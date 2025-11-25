/**
 * ✅ Widget Layout - 统一的工具 Widget 布局组件
 *
 * 提供一致的 Widget 视觉风格和结构，减少代码重复
 *
 * @example
 * <WidgetLayout icon={FileText} title="Read File" badge="Success">
 *   <div>Widget content here</div>
 * </WidgetLayout>
 */

import React from "react";
import { type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 状态类型 */
export type WidgetStatus = "default" | "success" | "error" | "warning" | "info" | "loading";

/** 状态样式映射 */
const statusStyles: Record<WidgetStatus, { border: string; bg: string; icon: string; text: string }> = {
  default: {
    border: "border-border/50",
    bg: "bg-muted/30",
    icon: "text-muted-foreground",
    text: "text-foreground",
  },
  success: {
    border: "border-success/30",
    bg: "bg-success/10",
    icon: "text-success",
    text: "text-success",
  },
  error: {
    border: "border-destructive/30",
    bg: "bg-destructive/10",
    icon: "text-destructive",
    text: "text-destructive",
  },
  warning: {
    border: "border-warning/30",
    bg: "bg-warning/10",
    icon: "text-warning",
    text: "text-warning",
  },
  info: {
    border: "border-info/30",
    bg: "bg-info/10",
    icon: "text-info",
    text: "text-info",
  },
  loading: {
    border: "border-primary/30",
    bg: "bg-primary/5",
    icon: "text-primary",
    text: "text-primary",
  },
};

/** 状态到徽章变体的映射 */
const statusToBadgeVariant: Record<WidgetStatus, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  default: "secondary",
  success: "success",
  error: "destructive",
  warning: "warning",
  info: "info",
  loading: "default",
};

export interface WidgetLayoutProps {
  /** 图标组件 */
  icon?: LucideIcon;
  /** 标题 */
  title?: string;
  /** 徽章文本 */
  badge?: string;
  /** 徽章变体（优先级低于 status） */
  badgeVariant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
  /** 子内容 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 状态（统一的状态控制） */
  status?: WidgetStatus;
  /** @deprecated 使用 status="error" 代替 */
  isError?: boolean;
}

/**
 * Widget 布局组件 - 提供统一的卡片式布局
 */
export const WidgetLayout: React.FC<WidgetLayoutProps> = ({
  icon: Icon,
  title,
  badge,
  badgeVariant,
  children,
  className,
  status,
  isError = false,
}) => {
  // 兼容旧 API：isError 映射到 status="error"
  const effectiveStatus: WidgetStatus = status ?? (isError ? "error" : "default");
  const styles = statusStyles[effectiveStatus];
  const effectiveBadgeVariant = badgeVariant ?? statusToBadgeVariant[effectiveStatus];

  return (
    <Card className={cn(
      "my-2 overflow-hidden transition-colors duration-200",
      effectiveStatus !== "default" && `border-${effectiveStatus === "error" ? "destructive" : effectiveStatus}/20`,
      className
    )}>
      {(Icon || title || badge) && (
        <div className={cn(
          "flex items-center gap-2 border-b px-3 py-2",
          styles.border,
          styles.bg
        )}>
          {Icon && (
            <Icon className={cn("h-4 w-4", styles.icon)} />
          )}
          {title && (
            <span className={cn(
              "text-sm font-medium",
              effectiveStatus !== "default" ? styles.text : "text-foreground"
            )}>
              {title}
            </span>
          )}
          {badge && (
            <Badge variant={effectiveBadgeVariant} size="sm" className="ml-auto">
              {badge}
            </Badge>
          )}
        </div>
      )}
      <CardContent className="p-3">
        {children}
      </CardContent>
    </Card>
  );
};

/**
 * ✅ Widget 内容区域 - 用于内容分组
 */
export const WidgetSection: React.FC<{
  title?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, children, className }) => {
  return (
    <div className={cn("space-y-2", className)}>
      {title && (
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h4>
      )}
      {children}
    </div>
  );
};
