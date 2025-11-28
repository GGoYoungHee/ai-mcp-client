"use client";

import { useState } from "react";
import { Loader2, CheckCircle, XCircle, Wrench } from "lucide-react";
import type { ToolCallInfo } from "@/lib/mcp/types";
import { cn } from "@/lib/utils";

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
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">결과:</div>
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              {toolCall.result !== undefined ? (
                <pre className="text-sm text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap">
                  {typeof toolCall.result === "string" 
                    ? toolCall.result 
                    : JSON.stringify(toolCall.result, null, 2)}
                </pre>
              ) : (
                <span className="text-sm text-gray-400 italic">(반환값 없음)</span>
              )}
            </div>
          </div>
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
