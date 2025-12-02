/**
 * ✅ Bash Widget - Bash 命令执行展示
 *
 * 迁移自 ToolWidgets.tsx (原 696-783 行)
 * 用于展示 Bash 命令执行和结果
 */

import React, { useState } from "react";
import { Terminal, ChevronUp, ChevronDown, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BashWidgetProps {
  /** Bash 命令 */
  command: string;
  /** 命令描述（可选） */
  description?: string;
  /** 工具结果 */
  result?: any;
}

/**
 * Bash 命令执行 Widget
 *
 * 展示 Bash 命令和可折叠的执行结果
 */
export const BashWidget: React.FC<BashWidgetProps> = ({
  command,
  description,
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

  const statusIcon = result
    ? isError
      ? <XCircle className="h-3.5 w-3.5 text-red-500" />
      : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    : <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;

  const statusText = result ? (isError ? '失败' : '完成') : '运行中';
  const statusColor = result ? (isError ? 'text-red-500' : 'text-green-500') : 'text-blue-500';

  return (
    <div className="space-y-2 w-full">
      {/* 紧凑型头部 */}
      <div 
        className="flex items-center justify-between bg-muted/30 p-2.5 rounded-md border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors group/header select-none"
        onClick={() => result && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Terminal className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm font-medium text-muted-foreground">Terminal</span>
            <span className="text-muted-foreground/30">|</span>
            <div className="flex items-center gap-1.5 min-w-0 text-sm">
              <code className="font-mono text-foreground/90 font-medium truncate" title={command}>
                {command}
              </code>
            </div>
          </div>

          {/* 状态与描述 */}
          <div className="flex items-center gap-2 text-xs flex-shrink-0">
            <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-md", 
              result ? (isError ? "bg-red-500/10" : "bg-green-500/10") : "bg-blue-500/10"
            )}>
              {statusIcon}
              <span className={cn("font-medium hidden sm:inline", statusColor)}>{statusText}</span>
            </div>
            {description && (
              <span className="text-muted-foreground/60 truncate hidden sm:inline max-w-[150px]">
                {description}
              </span>
            )}
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

      {/* 展开内容 */}
      {isExpanded && (
        <div className="rounded-lg border overflow-hidden bg-muted border-border/50">
          <div className="p-3 space-y-2">
            {/* 完整命令 */}
            <div className="text-xs font-mono text-muted-foreground border-b border-border/50 pb-2 mb-2 break-all">
              $ {command}
            </div>

            {/* 结果输出 */}
            <div className={cn(
              "text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[300px]",
              isError
                ? "text-red-600 dark:text-red-400"
                : "text-foreground/80"
            )} style={{ fontSize: '0.8rem', lineHeight: '1.5' }}>
              {resultContent || (isError ? "命令执行失败" : "命令执行完成，无输出")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
