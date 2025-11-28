import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type {
  MCPServerConfig,
  MCPServerStatus,
  MCPServerCapabilities,
  MCPTool,
  MCPPrompt,
  MCPResource,
} from "./types";

interface ManagedClient {
  client: Client;
  config: MCPServerConfig;
  status: MCPServerStatus;
  capabilities: MCPServerCapabilities | null;
}

// Extend globalThis type for TypeScript
declare global {
  var __mcpClientManager: MCPClientManager | undefined;
}

/**
 * Singleton MCP Client Manager
 * Manages multiple MCP client connections
 * Uses globalThis to persist across Next.js hot reloads
 */
class MCPClientManager {
  private clients: Map<string, ManagedClient> = new Map();

  constructor() {}

  static getInstance(): MCPClientManager {
    if (!globalThis.__mcpClientManager) {
      globalThis.__mcpClientManager = new MCPClientManager();
    }
    return globalThis.__mcpClientManager;
  }

  /**
   * Connect to an MCP server
   */
  async connect(config: MCPServerConfig): Promise<MCPServerStatus> {
    const existingClient = this.clients.get(config.id);
    if (existingClient?.status.status === "connected") {
      return existingClient.status;
    }

    try {
      const client = new Client({
        name: `mcp-client-${config.id}`,
        version: "1.0.0",
      });

      const transport = await this.createTransport(config);
      await client.connect(transport);

      // Fetch capabilities
      const capabilities = await this.fetchCapabilities(client);

      const connectedStatus: MCPServerStatus = {
        serverId: config.id,
        status: "connected",
        lastConnected: Date.now(),
      };

      this.clients.set(config.id, {
        client,
        config,
        status: connectedStatus,
        capabilities,
      });

      return connectedStatus;
    } catch (error) {
      const errorStatus: MCPServerStatus = {
        serverId: config.id,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };

      // Store failed client info for status tracking
      this.clients.set(config.id, {
        client: null as unknown as Client,
        config,
        status: errorStatus,
        capabilities: null,
      });

      return errorStatus;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverId: string): Promise<MCPServerStatus> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient) {
      return {
        serverId,
        status: "disconnected",
      };
    }

    try {
      if (managedClient.client && managedClient.status.status === "connected") {
        await managedClient.client.close();
      }
    } catch (error) {
      console.error(`Error disconnecting from server ${serverId}:`, error);
    }

    const status: MCPServerStatus = {
      serverId,
      status: "disconnected",
    };

    this.clients.set(serverId, {
      ...managedClient,
      status,
      capabilities: null,
    });

    return status;
  }

  /**
   * Get status of a specific server
   */
  getStatus(serverId: string): MCPServerStatus {
    const managedClient = this.clients.get(serverId);
    return (
      managedClient?.status ?? {
        serverId,
        status: "disconnected",
      }
    );
  }

  /**
   * Get all server statuses
   */
  getAllStatuses(): MCPServerStatus[] {
    return Array.from(this.clients.values()).map((mc) => mc.status);
  }

  /**
   * Get capabilities of a connected server
   */
  getCapabilities(serverId: string): MCPServerCapabilities | null {
    return this.clients.get(serverId)?.capabilities ?? null;
  }

  /**
   * Call a tool on a connected server
   */
  async callTool(
    serverId: string,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<unknown> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient || managedClient.status.status !== "connected") {
      throw new Error(`Server ${serverId} is not connected`);
    }

    const result = await managedClient.client.callTool({
      name: toolName,
      arguments: args ?? {},
    });

    return result;
  }

  /**
   * Get a prompt from a connected server
   */
  async getPrompt(
    serverId: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<unknown> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient || managedClient.status.status !== "connected") {
      throw new Error(`Server ${serverId} is not connected`);
    }

    const result = await managedClient.client.getPrompt({
      name: promptName,
      arguments: args,
    });

    return result;
  }

  /**
   * Read a resource from a connected server
   */
  async readResource(serverId: string, uri: string): Promise<unknown> {
    const managedClient = this.clients.get(serverId);
    if (!managedClient || managedClient.status.status !== "connected") {
      throw new Error(`Server ${serverId} is not connected`);
    }

    const result = await managedClient.client.readResource({
      uri,
    });

    return result;
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    const serverIds = Array.from(this.clients.keys());
    await Promise.all(serverIds.map((id) => this.disconnect(id)));
  }

  /**
   * Create transport based on config
   */
  private async createTransport(config: MCPServerConfig) {
    switch (config.transportType) {
      case "stdio": {
        if (!config.stdioConfig) {
          throw new Error("STDIO config is required for STDIO transport");
        }
        return new StdioClientTransport({
          command: config.stdioConfig.command,
          args: config.stdioConfig.args,
          env: config.stdioConfig.env,
          cwd: config.stdioConfig.cwd,
        });
      }

      case "streamable-http": {
        if (!config.httpConfig) {
          throw new Error("HTTP config is required for Streamable HTTP transport");
        }
        return new StreamableHTTPClientTransport(
          new URL(config.httpConfig.url),
          {
            requestInit: {
              headers: config.httpConfig.headers,
            },
          }
        );
      }

      case "sse": {
        if (!config.httpConfig) {
          throw new Error("HTTP config is required for SSE transport");
        }
        // SSEClientTransport only accepts URL
        return new SSEClientTransport(new URL(config.httpConfig.url));
      }

      default:
        throw new Error(`Unsupported transport type: ${config.transportType}`);
    }
  }

  /**
   * Fetch capabilities from connected client
   */
  private async fetchCapabilities(
    client: Client
  ): Promise<MCPServerCapabilities> {
    const [toolsResult, promptsResult, resourcesResult] = await Promise.allSettled([
      client.listTools(),
      client.listPrompts(),
      client.listResources(),
    ]);

    const tools: MCPTool[] =
      toolsResult.status === "fulfilled"
        ? toolsResult.value.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema as Record<string, unknown>,
          }))
        : [];

    const prompts: MCPPrompt[] =
      promptsResult.status === "fulfilled"
        ? promptsResult.value.prompts.map((p) => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments,
          }))
        : [];

    const resources: MCPResource[] =
      resourcesResult.status === "fulfilled"
        ? resourcesResult.value.resources.map((r) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          }))
        : [];

    return { tools, prompts, resources };
  }
}

// Export singleton instance
export const mcpClientManager = MCPClientManager.getInstance();
export { MCPClientManager };

