import { NextRequest, NextResponse } from "next/server";
import { mcpClientManager } from "@/lib/mcp/client-manager";
import type { MCPApiResponse, CallToolRequest } from "@/lib/mcp/types";

export async function POST(req: NextRequest) {
  try {
    const { serverId, toolName, arguments: args }: CallToolRequest = await req.json();

    if (!serverId || !toolName) {
      return NextResponse.json<MCPApiResponse>(
        { success: false, error: "Server ID and tool name are required" },
        { status: 400 }
      );
    }

    const result = await mcpClientManager.callTool(serverId, toolName, args);

    return NextResponse.json<MCPApiResponse<unknown>>({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("MCP tool call error:", error);
    return NextResponse.json<MCPApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to call tool",
      },
      { status: 500 }
    );
  }
}

