"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Trash2, Bot, User, Copy, Check, Plus, MessageSquare, Menu, X, Settings, Wrench, ToggleLeft, ToggleRight } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { generateId, formatDate, cn } from "@/lib/utils";
import {
  getSessions,
  getMessagesExtended,
  createSession as dbCreateSession,
  saveMessage,
  deleteSession as dbDeleteSession,
  hasAnySessions,
  saveMessages,
  updateMessageById,
  encodeExtendedMessage,
  type ChatSession,
  type Message,
} from "@/lib/supabase";
import { useMCP } from "@/lib/mcp/context";
import type { ToolCallInfo } from "@/lib/mcp/types";
import { ToolCallsDisplay } from "@/components/chat/ToolCallCard";

// Extended message type with tool calls
interface ExtendedMessage extends Message {
  toolCalls?: ToolCallInfo[];
}

// CodeBlock Component
interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const CodeBlock = ({inline, className, children, ...props}: CodeBlockProps) => {
  const match = /language-(\w+)/.exec(className || '');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
      navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  return !inline && match ? (
      <div className="relative group rounded-md overflow-hidden my-2">
          <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                  onClick={handleCopy}
                  className="p-1.5 bg-gray-700/80 text-gray-200 rounded-md hover:bg-gray-600 transition-colors"
                  title="Copy code"
              >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
          </div>
          <SyntaxHighlighter
              style={oneDark}
              language={match[1]}
              PreTag="div"
              customStyle={{ margin: 0, borderRadius: '0.375rem' }}
              {...props}
          >
              {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
      </div>
  ) : (
      <code className={`${className} bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5`} {...props}>
          {children}
      </code>
  );
};

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallInfo[]>([]);
  
  // MCP context for connection status
  const { statuses, capabilities } = useMCP();
  
  // Count connected servers with tools
  const connectedServersWithTools = Array.from(statuses.entries()).filter(([serverId, status]) => {
    if (status.status !== "connected") return false;
    const caps = capabilities.get(serverId);
    return caps && caps.tools.length > 0;
  }).length;
  
  const totalToolsCount = Array.from(capabilities.values()).reduce((sum, cap) => sum + cap.tools.length, 0);

  // Migrate localStorage data to Supabase DB
  const migrateLocalStorageToDb = useCallback(async () => {
    const savedSessions = localStorage.getItem("chat_sessions");
    const legacyMessages = localStorage.getItem("chat_messages");
    
    let localSessions: ChatSession[] = [];

    if (savedSessions) {
      try {
        localSessions = JSON.parse(savedSessions);
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }

    // Handle legacy single chat format
    if (localSessions.length === 0 && legacyMessages) {
      try {
        const oldMsgs = JSON.parse(legacyMessages);
        if (oldMsgs.length > 0) {
          const newId = generateId();
          const newSession: ChatSession = {
            id: newId,
            title: formatDate(new Date()),
            createdAt: Date.now(),
          };
          localSessions = [newSession];
          localStorage.setItem(`chat_messages_${newId}`, JSON.stringify(oldMsgs));
          localStorage.removeItem("chat_messages");
        }
      } catch (e) {
        console.error("Failed to migrate legacy messages", e);
      }
    }

    if (localSessions.length === 0) return false;

    // Check if DB already has data
    const dbHasData = await hasAnySessions();
    if (dbHasData) {
      console.log("DB already has data, skipping migration");
      return false;
    }

    console.log("Migrating localStorage data to Supabase...");

    // Migrate each session and its messages
    for (const session of localSessions) {
      await dbCreateSession(session);
      
      const messagesKey = `chat_messages_${session.id}`;
      const savedMsgs = localStorage.getItem(messagesKey);
      if (savedMsgs) {
        try {
          const msgs: Message[] = JSON.parse(savedMsgs);
          await saveMessages(session.id, msgs);
        } catch (e) {
          console.error(`Failed to migrate messages for session ${session.id}`, e);
        }
      }
    }

    // Mark migration as complete
    localStorage.setItem("chat_migrated_to_db", "true");
    console.log("Migration complete!");
    
    return true;
  }, []);

  // Load session messages from DB (with tool calls)
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    const msgs = await getMessagesExtended(sessionId);
    setMessages(msgs.map(m => ({
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls as ToolCallInfo[] | undefined,
    })));
  }, []);

  // Initial Load & Migration
  useEffect(() => {
    setMounted(true);
    
    const initializeData = async () => {
      // Check if we need to migrate
      const alreadyMigrated = localStorage.getItem("chat_migrated_to_db");
      if (!alreadyMigrated) {
        await migrateLocalStorageToDb();
      }

      // Load sessions from DB
      const dbSessions = await getSessions();
      setSessions(dbSessions);

      // Select most recent session or prepare for new chat
      if (dbSessions.length > 0) {
        setCurrentSessionId(dbSessions[0].id);
        await loadSessionMessages(dbSessions[0].id);
      } else {
        setCurrentSessionId(null);
        setMessages([]);
      }
      
      setIsInitialized(true);
    };

    initializeData();
  }, [migrateLocalStorageToDb, loadSessionMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  };

  // Select a session and load its messages from DB
  const selectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    await loadSessionMessages(sessionId);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // Create a new session in DB
  const createNewSession = async () => {
    const newId = generateId();
    const newSession: ChatSession = {
      id: newId,
      title: formatDate(new Date()),
      createdAt: Date.now(),
    };
    
    await dbCreateSession(newSession);
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    return newId;
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInput("");
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // Delete a session from DB
  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this chat?")) return;

    await dbDeleteSession(sessionId);
    const newSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(newSessions);

    if (currentSessionId === sessionId) {
      if (newSessions.length > 0) {
        await selectSession(newSessions[0].id);
      } else {
        handleNewChat();
      }
    }
  };

  // Parse SSE stream with tool call markers
  const parseStreamContent = (buffer: string) => {
    const toolCalls: ToolCallInfo[] = [];
    
    // Helper function to extract content between markers
    const extractBetweenMarkers = (str: string, startMarker: string, endMarker: string): string[] => {
      const results: string[] = [];
      let searchStart = 0;
      
      while (true) {
        const startIdx = str.indexOf(startMarker, searchStart);
        if (startIdx === -1) break;
        
        const contentStart = startIdx + startMarker.length;
        const endIdx = str.indexOf(endMarker, contentStart);
        if (endIdx === -1) break;
        
        results.push(str.substring(contentStart, endIdx));
        searchStart = endIdx + endMarker.length;
      }
      
      return results;
    };
    
    // Parse tool call starts
    const toolCallContents = extractBetweenMarkers(buffer, "[TOOL_CALL]", "[/TOOL_CALL]");
    for (const content of toolCallContents) {
      try {
        const parsed = JSON.parse(content);
        toolCalls.push(parsed);
      } catch (e) {
        console.error("Failed to parse tool call:", e, content);
      }
    }
    
    // Parse tool call results (updates) - these have the final result
    const toolResultContents = extractBetweenMarkers(buffer, "[TOOL_RESULT]", "[/TOOL_RESULT]");
    for (const content of toolResultContents) {
      try {
        const result: ToolCallInfo = JSON.parse(content);
        const existingIndex = toolCalls.findIndex(tc => tc.id === result.id);
        if (existingIndex >= 0) {
          toolCalls[existingIndex] = result;
        } else {
          toolCalls.push(result);
        }
      } catch (e) {
        console.error("Failed to parse tool result:", e, content);
      }
    }
    
    // Extract text content
    let text = "";
    const textContents = extractBetweenMarkers(buffer, "[TEXT]", "[/TEXT]");
    if (textContents.length > 0) {
      text = textContents[textContents.length - 1]; // Get the last text content
    } else {
      // If no markers at all, treat the whole buffer as text (for non-tool responses)
      const hasAnyMarkers = buffer.includes("[TOOL_CALL]") || buffer.includes("[TEXT]");
      if (!hasAnyMarkers) {
        text = buffer;
      }
    }
    
    // Debug log
    if (toolCalls.length > 0) {
      console.log("Parsed tool calls:", toolCalls);
    }
    
    return { toolCalls, text };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ExtendedMessage = { role: "user", content: input };
    
    setInput("");
    setIsLoading(true);
    setCurrentToolCalls([]);

    let activeSessionId = currentSessionId;

    // Create session if it doesn't exist (first message)
    if (!activeSessionId) {
      activeSessionId = await createNewSession();
    }

    // Optimistic update for UI
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    // Save user message to DB
    await saveMessage(activeSessionId, userMessage);

    // Save empty assistant message to DB first to get message_id
    const assistantMessageId = await saveMessage(activeSessionId, { role: "assistant", content: "" });
    
    if (!assistantMessageId) {
      throw new Error("Failed to create assistant message");
    }

    try {
      const response = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          mcpEnabled,
          messageId: assistantMessageId, // Pass message ID for image linking
        }),
      });

      if (!response.ok) throw new Error("Network response was not ok");
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // Add empty assistant message for streaming
      const assistantMessage: ExtendedMessage = { role: "assistant", content: "", toolCalls: [] };
      setMessages((prev) => [...prev, assistantMessage]);

      let fullBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullBuffer += chunk;
        
        // Parse the buffer for tool calls and text
        const { toolCalls, text } = parseStreamContent(fullBuffer);
        
        // Update current tool calls for live display (shown in loading indicator)
        setCurrentToolCalls([...toolCalls]);
        
        // Update messages with parsed content (immutable update)
        setMessages((prev) => {
          const updated = prev.slice(0, -1);
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            return [...updated, { ...lastMsg, toolCalls: [...toolCalls], content: text }];
          }
          return prev;
        });
      }

      // Final parse
      const { toolCalls: finalToolCalls, text: finalText } = parseStreamContent(fullBuffer);
      
      console.log("Final parsed:", { toolCalls: finalToolCalls, text: finalText });
      
      // Update final message state with tool calls preserved (immutable update)
      setMessages((prev) => {
        const updated = prev.slice(0, -1);
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          return [...updated, { ...lastMsg, toolCalls: [...finalToolCalls], content: finalText }];
        }
        return prev;
      });
      
      // Update the assistant message in DB with full content (including tool calls)
      const encodedContent = encodeExtendedMessage(finalText, finalToolCalls);
      await updateMessageById(assistantMessageId, encodedContent);
      
      // Clear current tool calls (loading indicator)
      setCurrentToolCalls([]);

    } catch (error) {
      console.error("Error:", error);
      const errorMessage: ExtendedMessage = { 
        role: "assistant", 
        content: "Error generating response. Please try again." 
      };
      setMessages((prev) => [...prev, errorMessage]);
      await saveMessage(activeSessionId, { role: "assistant", content: errorMessage.content });
    } finally {
      setIsLoading(false);
      setCurrentToolCalls([]);
    }
  };

  if (!mounted || !isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex gap-1 items-center">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
            "fixed md:relative z-30 w-64 h-full bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out flex flex-col",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold text-lg">Chats</h2>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1">
                <X size={20} />
            </button>
        </div>
        
        <div className="p-4">
            <button
                onClick={handleNewChat}
                className="w-full flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
                <Plus size={20} />
                New Chat
            </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
            {sessions.map((session) => (
                <div
                    key={session.id}
                    onClick={() => selectSession(session.id)}
                    className={cn(
                        "group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
                        currentSessionId === session.id 
                            ? "bg-white dark:bg-gray-700 shadow-sm" 
                            : "hover:bg-gray-200 dark:hover:bg-gray-700/50"
                    )}
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <MessageSquare size={18} className="text-gray-500 flex-shrink-0" />
                        <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                            {session.title}
                        </span>
                    </div>
                    <button
                        onClick={(e) => deleteSession(e, session.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-all"
                        title="Delete chat"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ))}
            
            {sessions.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-4">
                    No history
                </div>
            )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full w-full relative">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm z-10">
            <div className="flex items-center gap-3">
                <button 
                    onClick={() => setIsSidebarOpen(true)}
                    className="md:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full"
                >
                    <Menu size={24} />
                </button>
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                    <Bot size={20} />
                </div>
                <h1 className="text-lg font-semibold">Gemini Chat</h1>
            </div>
            <div className="flex items-center gap-2">
                {/* MCP Tools Toggle */}
                <button
                    onClick={() => setMcpEnabled(!mcpEnabled)}
                    className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                        mcpEnabled && connectedServersWithTools > 0
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    )}
                    title={mcpEnabled ? "MCP 도구 비활성화" : "MCP 도구 활성화"}
                >
                    <Wrench size={14} />
                    <span className="hidden sm:inline">
                        {connectedServersWithTools > 0 
                            ? `${totalToolsCount} Tools` 
                            : "No Tools"}
                    </span>
                    {mcpEnabled ? (
                        <ToggleRight size={18} className="text-emerald-500" />
                    ) : (
                        <ToggleLeft size={18} />
                    )}
                </button>
                <Link
                    href="/mcp"
                    className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    title="MCP 서버 관리"
                >
                    <Settings size={20} />
                </Link>
            </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="max-w-3xl mx-auto space-y-6">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400 text-center">
                        <Bot size={48} className="mb-4 opacity-20" />
                        <p className="text-lg">Start a conversation with Gemini</p>
                        <p className="text-sm mt-2">&quot;Tell me a joke&quot; or &quot;Explain quantum physics&quot;</p>
                    </div>
                )}
                
                {messages.map((msg, index) => (
                    <div 
                        key={index} 
                        className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        {msg.role === "assistant" && (
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center text-white mt-1">
                                <Bot size={16} />
                            </div>
                        )}
                        
                        <div 
                            className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl leading-relaxed shadow-sm ${
                                msg.role === "user" 
                                    ? "bg-blue-600 text-white rounded-br-sm" 
                                    : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-sm w-full overflow-hidden"
                            }`}
                        >
                            {msg.role === "user" ? (
                                <div className="whitespace-pre-wrap">{msg.content}</div>
                            ) : (
                                <div className="markdown-body">
                                    {/* Tool Calls Display */}
                                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                                        <ToolCallsDisplay toolCalls={msg.toolCalls} />
                                    )}
                                    
                                    {/* Text Content */}
                                    {msg.content && (
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                code: CodeBlock,
                                                ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                                                ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                                                li: ({children}) => <li className="mb-1">{children}</li>,
                                                p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                                                h1: ({children}) => <h1 className="text-2xl font-bold mb-2 mt-4">{children}</h1>,
                                                h2: ({children}) => <h2 className="text-xl font-bold mb-2 mt-3">{children}</h2>,
                                                h3: ({children}) => <h3 className="text-lg font-bold mb-1 mt-2">{children}</h3>,
                                                blockquote: ({children}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic my-2">{children}</blockquote>,
                                                a: ({href, children}) => <a href={href} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                                                table: ({children}) => <div className="overflow-x-auto mb-2"><table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700">{children}</table></div>,
                                                th: ({children}) => <th className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">{children}</th>,
                                                td: ({children}) => <td className="px-3 py-2 whitespace-nowrap text-sm border-b dark:border-gray-700">{children}</td>,
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    )}
                                </div>
                            )}
                        </div>

                        {msg.role === "user" && (
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center mt-1">
                                <User size={16} />
                            </div>
                        )}
                    </div>
                ))}
                {isLoading && messages[messages.length-1]?.role !== "assistant" && (
                     <div className="flex gap-4 justify-start">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center text-white mt-1">
                            <Bot size={16} />
                        </div>
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm max-w-[85%] sm:max-w-[75%]">
                            {/* Show current tool calls while loading */}
                            {currentToolCalls.length > 0 && (
                                <ToolCallsDisplay toolCalls={currentToolCalls} />
                            )}
                            {currentToolCalls.length === 0 && (
                                <div className="flex gap-1 h-6 items-center">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                </div>
                            )}
                        </div>
                     </div>
                )}
                <div ref={messagesEndRef} />
            </div>
        </main>

        {/* Input Area */}
        <footer className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <div className="max-w-3xl mx-auto">
                <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Message Gemini..."
                        className="w-full p-4 pr-12 rounded-full bg-gray-100 dark:bg-gray-900 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black focus:ring-0 transition-all outline-none"
                        disabled={isLoading}
                    />
                    <button 
                        type="submit" 
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
                    >
                        <Send size={20} />
                    </button>
                </form>
                 <div className="text-xs text-center text-gray-400 mt-2">
                    Gemini can make mistakes. Consider checking important information.
                </div>
            </div>
        </footer>
      </div>
    </div>
  );
}
