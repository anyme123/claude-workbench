/**
 * ✅ Grep Widget - 代码搜索展示
 *
 * 迁移并拆分自 ToolWidgets.tsx (原 1042-1335 行)
 * 主组件 (~120行) + GrepResults 子组件 (~200行)
 */

import React, { useState } from "react";
import { Search, Code, FolderOpen, FilePlus, X } from "lucide-react";
import { GrepResults } from "./components/GrepResults";

export interface GrepWidgetProps {
  /** 搜索模式 */
  pattern: string;
  /** 包含模式（可选） */
  include?: string;
  /** 搜索路径（可选） */
  path?: string;
  /** 排除模式（可选） */
  exclude?: string;
  /** 工具结果 */
  result?: any;
}

/**
 * Grep 搜索 Widget
 *
 * Features:
 * - 显示搜索参数（模式、路径、包含/排除）
 * - 解析多种 grep 输出格式
 * - 可折叠的结果列表
 */
export const GrepWidget: React.FC<GrepWidgetProps> = ({
  pattern,
  include,
  path,
  exclude,
  result,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

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
      <div className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
        <Search className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-medium">使用 grep 搜索</span>
        {!result && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
            <span>搜索中...</span>
          </div>
        )}
      </div>

      {/* 搜索参数 */}
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <div className="grid gap-2">
          {/* 模式 */}
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-1.5 min-w-[80px]">
              <Code className="h-3 w-3 text-emerald-500" />
              <span className="text-xs font-medium text-muted-foreground">模式</span>
            </div>
            <code className="flex-1 font-mono text-sm bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-md text-emerald-600 dark:text-emerald-400">
              {pattern}
            </code>
          </div>

          {/* 路径 */}
          {path && (
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-1.5 min-w-[80px]">
                <FolderOpen className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">路径</span>
              </div>
              <code className="flex-1 font-mono text-xs bg-muted px-2 py-1 rounded truncate">
                {path}
              </code>
            </div>
          )}

          {/* 包含/排除 */}
          {(include || exclude) && (
            <div className="flex gap-4">
              {include && (
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-1.5">
                    <FilePlus className="h-3 w-3 text-green-500" />
                    <span className="text-xs font-medium text-muted-foreground">包含</span>
                  </div>
                  <code className="font-mono text-xs bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded text-green-600 dark:text-green-400">
                    {include}
                  </code>
                </div>
              )}

              {exclude && (
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-1.5">
                    <X className="h-3 w-3 text-red-500" />
                    <span className="text-xs font-medium text-muted-foreground">排除</span>
                  </div>
                  <code className="font-mono text-xs bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded text-red-600 dark:text-red-400">
                    {exclude}
                  </code>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 结果展示 */}
      {result && (
        <div className="space-y-2">
          <GrepResults
            resultContent={resultContent}
            isError={isError}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(!isExpanded)}
          />
        </div>
      )}
    </div>
  );
};
