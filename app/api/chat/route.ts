import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { NextRequest } from "next/server";
import { mcpClientManager } from "@/lib/mcp/client-manager";
import type { ToolCallInfo } from "@/lib/mcp/types";

// Convert MCP tool schema to Gemini function declaration format
function convertToGeminiFunctions(tools: Array<{
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  serverId: string;
}>): { declarations: FunctionDeclaration[]; toolMap: Map<string, { serverId: string; toolName: string }> } {
  const toolMap = new Map<string, { serverId: string; toolName: string }>();
  
  const declarations = tools.map((tool, index) => {
    // Create a safe function name: must start with letter/underscore, alphanumeric only
    // Use index to ensure uniqueness, and sanitize tool name
    const sanitizedToolName = tool.name.replace(/[^a-zA-Z0-9_]/g, "_");
    const safeName = `mcp_${index}_${sanitizedToolName}`.substring(0, 64);
    
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
  console.log("All MCP statuses:", allStatuses);
  
  const connectedServers = allStatuses.filter((s) => s.status === "connected");
  console.log("Connected servers:", connectedServers.length);

  const allTools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    serverId: string;
  }> = [];

  for (const status of connectedServers) {
    const capabilities = mcpClientManager.getCapabilities(status.serverId);
    console.log(`Capabilities for ${status.serverId}:`, capabilities?.tools?.length || 0, "tools");
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
    const { messages, mcpEnabled = true } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response("GEMINI_API_KEY is not set", { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Get connected MCP tools only if enabled
    const mcpTools = mcpEnabled ? await getConnectedMCPTools() : [];
    const { declarations, toolMap } = convertToGeminiFunctions(mcpTools);

    // Map messages to Gemini format
    const history = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Build config with tools if available
    const toolNames = mcpTools.map(t => t.name).join(", ");
    
    const config: Record<string, unknown> = {
      systemInstruction: `You are a helpful assistant. 코드블럭이 있다면 코드블럭을 제대로 열고 닫아.
${mcpTools.length > 0 ? `
You have access to the following tools: ${toolNames}

IMPORTANT: When the user asks about time, date, or timezone information, you MUST use the available time-related tools to get accurate current time. Do NOT guess or make up the time. Always call the tool first, then respond based on the tool's result.

Use tools when appropriate to help the user with accurate information.` : ""}`,
    };

    // Add tools to config if available
    if (declarations.length > 0) {
      config.tools = [{
        functionDeclarations: declarations,
      }];
    }

    console.log("MCP Tools available:", mcpTools.length, mcpTools.map(t => t.name));
    console.log("Declarations:", declarations.length);

    // Use SSE stream for real-time tool call updates
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Non-streaming approach for function calling
          const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-001",
            contents: history,
            config,
          });

          // Check if there's a function call
          const candidate = response.candidates?.[0];
          const parts = candidate?.content?.parts || [];
          
          console.log("Response parts:", JSON.stringify(parts, null, 2));
          
          let finalText = "";
          const toolCalls: ToolCallInfo[] = [];

          for (const part of parts) {
            if (part.text) {
              finalText += part.text;
            }
            
            if (part.functionCall) {
              const fnCall = part.functionCall;
              const originalInfo = toolMap.get(fnCall.name || "");
              
              if (originalInfo) {
                const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                const toolCallInfo: ToolCallInfo = {
                  id: toolCallId,
                  toolName: originalInfo.toolName,
                  serverId: originalInfo.serverId,
                  arguments: fnCall.args as Record<string, unknown>,
                  status: "calling",
                  startedAt: Date.now(),
                };
                
                // Send tool call start event
                controller.enqueue(encoder.encode(`[TOOL_CALL]${JSON.stringify(toolCallInfo)}[/TOOL_CALL]`));
                
                try {
                  // Call MCP tool
                  const result = await mcpClientManager.callTool(
                    originalInfo.serverId,
                    originalInfo.toolName,
                    fnCall.args as Record<string, unknown>
                  );
                  
                  // Update tool call info with result
                  toolCallInfo.status = "success";
                  toolCallInfo.result = result;
                  toolCallInfo.completedAt = Date.now();
                  toolCalls.push(toolCallInfo);
                  
                  // Send tool call result event
                  controller.enqueue(encoder.encode(`[TOOL_RESULT]${JSON.stringify(toolCallInfo)}[/TOOL_RESULT]`));

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
                  // Update tool call info with error
                  toolCallInfo.status = "error";
                  toolCallInfo.error = error instanceof Error ? error.message : "Unknown error";
                  toolCallInfo.completedAt = Date.now();
                  toolCalls.push(toolCallInfo);
                  
                  // Send tool call error event
                  controller.enqueue(encoder.encode(`[TOOL_RESULT]${JSON.stringify(toolCallInfo)}[/TOOL_RESULT]`));
                  
                  console.error("Tool call error:", error);
                  finalText += `\n\n[Tool Error: ${error instanceof Error ? error.message : "Unknown error"}]`;
                }
              }
            }
          }

          // Send final text content
          if (finalText) {
            controller.enqueue(encoder.encode(`[TEXT]${finalText}[/TEXT]`));
          }
          
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(encoder.encode(`[TEXT]Error generating response: ${error instanceof Error ? error.message : "Unknown error"}[/TEXT]`));
          controller.close();
        }
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
