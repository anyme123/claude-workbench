/**
 * ✅ Grep Widget - 代码搜索展示
 *
 * 迁移并拆分自 ToolWidgets.tsx (原 1042-1335 行)
 * 主组件 (~120行) + GrepResults 子组件 (~200行)
 */

import React, { useState } from "react";
import { Search, Code, FolderOpen, FilePlus, X, ChevronUp, ChevronDown } from "lucide-react";
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
    <div className="space-y-2 w-full">
      {/* 紧凑型头部 */}
      <div 
        className="flex items-center justify-between bg-muted/30 p-2.5 rounded-md border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors group/header select-none"
        onClick={() => result && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Search className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm font-medium text-muted-foreground">Grep</span>
            <span className="text-muted-foreground/30">|</span>
            <div className="flex items-center gap-1.5 min-w-0 text-sm">
              <code className="font-mono text-foreground/90 font-medium truncate" title={pattern}>
                {pattern}
              </code>
            </div>
          </div>

          {/* 状态与统计 */}
          <div className="flex items-center gap-2 text-xs flex-shrink-0">
            {!result && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-pulse" />
                <span>搜索中...</span>
              </div>
            )}
            {/* 这里可以添加更多统计信息如果需要 */}
          </div>
        </div>

        {/* 展开/收起按钮 */}
        {result && (
          <div className="h-6 px-2 ml-2 text-muted-foreground group-hover/header:text-foreground flex items-center gap-1 transition-colors">
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </div>
        )}
      </div>

      {/* 搜索参数 & 结果 */}
      {isExpanded && (
        <div className="space-y-2">
          {/* 搜索参数面板 */}
          <div className="rounded-lg border bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
            <div className="grid gap-2">
              {/* 路径 */}
              {path && (
                <div className="flex items-start gap-3 text-xs">
                  <div className="flex items-center gap-1.5 min-w-[60px] text-muted-foreground">
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span className="font-medium">路径</span>
                  </div>
                  <code className="flex-1 font-mono bg-muted/50 px-2 py-0.5 rounded truncate text-foreground/80">
                    {path}
                  </code>
                </div>
              )}

              {/* 包含/排除 */}
              {(include || exclude) && (
                <div className="flex gap-4 text-xs">
                  {include && (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                        <FilePlus className="h-3.5 w-3.5" />
                        <span className="font-medium">包含</span>
                      </div>
                      <code className="font-mono bg-green-500/10 px-2 py-0.5 rounded text-green-700 dark:text-green-300">
                        {include}
                      </code>
                    </div>
                  )}

                  {exclude && (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                        <X className="h-3.5 w-3.5" />
                        <span className="font-medium">排除</span>
                      </div>
                      <code className="font-mono bg-red-500/10 px-2 py-0.5 rounded text-red-700 dark:text-red-300">
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
            <GrepResults
              resultContent={resultContent}
              isError={isError}
              isExpanded={true} // 既然外层已经展开，这里就直接显示
              onToggle={() => {}} // 禁用内部折叠，由外层控制
            />
          )}
        </div>
      )}
    </div>
  );
};
