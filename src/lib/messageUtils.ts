/**
 * 消息处理公共工具函数
 * 集中管理消息组件中重复使用的工具函数
 */

/**
 * 格式化时间戳为 HH:MM:SS 格式
 * @param timestamp - ISO 8601 格式的时间字符串
 * @returns 格式化后的时间字符串，如 "14:30:25"
 */
export const formatTimestamp = (timestamp: string | undefined): string => {
  if (!timestamp) return '';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return '';
  }
};

/**
 * 格式化时间戳为相对时间（如 "2分钟前"）
 * @param timestamp - ISO 8601 格式的时间字符串
 * @returns 相对时间字符串
 */
export const formatRelativeTime = (timestamp: string | undefined): string => {
  if (!timestamp) return '';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;

    return formatTimestamp(timestamp);
  } catch {
    return '';
  }
};

/**
 * 统一的状态样式类名
 * 用于 Widget 和消息组件的状态展示
 */
export const statusStyles = {
  success: "border-success/20 bg-success/5 text-success",
  error: "border-destructive/20 bg-destructive/5 text-destructive",
  warning: "border-warning/20 bg-warning/5 text-warning",
  info: "border-info/20 bg-info/5 text-info",
  loading: "border-muted/20 bg-muted/5 text-muted-foreground",
  default: "border-border bg-background text-foreground",
} as const;

/**
 * 统一的图标颜色类名
 */
export const iconColors = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-info",
  muted: "text-muted-foreground",
  primary: "text-primary",
} as const;

/**
 * 统一的加载指示器尺寸
 */
export const loaderSizes = {
  sm: "h-4 w-4",      // 用于按钮内
  default: "h-6 w-6", // 用于卡片内
  lg: "h-8 w-8",      // 用于页面级
} as const;

export type StatusType = keyof typeof statusStyles;
export type IconColorType = keyof typeof iconColors;
export type LoaderSizeType = keyof typeof loaderSizes;
