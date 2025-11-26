/**
 * ✅ Bash Output Widget - Bash 后台输出展示
 *
 * 迁移自 ToolWidgets.tsx (原 1340-1420 行)
 * 用于展示后台 Bash 命令的输出
 */

import React, { useState } from "react";
import { Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
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
    <div className={cn(
      "rounded-lg border overflow-hidden",
      isDark ? "bg-zinc-950 border-zinc-800" : "bg-zinc-100 border-zinc-300"
    )}>
      <div className={cn(
        "px-4 py-2 flex items-center gap-2 border-b",
        isDark ? "bg-zinc-700/30 border-zinc-800" : "bg-zinc-200/50 border-zinc-300"
      )}>
        <Terminal className="h-3.5 w-3.5 text-blue-500" />
        <span className={cn("text-xs font-mono", isDark ? "text-zinc-300" : "text-zinc-600")}>Bash 输出</span>
        <code className={cn("text-xs font-mono", isDark ? "text-blue-400" : "text-blue-600")}>ID: {bash_id}</code>

        {/* 展开/收起按钮 */}
        {result && cleanContent && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-auto h-6 px-2"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                <span className="text-xs">收起</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                <span className="text-xs">展开</span>
              </>
            )}
          </Button>
        )}
      </div>

      {isExpanded && result && (
        <div className="p-4 space-y-3">
          <div className={cn(
            "p-3 rounded-md border text-xs font-mono whitespace-pre-wrap overflow-x-auto",
            isError
              ? "border-red-500/20 bg-red-500/5 text-red-400"
              : "border-blue-500/20 bg-blue-500/5 text-blue-300"
          )}>
            {cleanContent || (isError ? "获取输出失败" : "输出为空")}
          </div>
        </div>
      )}
    </div>
  );
};
