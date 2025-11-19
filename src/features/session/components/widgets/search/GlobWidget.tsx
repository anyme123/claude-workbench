/**
 * ✅ Glob Widget - 文件模式匹配展示
 *
 * 迁移自 ToolWidgets.tsx (原 640-691 行)
 * 用于展示 Glob 模式匹配操作和结果
 */

import React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GlobWidgetProps {
  /** 匹配模式 */
  pattern: string;
  /** 工具结果 */
  result?: any;
}

/**
 * Glob 文件匹配 Widget
 *
 * 展示文件模式匹配操作和搜索结果
 */
export const GlobWidget: React.FC<GlobWidgetProps> = ({ pattern, result }) => {
  // 提取结果内容
  let resultContent = '';
  let isError = false;

  if (result) {
    isError = result.is_error || false;
    if (typeof result.content === 'string') {
      resultContent = result.content;
    } else if (result.content && typeof result.content === 'object') {
      if (result.content.text) {
        resultContent = result.content.text;
      } else if (Array.isArray(result.content)) {
        resultContent = result.content
          .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
          .join('\n');
      } else {
        resultContent = JSON.stringify(result.content, null, 2);
      }
    }
  }

  return (
    <div className="space-y-2">
      {/* 头部 */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
        <Search className="h-4 w-4 text-primary" />
        <span className="text-sm">正在搜索模式：</span>
        <code className="text-sm font-mono bg-background px-2 py-0.5 rounded">
          {pattern}
        </code>
        {!result && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
            <span>搜索中...</span>
          </div>
        )}
      </div>

      {/* 结果展示 */}
      {result && (
        <div className={cn(
          "p-3 rounded-md border text-xs font-mono whitespace-pre-wrap overflow-x-auto",
          isError
            ? "border-red-500/20 bg-red-500/5 text-red-400"
            : "border-green-500/20 bg-green-500/5 text-green-300"
        )}>
          {resultContent || (isError ? "搜索失败" : "No matches found")}
        </div>
      )}
    </div>
  );
};
