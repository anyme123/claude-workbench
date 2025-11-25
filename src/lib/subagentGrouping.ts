/**
 * 子代理消息分组逻辑
 * 
 * 核心思路：
 * 1. 识别 Task 工具调用（子代理启动边界）
 * 2. 收集该 Task 对应的所有子代理消息（有 parent_tool_use_id）
 * 3. 将 Task 调用和相关子代理消息打包成一个消息组
 */

import type { ClaudeStreamMessage } from '@/types/claude';

/**
 * 子代理消息组
 */
export interface SubagentGroup {
  /** 组 ID（使用 Task 的 tool_use_id） */
  id: string;
  /** Task 工具调用的消息 */
  taskMessage: ClaudeStreamMessage;
  /** Task 工具的 ID */
  taskToolUseId: string;
  /** 子代理的所有消息（按顺序） */
  subagentMessages: ClaudeStreamMessage[];
  /** 组在原始消息列表中的起始索引 */
  startIndex: number;
  /** 组在原始消息列表中的结束索引 */
  endIndex: number;
}

/**
 * 消息组类型（用于渲染）
 */
export type MessageGroup = 
  | { type: 'normal'; message: ClaudeStreamMessage; index: number }
  | { type: 'subagent'; group: SubagentGroup };

/**
 * 检查消息是否包含 Task 工具调用
 */
export function hasTaskToolCall(message: ClaudeStreamMessage): boolean {
  if (message.type !== 'assistant') return false;
  
  const content = message.message?.content;
  if (!Array.isArray(content)) return false;
  
  return content.some((item: any) => 
    item.type === 'tool_use' && 
    item.name?.toLowerCase() === 'task'
  );
}

/**
 * 从消息中提取 Task 工具的 ID
 */
export function extractTaskToolUseIds(message: ClaudeStreamMessage): string[] {
  if (!hasTaskToolCall(message)) return [];
  
  const content = message.message?.content as any[];
  return content
    .filter((item: any) => item.type === 'tool_use' && item.name?.toLowerCase() === 'task')
    .map((item: any) => item.id)
    .filter(Boolean);
}

/**
 * 检查消息是否是子代理消息
 */
export function isSubagentMessage(message: ClaudeStreamMessage): boolean {
  // 检查是否有 parent_tool_use_id
  const hasParent = !!(message as any).parent_tool_use_id;
  
  // 检查是否标记为侧链
  const isSidechain = !!(message as any).isSidechain;
  
  return hasParent || isSidechain;
}

/**
 * 获取消息的 parent_tool_use_id
 */
export function getParentToolUseId(message: ClaudeStreamMessage): string | null {
  return (message as any).parent_tool_use_id || null;
}

/**
 * 对消息列表进行分组
 *
 * @param messages 原始消息列表
 * @returns 分组后的消息列表
 *
 * ✅ FIX: 支持并行 Task 调用
 * 当 Claude 在一条消息中并行调用多个子代理时，每个 Task 都应该被正确分组
 */
export function groupMessages(messages: ClaudeStreamMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  const processedIndices = new Set<number>();

  // 第一遍：识别所有 Task 工具调用
  // 记录每个 Task ID 对应的消息和索引
  const taskToolUseMap = new Map<string, { message: ClaudeStreamMessage; index: number }>();
  // 记录每个消息索引对应的所有 Task ID（支持并行 Task）
  const indexToTaskIds = new Map<number, string[]>();

  messages.forEach((message, index) => {
    const taskIds = extractTaskToolUseIds(message);
    if (taskIds.length > 0) {
      indexToTaskIds.set(index, taskIds);
      taskIds.forEach(taskId => {
        taskToolUseMap.set(taskId, { message, index });
      });
    }
  });

  // 第二遍：为每个 Task 收集子代理消息
  // ✅ FIX: 不再在遇到下一个 Task 时停止，而是遍历所有消息并根据 parent_tool_use_id 归类
  const subagentGroups = new Map<string, SubagentGroup>();

  taskToolUseMap.forEach((taskInfo, taskId) => {
    const subagentMessages: ClaudeStreamMessage[] = [];
    let maxIndex = taskInfo.index;

    // 遍历所有后续消息，根据 parent_tool_use_id 匹配
    for (let i = taskInfo.index + 1; i < messages.length; i++) {
      const msg = messages[i];
      const parentId = getParentToolUseId(msg);

      // ✅ FIX: 只根据 parent_tool_use_id 判断归属，不提前停止
      if (parentId === taskId) {
        subagentMessages.push(msg);
        maxIndex = Math.max(maxIndex, i);
      }
    }

    if (subagentMessages.length > 0) {
      subagentGroups.set(taskId, {
        id: taskId,
        taskMessage: taskInfo.message,
        taskToolUseId: taskId,
        subagentMessages,
        startIndex: taskInfo.index,
        endIndex: maxIndex,
      });
    }
  });

  // 标记所有子代理消息的索引（避免重复渲染）
  messages.forEach((message, index) => {
    const parentId = getParentToolUseId(message);
    if (parentId && subagentGroups.has(parentId)) {
      processedIndices.add(index);
    }
  });

  // 记录已添加的 Task 组（避免重复）
  const addedTaskGroups = new Set<string>();

  // 第三遍：构建最终的分组列表
  messages.forEach((message, index) => {
    // 跳过已被归入子代理组的消息
    if (processedIndices.has(index)) {
      return;
    }

    // 检查是否是包含 Task 调用的消息
    const taskIds = indexToTaskIds.get(index);

    if (taskIds && taskIds.length > 0) {
      // ✅ FIX: 遍历所有 Task ID，为每个有子代理消息的 Task 创建分组
      taskIds.forEach(taskId => {
        if (subagentGroups.has(taskId) && !addedTaskGroups.has(taskId)) {
          groups.push({
            type: 'subagent',
            group: subagentGroups.get(taskId)!,
          });
          addedTaskGroups.add(taskId);
        }
      });

      // 如果该消息的所有 Task 都没有子代理消息（可能是正在执行中），
      // 仍然作为普通消息显示
      const hasAnySubagentGroup = taskIds.some(id => subagentGroups.has(id));
      if (!hasAnySubagentGroup) {
        groups.push({
          type: 'normal',
          message,
          index,
        });
      }
    } else {
      // 普通消息
      groups.push({
        type: 'normal',
        message,
        index,
      });
    }
  });

  return groups;
}

/**
 * 检查消息是否应该被隐藏（已被分组的子代理消息）
 */
export function shouldHideMessage(message: ClaudeStreamMessage, groups: MessageGroup[]): boolean {
  // 如果消息是子代理消息，检查是否已被分组
  if (isSubagentMessage(message)) {
    const parentId = getParentToolUseId(message);
    if (parentId) {
      // 检查是否有对应的子代理组
      return groups.some(g => 
        g.type === 'subagent' && g.group.taskToolUseId === parentId
      );
    }
  }
  return false;
}

/**
 * 获取子代理消息的类型标识
 */
export function getSubagentMessageRole(message: ClaudeStreamMessage): 'user' | 'assistant' | 'system' | 'other' {
  // 子代理发送给主代理的提示词被标记为 user 类型，但应该显示为子代理的输出
  if (message.type === 'user' && isSubagentMessage(message)) {
    // 检查是否有文本内容（子代理的提示词）
    const content = message.message?.content;
    if (Array.isArray(content)) {
      const hasText = content.some((item: any) => item.type === 'text');
      if (hasText) {
        return 'assistant'; // 子代理的输出
      }
    }
  }
  
  return message.type as any;
}
