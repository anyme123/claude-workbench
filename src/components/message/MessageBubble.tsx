import React, { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  /** 消息类型：用户或AI */
  variant: "user" | "assistant";
  /** 子内容 */
  children: React.ReactNode;
  /** 自定义容器类名 */
  className?: string;
  /** 自定义气泡类名 */
  bubbleClassName?: string;
  /** 是否正在流式输出 */
  isStreaming?: boolean;
}

/**
 * 消息气泡容器组件
 * 
 * 用户消息：右对齐气泡样式
 * AI消息：左对齐卡片样式
 */
const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  variant,
  children,
  className,
  bubbleClassName,
  isStreaming = false
}) => {
  const isUser = variant === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex w-full mb-6", // 恢复 mb-6 确保消息间距
        isUser ? "justify-end" : "justify-start",
        className
      )}
    >
      {isUser ? (
        // 用户消息：紧凑气泡样式
        <div className="flex flex-col items-end max-w-[85%] sm:max-w-[70%]">
          <div
            className={cn(
              "rounded-lg px-4 py-2",
              "bg-primary text-primary-foreground",
              "shadow-sm",
              "break-words",
              bubbleClassName
            )}
          >
            {children}
          </div>
        </div>
      ) : (
        // AI消息：全宽卡片样式
        <div className="flex flex-col w-full max-w-full">
          <div
            className={cn(
              "rounded-lg border",
              "bg-card text-card-foreground border-border",
              "shadow-md",
              "overflow-hidden",
              isStreaming && "ring-2 ring-primary/20 animate-pulse-subtle",
              bubbleClassName
            )}
          >
            {children}
          </div>
        </div>
      )}
    </motion.div>
  );
};

MessageBubbleComponent.displayName = "MessageBubble";

export const MessageBubble = memo(MessageBubbleComponent);
