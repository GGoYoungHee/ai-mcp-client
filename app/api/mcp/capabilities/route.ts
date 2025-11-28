import { NextRequest, NextResponse } from "next/server";
import { mcpClientManager } from "@/lib/mcp/client-manager";
import type { MCPApiResponse, MCPServerCapabilities } from "@/lib/mcp/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const serverId = searchParams.get("serverId");

    if (!serverId) {
      return NextResponse.json<MCPApiResponse>(
        { success: false, error: "Server ID is required" },
        { status: 400 }
      );
    }

    const capabilities = mcpClientManager.getCapabilities(serverId);

    if (!capabilities) {
      return NextResponse.json<MCPApiResponse>(
        { success: false, error: "Server not connected or capabilities not available" },
        { status: 404 }
      );
    }

    return NextResponse.json<MCPApiResponse<MCPServerCapabilities>>({
      success: true,
      data: capabilities,
    });
  } catch (error) {
    console.error("MCP capabilities error:", error);
    return NextResponse.json<MCPApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get capabilities",
      },
      { status: 500 }
    );
  }
}

