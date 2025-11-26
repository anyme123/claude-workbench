/**
 * ✅ Command Widget - Slash 命令展示
 *
 * 迁移自 ToolWidgets.tsx (原 1845-1870 行)
 * 用于展示 Slash 命令的执行信息
 */

import React from "react";
import { Terminal } from "lucide-react";

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
  return (
    <div className="rounded-lg border overflow-hidden bg-zinc-100 dark:bg-zinc-950/50 border-zinc-300 dark:border-zinc-800">
      {/* 命令头部 */}
      <div className="px-4 py-2 border-b flex items-center gap-2 bg-zinc-200/50 dark:bg-zinc-700/30 border-zinc-300 dark:border-zinc-800">
        <Terminal className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-xs font-mono text-blue-600 dark:text-blue-400">命令</span>
      </div>

      {/* 命令内容 */}
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-600 dark:text-green-400">$</span>
          <code className="text-sm font-mono text-green-600 dark:text-green-300">{commandName}</code>
          {commandArgs && (
            <code className="text-sm font-mono text-zinc-600 dark:text-zinc-300">{commandArgs}</code>
          )}
        </div>

        {/* 命令消息（如果与命令名不同） */}
        {commandMessage && commandMessage !== commandName && (
          <div className="text-xs ml-4 text-zinc-600 dark:text-zinc-300">{commandMessage}</div>
        )}
      </div>
    </div>
  );
};
