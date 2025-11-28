import { NextRequest, NextResponse } from "next/server";
import { mcpClientManager } from "@/lib/mcp/client-manager";
import type { MCPApiResponse, ReadResourceRequest } from "@/lib/mcp/types";

export async function POST(req: NextRequest) {
  try {
    const { serverId, uri }: ReadResourceRequest = await req.json();

    if (!serverId || !uri) {
      return NextResponse.json<MCPApiResponse>(
        { success: false, error: "Server ID and URI are required" },
        { status: 400 }
      );
    }

    const result = await mcpClientManager.readResource(serverId, uri);

    return NextResponse.json<MCPApiResponse<unknown>>({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("MCP read resource error:", error);
    return NextResponse.json<MCPApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to read resource",
      },
      { status: 500 }
    );
  }
}

