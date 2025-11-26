/**
 * ✅ Glob Widget - 文件模式匹配展示
 *
 * 迁移自 ToolWidgets.tsx (原 640-691 行)
 * 用于展示 Glob 模式匹配操作和结果
 * 支持结果自动折叠和展开/收起功能
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, ChevronUp, FileText } from "lucide-react";
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
  const [shouldCollapse, setShouldCollapse] = useState(false);
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
      setShouldCollapse(defaultCollapsed);
      setIsCollapsed(defaultCollapsed);
      return;
    }

    // 基于行数判断
    if (fileCount > COLLAPSE_LINE_COUNT) {
      setShouldCollapse(true);
      setIsCollapsed(true);
      return;
    }

    // 基于高度判断
    const el = resultRef.current;
    if (el) {
      const needCollapse = el.scrollHeight > COLLAPSE_HEIGHT;
      setShouldCollapse(needCollapse);
      setIsCollapsed(needCollapse);
    }
  }, [result, fileCount, defaultCollapsed]);

  const toggleCollapse = () => setIsCollapsed((v) => !v);

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
        {/* 文件数量统计 */}
        {result && !isError && fileCount > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span>找到 {fileCount} 个文件</span>
          </div>
        )}
      </div>

      {/* 结果展示 - 支持折叠 */}
      {result && (
        <div className={cn(
          "rounded-md border",
          isError
            ? "border-red-500/20 bg-red-500/5"
            : "border-green-500/20 bg-green-500/5"
        )}>
          {/* 折叠控制按钮 */}
          {shouldCollapse && (
            <button
              onClick={toggleCollapse}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-left text-xs",
                "hover:bg-muted/30 transition-colors border-b",
                isError ? "border-red-500/20" : "border-green-500/20"
              )}
            >
              {isCollapsed ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
              <span className="font-medium">
                {isCollapsed ? `展开查看全部 ${fileCount} 个文件` : "收起结果"}
              </span>
            </button>
          )}

          {/* 结果内容区域 */}
          <div className="relative">
            <div
              ref={resultRef}
              className={cn(
                "p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto transition-[max-height] duration-200",
                isError ? "text-red-400" : "text-green-300",
                shouldCollapse && isCollapsed && "overflow-hidden"
              )}
              style={shouldCollapse && isCollapsed ? { maxHeight: `${COLLAPSE_HEIGHT}px` } : undefined}
            >
              {resultContent || (isError ? "搜索失败" : "No matches found")}
            </div>

            {/* 渐变遮罩 */}
            {shouldCollapse && isCollapsed && (
              <div className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-12",
                "bg-gradient-to-t",
                isError
                  ? "from-red-500/10 via-red-500/5 to-transparent"
                  : "from-green-500/10 via-green-500/5 to-transparent"
              )} />
            )}
          </div>

          {/* 底部展开按钮（折叠状态下显示） */}
          {shouldCollapse && isCollapsed && (
            <button
              onClick={toggleCollapse}
              className={cn(
                "flex items-center justify-center gap-1.5 w-full py-2 text-xs",
                "hover:bg-muted/30 transition-colors border-t",
                isError
                  ? "border-red-500/20 text-red-400"
                  : "border-green-500/20 text-green-400"
              )}
            >
              <ChevronDown className="h-3 w-3" />
              <span>点击展开</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
