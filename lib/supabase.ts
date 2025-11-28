import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types (matching existing interfaces)
export interface ChatSession {
  id: string;
  title: string;
  createdAt: number; // timestamp in milliseconds
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Database row types
interface DbChatSession {
  id: string;
  title: string;
  created_at: number;
}

interface DbChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// Transform functions
const toAppSession = (row: DbChatSession): ChatSession => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
});

// CRUD Functions

/**
 * Get all chat sessions, sorted by created_at desc
 */
export async function getSessions(): Promise<ChatSession[]> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching sessions:", error);
    return [];
  }

  return (data as DbChatSession[]).map(toAppSession);
}

/**
 * Get messages for a specific session
 */
export async function getMessages(sessionId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  return (data as Pick<DbChatMessage, "role" | "content">[]).map((row) => ({
    role: row.role,
    content: row.content,
  }));
}

/**
 * Create a new chat session
 */
export async function createSession(session: ChatSession): Promise<boolean> {
  const { error } = await supabase.from("chat_sessions").insert({
    id: session.id,
    title: session.title,
    created_at: session.createdAt,
  });

  if (error) {
    console.error("Error creating session:", error);
    return false;
  }

  return true;
}

/**
 * Save a message to a session
 */
export async function saveMessage(
  sessionId: string,
  message: Message
): Promise<boolean> {
  const { error } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: message.role,
    content: message.content,
  });

  if (error) {
    console.error("Error saving message:", error);
    return false;
  }

  return true;
}

/**
 * Save multiple messages to a session (for migration)
 */
export async function saveMessages(
  sessionId: string,
  messages: Message[]
): Promise<boolean> {
  if (messages.length === 0) return true;

  const rows = messages.map((msg) => ({
    session_id: sessionId,
    role: msg.role,
    content: msg.content,
  }));

  const { error } = await supabase.from("chat_messages").insert(rows);

  if (error) {
    console.error("Error saving messages:", error);
    return false;
  }

  return true;
}

/**
 * Delete a session and all its messages (cascade)
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId);

  if (error) {
    console.error("Error deleting session:", error);
    return false;
  }

  return true;
}

/**
 * Update the last message in a session (for streaming updates)
 */
export async function updateLastMessage(
  sessionId: string,
  content: string
): Promise<boolean> {
  // Get the last message for this session
  const { data, error: fetchError } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (fetchError || !data || data.length === 0) {
    console.error("Error finding last message:", fetchError);
    return false;
  }

  const { error } = await supabase
    .from("chat_messages")
    .update({ content })
    .eq("id", data[0].id);

  if (error) {
    console.error("Error updating message:", error);
    return false;
  }

  return true;
}

/**
 * Check if DB has any sessions (for migration check)
 */
export async function hasAnySessions(): Promise<boolean> {
  const { count, error } = await supabase
    .from("chat_sessions")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("Error checking sessions:", error);
    return false;
  }

  return (count ?? 0) > 0;
}

