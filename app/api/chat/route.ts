import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { NextRequest } from "next/server";
import { mcpClientManager } from "@/lib/mcp/client-manager";

// Convert MCP tool schema to Gemini function declaration format
function convertToGeminiFunctions(tools: Array<{
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  serverId: string;
}>): { declarations: FunctionDeclaration[]; toolMap: Map<string, { serverId: string; toolName: string }> } {
  const toolMap = new Map<string, { serverId: string; toolName: string }>();
  
  const declarations = tools.map((tool) => {
    // Create a safe function name (alphanumeric and underscore only)
    const safeName = `${tool.serverId}__${tool.name}`.replace(/[^a-zA-Z0-9_]/g, "_");
    
    toolMap.set(safeName, {
      serverId: tool.serverId,
      toolName: tool.name,
    });

    const parameters: Record<string, unknown> = {};
    
    if (tool.inputSchema && typeof tool.inputSchema === "object") {
      const schema = tool.inputSchema as Record<string, unknown>;
      
      // Handle JSON Schema format
      if (schema.properties) {
        parameters.type = Type.OBJECT;
        parameters.properties = {};
        
        const props = schema.properties as Record<string, unknown>;
        for (const [key, value] of Object.entries(props)) {
          const prop = value as Record<string, unknown>;
          (parameters.properties as Record<string, unknown>)[key] = {
            type: mapJsonSchemaTypeToGemini(prop.type as string),
            description: prop.description || "",
          };
        }
        
        if (schema.required && Array.isArray(schema.required)) {
          parameters.required = schema.required;
        }
      } else {
        parameters.type = Type.OBJECT;
        parameters.properties = {};
      }
    } else {
      parameters.type = Type.OBJECT;
      parameters.properties = {};
    }

    return {
      name: safeName,
      description: tool.description || tool.name,
      parameters,
    };
  });

  return { declarations, toolMap };
}

function mapJsonSchemaTypeToGemini(type: string): Type {
  switch (type) {
    case "string":
      return Type.STRING;
    case "number":
    case "integer":
      return Type.NUMBER;
    case "boolean":
      return Type.BOOLEAN;
    case "array":
      return Type.ARRAY;
    case "object":
      return Type.OBJECT;
    default:
      return Type.STRING;
  }
}

// Get all tools from connected MCP servers
async function getConnectedMCPTools() {
  const allStatuses = mcpClientManager.getAllStatuses();
  const connectedServers = allStatuses.filter((s) => s.status === "connected");

  const allTools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    serverId: string;
  }> = [];

  for (const status of connectedServers) {
    const capabilities = mcpClientManager.getCapabilities(status.serverId);
    if (capabilities?.tools) {
      for (const tool of capabilities.tools) {
        allTools.push({
          ...tool,
          serverId: status.serverId,
        });
      }
    }
  }

  return allTools;
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response("GEMINI_API_KEY is not set", { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Get connected MCP tools
    const mcpTools = await getConnectedMCPTools();
    const { declarations, toolMap } = convertToGeminiFunctions(mcpTools);

    // Map messages to Gemini format
    const history = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Build config with tools if available
    const config: Record<string, unknown> = {
      systemInstruction: `You are a helpful assistant. 코드블럭이 있다면 코드블럭을 제대로 열고 닫아.
${mcpTools.length > 0 ? `You have access to the following tools. Use them when appropriate to help the user.` : ""}`,
    };

    // Add tools to config if available
    if (declarations.length > 0) {
      config.tools = [{
        functionDeclarations: declarations,
      }];
    }

    // Non-streaming approach for function calling
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-001",
      contents: history,
      config,
    });

    // Check if there's a function call
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    let finalText = "";
    const toolResults: Array<{ toolName: string; result: unknown }> = [];

    for (const part of parts) {
      if (part.text) {
        finalText += part.text;
      }
      
      if (part.functionCall) {
        const fnCall = part.functionCall;
        const originalInfo = toolMap.get(fnCall.name || "");
        
        if (originalInfo) {
          try {
            // Call MCP tool
            const result = await mcpClientManager.callTool(
              originalInfo.serverId,
              originalInfo.toolName,
              fnCall.args as Record<string, unknown>
            );
            
            toolResults.push({
              toolName: originalInfo.toolName,
              result,
            });

            // Add tool result to conversation and get final response
            const toolResultContent = [
              ...history,
              {
                role: "model",
                parts: [{ functionCall: fnCall }],
              },
              {
                role: "user",
                parts: [{
                  functionResponse: {
                    name: fnCall.name,
                    response: result,
                  },
                }],
              },
            ];

            const finalResponse = await ai.models.generateContent({
              model: "gemini-2.0-flash-001",
              contents: toolResultContent,
              config,
            });

            finalText = finalResponse.candidates?.[0]?.content?.parts?.[0]?.text || "";
          } catch (error) {
            console.error("Tool call error:", error);
            finalText += `\n\n[Tool Error: ${error instanceof Error ? error.message : "Unknown error"}]`;
          }
        }
      }
    }

    // Return as streaming response for consistency with frontend
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(finalText));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
