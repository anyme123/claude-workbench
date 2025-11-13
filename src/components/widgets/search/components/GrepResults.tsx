/**
 * ✅ Grep Results Component - Grep 搜索结果展示子组件
 *
 * 从 GrepWidget 中提取，用于解析和展示 grep 搜索结果
 */

import React, { useMemo } from "react";
import { FileText, AlertCircle, Info, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GrepMatch {
  file: string;
  lineNumber: number;
  content: string;
}

export interface GrepResultsProps {
  /** 结果内容（原始字符串） */
  resultContent: string;
  /** 是否为错误 */
  isError: boolean;
  /** 是否展开 */
  isExpanded: boolean;
  /** 切换展开回调 */
  onToggle: () => void;
}

/**
 * 解析 Grep 结果
 */
const parseGrepResults = (resultContent: string, isError: boolean): GrepMatch[] => {
  if (!resultContent || isError) return [];

  const lines = resultContent.split('\n').filter(line => line.trim());
  const results: GrepMatch[] = [];

  // 检查是否为 "files_with_matches" 模式（只有文件路径）
  const isFilesOnlyMode = lines.length > 0 &&
    lines.every(line => {
      return !line.includes(':') ||
             (line.split(':').length === 2 && line.match(/\.[a-zA-Z]+$/));
    });

  if (isFilesOnlyMode) {
    // 仅文件模式 - 每行是一个文件路径
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        results.push({
          file: trimmedLine,
          lineNumber: 0,
          content: '(文件包含匹配项)'
        });
      }
    });
  } else {
    // 详细模式 - 解析不同格式
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      // 格式 1: filename:lineNumber:content (标准 grep -n 输出)
      const match = trimmedLine.match(/^(.+?):(\d+):(.*)$/);

      if (match) {
        results.push({
          file: match[1],
          lineNumber: parseInt(match[2], 10),
          content: match[3] || '(匹配行)'
        });
      } else {
        // 格式 2: 仅文件路径
        if (trimmedLine.includes('/') || trimmedLine.includes('\\') || trimmedLine.includes('.')) {
          results.push({
            file: trimmedLine,
            lineNumber: 0,
            content: '(文件包含匹配项)'
          });
        }
      }
    });
  }

  return results;
};

/**
 * Grep 搜索结果组件
 */
export const GrepResults: React.FC<GrepResultsProps> = ({
  resultContent,
  isError,
  isExpanded,
  onToggle,
}) => {
  // 解析结果（使用 useMemo 避免重复解析）
  const grepResults = useMemo(() => {
    return parseGrepResults(resultContent, isError);
  }, [resultContent, isError]);

  if (isError) {
    // 错误状态
    return (
      <>
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-600 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span>搜索失败</span>
        </button>
        {isExpanded && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <div className="text-sm text-red-600 dark:text-red-400">
              {resultContent || "搜索失败"}
            </div>
          </div>
        )}
      </>
    );
  }

  if (grepResults.length > 0) {
    // 有匹配结果
    return (
      <>
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span>{grepResults.length} 个匹配项</span>
        </button>

        {isExpanded && (
          <div className="rounded-lg border bg-zinc-950 overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              {grepResults.map((match, idx) => {
                const fileName = match.file.split('/').pop() || match.file;
                const dirPath = match.file.substring(0, match.file.lastIndexOf('/'));

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-start gap-3 p-3 border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors",
                      idx === grepResults.length - 1 && "border-b-0"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-[60px]">
                      <FileText className="h-3.5 w-3.5 text-emerald-500" />
                      {match.lineNumber > 0 ? (
                        <span className="text-xs font-mono text-emerald-400">
                          {match.lineNumber}
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-muted-foreground">
                          文件
                        </span>
                      )}
                    </div>

                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-blue-400 truncate">
                          {fileName}
                        </span>
                        {dirPath && (
                          <span className="text-xs text-muted-foreground truncate">
                            {dirPath}
                          </span>
                        )}
                      </div>
                      {match.content && (
                        <code className="text-xs font-mono text-zinc-300 block whitespace-pre-wrap break-all">
                          {match.content.trim()}
                        </code>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  }

  // 无匹配结果
  return (
    <>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-medium text-amber-500 hover:text-amber-600 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span>无匹配结果</span>
      </button>
      {isExpanded && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Info className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="text-sm text-amber-600 dark:text-amber-400">
            没有找到与给定模式匹配的结果。
          </div>
        </div>
      )}
    </>
  );
};
