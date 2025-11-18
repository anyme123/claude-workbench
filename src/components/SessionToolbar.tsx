/**
 * SessionToolbar - 会话工具栏组件
 * 提供导出、复制等会话操作功能
 */

import React, { useState } from 'react';
import { Download, Copy, Check, FileText, FileJson, FileCode2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { exportSession, copyToClipboard, exportAsJsonl, exportAsMarkdown } from '@/lib/sessionExport';
import type { ClaudeStreamMessage } from '@/types/claude';
import type { Session } from '@/lib/api';

interface SessionToolbarProps {
  /** 当前会话的消息列表 */
  messages: ClaudeStreamMessage[];
  /** 当前会话信息 */
  session?: Session;
  /** 是否正在流式输出 */
  isStreaming?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * SessionToolbar 组件
 * 
 * @example
 * <SessionToolbar 
 *   messages={messages} 
 *   session={session} 
 *   isStreaming={false} 
 * />
 */
export const SessionToolbar: React.FC<SessionToolbarProps> = ({
  messages,
  session,
  isStreaming = false,
  className,
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'jsonl' | 'markdown'>('idle');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // 没有消息或正在流式输出时禁用
  const hasMessages = messages.length > 0;
  const isDisabled = !hasMessages || isStreaming;

  /**
   * 处理复制为 JSONL
   */
  const handleCopyAsJsonl = async () => {
    try {
      const content = exportAsJsonl(messages);
      await copyToClipboard(content);
      setCopyState('jsonl');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  /**
   * 处理复制为 Markdown
   */
  const handleCopyAsMarkdown = async () => {
    try {
      const content = exportAsMarkdown(messages, session);
      await copyToClipboard(content);
      setCopyState('markdown');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  /**
   * 处理导出为文件
   */
  const handleExport = (format: 'json' | 'jsonl' | 'markdown') => {
    try {
      exportSession(messages, format, session);
      setIsExportMenuOpen(false);
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* 复制按钮 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDisabled}
            className="h-8 px-2 gap-1.5"
          >
            {copyState !== 'idle' ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span className="text-xs">
              {copyState === 'jsonl' ? '已复制 JSONL' : 
               copyState === 'markdown' ? '已复制 Markdown' : 
               '复制'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={handleCopyAsJsonl}>
            <FileCode2 className="h-4 w-4 mr-2" />
            复制为 JSONL
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopyAsMarkdown}>
            <FileText className="h-4 w-4 mr-2" />
            复制为 Markdown
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 导出按钮 */}
      <DropdownMenu open={isExportMenuOpen} onOpenChange={setIsExportMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDisabled}
            className="h-8 px-2 gap-1.5"
          >
            <Download className="h-4 w-4" />
            <span className="text-xs">导出</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => handleExport('json')}>
            <FileJson className="h-4 w-4 mr-2" />
            导出为 JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('jsonl')}>
            <FileCode2 className="h-4 w-4 mr-2" />
            导出为 JSONL
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport('markdown')}>
            <FileText className="h-4 w-4 mr-2" />
            导出为 Markdown
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
