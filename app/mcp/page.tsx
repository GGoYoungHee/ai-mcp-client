"use client";

import { useState, useRef } from "react";
import {
  Server,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Settings,
  Download,
  Upload,
  ChevronDown,
  ChevronRight,
  Wrench,
  MessageSquare,
  FileText,
  Play,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import { useMCP } from "@/lib/mcp/context";
import type {
  MCPServerConfig,
  TransportType,
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPExportData,
} from "@/lib/mcp/types";
import { cn } from "@/lib/utils";

// Server Form Component
function ServerForm({
  onSubmit,
  onCancel,
  initialData,
}: {
  onSubmit: (data: Omit<MCPServerConfig, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
  initialData?: MCPServerConfig;
}) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [transportType, setTransportType] = useState<TransportType>(
    initialData?.transportType ?? "stdio"
  );
  const [command, setCommand] = useState(initialData?.stdioConfig?.command ?? "");
  const [args, setArgs] = useState(initialData?.stdioConfig?.args?.join(" ") ?? "");
  const [url, setUrl] = useState(initialData?.httpConfig?.url ?? "");
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const config: Omit<MCPServerConfig, "id" | "createdAt" | "updatedAt"> = {
      name,
      transportType,
      enabled,
    };

    if (transportType === "stdio") {
      config.stdioConfig = {
        command,
        args: args.split(" ").filter(Boolean),
      };
    } else {
      config.httpConfig = { url };
    }

    onSubmit(config);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">서버 이름</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
          placeholder="My MCP Server"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Transport 타입</label>
        <select
          value={transportType}
          onChange={(e) => setTransportType(e.target.value as TransportType)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
        >
          <option value="stdio">STDIO</option>
          <option value="streamable-http">Streamable HTTP</option>
          <option value="sse">SSE (Server-Sent Events)</option>
        </select>
      </div>

      {transportType === "stdio" ? (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">Command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none font-mono text-sm"
              placeholder="node, python, npx..."
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Arguments</label>
            <input
              type="text"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none font-mono text-sm"
              placeholder="server.js --port 3000"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="block text-sm font-medium mb-1">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none font-mono text-sm"
            placeholder="http://localhost:3000/mcp"
            required
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-emerald-500 focus:ring-emerald-500"
        />
        <label htmlFor="enabled" className="text-sm">
          활성화
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition-colors"
        >
          {initialData ? "수정" : "추가"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
        >
          취소
        </button>
      </div>
    </form>
  );
}

// Tool Test Component
function ToolTester({
  tool,
  serverId,
  onClose,
}: {
  tool: MCPTool;
  serverId: string;
  onClose: () => void;
}) {
  const { callTool } = useMCP();
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const parsedArgs = JSON.parse(args);
      const response = await callTool(serverId, tool.name, parsedArgs);
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to call tool");
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">{tool.name}</h3>
            {tool.description && (
              <p className="text-sm text-gray-400 mt-1">{tool.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-auto">
          <div>
            <label className="block text-sm font-medium mb-2">Arguments (JSON)</label>
            <textarea
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              className="w-full h-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none"
              placeholder="{}"
            />
          </div>

          {tool.inputSchema && (
            <div>
              <label className="block text-sm font-medium mb-2">Input Schema</label>
              <pre className="p-3 bg-gray-800 rounded-lg text-xs overflow-auto max-h-40">
                {JSON.stringify(tool.inputSchema, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {result && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Result</label>
                <button
                  onClick={handleCopy}
                  className="p-1.5 hover:bg-gray-800 rounded transition-colors"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <pre className="p-3 bg-gray-800 rounded-lg text-xs overflow-auto max-h-60 text-emerald-400">
                {result}
              </pre>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                실행 중...
              </>
            ) : (
              <>
                <Play size={16} />
                실행
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Prompt Tester Component
function PromptTester({
  prompt,
  serverId,
  onClose,
}: {
  prompt: MCPPrompt;
  serverId: string;
  onClose: () => void;
}) {
  const { getPrompt } = useMCP();
  const [args, setArgs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await getPrompt(serverId, prompt.name, args);
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get prompt");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">{prompt.name}</h3>
            {prompt.description && (
              <p className="text-sm text-gray-400 mt-1">{prompt.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-auto">
          {prompt.arguments?.map((arg) => (
            <div key={arg.name}>
              <label className="block text-sm font-medium mb-1">
                {arg.name}
                {arg.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              {arg.description && (
                <p className="text-xs text-gray-400 mb-2">{arg.description}</p>
              )}
              <input
                type="text"
                value={args[arg.name] ?? ""}
                onChange={(e) => setArgs({ ...args, [arg.name]: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
            </div>
          ))}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {result && (
            <div>
              <label className="block text-sm font-medium mb-2">Result</label>
              <pre className="p-3 bg-gray-800 rounded-lg text-xs overflow-auto max-h-60 text-emerald-400">
                {result}
              </pre>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                실행 중...
              </>
            ) : (
              <>
                <Play size={16} />
                실행
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Resource Reader Component
function ResourceReader({
  resource,
  serverId,
  onClose,
}: {
  resource: MCPResource;
  serverId: string;
  onClose: () => void;
}) {
  const { readResource } = useMCP();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRead = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await readResource(serverId, resource.uri);
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read resource");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">{resource.name}</h3>
            <p className="text-xs text-gray-400 font-mono mt-1">{resource.uri}</p>
            {resource.description && (
              <p className="text-sm text-gray-400 mt-1">{resource.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-auto">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {result && (
            <div>
              <label className="block text-sm font-medium mb-2">Content</label>
              <pre className="p-3 bg-gray-800 rounded-lg text-xs overflow-auto max-h-96 text-emerald-400">
                {result}
              </pre>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleRead}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                읽는 중...
              </>
            ) : (
              <>
                <FileText size={16} />
                리소스 읽기
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Server Card Component
function ServerCard({ server }: { server: MCPServerConfig }) {
  const { statuses, capabilities, connect, disconnect, deleteServer, refreshCapabilities } = useMCP();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<MCPPrompt | null>(null);
  const [selectedResource, setSelectedResource] = useState<MCPResource | null>(null);

  const status = statuses.get(server.id);
  const serverCapabilities = capabilities.get(server.id);
  const isConnected = status?.status === "connected";

  const handleConnect = async () => {
    setIsConnecting(true);
    await connect(server.id);
    setIsConnecting(false);
  };

  const handleDisconnect = async () => {
    await disconnect(server.id);
  };

  const handleDelete = () => {
    if (confirm(`"${server.name}" 서버를 삭제하시겠습니까?`)) {
      deleteServer(server.id);
    }
  };

  const handleRefresh = async () => {
    await refreshCapabilities(server.id);
  };

  const statusColor = {
    disconnected: "text-gray-400",
    connecting: "text-yellow-400",
    connected: "text-emerald-400",
    error: "text-red-400",
  };

  const StatusIcon = {
    disconnected: PowerOff,
    connecting: Loader2,
    connected: CheckCircle,
    error: AlertCircle,
  };

  const CurrentStatusIcon = StatusIcon[status?.status ?? "disconnected"];

  return (
    <>
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  isConnected ? "bg-emerald-500/20" : "bg-gray-700"
                )}
              >
                <Server size={20} className={isConnected ? "text-emerald-400" : "text-gray-400"} />
              </div>
              <div>
                <h3 className="font-semibold">{server.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-gray-700 rounded-full">
                    {server.transportType}
                  </span>
                  <span className={cn("text-xs flex items-center gap-1", statusColor[status?.status ?? "disconnected"])}>
                    <CurrentStatusIcon size={12} className={status?.status === "connecting" ? "animate-spin" : ""} />
                    {status?.status ?? "disconnected"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {isConnected ? (
                <button
                  onClick={handleDisconnect}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-red-400"
                  title="연결 해제"
                >
                  <PowerOff size={18} />
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-emerald-400 disabled:opacity-50"
                  title="연결"
                >
                  {isConnecting ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
                </button>
              )}
              <button
                onClick={handleDelete}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-red-400"
                title="삭제"
              >
                <Trash2 size={18} />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
            </div>
          </div>

          {status?.error && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {status.error}
            </div>
          )}

          {/* Config Preview */}
          <div className="mt-3 text-xs text-gray-400 font-mono">
            {server.transportType === "stdio" && server.stdioConfig && (
              <span>
                {server.stdioConfig.command} {server.stdioConfig.args?.join(" ")}
              </span>
            )}
            {(server.transportType === "streamable-http" || server.transportType === "sse") &&
              server.httpConfig && <span>{server.httpConfig.url}</span>}
          </div>
        </div>

        {/* Expanded Capabilities */}
        {isExpanded && isConnected && serverCapabilities && (
          <div className="border-t border-gray-700 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Capabilities</span>
              <button
                onClick={handleRefresh}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                title="새로고침"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {/* Tools */}
            {serverCapabilities.tools.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                  <Wrench size={14} />
                  <span>Tools ({serverCapabilities.tools.length})</span>
                </div>
                <div className="space-y-1">
                  {serverCapabilities.tools.map((tool) => (
                    <button
                      key={tool.name}
                      onClick={() => setSelectedTool(tool)}
                      className="w-full text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <div className="font-mono text-sm text-emerald-400">{tool.name}</div>
                      {tool.description && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{tool.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Prompts */}
            {serverCapabilities.prompts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                  <MessageSquare size={14} />
                  <span>Prompts ({serverCapabilities.prompts.length})</span>
                </div>
                <div className="space-y-1">
                  {serverCapabilities.prompts.map((prompt) => (
                    <button
                      key={prompt.name}
                      onClick={() => setSelectedPrompt(prompt)}
                      className="w-full text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <div className="font-mono text-sm text-blue-400">{prompt.name}</div>
                      {prompt.description && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{prompt.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Resources */}
            {serverCapabilities.resources.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                  <FileText size={14} />
                  <span>Resources ({serverCapabilities.resources.length})</span>
                </div>
                <div className="space-y-1">
                  {serverCapabilities.resources.map((resource) => (
                    <button
                      key={resource.uri}
                      onClick={() => setSelectedResource(resource)}
                      className="w-full text-left p-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <div className="font-mono text-sm text-amber-400">{resource.name}</div>
                      <div className="text-xs text-gray-500 font-mono truncate">{resource.uri}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {serverCapabilities.tools.length === 0 &&
              serverCapabilities.prompts.length === 0 &&
              serverCapabilities.resources.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-4">
                  이 서버는 capabilities를 제공하지 않습니다.
                </div>
              )}
          </div>
        )}

        {isExpanded && !isConnected && (
          <div className="border-t border-gray-700 p-4 text-center text-gray-400 text-sm">
            서버에 연결하면 capabilities를 확인할 수 있습니다.
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedTool && (
        <ToolTester tool={selectedTool} serverId={server.id} onClose={() => setSelectedTool(null)} />
      )}
      {selectedPrompt && (
        <PromptTester prompt={selectedPrompt} serverId={server.id} onClose={() => setSelectedPrompt(null)} />
      )}
      {selectedResource && (
        <ResourceReader
          resource={selectedResource}
          serverId={server.id}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </>
  );
}

// Main Page Component
export default function MCPPage() {
  const { servers, addServer, exportConfig, importConfig, isLoading } = useMCP();
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddServer = (config: Omit<MCPServerConfig, "id" | "createdAt" | "updatedAt">) => {
    addServer(config);
    setShowAddForm(false);
  };

  const handleExport = () => {
    const data = exportConfig();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mcp-servers-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data: MCPExportData = JSON.parse(event.target?.result as string);
        const merge = confirm("기존 서버 설정에 병합하시겠습니까?\n(취소를 누르면 기존 설정을 덮어씁니다)");
        importConfig(data, merge);
      } catch (error) {
        alert("잘못된 파일 형식입니다.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="채팅으로 돌아가기"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Settings size={20} />
              </div>
              <div>
                <h1 className="font-bold text-lg">MCP 서버 관리</h1>
                <p className="text-xs text-gray-400">Model Context Protocol</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="설정 내보내기"
            >
              <Download size={20} />
            </button>
            <button
              onClick={handleImport}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="설정 가져오기"
            >
              <Upload size={20} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Add Server Button */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full p-4 border-2 border-dashed border-gray-700 hover:border-emerald-500/50 rounded-xl flex items-center justify-center gap-2 text-gray-400 hover:text-emerald-400 transition-colors mb-6"
          >
            <Plus size={20} />
            <span>새 MCP 서버 추가</span>
          </button>
        )}

        {/* Add Server Form */}
        {showAddForm && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-lg mb-4">새 MCP 서버 추가</h2>
            <ServerForm onSubmit={handleAddServer} onCancel={() => setShowAddForm(false)} />
          </div>
        )}

        {/* Server List */}
        <div className="space-y-4">
          {servers.length === 0 && !showAddForm && (
            <div className="text-center py-16 text-gray-400">
              <Server size={48} className="mx-auto mb-4 opacity-30" />
              <p>등록된 MCP 서버가 없습니다.</p>
              <p className="text-sm mt-1">위 버튼을 클릭하여 서버를 추가하세요.</p>
            </div>
          )}

          {servers.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>

        {/* Warning Banner */}
        <div className="mt-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-sm">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">보안 주의사항</p>
              <p className="text-amber-200/70 mt-1">
                공용/공유 PC에서는 민감한 정보(API 키, 인증 토큰 등)를 서버 설정에 저장하지 마세요.
                설정은 브라우저의 localStorage에 저장됩니다.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

