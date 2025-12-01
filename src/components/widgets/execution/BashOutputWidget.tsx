/**
 * ✅ Bash Output Widget - Bash 后台输出展示
 *
 * 迁移自 ToolWidgets.tsx (原 1340-1420 行)
 * 用于展示后台 Bash 命令的输出
 */

import React, { useState } from "react";
import { Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BashOutputWidgetProps {
  /** Bash ID */
  bash_id: string;
  /** 工具结果 */
  result?: any;
}

/**
 * Bash 后台输出 Widget
 *
 * 可折叠的输出展示，支持 ANSI 代码清理
 */
export const BashOutputWidget: React.FC<BashOutputWidgetProps> = ({
  bash_id,
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

  // 清除 ANSI 转义序列
  const stripAnsiCodes = (text: string): string => {
    return text.replace(/\x1b\[[0-9;]*[mGKHJfABCD]/g, '');
  };

  const cleanContent = stripAnsiCodes(resultContent);

  return (
    <div className="space-y-2 w-full">
      <div 
        className="flex items-center justify-between bg-muted/30 p-2.5 rounded-md border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors group/header select-none"
        onClick={() => result && cleanContent && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <span className="text-sm font-medium text-muted-foreground">Bash Output</span>
          <span className="text-muted-foreground/30">|</span>
          <code className="text-xs font-mono text-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded">ID: {bash_id}</code>
        </div>

        {/* 展开/收起按钮 */}
        {result && cleanContent && (
          <div className="h-6 px-2 ml-2 text-muted-foreground group-hover/header:text-foreground flex items-center gap-1 transition-colors">
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </div>
        )}
      </div>

      {isExpanded && result && (
        <div className="rounded-lg border overflow-hidden bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
          <div className={cn(
            "p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[300px]",
            isError
              ? "text-red-600 dark:text-red-400"
              : "text-foreground/80"
          )} style={{ fontSize: '0.8rem', lineHeight: '1.5' }}>
            {cleanContent || (isError ? "获取输出失败" : "输出为空")}
          </div>
        </div>
      )}
    </div>
  );
};
