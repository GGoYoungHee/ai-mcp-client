import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response("GEMINI_API_KEY is not set", { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Map messages to Gemini format
    const history = messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // Streaming response
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash-001",
      contents: history,
      config: {
        systemInstruction: "코드블럭이 있다면 코드블럭을 제대로 열고 닫아",
      },
    });

    // Create a ReadableStream from the Gemini stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.error(error);
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

