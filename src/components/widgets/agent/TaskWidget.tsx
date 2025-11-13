/**
 * ✅ Task Widget - 子代理任务展示
 *
 * 迁移自 ToolWidgets.tsx (原 2498-2548 行)
 * 用于展示 Claude Code 子代理的任务信息
 */

import React, { useState } from "react";
import { Bot, Sparkles, Zap, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TaskWidgetProps {
  /** 任务描述 */
  description?: string;
  /** 任务提示词 */
  prompt?: string;
  /** 工具结果 */
  result?: any;
}

/**
 * 子代理任务 Widget
 *
 * 展示 Task 工具的任务描述和详细指令
 */
export const TaskWidget: React.FC<TaskWidgetProps> = ({
  description,
  prompt,
  result: _result,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="space-y-2">
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative">
          <Bot className="h-4 w-4 text-purple-500" />
          <Sparkles className="h-2.5 w-2.5 text-purple-400 absolute -top-1 -right-1" />
        </div>
        <span className="text-sm font-medium">生成子代理任务</span>
      </div>

      <div className="ml-6 space-y-3">
        {/* 任务描述 */}
        {description && (
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs font-medium text-purple-600 dark:text-purple-400">任务描述</span>
            </div>
            <p className="text-sm text-foreground ml-5">{description}</p>
          </div>
        )}

        {/* 任务指令（可折叠） */}
        {prompt && (
          <div className="space-y-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
              <span>任务指令</span>
            </button>

            {isExpanded && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                  {prompt}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
