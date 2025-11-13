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

export interface WidgetLayoutProps {
  /** 图标组件 */
  icon?: LucideIcon;
  /** 标题 */
  title?: string;
  /** 徽章文本 */
  badge?: string;
  /** 徽章变体 */
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  /** 子内容 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 是否为错误状态 */
  isError?: boolean;
}

/**
 * Widget 布局组件 - 提供统一的卡片式布局
 */
export const WidgetLayout: React.FC<WidgetLayoutProps> = ({
  icon: Icon,
  title,
  badge,
  badgeVariant = "default",
  children,
  className,
  isError = false,
}) => {
  return (
    <Card className={cn(
      "my-2 overflow-hidden transition-colors",
      isError && "border-destructive/50 bg-destructive/5",
      className
    )}>
      {(Icon || title || badge) && (
        <div className={cn(
          "flex items-center gap-2 border-b px-3 py-2",
          isError ? "border-destructive/20 bg-destructive/10" : "border-border/50 bg-muted/30"
        )}>
          {Icon && (
            <Icon className={cn(
              "h-4 w-4",
              isError ? "text-destructive" : "text-muted-foreground"
            )} />
          )}
          {title && (
            <span className={cn(
              "text-sm font-medium",
              isError ? "text-destructive" : "text-foreground"
            )}>
              {title}
            </span>
          )}
          {badge && (
            <Badge variant={badgeVariant} className="ml-auto text-xs">
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
