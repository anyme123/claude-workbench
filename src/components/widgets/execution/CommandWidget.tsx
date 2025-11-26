/**
 * ✅ Command Widget - Slash 命令展示
 *
 * 迁移自 ToolWidgets.tsx (原 1845-1870 行)
 * 用于展示 Slash 命令的执行信息
 */

import React from "react";
import { Terminal } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

export interface CommandWidgetProps {
  /** 命令名称 */
  commandName: string;
  /** 命令消息/描述 */
  commandMessage: string;
  /** 命令参数（可选） */
  commandArgs?: string;
}

/**
 * Slash 命令 Widget
 *
 * 以终端风格展示命令执行信息
 */
export const CommandWidget: React.FC<CommandWidgetProps> = ({
  commandName,
  commandMessage,
  commandArgs,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      isDark ? "bg-zinc-950/50 border-zinc-800" : "bg-zinc-100 border-zinc-300"
    )}>
      {/* 命令头部 */}
      <div className={cn(
        "px-4 py-2 border-b flex items-center gap-2",
        isDark ? "bg-zinc-700/30 border-zinc-800" : "bg-zinc-200/50 border-zinc-300"
      )}>
        <Terminal className="h-3.5 w-3.5 text-blue-500" />
        <span className={cn("text-xs font-mono", isDark ? "text-blue-400" : "text-blue-600")}>命令</span>
      </div>

      {/* 命令内容 */}
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs", isDark ? "text-green-400" : "text-green-600")}>$</span>
          <code className={cn("text-sm font-mono", isDark ? "text-green-300" : "text-green-600")}>{commandName}</code>
          {commandArgs && (
            <code className={cn("text-sm font-mono", isDark ? "text-zinc-300" : "text-zinc-600")}>{commandArgs}</code>
          )}
        </div>

        {/* 命令消息（如果与命令名不同） */}
        {commandMessage && commandMessage !== commandName && (
          <div className={cn("text-xs ml-4", isDark ? "text-zinc-300" : "text-zinc-600")}>{commandMessage}</div>
        )}
      </div>
    </div>
  );
};
