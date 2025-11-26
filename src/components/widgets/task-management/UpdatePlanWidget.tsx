/**
 * ✅ Update Plan Widget - 计划更新展示
 *
 * 用于展示 Codex update_plan 工具的调用结果
 * 显示计划更新状态和内容
 */

import React, { useState } from "react";
import { ClipboardList, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface UpdatePlanWidgetProps {
  /** 计划内容/更新说明 */
  plan?: string;
  /** 计划条目列表 */
  items?: Array<{ text: string; status?: string }>;
  /** 工具结果 */
  result?: {
    content?: any;
    is_error?: boolean;
  };
}

/**
 * Update Plan Widget
 *
 * 展示 Codex 的计划更新操作
 * - 显示更新成功状态
 * - 支持展开查看详细计划内容
 */
export const UpdatePlanWidget: React.FC<UpdatePlanWidgetProps> = ({
  plan,
  items,
  result,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // 从 result 中提取内容
  const resultContent = result?.content;
  const isError = result?.is_error;

  // 尝试解析计划内容
  let planText = plan || '';
  let planItems = items || [];

  if (resultContent) {
    if (typeof resultContent === 'string') {
      planText = resultContent;
    } else if (typeof resultContent === 'object') {
      if (resultContent.plan) {
        planText = resultContent.plan;
      }
      if (Array.isArray(resultContent.items)) {
        planItems = resultContent.items;
      }
    }
  }

  const hasContent = planText || planItems.length > 0;

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      isError
        ? "border-destructive/20 bg-gradient-to-br from-destructive/5 to-destructive/10"
        : "border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5"
    )}>
      {/* 头部 */}
      <div className={cn(
        "px-4 py-3 border-b",
        isError
          ? "bg-destructive/10 border-destructive/20"
          : "bg-zinc-700/30 border-emerald-500/20"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className={cn(
              "h-4 w-4",
              isError ? "text-destructive" : "text-emerald-500"
            )} />
            <span className={cn(
              "text-sm font-medium",
              isError ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
            )}>
              update_plan
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                isError
                  ? "border-destructive/30 text-destructive"
                  : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              )}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {isError ? "失败" : "成功"}
            </Badge>
            {hasContent && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                  "transition-colors",
                  isError
                    ? "text-destructive hover:text-destructive/80"
                    : "text-emerald-500 hover:text-emerald-600"
                )}
              >
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 摘要信息 */}
      <div className="px-4 py-2">
        <p className="text-sm text-muted-foreground">
          Plan updated
        </p>
      </div>

      {/* 展开内容 */}
      {isExpanded && hasContent && (
        <div className="px-4 pb-3 space-y-2">
          {planText && (
            <div className="p-3 rounded-md bg-background/50 border text-sm whitespace-pre-wrap">
              {planText}
            </div>
          )}
          {planItems.length > 0 && (
            <div className="space-y-1">
              {planItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded-md bg-background/50 border text-sm"
                >
                  <span className="text-muted-foreground">{idx + 1}.</span>
                  <span>{typeof item === 'string' ? item : item.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
