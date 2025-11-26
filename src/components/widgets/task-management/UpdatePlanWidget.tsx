/**
 * ✅ Update Plan Widget - 计划更新展示
 *
 * 用于展示 Codex update_plan 工具的调用结果
 * 显示计划步骤和状态
 *
 * Codex update_plan 格式:
 * {
 *   "plan": [
 *     {"status": "completed", "step": "步骤描述"},
 *     {"status": "in_progress", "step": "步骤描述"}
 *   ]
 * }
 */

import React, { useState } from "react";
import {
  ClipboardList,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** 计划步骤项 */
interface PlanStep {
  step: string;
  status: "completed" | "in_progress" | "pending" | string;
}

export interface UpdatePlanWidgetProps {
  /** 计划步骤数组 (Codex 实际格式) */
  plan?: PlanStep[];
  /** 工具结果 */
  result?: {
    content?: any;
    is_error?: boolean;
  };
}

/**
 * 获取状态图标
 */
const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />;
    case "in_progress":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
  }
};

/**
 * Update Plan Widget
 *
 * 展示 Codex 的计划更新操作
 * - 显示计划步骤列表
 * - 显示每个步骤的状态（完成/进行中/待处理）
 */
export const UpdatePlanWidget: React.FC<UpdatePlanWidgetProps> = ({
  plan,
  result,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const isError = result?.is_error;

  // 解析计划步骤
  let planSteps: PlanStep[] = [];

  if (Array.isArray(plan)) {
    planSteps = plan;
  }

  // 统计状态
  const completedCount = planSteps.filter((s) => s.status === "completed").length;
  const inProgressCount = planSteps.filter((s) => s.status === "in_progress").length;
  const totalCount = planSteps.length;

  // 生成摘要
  const summary =
    totalCount > 0
      ? `${completedCount}/${totalCount} 完成${inProgressCount > 0 ? `, ${inProgressCount} 进行中` : ""}`
      : "Plan updated";

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        isError
          ? "border-destructive/20 bg-gradient-to-br from-destructive/5 to-destructive/10"
          : "border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5"
      )}
    >
      {/* 头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full px-4 py-3 border-b flex items-center justify-between",
          "hover:bg-muted/30 transition-colors",
          isError
            ? "bg-destructive/10 border-destructive/20"
            : "bg-zinc-700/30 border-emerald-500/20"
        )}
      >
        <div className="flex items-center gap-2">
          <ClipboardList
            className={cn(
              "h-4 w-4",
              isError ? "text-destructive" : "text-emerald-500"
            )}
          />
          <span
            className={cn(
              "text-sm font-medium",
              isError ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
            )}
          >
            update_plan
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-xs ml-2",
              isError
                ? "border-destructive/30 text-destructive"
                : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
            )}
          >
            {summary}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* 计划步骤列表 */}
      {isExpanded && planSteps.length > 0 && (
        <div className="px-4 py-3 space-y-2">
          {planSteps.map((item, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-start gap-3 p-2.5 rounded-md border text-sm",
                item.status === "completed"
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : item.status === "in_progress"
                    ? "bg-blue-500/5 border-blue-500/20"
                    : "bg-muted/30 border-border/50"
              )}
            >
              <StatusIcon status={item.status} />
              <span
                className={cn(
                  "flex-1",
                  item.status === "completed" && "text-emerald-700 dark:text-emerald-300"
                )}
              >
                {item.step}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 无内容时显示成功状态 */}
      {planSteps.length === 0 && (
        <div className="px-4 py-2">
          <p className="text-sm text-muted-foreground">Plan updated</p>
        </div>
      )}
    </div>
  );
};
