/**
 * 消息分组 Hook
 * 
 * 将消息列表进行分组处理，识别并组织子代理消息
 */

import { useMemo } from 'react';
import type { ClaudeStreamMessage } from '@/types/claude';
import { groupMessages, type MessageGroup } from '@/lib/subagentGrouping';

/**
 * 消息分组配置
 */
export interface GroupedMessagesOptions {
  /** 是否启用子代理分组 */
  enableSubagentGrouping?: boolean;
}

/**
 * 对消息列表进行分组处理
 * 
 * @param messages 原始消息列表
 * @param options 分组选项
 * @returns 分组后的消息列表
 * 
 * @example
 * const messageGroups = useGroupedMessages(messages, { enableSubagentGrouping: true });
 */
export function useGroupedMessages(
  messages: ClaudeStreamMessage[],
  options: GroupedMessagesOptions = {}
): MessageGroup[] {
  const { enableSubagentGrouping = true } = options;

  return useMemo(() => {
    if (!enableSubagentGrouping) {
      // 不启用分组时，返回普通消息列表
      return messages.map((message, index) => ({
        type: 'normal' as const,
        message,
        index,
      }));
    }

    // 启用分组时，进行消息分组
    return groupMessages(messages);
  }, [messages, enableSubagentGrouping]);
}
