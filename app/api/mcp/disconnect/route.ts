import { NextRequest, NextResponse } from "next/server";
import { mcpClientManager } from "@/lib/mcp/client-manager";
import type { MCPApiResponse, MCPServerStatus, DisconnectServerRequest } from "@/lib/mcp/types";

export async function POST(req: NextRequest) {
  try {
    const { serverId }: DisconnectServerRequest = await req.json();

    if (!serverId) {
      return NextResponse.json<MCPApiResponse>(
        { success: false, error: "Server ID is required" },
        { status: 400 }
      );
    }

    const status = await mcpClientManager.disconnect(serverId);

    return NextResponse.json<MCPApiResponse<MCPServerStatus>>({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("MCP disconnect error:", error);
    return NextResponse.json<MCPApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to disconnect",
      },
      { status: 500 }
    );
  }
}

