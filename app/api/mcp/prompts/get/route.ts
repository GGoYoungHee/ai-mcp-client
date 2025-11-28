import { NextRequest, NextResponse } from "next/server";
import { mcpClientManager } from "@/lib/mcp/client-manager";
import type { MCPApiResponse, GetPromptRequest } from "@/lib/mcp/types";

export async function POST(req: NextRequest) {
  try {
    const { serverId, promptName, arguments: args }: GetPromptRequest = await req.json();

    if (!serverId || !promptName) {
      return NextResponse.json<MCPApiResponse>(
        { success: false, error: "Server ID and prompt name are required" },
        { status: 400 }
      );
    }

    const result = await mcpClientManager.getPrompt(serverId, promptName, args);

    return NextResponse.json<MCPApiResponse<unknown>>({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("MCP get prompt error:", error);
    return NextResponse.json<MCPApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get prompt",
      },
      { status: 500 }
    );
  }
}

