import React, { useMemo } from "react";
import { Bot, Clock } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { MessageContent } from "./MessageContent";
import { MessageImagePreview, extractImagesFromContent } from "./MessageImagePreview";
import { ToolCallsGroup } from "./ToolCallsGroup";
import { cn } from "@/lib/utils";
import { tokenExtractor } from "@/lib/tokenExtractor";
import { formatTimestamp } from "@/lib/messageUtils";
import type { ClaudeStreamMessage } from '@/types/claude';

interface AIMessageProps {
  /** 消息数据 */
  message: ClaudeStreamMessage;
  /** 是否正在流式输出 */
  isStreaming?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 链接检测回调 */
  onLinkDetected?: (url: string) => void;
}

/**
 * 提取AI消息的文本内容
 */
const extractAIText = (message: ClaudeStreamMessage): string => {
  if (!message.message?.content) return '';
  
  const content = message.message.content;
  
  // 如果是字符串，直接返回
  if (typeof content === 'string') return content;
  
  // 如果是数组，提取所有text类型的内容
  if (Array.isArray(content)) {
    return content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n\n');
  }
  
  return '';
};

/**
 * 检测消息中是否有工具调用
 *
 * 注意：只检查 tool_use，不检查 tool_result
 * tool_result 是工具执行的结果，通常通过 ToolCallsGroup 根据 tool_use 匹配显示
 * Codex 的 function_call_output 事件会生成仅包含 tool_result 的消息，
 * 这些消息不应该触发工具卡片渲染（避免空白消息卡片）
 */
const hasToolCalls = (message: ClaudeStreamMessage): boolean => {
  if (!message.message?.content) return false;

  const content = message.message.content;
  if (!Array.isArray(content)) return false;

  return content.some((item: any) => item.type === 'tool_use');
};

/**
 * 检测消息中是否有思考块
 */
const hasThinkingBlock = (message: ClaudeStreamMessage): boolean => {
  if (!message.message?.content) return false;

  const content = message.message.content;
  if (!Array.isArray(content)) return false;

  return content.some((item: any) => item.type === 'thinking');
};

/**
 * 提取思考块内容
 */
const extractThinkingContent = (message: ClaudeStreamMessage): string => {
  if (!message.message?.content) return '';

  const content = message.message.content;
  if (!Array.isArray(content)) return '';

  const thinkingBlocks = content.filter((item: any) => item.type === 'thinking');
  return thinkingBlocks.map((item: any) => item.thinking || '').join('\n\n');
};

/**
 * AI消息组件（重构版）
 * 左对齐卡片样式，支持工具调用展示和思考块
 */
export const AIMessage: React.FC<AIMessageProps> = ({
  message,
  isStreaming = false,
  className,
  onLinkDetected
}) => {
  const text = extractAIText(message);
  const hasTools = hasToolCalls(message);
  const hasThinking = hasThinkingBlock(message);
  const thinkingContent = hasThinking ? extractThinkingContent(message) : '';

  // 🆕 提取消息中的图片
  const images = useMemo(() => {
    const content = message.message?.content;
    if (!content || !Array.isArray(content)) return [];
    return extractImagesFromContent(content);
  }, [message]);

  // 如果既没有文本又没有工具调用又没有思考块又没有图片，不渲染
  if (!text && !hasTools && !hasThinking && images.length === 0) return null;

  // 提取 tokens 统计
  const tokenStats = message.message?.usage ? (() => {
    const extractedTokens = tokenExtractor.extract({
      type: 'assistant',
      message: { usage: message.message.usage }
    });
    const parts = [`${extractedTokens.input_tokens}/${extractedTokens.output_tokens}`];
    if (extractedTokens.cache_creation_tokens > 0) {
      parts.push(`创建${extractedTokens.cache_creation_tokens}`);
    }
    if (extractedTokens.cache_read_tokens > 0) {
      parts.push(`缓存${extractedTokens.cache_read_tokens}`);
    }
    return parts.join(' | ');
  })() : null;

  // Detect if this is a Codex message
  const isCodexMessage = (message as any).engine === 'codex';
  const assistantName = isCodexMessage ? 'Codex' : 'Claude';

  return (
    <div className={cn("relative", className)}>
      <MessageBubble variant="assistant" isStreaming={isStreaming}>
        {/* 消息头部：整合标头和tokens统计 */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
            {/* 左侧：头像 + 名称 + 时间 */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/10 flex-shrink-0">
                <Bot className="w-4 h-4 text-blue-500" />
              </div>
              <span className="font-medium">{assistantName}</span>
              {formatTimestamp((message as any).receivedAt ?? (message as any).timestamp) && (
                <>
                  <span className="text-muted-foreground/50">•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimestamp((message as any).receivedAt ?? (message as any).timestamp)}
                  </span>
                </>
              )}
            </div>
            
            {/* 右侧：tokens统计 */}
            {tokenStats && (
              <div className="text-foreground/60 font-mono flex-shrink-0">
                Tokens: {tokenStats}
              </div>
            )}
          </div>
        </div>

        {/* 消息内容 */}
        {text && (
          <div className="px-4 pb-4">
            <MessageContent
              content={text}
              isStreaming={isStreaming && !hasTools && !hasThinking}
            />
          </div>
        )}

        {/* 🆕 图片预览 */}
        {images.length > 0 && (
          <div className="px-4 pb-4">
            <MessageImagePreview
              images={images}
              thumbnailSize={150}
            />
          </div>
        )}

        {/* 思考块区域 */}
        {hasThinking && thinkingContent && (
          <div className="mx-4 mb-3 border-l-2 border-purple-500/30 bg-purple-500/5 rounded">
            <details className="group">
              <summary className="cursor-pointer px-3 py-2 text-xs text-purple-700 dark:text-purple-300 font-medium hover:bg-purple-500/10 transition-colors select-none flex items-center gap-2">
                <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                <span>思考过程</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {thinkingContent.length} 字符
                </span>
              </summary>
              <div className="px-3 pb-3 pt-1">
                <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                  {thinkingContent}
                </div>
              </div>
            </details>
          </div>
        )}

        {/* 工具调用区域 */}
        {hasTools && (
          <ToolCallsGroup
            message={message}
            onLinkDetected={onLinkDetected}
          />
        )}
      </MessageBubble>
    </div>
  );
};
