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
  /** 气泡侧边内容 (显示在气泡外侧，用户消息在左侧，AI消息在右侧) */
  sideContent?: React.ReactNode;
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
  isStreaming = false,
  sideContent
}) => {
  const isUser = variant === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.3,
        ease: [0.2, 0, 0, 1] // Emphasized easing
      }}
      className={cn(
        "flex w-full mb-2", // Reduced spacing for compact layout
        isUser ? "justify-end" : "justify-start",
        className
      )}
    >
      {isUser ? (
        // User Message: Modern Bubble
        <div className="flex flex-col items-end max-w-[85%] sm:max-w-[70%]">
          <div className="flex items-center gap-1.5 justify-end w-full">
            {sideContent}
            <div
              className={cn(
                "rounded-[20px] px-5 py-2.5", // More rounded, slightly tighter padding
                "bg-[#F0F0F0] text-foreground dark:bg-[#303030] dark:text-foreground", // Neutral grey instead of primary color
                "break-words text-[15px] leading-relaxed",
                bubbleClassName
              )}
            >
              {children}
            </div>
          </div>
        </div>
      ) : (
        // AI Message: Clean Document Style (No Card)
        <div className="flex flex-col w-full max-w-full">
          <div
            className={cn(
              "w-full pr-4", // No border, no background, just spacing
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
