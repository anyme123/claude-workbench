/**
 * PlanModeWidget - Plan 模式切换工具渲染器
 *
 * 用于渲染 ExitPlanMode 和 EnterPlanMode 工具调用
 * Claude Code 官方 Plan 模式：AI 可动态进入/退出规划模式
 */

import React from "react";
import { Search, LogOut, CheckCircle, AlertCircle } from "lucide-react";

export interface PlanModeWidgetProps {
  /** 操作类型：进入或退出 Plan 模式 */
  action: "enter" | "exit";
  /** 工具执行结果 */
  result?: {
    content?: any;
    is_error?: boolean;
  };
}

/**
 * Plan 模式切换 Widget
 *
 * 展示 AI 进入或退出 Plan 模式的操作
 */
export const PlanModeWidget: React.FC<PlanModeWidgetProps> = ({
  action,
  result,
}) => {
  const isEnter = action === "enter";
  const isError = result?.is_error;

  // 根据操作类型选择图标和颜色
  const Icon = isEnter ? Search : LogOut;
  const colorClass = isError
    ? "border-destructive/20 bg-destructive/5"
    : isEnter
      ? "border-blue-500/20 bg-blue-500/5"
      : "border-green-500/20 bg-green-500/5";
  const iconBgClass = isError
    ? "bg-destructive/10"
    : isEnter
      ? "bg-blue-500/10"
      : "bg-green-500/10";
  const iconColorClass = isError
    ? "text-destructive"
    : isEnter
      ? "text-blue-500"
      : "text-green-500";

  const title = isEnter ? "进入 Plan 模式" : "退出 Plan 模式";
  const description = isEnter
    ? "AI 进入规划模式，将分析任务并制定实施方案，不会修改文件或执行命令"
    : "AI 退出规划模式，准备开始执行已制定的方案";

  return (
    <div className={`rounded-lg border ${colorClass} overflow-hidden`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5">
          <div className={`h-8 w-8 rounded-full ${iconBgClass} flex items-center justify-center`}>
            <Icon className={`h-4 w-4 ${iconColorClass}`} />
          </div>
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${iconColorClass}`}>
              {title}
            </span>
            {result && !isError && (
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            )}
            {isError && (
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {description}
          </p>

          {/* 显示错误信息 */}
          {isError && result?.content && (
            <div className="mt-2 p-2 rounded bg-destructive/10 text-xs text-destructive">
              {typeof result.content === 'string'
                ? result.content
                : JSON.stringify(result.content)}
            </div>
          )}

          {/* 显示成功消息 */}
          {!isError && result?.content && typeof result.content === 'string' && (
            <div className="mt-2 text-xs text-muted-foreground">
              {result.content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
