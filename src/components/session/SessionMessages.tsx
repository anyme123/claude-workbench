import React, { useImperativeHandle, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import { StreamMessageV2 } from "@/components/message";
import type { MessageGroup } from "@/lib/subagentGrouping";
import type { RewindMode } from "@/lib/api";

export interface SessionMessagesRef {
  scrollToPrompt: (promptIndex: number) => void;
}

interface SessionMessagesProps {
  messageGroups: MessageGroup[];
  isLoading: boolean;
  claudeSettings: { showSystemInitialization?: boolean; hideWarmupMessages?: boolean };
  effectiveSession: any;
  getPromptIndexForMessage: (index: number) => number;
  handleLinkDetected: (url: string) => void;
  handleRevert: (promptIndex: number, mode: RewindMode) => void;
  error?: string | null;
  parentRef: React.RefObject<HTMLDivElement>;
}

export const SessionMessages = forwardRef<SessionMessagesRef, SessionMessagesProps>(({
  messageGroups,
  isLoading,
  claudeSettings,
  effectiveSession,
  getPromptIndexForMessage,
  handleLinkDetected,
  handleRevert,
  error,
  parentRef
}, ref) => {
  /**
   * ✅ OPTIMIZED: Virtual list configuration for improved performance
   */
  const rowVirtualizer = useVirtualizer({
    count: messageGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // ✅ Dynamic height estimation based on message group type
      const messageGroup = messageGroups[index];
      if (!messageGroup) return 200;

      // For subagent groups, estimate larger height
      if (messageGroup.type === 'subagent') {
        return 400; // Subagent groups are typically larger
      }

      // For normal messages, estimate based on message type
      const message = messageGroup.message;
      if (!message) return 200;

      // Estimate different heights for different message types
      if (message.type === 'system') return 80;  // System messages are smaller
      if (message.type === 'user') return 150;   // User prompts are medium
      if (message.type === 'assistant') {
        // Assistant messages with code blocks are larger
        const hasCodeBlock = message.content && typeof message.content === 'string' &&
                            message.content.includes('```');
        return hasCodeBlock ? 300 : 200;
      }
      return 200; // Default fallback
    },
    overscan: 5, // ✅ OPTIMIZED: Reduced from 8 to 5 for better performance
    measureElement: (element) => {
      // Ensure element is fully rendered before measurement
      return element?.getBoundingClientRect().height ?? 200;
    },
  });

  useImperativeHandle(ref, () => ({
    scrollToPrompt: (promptIndex: number) => {
      // 找到 promptIndex 对应的消息在 messageGroups 中的索引
      let currentPromptIndex = 0;
      let targetGroupIndex = -1;

      for (let i = 0; i < messageGroups.length; i++) {
        const group = messageGroups[i];

        // 检查普通消息
        if (group.type === 'normal') {
          const message = group.message;
          const messageType = (message as any).type || (message.message as any)?.role;

          if (messageType === 'user') {
            if (currentPromptIndex === promptIndex) {
              targetGroupIndex = i;
              break;
            }
            currentPromptIndex++;
          }
        }
        // 子代理组不包含 user 消息，跳过
      }

      if (targetGroupIndex === -1) {
        console.warn(`[Prompt Navigation] Prompt #${promptIndex} not found`);
        return;
      }

      console.log(`[Prompt Navigation] Navigating to prompt #${promptIndex}, group index: ${targetGroupIndex}`);

      // 先使用虚拟列表滚动到该索引（让元素渲染出来）
      rowVirtualizer.scrollToIndex(targetGroupIndex, {
        align: 'center',
        behavior: 'smooth',
      });

      // 等待虚拟列表渲染完成后，再进行精确定位
      setTimeout(() => {
        const element = document.getElementById(`prompt-${promptIndex}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }));

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto relative"
      style={{
        paddingBottom: 'calc(240px + env(safe-area-inset-bottom))', // 增加底部空间，避免与动态高度的输入框重叠
        paddingTop: '20px',
      }}
    >
      <div
        className="relative w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[85%] mx-auto px-4 pt-8 pb-4"
        style={{
          height: `${Math.max(rowVirtualizer.getTotalSize(), 100)}px`,
          minHeight: '100px',
        }}
      >
        <AnimatePresence>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const messageGroup = messageGroups[virtualItem.index];

            // 防御性检查：确保 messageGroup 存在
            if (!messageGroup) {
              console.warn('[SessionMessages] messageGroup is undefined for index:', virtualItem.index);
              return null;
            }

            const message = messageGroup.type === 'normal' ? messageGroup.message : null;
            const originalIndex = messageGroup.type === 'normal' ? messageGroup.index : undefined;
            const promptIndex = message && message.type === 'user' && originalIndex !== undefined
              ? getPromptIndexForMessage(originalIndex)
              : undefined;

            return (
              <motion.div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={(el) => el && rowVirtualizer.measureElement(el)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-x-4"
                style={{
                  top: virtualItem.start,
                }}
              >
                <StreamMessageV2
                  messageGroup={messageGroup}
                  onLinkDetected={handleLinkDetected}
                  claudeSettings={claudeSettings}
                  isStreaming={virtualItem.index === messageGroups.length - 1 && isLoading}
                  promptIndex={promptIndex}
                  sessionId={effectiveSession?.id}
                  projectId={effectiveSession?.project_id}
                  onRevert={handleRevert}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Error indicator */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive w-full max-w-5xl mx-auto"
          style={{ marginBottom: 'calc(80px + env(safe-area-inset-bottom))' }}
        >
          {error}
        </motion.div>
      )}
    </div>
  );
});

SessionMessages.displayName = "SessionMessages";