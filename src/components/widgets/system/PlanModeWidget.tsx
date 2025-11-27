/**
 * PlanModeWidget - Plan 模式切换工具渲染器
 *
 * 用于渲染 ExitPlanMode 和 EnterPlanMode 工具调用
 * Claude Code 官方 Plan 模式：AI 可动态进入/退出规划模式
 *
 * 方案 B-1 改进实现：
 * - ExitPlanMode 时显示计划内容和"审批计划"按钮
 * - 使用 PlanModeContext 触发审批对话框
 * - 追踪已审批的计划，显示"已批准执行"状态
 * - 避免重复弹窗
 */

import { useEffect, useRef, useMemo } from "react";
import { Search, LogOut, CheckCircle, AlertCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlanMode, getPlanId } from "@/contexts/PlanModeContext";

export interface PlanModeWidgetProps {
  /** 操作类型：进入或退出 Plan 模式 */
  action: "enter" | "exit";
  /** 计划内容（ExitPlanMode 时） */
  plan?: string;
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
  plan,
  result,
}) => {
  const isEnter = action === "enter";
  const isExit = action === "exit";
  const isError = result?.is_error;
  const hasTriggered = useRef(false);

  // 计算计划 ID
  const planId = useMemo(() => {
    return plan ? getPlanId(plan) : null;
  }, [plan]);

  // 尝试获取 PlanMode Context
  let triggerPlanApproval: ((plan: string) => void) | undefined;
  let isPlanApproved: ((planId: string) => boolean) | undefined;
  let isApproved = false;

  try {
    const planModeContext = usePlanMode();
    triggerPlanApproval = planModeContext.triggerPlanApproval;
    isPlanApproved = planModeContext.isPlanApproved;

    // 检查当前计划是否已审批
    if (planId && isPlanApproved) {
      isApproved = isPlanApproved(planId);
    }
  } catch {
    // Context 不可用时忽略（组件可能在 Provider 外部渲染）
  }

  // 自动触发审批对话框（仅在 ExitPlanMode 且有计划内容且未审批时）
  useEffect(() => {
    if (isExit && plan && triggerPlanApproval && !hasTriggered.current && !isApproved) {
      hasTriggered.current = true;
      // 延迟触发，确保 UI 已渲染
      const timer = setTimeout(() => {
        triggerPlanApproval(plan);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isExit, plan, triggerPlanApproval, isApproved]);

  // 根据操作类型和审批状态选择样式
  const Icon = isEnter ? Search : LogOut;

  // 已审批的计划使用特殊样式
  const colorClass = isError
    ? "border-destructive/20 bg-destructive/5"
    : isApproved
      ? "border-green-500/30 bg-green-500/10"  // 已审批：更明显的绿色
      : isEnter
        ? "border-blue-500/20 bg-blue-500/5"
        : "border-green-500/20 bg-green-500/5";

  const iconBgClass = isError
    ? "bg-destructive/10"
    : isApproved
      ? "bg-green-500/20"
      : isEnter
        ? "bg-blue-500/10"
        : "bg-green-500/10";

  const iconColorClass = isError
    ? "text-destructive"
    : isApproved
      ? "text-green-600"
      : isEnter
        ? "text-blue-500"
        : "text-green-500";

  // 根据状态显示不同标题
  const title = isEnter
    ? "进入 Plan 模式"
    : isApproved
      ? "计划已批准执行"
      : "退出 Plan 模式";

  const description = isEnter
    ? "AI 进入规划模式，将分析任务并制定实施方案，不会修改文件或执行命令"
    : isApproved
      ? "此计划已通过审批，Claude 正在执行中"
      : "AI 退出规划模式，准备开始执行已制定的方案";

  // 手动触发审批
  const handleTriggerApproval = () => {
    if (plan && triggerPlanApproval) {
      triggerPlanApproval(plan);
    }
  };

  return (
    <div className={`rounded-lg border ${colorClass} overflow-hidden`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5">
          <div className={`h-8 w-8 rounded-full ${iconBgClass} flex items-center justify-center`}>
            {isApproved ? (
              <CheckCircle className={`h-4 w-4 ${iconColorClass}`} />
            ) : (
              <Icon className={`h-4 w-4 ${iconColorClass}`} />
            )}
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${iconColorClass}`}>
              {title}
            </span>
            {isApproved && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-600 font-medium">
                已执行
              </span>
            )}
            {result && !isError && !isExit && !isApproved && (
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            )}
            {isError && (
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {description}
          </p>

          {/* ExitPlanMode: 显示计划内容预览 */}
          {isExit && plan && (
            <div className="mt-2 space-y-2">
              <div className="p-3 rounded-md bg-background/50 border border-border/50">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  计划内容：
                </div>
                <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-32 overflow-y-auto">
                  {plan.length > 500 ? plan.substring(0, 500) + "..." : plan}
                </pre>
              </div>

              {/* 根据审批状态显示不同按钮 */}
              {isApproved ? (
                // 已审批：显示状态标签
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>计划已批准，Claude 已开始执行</span>
                </div>
              ) : triggerPlanApproval ? (
                // 未审批：显示审批按钮
                <Button
                  size="sm"
                  onClick={handleTriggerApproval}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Play className="h-3.5 w-3.5" />
                  查看完整计划并审批
                </Button>
              ) : null}
            </div>
          )}

          {/* 显示错误信息 */}
          {isError && result?.content && (
            <div className="mt-2 p-2 rounded bg-destructive/10 text-xs text-destructive">
              {typeof result.content === 'string'
                ? result.content
                : JSON.stringify(result.content)}
            </div>
          )}

          {/* 显示成功消息（非 ExitPlanMode） */}
          {!isError && !isExit && result?.content && typeof result.content === 'string' && (
            <div className="mt-2 text-xs text-muted-foreground">
              {result.content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
