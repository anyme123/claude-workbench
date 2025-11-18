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
 */
export function groupMessages(messages: ClaudeStreamMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  const processedIndices = new Set<number>();
  
  // 第一遍：识别所有 Task 工具调用
  const taskToolUseMap = new Map<string, { message: ClaudeStreamMessage; index: number }>();
  
  messages.forEach((message, index) => {
    const taskIds = extractTaskToolUseIds(message);
    taskIds.forEach(taskId => {
      taskToolUseMap.set(taskId, { message, index });
    });
  });
  
  // 第二遍：为每个 Task 收集子代理消息
  const subagentGroups = new Map<string, SubagentGroup>();
  
  taskToolUseMap.forEach((taskInfo, taskId) => {
    const subagentMessages: ClaudeStreamMessage[] = [];
    let minIndex = taskInfo.index;
    let maxIndex = taskInfo.index;
    
    // 从 Task 后面的消息中查找子代理消息
    for (let i = taskInfo.index + 1; i < messages.length; i++) {
      const msg = messages[i];
      const parentId = getParentToolUseId(msg);
      
      if (parentId === taskId) {
        subagentMessages.push(msg);
        maxIndex = i;
      }
      
      // 如果遇到下一个 Task 调用，停止收集
      if (i > taskInfo.index && hasTaskToolCall(msg)) {
        break;
      }
    }
    
    if (subagentMessages.length > 0) {
      subagentGroups.set(taskId, {
        id: taskId,
        taskMessage: taskInfo.message,
        taskToolUseId: taskId,
        subagentMessages,
        startIndex: minIndex,
        endIndex: maxIndex,
      });
      
      // 标记已处理的索引
      processedIndices.add(minIndex);
      for (let i = minIndex + 1; i <= maxIndex; i++) {
        const parentId = getParentToolUseId(messages[i]);
        if (parentId === taskId) {
          processedIndices.add(i);
        }
      }
    }
  });
  
  // 第三遍：构建最终的分组列表
  messages.forEach((message, index) => {
    if (processedIndices.has(index)) {
      // 如果是 Task 消息，添加整个子代理组
      const taskIds = extractTaskToolUseIds(message);
      const taskId = taskIds[0];
      
      if (taskId && subagentGroups.has(taskId)) {
        groups.push({
          type: 'subagent',
          group: subagentGroups.get(taskId)!,
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
