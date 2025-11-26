/**
 * ✅ System Reminder Widget - 系统提醒信息展示
 *
 * 迁移自 ToolWidgets.tsx (原 2241-2260 行)
 * 用于显示系统级别的提示、警告和错误信息
 */

import React from "react";
import { Info, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SystemReminderWidgetProps {
  /** 提醒消息内容 */
  message: string;
}

/**
 * 系统提醒 Widget
 *
 * 根据消息内容自动选择合适的图标和颜色：
 * - 默认: 蓝色信息图标
 * - "warning": 黄色警告图标
 * - "error": 红色错误图标
 */
export const SystemReminderWidget: React.FC<SystemReminderWidgetProps> = ({ message }) => {
  // 根据消息内容提取图标和样式
  let icon = <Info className="h-4 w-4" />;
  let colorClass = "border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400";

  if (message.toLowerCase().includes("warning")) {
    icon = <AlertCircle className="h-4 w-4" />;
    colorClass = "border-yellow-500/20 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400";
  } else if (message.toLowerCase().includes("error")) {
    icon = <AlertCircle className="h-4 w-4" />;
    colorClass = "border-destructive/20 bg-destructive/5 text-destructive";
  }

  return (
    <div className={cn("flex items-start gap-2 p-3 rounded-md border", colorClass)}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 text-sm">{message}</div>
    </div>
  );
};
