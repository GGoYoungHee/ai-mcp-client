import { NextRequest, NextResponse } from "next/server";
import { mcpClientManager } from "@/lib/mcp/client-manager";
import type { MCPApiResponse, MCPServerStatus } from "@/lib/mcp/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const serverId = searchParams.get("serverId");

    if (serverId) {
      const status = mcpClientManager.getStatus(serverId);
      return NextResponse.json<MCPApiResponse<MCPServerStatus>>({
        success: true,
        data: status,
      });
    }

    // Return all statuses
    const statuses = mcpClientManager.getAllStatuses();
    return NextResponse.json<MCPApiResponse<MCPServerStatus[]>>({
      success: true,
      data: statuses,
    });
  } catch (error) {
    console.error("MCP status error:", error);
    return NextResponse.json<MCPApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get status",
      },
      { status: 500 }
    );
  }
}

