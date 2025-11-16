import React, { useMemo } from "react";
import { List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ClaudeStreamMessage } from "@/types/claude";

interface PromptNavigatorProps {
  /** 所有消息列表 */
  messages: ClaudeStreamMessage[];
  /** 是否显示导航面板 */
  isOpen: boolean;
  /** 关闭面板回调 */
  onClose: () => void;
  /** 点击提示词回调 */
  onPromptClick: (promptIndex: number) => void;
}

interface PromptItem {
  promptIndex: number;
  content: string;
  timestamp?: string;
}

/**
 * 提取用户消息的纯文本内容
 */
const extractUserText = (message: ClaudeStreamMessage): string => {
  if (!message.message?.content) return '';

  const content = message.message.content;
  let text = '';

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text || '')
      .join('\n');
  }

  // 处理转义字符
  if (text.includes('\\')) {
    text = text
      .replace(/\\\\n/g, '\n')
      .replace(/\\\\r/g, '\r')
      .replace(/\\\\t/g, '\t')
      .replace(/\\\\"/g, '"')
      .replace(/\\\\'/g, "'")
      .replace(/\\\\\\\\/g, '\\');
  }

  return text;
};

/**
 * 截断文本为摘要
 */
const truncateText = (text: string, maxLength: number = 80): string => {
  // 移除多余的换行符和空格
  const cleaned = text.replace(/\s+/g, ' ').trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return cleaned.substring(0, maxLength) + '...';
};

/**
 * 提示词快速导航组件
 */
export const PromptNavigator: React.FC<PromptNavigatorProps> = ({
  messages,
  isOpen,
  onClose,
  onPromptClick
}) => {
  // 提取所有用户提示词
  const prompts = useMemo<PromptItem[]>(() => {
    let promptIndex = 0;
    const items: PromptItem[] = [];

    for (const message of messages) {
      const messageType = (message as any).type || message.message?.role;

      if (messageType === 'user') {
        const text = extractUserText(message);
        if (text) {
          items.push({
            promptIndex,
            content: text,
            timestamp: (message as any).sentAt || (message as any).timestamp
          });
          promptIndex++;
        }
      }
    }

    return items;
  }, [messages]);

  return (
    <div
      className={cn(
        "h-full bg-background flex flex-col transition-all duration-300 ease-in-out",
        isOpen ? "w-80 border-l shadow-lg" : "w-0"
      )}
      style={{
        overflow: 'hidden',
      }}
    >
      {isOpen && (
        <>
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <List className="h-5 w-5" />
          <h3 className="font-semibold">提示词导航</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 列表 */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {prompts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              暂无提示词
            </div>
          ) : (
            prompts.map((prompt) => (
              <div
                key={prompt.promptIndex}
                onClick={() => onPromptClick(prompt.promptIndex)}
                className={cn(
                  "p-3 rounded-lg border cursor-pointer transition-all",
                  "hover:bg-accent hover:border-primary hover:shadow-sm",
                  "active:scale-[0.98]"
                )}
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    #{prompt.promptIndex + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium line-clamp-2">
                      {truncateText(prompt.content, 60)}
                    </div>
                  </div>
                </div>
                {prompt.timestamp && (
                  <div className="text-xs text-muted-foreground ml-8">
                    {new Date(prompt.timestamp).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* 底部统计 */}
      <div className="p-4 border-t bg-muted/30 flex-shrink-0">
        <div className="text-sm text-muted-foreground text-center">
          共 {prompts.length} 个提示词
        </div>
      </div>
        </>
      )}
    </div>
  );
};
