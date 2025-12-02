/**
 * ✅ Glob Widget - 文件模式匹配展示
 *
 * 迁移自 ToolWidgets.tsx (原 640-691 行)
 * 用于展示 Glob 模式匹配操作和结果
 * 支持结果自动折叠和展开/收起功能
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** 自动折叠的高度阈值 (px) */
const COLLAPSE_HEIGHT = 200;

/** 自动折叠的行数阈值 */
const COLLAPSE_LINE_COUNT = 10;

export interface GlobWidgetProps {
  /** 匹配模式 */
  pattern: string;
  /** 工具结果 */
  result?: any;
  /** 默认折叠状态（可选，自动根据结果数量决定） */
  defaultCollapsed?: boolean;
}

/**
 * Glob 文件匹配 Widget
 *
 * 展示文件模式匹配操作和搜索结果
 * 支持结果自动折叠和展开/收起功能
 */
export const GlobWidget: React.FC<GlobWidgetProps> = ({ pattern, result, defaultCollapsed }) => {
  const resultRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

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

  // 解析匹配的文件列表
  const fileList = useMemo(() => {
    if (!resultContent || isError) return [];
    // 按行分割，过滤空行
    return resultContent.split('\n').filter(line => line.trim());
  }, [resultContent, isError]);

  // 文件数量统计
  const fileCount = fileList.length;

  // 根据内容高度或行数判断是否需要折叠
  useEffect(() => {
    if (defaultCollapsed !== undefined) {
      setIsCollapsed(defaultCollapsed);
      return;
    }

    // 基于行数判断
    if (fileCount > COLLAPSE_LINE_COUNT) {
      setIsCollapsed(true);
      return;
    }

    // 基于高度判断
    const el = resultRef.current;
    if (el) {
      const needCollapse = el.scrollHeight > COLLAPSE_HEIGHT;
      setIsCollapsed(needCollapse);
    }
  }, [result, fileCount, defaultCollapsed]);

  return (
    <div className="space-y-2 w-full">
      {/* 紧凑型头部 */}
      <div 
        className="flex items-center justify-between bg-muted/30 p-2.5 rounded-md border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors group/header select-none"
        onClick={() => result && fileCount > 0 && setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Search className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0 text-sm">
              <span className="text-sm font-medium text-muted-foreground">Glob</span>
              <span className="text-muted-foreground/30">|</span>
              <code className="font-mono text-foreground/90 font-medium truncate" title={pattern}>
                {pattern}
              </code>
            </div>
          </div>

          {!result && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-pulse" />
              <span>搜索中...</span>
            </div>
          )}

          {/* 状态与统计 */}
          {result && !isError && (
            <div className="flex items-center gap-2 text-xs flex-shrink-0">
              <span className="text-green-600 dark:text-green-400 font-medium">
                找到 {fileCount} 个文件
              </span>
            </div>
          )}
          
          {result && isError && (
            <div className="flex items-center gap-2 text-xs flex-shrink-0">
              <span className="text-red-600 dark:text-red-400 font-medium">
                搜索失败
              </span>
            </div>
          )}
        </div>

        {/* 展开/收起按钮 */}
        {result && fileCount > 0 && (
          <div className="h-6 px-2 ml-2 text-muted-foreground group-hover/header:text-foreground flex items-center gap-1 transition-colors">
            {isCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </div>
        )}
      </div>

      {/* 结果展示 */}
      {result && !isCollapsed && (
        <div className={cn(
          "rounded-lg border overflow-hidden bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800",
          isError && "border-red-500/20 bg-red-500/5"
        )}>
          <div
            ref={resultRef}
            className={cn(
              "p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto",
              isError
                ? "text-red-600 dark:text-red-400"
                : "text-foreground/80"
            )}
            style={{ fontSize: '0.8rem', lineHeight: '1.5' }}
          >
            {resultContent || (isError ? "搜索失败" : "No matches found")}
          </div>
        </div>
      )}
    </div>
  );
};
