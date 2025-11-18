/**
 * Session Export Utilities
 * 提供会话记录导出功能，支持多种格式
 */

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
  messages
    .filter(msg => msg.type === 'user' || msg.type === 'assistant')
    .forEach((msg, index) => {
      if (msg.type === 'user') {
        markdown += `### 👤 用户\n\n`;
        const content = extractMessageContent(msg);
        markdown += `${content}\n\n`;
      } else if (msg.type === 'assistant') {
        markdown += `### 🤖 Assistant\n\n`;
        const content = extractMessageContent(msg);
        markdown += `${content}\n\n`;
      }

      // 添加分隔线（除了最后一条消息）
      if (index < messages.length - 1) {
        markdown += '---\n\n';
      }
    });

  // 添加统计信息
  const userMessages = messages.filter(m => m.type === 'user').length;
  const assistantMessages = messages.filter(m => m.type === 'assistant').length;
  
  markdown += '\n---\n\n';
  markdown += '## 统计信息\n\n';
  markdown += `- 用户消息: ${userMessages}\n`;
  markdown += `- AI 回复: ${assistantMessages}\n`;
  markdown += `- 总消息数: ${messages.length}\n`;
  markdown += `\n*导出时间: ${new Date().toLocaleString('zh-CN')}*\n`;

  return markdown;
}

/**
 * 从消息对象中提取可读的文本内容
 */
function extractMessageContent(msg: ClaudeStreamMessage): string {
  const content = msg.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (item.type === 'text') return item.text || '';
        if (item.type === 'tool_use') {
          return `\n\`\`\`json\n[工具调用: ${item.name}]\n${JSON.stringify(item.input, null, 2)}\n\`\`\`\n`;
        }
        if (item.type === 'tool_result') {
          const result = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
          return `\n\`\`\`\n[工具结果]\n${result}\n\`\`\`\n`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

/**
 * 下载文件到本地
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 清理 URL 对象
  URL.revokeObjectURL(url);
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
 * 导出会话记录（完整流程：生成内容 + 下载文件）
 */
export function exportSession(
  messages: ClaudeStreamMessage[],
  format: ExportFormat,
  session?: Session
): void {
  let content: string;
  let mimeType: string;

  switch (format) {
    case 'jsonl':
      content = exportAsJsonl(messages);
      mimeType = 'application/x-ndjson';
      break;
    case 'json':
      content = exportAsJson(messages, session);
      mimeType = 'application/json';
      break;
    case 'markdown':
      content = exportAsMarkdown(messages, session);
      mimeType = 'text/markdown';
      break;
    default:
      throw new Error(`不支持的导出格式: ${format}`);
  }

  const filename = generateExportFilename(session, format);
  downloadFile(content, filename, mimeType);
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
