import { NextResponse } from "next/server";
import { mcpClientManager } from "@/lib/mcp/client-manager";
import type { MCPApiResponse, MCPTool } from "@/lib/mcp/types";

export interface MCPToolWithServer extends MCPTool {
  serverId: string;
  serverName: string;
}

export async function GET() {
  try {
    const allStatuses = mcpClientManager.getAllStatuses();
    const connectedServers = allStatuses.filter((s) => s.status === "connected");

    const allTools: MCPToolWithServer[] = [];

    for (const status of connectedServers) {
      const capabilities = mcpClientManager.getCapabilities(status.serverId);
      if (capabilities?.tools) {
        for (const tool of capabilities.tools) {
          allTools.push({
            ...tool,
            serverId: status.serverId,
            serverName: status.serverId, // Will be replaced with actual name if available
          });
        }
      }
    }

    return NextResponse.json<MCPApiResponse<MCPToolWithServer[]>>({
      success: true,
      data: allTools,
    });
  } catch (error) {
    console.error("Error getting MCP tools:", error);
    return NextResponse.json<MCPApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get tools",
      },
      { status: 500 }
    );
  }
}

