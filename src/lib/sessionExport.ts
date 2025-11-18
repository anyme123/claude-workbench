/**
 * Session Export Utilities
 * 提供会话记录导出功能，支持多种格式
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import type { ClaudeStreamMessage } from '@/types/claude';
import type { Session } from '@/lib/api';

/**
 * 导出格式类型
 */
export type ExportFormat = 'json' | 'jsonl' | 'markdown';

/**
 * 导出会话记录为 JSONL 格式（完整的原始数据）
 */
export function exportAsJsonl(messages: ClaudeStreamMessage[]): string {
  return messages.map(msg => JSON.stringify(msg)).join('\n');
}

/**
 * 导出会话记录为 JSON 格式（结构化数据）
 */
export function exportAsJson(
  messages: ClaudeStreamMessage[],
  session?: Session
): string {
  const exportData = {
    version: 1,
    exported_at: new Date().toISOString(),
    session: session ? {
      id: session.id,
      project_id: session.project_id,
      project_path: session.project_path,
      created_at: session.created_at,
      model: session.model,
      first_message: session.first_message,
    } : null,
    messages: messages,
    message_count: messages.length,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * 导出会话记录为 Markdown 格式（人类可读）
 */
export function exportAsMarkdown(
  messages: ClaudeStreamMessage[],
  session?: Session
): string {
  let markdown = '# Claude 会话记录\n\n';

  // 添加会话元数据
  if (session) {
    markdown += '## 会话信息\n\n';
    markdown += `- **会话 ID**: ${session.id}\n`;
    markdown += `- **项目路径**: ${session.project_path}\n`;
    if (session.model) markdown += `- **模型**: ${session.model}\n`;
    markdown += `- **创建时间**: ${new Date(session.created_at * 1000).toLocaleString('zh-CN')}\n`;
    markdown += '\n---\n\n';
  }

  markdown += '## 对话内容\n\n';

  // 添加消息内容
  messages.forEach((msg) => {
    // 检查是否是工具结果消息（type 为 user 但内容包含 tool_result）
    const isToolResultMessage = msg.type === 'user' && Array.isArray(msg.message?.content) && 
      msg.message.content.some((item: any) => item.type === 'tool_result');
    
    // 检查是否是纯用户消息（type 为 user 且不包含 tool_result）
    const isPureUserMessage = msg.type === 'user' && !isToolResultMessage;

    if (isPureUserMessage) {
      markdown += `### 👤 用户\n\n`;
      const content = extractMessageContent(msg);
      markdown += `${content}\n\n`;
      markdown += '---\n\n';
    } else if (msg.type === 'assistant') {
      markdown += `### 🤖 Assistant\n\n`;
      const content = extractMessageContent(msg);
      markdown += `${content}\n\n`;
      markdown += '---\n\n';
    } else if (isToolResultMessage) {
      // 工具结果作为独立部分显示
      markdown += `### 🔧 工具执行结果\n\n`;
      const content = extractToolResultContent(msg);
      markdown += `${content}\n\n`;
      markdown += '---\n\n';
    }
  });

  // 添加统计信息
  const userMessages = messages.filter(m => {
    const isToolResult = m.type === 'user' && Array.isArray(m.message?.content) && 
      m.message.content.some((item: any) => item.type === 'tool_result');
    return m.type === 'user' && !isToolResult;
  }).length;
  const assistantMessages = messages.filter(m => m.type === 'assistant').length;
  const toolResultMessages = messages.filter(m => {
    return m.type === 'user' && Array.isArray(m.message?.content) && 
      m.message.content.some((item: any) => item.type === 'tool_result');
  }).length;
  
  markdown += '\n---\n\n';
  markdown += '## 统计信息\n\n';
  markdown += `- 用户消息: ${userMessages}\n`;
  markdown += `- AI 回复: ${assistantMessages}\n`;
  markdown += `- 工具执行: ${toolResultMessages}\n`;
  markdown += `- 总消息数: ${messages.length}\n`;
  markdown += `\n*导出时间: ${new Date().toLocaleString('zh-CN')}*\n`;

  return markdown;
}

/**
 * 从工具结果消息中提取工具结果内容
 */
function extractToolResultContent(msg: ClaudeStreamMessage): string {
  const content = msg.message?.content;
  
  if (!Array.isArray(content)) {
    return '';
  }

  const results: string[] = [];
  
  content.forEach((item: any) => {
    if (item.type === 'tool_result') {
      const toolId = item.tool_use_id ? ` (ID: ${item.tool_use_id.slice(0, 8)}...)` : '';
      const isError = item.is_error || false;
      const status = isError ? '❌ 失败' : '✅ 成功';
      
      results.push(`**状态**: ${status}${toolId}\n`);
      
      if (item.content) {
        const resultContent = typeof item.content === 'string' 
          ? item.content 
          : JSON.stringify(item.content, null, 2);
        
        results.push(`\`\`\`\n${resultContent}\n\`\`\`\n`);
      }
    }
  });

  return results.join('\n');
}

/**
 * 从消息对象中提取可读的文本内容（包括思考过程）
 * 注意：工具结果不在这里处理，而是通过 extractToolResultContent 单独处理
 */
function extractMessageContent(msg: ClaudeStreamMessage): string {
  const content = msg.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const parts: string[] = [];
    
    // 首先提取思考块（如果有）
    const thinkingBlocks = content.filter((item: any) => item.type === 'thinking');
    if (thinkingBlocks.length > 0) {
      const thinkingContent = thinkingBlocks
        .map((item: any) => item.thinking || '')
        .filter(Boolean)
        .join('\n\n');
      
      if (thinkingContent) {
        parts.push(`\n**💭 思考过程:**\n\n\`\`\`\n${thinkingContent}\n\`\`\`\n`);
      }
    }
    
    // 然后提取其他内容块（注意：tool_result 不在这里处理）
    const otherContent = content
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (item.type === 'text') return item.text || '';
        if (item.type === 'thinking') return ''; // 已在上面处理
        if (item.type === 'tool_use') {
          return `\n**🔧 工具调用: ${item.name}**\n\n\`\`\`json\n${JSON.stringify(item.input, null, 2)}\n\`\`\`\n`;
        }
        if (item.type === 'tool_result') {
          // tool_result 不在这里处理，由 extractToolResultContent 专门处理
          return '';
        }
        // 其他未知类型也导出
        return `\n**⚙️ ${item.type || 'unknown'}**\n\n\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n`;
      })
      .filter(Boolean);
    
    parts.push(...otherContent);
    
    return parts.join('\n');
  }

  return '';
}

/**
 * 保存文件到用户选择的路径（使用 Tauri 文件对话框）
 * @returns 保存的文件路径，如果用户取消则返回 null
 */
export async function saveFileWithDialog(
  content: string,
  defaultFilename: string,
  filters?: { name: string; extensions: string[] }[]
): Promise<string | null> {
  try {
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: filters || [
        {
          name: 'All Files',
          extensions: ['*']
        }
      ]
    });
    
    if (filePath) {
      await writeTextFile(filePath, content);
      return filePath;
    }
    
    return null;
  } catch (error) {
    console.error('保存文件失败:', error);
    throw error;
  }
}

/**
 * 生成导出文件名
 */
export function generateExportFilename(session: Session | undefined, format: ExportFormat): string {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const sessionId = session?.id ? session.id.slice(0, 8) : 'session';
  
  const extension = format === 'markdown' ? 'md' : format;
  return `claude-session-${sessionId}-${timestamp}.${extension}`;
}

/**
 * 导出会话记录（完整流程：生成内容 + 用户选择保存路径）
 * @returns 保存的文件路径，如果用户取消则返回 null
 */
export async function exportSession(
  messages: ClaudeStreamMessage[],
  format: ExportFormat,
  session?: Session
): Promise<string | null> {
  let content: string;
  let filters: { name: string; extensions: string[] }[];

  switch (format) {
    case 'jsonl':
      content = exportAsJsonl(messages);
      filters = [{ name: 'JSONL Files', extensions: ['jsonl'] }];
      break;
    case 'json':
      content = exportAsJson(messages, session);
      filters = [{ name: 'JSON Files', extensions: ['json'] }];
      break;
    case 'markdown':
      content = exportAsMarkdown(messages, session);
      filters = [{ name: 'Markdown Files', extensions: ['md'] }];
      break;
    default:
      throw new Error(`不支持的导出格式: ${format}`);
  }

  const filename = generateExportFilename(session, format);
  return await saveFileWithDialog(content, filename, filters);
}

/**
 * 复制内容到剪贴板
 */
export async function copyToClipboard(content: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(content);
  } catch (error) {
    // 降级到传统方法
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
