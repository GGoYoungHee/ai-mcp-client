import { NextRequest, NextResponse } from "next/server";
import { mcpClientManager } from "@/lib/mcp/client-manager";
import type { MCPServerConfig, MCPApiResponse, MCPServerStatus } from "@/lib/mcp/types";

export async function POST(req: NextRequest) {
  try {
    const config: MCPServerConfig = await req.json();

    if (!config || !config.id) {
      return NextResponse.json<MCPApiResponse>(
        { success: false, error: "Invalid server config" },
        { status: 400 }
      );
    }

    const status = await mcpClientManager.connect(config);

    return NextResponse.json<MCPApiResponse<MCPServerStatus>>({
      success: status.status === "connected",
      data: status,
      error: status.error,
    });
  } catch (error) {
    console.error("MCP connect error:", error);
    return NextResponse.json<MCPApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to connect",
      },
      { status: 500 }
    );
  }
}

