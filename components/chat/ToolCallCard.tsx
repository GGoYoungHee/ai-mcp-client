"use client";

import { useState } from "react";
import { Loader2, CheckCircle, XCircle, Wrench, Download, ZoomIn } from "lucide-react";
import type { ToolCallInfo } from "@/lib/mcp/types";
import { cn } from "@/lib/utils";

// MCP 이미지 콘텐츠 타입 (with optional storage URL)
interface MCPImageContent {
  type: "image";
  data: string;
  mimeType: string;
  storageUrl?: string; // Supabase Storage URL (persistent)
}

interface MCPTextContent {
  type: "text";
  text: string;
}

type MCPContent = MCPImageContent | MCPTextContent;

interface MCPResult {
  content?: MCPContent[];
}

// 결과에서 이미지 콘텐츠 추출
function extractImageContents(result: unknown): MCPImageContent[] {
  if (!result || typeof result !== "object") return [];
  
  const mcpResult = result as MCPResult;
  if (!mcpResult.content || !Array.isArray(mcpResult.content)) return [];
  
  return mcpResult.content.filter(
    (item): item is MCPImageContent => 
      item.type === "image" && (typeof item.data === "string" || typeof item.storageUrl === "string")
  );
}

// 결과에서 텍스트 콘텐츠 추출
function extractTextContents(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  
  const mcpResult = result as MCPResult;
  if (!mcpResult.content || !Array.isArray(mcpResult.content)) return [];
  
  return mcpResult.content
    .filter((item): item is MCPTextContent => item.type === "text" && typeof item.text === "string")
    .map(item => item.text);
}

// 이미지 렌더링 컴포넌트
// Storage URL이 있으면 사용하고, 없으면 base64 데이터 사용
function ImageResult({ image, index }: { image: MCPImageContent; index: number }) {
  const [isZoomed, setIsZoomed] = useState(false);
  
  // Storage URL 우선 사용 (영구 저장), 없으면 base64 fallback
  const imageSrc = image.storageUrl || `data:${image.mimeType};base64,${image.data}`;
  const isStorageUrl = !!image.storageUrl;
  
  const handleDownload = async () => {
    const link = document.createElement("a");
    const filename = `generated-image-${index + 1}.${image.mimeType.split("/")[1] || "png"}`;
    
    if (isStorageUrl) {
      // Storage URL인 경우 fetch로 다운로드
      try {
        const response = await fetch(imageSrc);
        const blob = await response.blob();
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (error) {
        console.error("Download failed:", error);
        // Fallback: 새 탭에서 열기
        window.open(imageSrc, "_blank");
      }
    } else {
      // Base64인 경우 직접 다운로드
      link.href = imageSrc;
      link.download = filename;
      link.click();
    }
  };
  
  return (
    <>
      <div className="relative group">
        <img
          src={imageSrc}
          alt={`Generated image ${index + 1}`}
          className="max-w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer transition-transform hover:scale-[1.02]"
          onClick={() => setIsZoomed(true)}
        />
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setIsZoomed(true)}
            className="p-2 bg-black/50 hover:bg-black/70 rounded-lg text-white transition-colors"
            title="확대"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 bg-black/50 hover:bg-black/70 rounded-lg text-white transition-colors"
            title="다운로드"
          >
            <Download size={16} />
          </button>
        </div>
        {/* Storage에 저장된 이미지 표시 */}
        {isStorageUrl && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-green-500/80 rounded text-xs text-white">
            저장됨
          </div>
        )}
      </div>
      
      {/* 확대 모달 */}
      {isZoomed && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setIsZoomed(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={imageSrc}
              alt={`Generated image ${index + 1}`}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={handleDownload}
              className="absolute top-4 right-4 p-3 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
              title="다운로드"
            >
              <Download size={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// 결과 표시 컴포넌트
function ResultDisplay({ result }: { result: unknown }) {
  const images = extractImageContents(result);
  const texts = extractTextContents(result);
  
  // 이미지나 텍스트 콘텐츠가 있는 경우
  if (images.length > 0 || texts.length > 0) {
    return (
      <div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">결과:</div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          {/* 이미지 렌더링 */}
          {images.length > 0 && (
            <div className={cn(
              "grid gap-3",
              images.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
            )}>
              {images.map((img, idx) => (
                <ImageResult key={idx} image={img} index={idx} />
              ))}
            </div>
          )}
          
          {/* 텍스트 렌더링 */}
          {texts.length > 0 && (
            <div className="space-y-2">
              {texts.map((text, idx) => (
                <p key={idx} className="text-sm text-gray-800 dark:text-gray-200">
                  {text}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // 일반 결과 (이미지/텍스트 콘텐츠가 아닌 경우)
  return (
    <div>
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">결과:</div>
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
        {result !== undefined ? (
          <pre className="text-sm text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap">
            {typeof result === "string" 
              ? result 
              : JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <span className="text-sm text-gray-400 italic">(반환값 없음)</span>
        )}
      </div>
    </div>
  );
}

interface ToolCallCardProps {
  toolCall: ToolCallInfo;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const statusConfig = {
    calling: {
      icon: Loader2,
      iconClass: "animate-spin",
      badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      label: "호출 중...",
    },
    success: {
      icon: CheckCircle,
      iconClass: "",
      badgeClass: "bg-gray-800 text-white dark:bg-gray-700",
      label: "완료",
    },
    error: {
      icon: XCircle,
      iconClass: "",
      badgeClass: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      label: "오류",
    },
  };

  const config = statusConfig[toolCall.status];
  const StatusIcon = config.icon;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 my-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <Wrench size={16} className="text-blue-500" />
        <span className="font-medium text-gray-900 dark:text-gray-100">함수 호출:</span>
        <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{toolCall.toolName}</span>
        <span className={cn(
          "ml-2 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1",
          config.badgeClass
        )}>
          <StatusIcon size={12} className={config.iconClass} />
          {config.label}
        </span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Arguments */}
        <div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">매개변수:</div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 ? (
              <pre className="text-sm text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            ) : (
              <span className="text-sm text-gray-400 italic">(매개변수 없음)</span>
            )}
          </div>
        </div>

        {/* Result */}
        {toolCall.status === "success" && (
          <ResultDisplay result={toolCall.result} />
        )}

        {/* Loading */}
        {toolCall.status === "calling" && (
          <div className="flex items-center gap-2 text-sm text-blue-500">
            <Loader2 size={14} className="animate-spin" />
            <span>실행 중...</span>
          </div>
        )}

        {/* Error */}
        {toolCall.status === "error" && toolCall.error && (
          <div>
            <div className="text-sm text-red-500 dark:text-red-400 mb-2">오류:</div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-3">
              <pre className="text-sm text-red-700 dark:text-red-300 overflow-x-auto whitespace-pre-wrap">
                {toolCall.error}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Multiple tool calls display
interface ToolCallsDisplayProps {
  toolCalls: ToolCallInfo[];
}

export function ToolCallsDisplay({ toolCalls }: ToolCallsDisplayProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="space-y-2">
      {toolCalls.map((tc) => (
        <ToolCallCard key={tc.id} toolCall={tc} />
      ))}
    </div>
  );
}
