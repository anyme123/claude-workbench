/**
 * ✅ WebFetch Widget - 网页内容获取展示
 *
 * 迁移自 ToolWidgets.tsx (原 2865-3031 行)
 * 用于展示网页获取操作和内容预览
 */

import React, { useState } from "react";
import { Globe, FileText, ChevronRight, Info, AlertCircle } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";

export interface WebFetchWidgetProps {
  /** URL 地址 */
  url: string;
  /** 分析提示（可选） */
  prompt?: string;
  /** 工具结果 */
  result?: any;
}

/**
 * 网页获取 Widget
 *
 * Features:
 * - 显示 URL 和获取状态
 * - 可折叠的分析提示
 * - 内容预览和展开
 * - 错误处理
 */
export const WebFetchWidget: React.FC<WebFetchWidgetProps> = ({
  url,
  prompt,
  result,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);

  // 提取结果内容
  let fetchedContent = '';
  let isLoading = !result;
  let hasError = false;

  if (result) {
    if (typeof result.content === 'string') {
      fetchedContent = result.content;
    } else if (result.content && typeof result.content === 'object') {
      if (result.content.text) {
        fetchedContent = result.content.text;
      } else if (Array.isArray(result.content)) {
        fetchedContent = result.content
          .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
          .join('\n');
      } else {
        fetchedContent = JSON.stringify(result.content, null, 2);
      }
    }

    // 检查是否有错误
    hasError = result.is_error ||
               fetchedContent.toLowerCase().includes('error') ||
               fetchedContent.toLowerCase().includes('failed');
  }

  // 内容截断（预览模式）
  const maxPreviewLength = 500;
  const isTruncated = fetchedContent.length > maxPreviewLength;
  const previewContent = isTruncated && !isContentExpanded
    ? fetchedContent.substring(0, maxPreviewLength) + '...'
    : fetchedContent;

  // 从 URL 提取域名
  const getDomain = (urlString: string) => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.hostname;
    } catch {
      return urlString;
    }
  };

  // 打开 URL
  const handleUrlClick = async () => {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* 头部：URL 和可选的提示 */}
      <div className="space-y-2">
        {/* URL 显示 */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
          <Globe className="h-4 w-4 text-purple-500/70" />
          <span className="text-xs font-medium uppercase tracking-wider text-purple-600/70 dark:text-purple-400/70">获取中</span>
          <button
            onClick={handleUrlClick}
            className="text-sm text-foreground/80 hover:text-foreground flex-1 truncate text-left hover:underline decoration-purple-500/50"
          >
            {url}
          </button>
        </div>

        {/* 分析提示（可折叠） */}
        {prompt && (
          <div className="ml-6 space-y-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
              <Info className="h-3 w-3" />
              <span>分析提示</span>
            </button>

            {isExpanded && (
              <div className="rounded-lg border bg-muted/30 p-3 ml-4">
                <p className="text-sm text-foreground/90">
                  {prompt}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 结果展示 */}
      {isLoading ? (
        // 加载中状态
        <div className="rounded-lg border bg-background/50 backdrop-blur-sm overflow-hidden">
          <div className="px-3 py-2 flex items-center gap-2 text-muted-foreground">
            <div className="animate-pulse flex items-center gap-1">
              <div className="h-1 w-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="h-1 w-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="h-1 w-1 bg-purple-500 rounded-full animate-bounce"></div>
            </div>
            <span className="text-sm">从 {getDomain(url)} 获取内容中...</span>
          </div>
        </div>
      ) : fetchedContent ? (
        // 有内容
        <div className="rounded-lg border bg-background/50 backdrop-blur-sm overflow-hidden">
          {hasError ? (
            // 错误状态
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">无法获取内容</span>
              </div>
              <pre className="mt-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                {fetchedContent}
              </pre>
            </div>
          ) : (
            // 成功状态
            <div className="p-3 space-y-2">
              {/* 内容头部 */}
              <div className="px-4 py-2 border-b bg-zinc-700/30 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  <span>从 {getDomain(url)} 获取的内容</span>
                </div>
                {isTruncated && (
                  <button
                    onClick={() => setIsContentExpanded(!isContentExpanded)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronRight className={cn("h-3 w-3 transition-transform", isContentExpanded && "rotate-90")} />
                    <span>{isContentExpanded ? '收起' : '展开'}</span>
                  </button>
                )}
              </div>

              {/* 获取的内容 */}
              {(!isTruncated || isContentExpanded) && (
                <div className="relative">
                  <div className="rounded-lg bg-muted/30 p-3 overflow-hidden">
                    <pre className="text-sm font-mono text-foreground/90 whitespace-pre-wrap">
                      {previewContent}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        // 无内容
        <div className="rounded-lg border bg-background/50 backdrop-blur-sm overflow-hidden">
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="h-4 w-4" />
              <span className="text-sm">没有返回内容</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
