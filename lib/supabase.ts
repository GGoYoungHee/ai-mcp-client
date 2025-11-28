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

// Extended message with tool calls (for storage)
export interface ExtendedMessageData {
  text: string;
  toolCalls?: unknown[];
}

// Marker to identify extended message format
const EXTENDED_MESSAGE_MARKER = "[[EXTENDED_MSG]]";

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
 * Returns extended messages with tool calls if available
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
 * Get messages with extended data (including tool calls)
 */
export async function getMessagesExtended(sessionId: string): Promise<Array<Message & { toolCalls?: unknown[] }>> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  return (data as Pick<DbChatMessage, "role" | "content">[]).map((row) => {
    // Check if content contains extended message data
    if (row.content.startsWith(EXTENDED_MESSAGE_MARKER)) {
      try {
        const jsonStr = row.content.slice(EXTENDED_MESSAGE_MARKER.length);
        const parsed: ExtendedMessageData = JSON.parse(jsonStr);
        return {
          role: row.role,
          content: parsed.text,
          toolCalls: parsed.toolCalls,
        };
      } catch (e) {
        console.error("Failed to parse extended message:", e);
        return { role: row.role, content: row.content };
      }
    }
    return { role: row.role, content: row.content };
  });
}

/**
 * Encode message with tool calls for storage
 */
export function encodeExtendedMessage(text: string, toolCalls?: unknown[]): string {
  if (!toolCalls || toolCalls.length === 0) {
    return text;
  }
  const data: ExtendedMessageData = { text, toolCalls };
  return EXTENDED_MESSAGE_MARKER + JSON.stringify(data);
}

/**
 * Decode message content (returns text and tool calls)
 */
export function decodeExtendedMessage(content: string): ExtendedMessageData {
  if (content.startsWith(EXTENDED_MESSAGE_MARKER)) {
    try {
      const jsonStr = content.slice(EXTENDED_MESSAGE_MARKER.length);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to decode extended message:", e);
      return { text: content };
    }
  }
  return { text: content };
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
 * Returns the message ID if successful, null otherwise
 */
export async function saveMessage(
  sessionId: string,
  message: Message
): Promise<string | null> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      session_id: sessionId,
      role: message.role,
      content: message.content,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error saving message:", error);
    return null;
  }

  return data?.id || null;
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
 * @deprecated Use updateMessageById instead when you have the message ID
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
 * Update a message by its ID
 */
export async function updateMessageById(
  messageId: string,
  content: string
): Promise<boolean> {
  const { error } = await supabase
    .from("chat_messages")
    .update({ content })
    .eq("id", messageId);

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

// ============================================
// Storage Functions for Chat Images
// ============================================

const CHAT_IMAGES_BUCKET = "chat-images";

export interface ChatImageUploadResult {
  url: string;
  path: string;
}

/**
 * Upload a base64 image to Supabase Storage
 * @param base64Data - Base64 encoded image data (without data URL prefix)
 * @param mimeType - MIME type of the image (e.g., "image/png")
 * @param toolCallId - Optional tool call ID for reference
 * @returns Object with public URL and storage path, or null on failure
 */
export async function uploadChatImage(
  base64Data: string,
  mimeType: string,
  toolCallId?: string
): Promise<ChatImageUploadResult | null> {
  try {
    // Generate unique filename
    const extension = mimeType.split("/")[1] || "png";
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const filename = `${timestamp}_${randomId}${toolCallId ? `_${toolCallId.substring(0, 8)}` : ""}.${extension}`;
    const storagePath = `images/${filename}`;

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from(CHAT_IMAGES_BUCKET)
      .upload(storagePath, bytes, {
        contentType: mimeType,
        cacheControl: "31536000", // 1 year cache
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading image:", uploadError);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(CHAT_IMAGES_BUCKET)
      .getPublicUrl(storagePath);

    return {
      url: urlData.publicUrl,
      path: storagePath,
    };
  } catch (error) {
    console.error("Error in uploadChatImage:", error);
    return null;
  }
}

/**
 * Save image metadata to chat_images table
 * @param messageId - Optional message ID (can be linked later via tool_call_id)
 * @param storagePath - Storage path of the uploaded image
 * @param mimeType - MIME type of the image
 * @param toolCallId - Tool call ID for reference
 */
export async function saveChatImageMetadata(
  messageId: string | undefined,
  storagePath: string,
  mimeType: string,
  toolCallId?: string
): Promise<boolean> {
  const insertData: Record<string, unknown> = {
    storage_path: storagePath,
    mime_type: mimeType,
    original_tool_call_id: toolCallId,
  };
  
  // Only include message_id if provided
  if (messageId) {
    insertData.message_id = messageId;
  }

  const { error } = await supabase.from("chat_images").insert(insertData);

  if (error) {
    console.error("Error saving image metadata:", error);
    return false;
  }

  return true;
}

/**
 * Get images for a specific message
 */
export async function getMessageImages(messageId: string): Promise<
  Array<{
    id: string;
    url: string;
    mimeType: string;
  }>
> {
  const { data, error } = await supabase
    .from("chat_images")
    .select("id, storage_path, mime_type")
    .eq("message_id", messageId);

  if (error) {
    console.error("Error fetching message images:", error);
    return [];
  }

  return data.map((row) => {
    const { data: urlData } = supabase.storage
      .from(CHAT_IMAGES_BUCKET)
      .getPublicUrl(row.storage_path);

    return {
      id: row.id,
      url: urlData.publicUrl,
      mimeType: row.mime_type,
    };
  });
}

