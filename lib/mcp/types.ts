// MCP Server Configuration Types

export type TransportType = "stdio" | "streamable-http" | "sse";

export interface StdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface HttpConfig {
  url: string;
  headers?: Record<string, string>;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  transportType: TransportType;
  stdioConfig?: StdioConfig;
  httpConfig?: HttpConfig;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// MCP Server Status
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface MCPServerStatus {
  serverId: string;
  status: ConnectionStatus;
  error?: string;
  lastConnected?: number;
}

// MCP Server Capabilities (from server)
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPServerCapabilities {
  tools: MCPTool[];
  prompts: MCPPrompt[];
  resources: MCPResource[];
}

// API Request/Response Types
export interface ConnectServerRequest {
  serverId: string;
}

export interface DisconnectServerRequest {
  serverId: string;
}

export interface CallToolRequest {
  serverId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface GetPromptRequest {
  serverId: string;
  promptName: string;
  arguments?: Record<string, string>;
}

export interface ReadResourceRequest {
  serverId: string;
  uri: string;
}

export interface MCPApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Storage Types
export interface MCPStorageData {
  servers: MCPServerConfig[];
  version: number;
}

// Export/Import Types
export interface MCPExportData {
  version: number;
  exportedAt: number;
  servers: Omit<MCPServerConfig, "id" | "createdAt" | "updatedAt">[];
}

