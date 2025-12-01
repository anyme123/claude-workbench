/**
 * PlanModeStatusBar - Plan 模式全局状态指示器
 *
 * 在聊天界面顶部显示 Plan 模式状态
 * 提供快捷键提示和工具限制说明
 */

import { Info, Lightbulb, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface PlanModeStatusBarProps {
  /** 是否处于 Plan 模式 */
  isPlanMode: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * Plan 模式全局状态指示器
 *
 * 根据 Claude Code 官方文档：
 * - Plan 模式是只读的研究和规划阶段
 * - 只能使用只读工具（Read, Grep, Glob, WebFetch, WebSearch）
 * - 通过 Shift+Tab 快捷键切换
 * - 最佳实践：保持计划范围小（30分钟内完成）
 */
export const PlanModeStatusBar: React.FC<PlanModeStatusBarProps> = ({
  isPlanMode,
  className,
}) => {
  if (!isPlanMode) return null;

  return (
    <div
      className={cn(
        "w-full border-b border-blue-500/30 bg-blue-500/10 backdrop-blur-sm",
        className
      )}
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        {/* 左侧：状态指示 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Plan 模式已激活
            </span>
          </div>

          {/* 工具限制提示 */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/20 hover:bg-blue-500/30 transition-colors">
                  <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs text-blue-700 dark:text-blue-300">
                    只读模式
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-2">
                  <p className="font-medium text-sm">Plan 模式工具限制</p>
                  <div className="text-xs space-y-1">
                    <p className="text-green-600 dark:text-green-400">
                      ✓ 允许使用：Read, Grep, Glob, WebFetch, WebSearch
                    </p>
                    <p className="text-red-600 dark:text-red-400">
                      ✗ 禁止使用：Write, Edit, Bash执行、Git操作
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    AI 将只能分析代码库和制定计划，不会修改任何文件
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* 最佳实践提示 */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 transition-colors">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    最佳实践
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-2">
                  <p className="font-medium text-sm">Plan 模式最佳实践</p>
                  <ul className="text-xs space-y-1 list-disc list-inside">
                    <li>保持计划范围小（30分钟内可完成）</li>
                    <li>先探索代码库，理解现有架构</li>
                    <li>制定具体的实施步骤</li>
                    <li>考虑边缘情况和错误处理</li>
                    <li>可以多次迭代优化计划</li>
                  </ul>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* 右侧：快捷键提示 */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 hover:bg-muted transition-colors">
                <Command className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 text-xs font-mono bg-background border border-border rounded">
                    Shift
                  </kbd>
                  <span className="text-xs text-muted-foreground">+</span>
                  <kbd className="px-1.5 py-0.5 text-xs font-mono bg-background border border-border rounded">
                    Tab
                  </kbd>
                </div>
                <span className="text-xs text-muted-foreground">退出</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">
                按 <kbd>Shift+Tab</kbd> 两次退出 Plan 模式
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};
