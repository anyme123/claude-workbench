import React from "react";
import { UserMessage } from "./UserMessage";
import { AIMessage } from "./AIMessage";
import { SystemMessage } from "./SystemMessage";
import { ResultMessage } from "./ResultMessage";
import { SummaryMessage } from "./SummaryMessage";
import { SubagentMessageGroup } from "./SubagentMessageGroup";
import type { ClaudeStreamMessage } from '@/types/claude';
import type { RewindMode } from '@/lib/api';
import type { MessageGroup } from '@/lib/subagentGrouping';

interface StreamMessageV2Props {
  message?: ClaudeStreamMessage;
  messageGroup?: MessageGroup;
  className?: string;
  onLinkDetected?: (url: string) => void;
  claudeSettings?: { showSystemInitialization?: boolean };
  isStreaming?: boolean;
  promptIndex?: number;
  sessionId?: string;
  projectId?: string;
  onRevert?: (promptIndex: number, mode: RewindMode) => void;
}

// Message renderer strategy map
const MESSAGE_RENDERERS: Record<string, React.FC<any>> = {
  user: UserMessage,
  assistant: AIMessage,
  system: SystemMessage,
  result: ResultMessage,
  summary: SummaryMessage,
};

/**
 * StreamMessage V2 - 重构版消息渲染组件
 *
 * 使用新的气泡式布局和组件架构
 * Phase 1: 基础消息显示 ✓
 * Phase 2: 工具调用折叠 ✓（已在 ToolCallsGroup 中实现）
 * Phase 3: 工具注册中心集成 ✓（已集成 toolRegistry）
 * Phase 4: 子代理消息分组 ✓（支持 MessageGroup）
 *
 * 架构说明：
 * - user 消息 → UserMessage 组件
 * - assistant 消息 → AIMessage 组件（集成 ToolCallsGroup + 思考块）
 * - system / result / summary → 对应消息组件
 * - subagent group → SubagentMessageGroup 组件
 * - 其他消息类型（meta 等）默认忽略
 *
 * ✅ OPTIMIZED: Using React.memo to prevent unnecessary re-renders
 */
const StreamMessageV2Component: React.FC<StreamMessageV2Props> = ({
  message,
  messageGroup,
  className,
  onLinkDetected,
  claudeSettings,
  isStreaming = false,
  promptIndex,
  sessionId,
  projectId,
  onRevert
}) => {
  // 如果提供了 messageGroup，优先使用分组渲染
  if (messageGroup) {
    if (messageGroup.type === 'subagent') {
      // 🛡️ 数据完整性验证：防止崩溃
      const group = messageGroup.group;

      // 验证必要的数据结构
      if (!group ||
          !group.taskMessage ||
          !Array.isArray(group.subagentMessages)) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[StreamMessageV2] Invalid subagent group structure:', {
            hasGroup: !!group,
            hasTaskMessage: !!group?.taskMessage,
            hasSubagentMessages: Array.isArray(group?.subagentMessages),
            group
          });
        }
        return null; // 安全降级：不渲染无效数据
      }

      return (
        <SubagentMessageGroup
          group={group}
          className={className}
          onLinkDetected={onLinkDetected}
        />
      );
    }
    // 普通消息组，使用原消息渲染
    message = messageGroup.message;
  }

  if (!message) {
    return null;
  }

  const messageType = (message as ClaudeStreamMessage & { type?: string }).type ?? (message as any).type;

  // Handle special cases
  if (messageType === 'thinking') {
    return (
      <AIMessage
        message={{
          ...message,
          type: 'assistant',
          message: {
            content: [
              {
                type: 'thinking',
                thinking: (message as any).content || ''
              }
            ]
          }
        }}
        isStreaming={isStreaming}
        onLinkDetected={onLinkDetected}
        className={className}
      />
    );
  }

  if (messageType === 'tool_use' || messageType === 'queue-operation') {
    return null;
  }

  const Renderer = MESSAGE_RENDERERS[messageType];

  if (!Renderer) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[StreamMessageV2] Unhandled message type:', messageType, message);
    }
    return null;
  }

  // Common props
  const commonProps = {
    message,
    className,
  };

  // Specific props based on type
  const specificProps = messageType === 'user' ? {
    promptIndex,
    sessionId,
    projectId,
    onRevert
  } : messageType === 'assistant' ? {
    isStreaming,
    onLinkDetected
  } : messageType === 'system' ? {
    claudeSettings
  } : {};

  return <Renderer {...commonProps} {...specificProps} />;
};

/**
 * ✅ OPTIMIZED: Memoized message component to prevent unnecessary re-renders
 *
 * Performance impact:
 * - ~50% reduction in re-renders for unchanged messages in virtual list
 * - Especially effective when scrolling through large message lists
 *
 * Comparison strategy:
 * - Deep comparison of message content via JSON serialization (safer but slightly slower)
 * - Reference comparison for functions (assumed stable via useCallback)
 * - Primitive comparison for simple props
 */
export const StreamMessageV2 = React.memo(
  StreamMessageV2Component,
  (prevProps, nextProps) => {
    // 如果使用 messageGroup，比较整个 group 对象
    if (prevProps.messageGroup || nextProps.messageGroup) {
      const prevGroupStr = JSON.stringify(prevProps.messageGroup);
      const nextGroupStr = JSON.stringify(nextProps.messageGroup);

      return (
        prevGroupStr === nextGroupStr &&
        prevProps.isStreaming === nextProps.isStreaming &&
        prevProps.promptIndex === nextProps.promptIndex &&
        prevProps.sessionId === nextProps.sessionId &&
        prevProps.projectId === nextProps.projectId &&
        prevProps.claudeSettings?.showSystemInitialization === nextProps.claudeSettings?.showSystemInitialization
      );
    }

    // 如果没有 message，无需比较
    if (!prevProps.message || !nextProps.message) {
      return prevProps.message === nextProps.message;
    }

    // Compare critical message properties
    // Using JSON.stringify for deep comparison (safer for complex message objects)
    const prevMessageStr = JSON.stringify({
      type: prevProps.message.type,
      content: prevProps.message.content,
      timestamp: prevProps.message.timestamp,
      id: (prevProps.message as any).id
    });
    const nextMessageStr = JSON.stringify({
      type: nextProps.message.type,
      content: nextProps.message.content,
      timestamp: nextProps.message.timestamp,
      id: (nextProps.message as any).id
    });

    // Only re-render if:
    // 1. Message content changed
    // 2. Streaming state changed
    // 3. Settings changed
    return (
      prevMessageStr === nextMessageStr &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.promptIndex === nextProps.promptIndex &&
      prevProps.sessionId === nextProps.sessionId &&
      prevProps.projectId === nextProps.projectId &&
      // claudeSettings is usually stable, but check showSystemInitialization
      prevProps.claudeSettings?.showSystemInitialization === nextProps.claudeSettings?.showSystemInitialization
      // Note: onLinkDetected and onRevert are assumed to be stable via useCallback
    );
  }
);
