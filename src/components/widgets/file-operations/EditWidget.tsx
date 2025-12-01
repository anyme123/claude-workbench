/**
 * ✅ Edit Widget - 文件编辑展示（Diff 视图）
 *
 * 迁移自 ToolWidgets.tsx (原 1466-1568 行)
 * 用于展示文件编辑操作的 Diff 对比
 */

import React, { useState } from "react";
import { FileEdit, FileText, ChevronUp, ChevronDown, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as Diff from 'diff';
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";
import { getLanguage } from "../common/languageDetector";

export interface EditWidgetProps {
  /** 文件路径 */
  file_path: string;
  /** 旧字符串 */
  old_string: string;
  /** 新字符串 */
  new_string: string;
  /** 工具结果 */
  result?: any;
}

/**
 * 文件编辑 Widget
 *
 * 展示文件编辑的 Diff 对比，支持语法高亮
 */
export const EditWidget: React.FC<EditWidgetProps> = ({
  file_path,
  old_string,
  new_string,
  result,
}) => {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const diffResult = Diff.diffLines(old_string || '', new_string || '', {
    newlineIsToken: true,
    ignoreWhitespace: false
  });
  const language = getLanguage(file_path);

  // Calculate stats
  const stats = diffResult.reduce((acc, part) => {
    if (part.added) acc.added += part.count || 0;
    if (part.removed) acc.removed += part.count || 0;
    return acc;
  }, { added: 0, removed: 0 });

  // Status logic
  const hasResult = result !== undefined;
  const isError = result?.is_error;
  
  const statusIcon = hasResult
    ? isError
      ? <XCircle className="h-3.5 w-3.5 text-red-500" />
      : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    : <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;

  const statusColor = hasResult ? (isError ? 'text-red-500' : 'text-green-500') : 'text-blue-500';

  return (
    <div className="space-y-2 w-full">
      <div className="ml-1 space-y-2">
        {/* 文件路径和展开按钮 - 可点击区域扩展到整行 */}
        <div 
          className="flex items-center justify-between bg-muted/30 p-2.5 rounded-md border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors group/header select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileEdit className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">Edit</span>
              <span className="text-muted-foreground/30">|</span>
              <code className="text-sm font-mono text-foreground/90 truncate font-medium" title={file_path}>
                {file_path.split(/[/\\]/).pop()}
              </code>
              <span className="text-xs text-muted-foreground truncate hidden sm:inline-block max-w-[200px] opacity-70">
                {file_path}
              </span>
            </div>
            
            {/* Diff Stats & Status */}
            <div className="flex items-center gap-3 text-xs font-mono font-medium">
              <div className="flex items-center gap-2">
                {stats.added > 0 && (
                  <span className="text-green-600 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                    +{stats.added}
                  </span>
                )}
                {stats.removed > 0 && (
                  <span className="text-red-600 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                    -{stats.removed}
                  </span>
                )}
              </div>
              
              {/* Status Badge */}
              <div className="flex items-center gap-1">
                {statusIcon}
                {hasResult && (
                  <span className={cn("font-medium hidden sm:inline", statusColor)}>
                    {isError ? '失败' : '成功'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="h-6 px-2 ml-2 text-muted-foreground group-hover/header:text-foreground flex items-center gap-1 transition-colors">
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </div>
        </div>

        {/* Diff 视图 */}
        {isExpanded && (
          <div className="rounded-lg border overflow-hidden text-xs font-mono mt-2 bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
            <div className="max-h-[440px] overflow-y-auto overflow-x-auto">
              {diffResult.map((part, index) => {
                const partClass = part.added
                  ? 'bg-green-100 dark:bg-green-950/20'
                  : part.removed
                  ? 'bg-red-100 dark:bg-red-950/20'
                  : '';

                // 折叠大量未更改的行
                if (!part.added && !part.removed && part.count && part.count > 8) {
                  return (
                    <div key={index} className="px-4 py-1 border-y text-center text-xs bg-zinc-200 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-500">
                      ... {part.count} 未更改的行 ...
                    </div>
                  );
                }

                const value = part.value.endsWith('\n') ? part.value.slice(0, -1) : part.value;

                return (
                  <div key={index} className={cn(partClass, "flex")}>
                    <div className="w-8 select-none text-center flex-shrink-0">
                      {part.added ? <span className="text-green-600 dark:text-green-400">+</span> : part.removed ? <span className="text-red-600 dark:text-red-400">-</span> : null}
                    </div>
                    <div className="flex-1">
                      <SyntaxHighlighter
                        language={language}
                        style={getClaudeSyntaxTheme(theme === 'dark')}
                        PreTag="div"
                        wrapLongLines={false}
                        customStyle={{
                          margin: 0,
                          padding: 0,
                          background: 'transparent',
                        }}
                        codeTagProps={{
                          style: {
                            fontSize: '0.8rem',
                            lineHeight: '1.6',
                          }
                        }}
                      >
                        {value}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
