/**
 * ✅ Bash Widget - Bash 命令执行展示
 *
 * 迁移自 ToolWidgets.tsx (原 696-783 行)
 * 用于展示 Bash 命令执行和结果
 */

import React, { useState } from "react";
import { Terminal, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
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

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      isDark ? "bg-zinc-950 border-zinc-800" : "bg-zinc-100 border-zinc-300"
    )}>
      {/* 头部 */}
      <div className={cn(
        "px-4 py-2 flex items-center gap-2 border-b",
        isDark ? "bg-zinc-700/30 border-zinc-800" : "bg-zinc-200/50 border-zinc-300"
      )}>
        <Terminal className="h-3.5 w-3.5 text-green-500" />
        <span className={cn("text-xs font-mono", isDark ? "text-zinc-300" : "text-zinc-600")}>终端</span>
        {description && (
          <>
            <ChevronRight className={cn("h-3 w-3", isDark ? "text-zinc-400" : "text-zinc-500")} />
            <span className={cn("text-xs", isDark ? "text-zinc-300" : "text-zinc-600")}>{description}</span>
          </>
        )}

        {/* 加载指示器 */}
        {!result && (
          <div className={cn("ml-auto flex items-center gap-1 text-xs", isDark ? "text-zinc-300" : "text-zinc-600")}>
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            <span>正在运行...</span>
          </div>
        )}

        {/* 展开/收起按钮 */}
        {result && resultContent && (
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

      {/* 命令和结果 */}
      <div className="p-4 space-y-3">
        <code className={cn("text-xs font-mono block", isDark ? "text-green-400" : "text-green-600")}>
          $ {command}
        </code>

        {/* 结果展示（可折叠） */}
        {result && isExpanded && (
          <div className={cn(
            "mt-3 p-3 rounded-md border text-xs font-mono whitespace-pre-wrap overflow-x-auto",
            isError
              ? "border-destructive/20 bg-destructive/5 text-destructive"
              : "border-success/20 bg-success/5 text-success"
          )}>
            {resultContent || (isError ? "命令失败" : "命令完成")}
          </div>
        )}
      </div>
    </div>
  );
};
