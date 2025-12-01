import React from "react";
import { Bot, Clock, BrainCircuit } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { MessageContent } from "./MessageContent";
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

  // 如果既没有文本又没有工具调用又没有思考块，不渲染
  if (!text && !hasTools && !hasThinking) return null;

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
    <div className={cn("relative group", className)}>
      <MessageBubble variant="assistant" isStreaming={isStreaming}>
        <div className="flex gap-4 items-start">
          {/* Left Column: Avatar */}
          <div className="flex-shrink-0 mt-0.5 select-none">
            <div className={cn(
              "flex items-center justify-center w-7 h-7 rounded-lg",
              isCodexMessage 
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20"
                : "bg-orange-500/10 text-orange-600 dark:text-orange-400 dark:bg-orange-500/20"
            )}>
              <Bot className="w-4 h-4" />
            </div>
          </div>

          {/* Right Column: Content */}
          <div className="flex-1 min-w-0 space-y-1">
            
            {/* Main Content */}
            <div className="space-y-3">
              {text && (
                <div className="prose prose-neutral dark:prose-invert max-w-none leading-relaxed text-[15px]">
                  <MessageContent
                    content={text}
                    isStreaming={isStreaming && !hasTools && !hasThinking}
                  />
                </div>
              )}

              {/* Thinking Block */}
              {hasThinking && thinkingContent && (
                <div className="border-l-2 border-amber-500/30 bg-amber-500/5 rounded-md overflow-hidden my-2">
                  <details className="group">
                    <summary className="cursor-pointer px-3 py-2 text-xs text-amber-700 dark:text-amber-300 font-medium hover:bg-amber-500/10 transition-colors select-none flex items-center gap-2 outline-none">
                      <BrainCircuit className="w-3.5 h-3.5 opacity-70" />
                      <span>Thinking Process</span>
                      <span className="ml-auto text-[10px] opacity-60">
                        {thinkingContent.length} chars
                      </span>
                    </summary>
                    <div className="px-3 pb-3 pt-1">
                      <div className="text-xs text-muted-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
                        {thinkingContent}
                      </div>
                    </div>
                  </details>
                </div>
              )}

              {/* Tool Calls */}
              {hasTools && (
                <div className="mt-2">
                  <ToolCallsGroup
                    message={message}
                    onLinkDetected={onLinkDetected}
                  />
                </div>
              )}
            </div>

            {/* Footer: Meta Info (Hover Only) */}
            <div className="flex items-center justify-end gap-2 pt-1 text-[10px] text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none">
              <span className="font-medium">{assistantName}</span>
              {formatTimestamp((message as any).receivedAt ?? (message as any).timestamp) && (
                <>
                  <span>•</span>
                  <span>
                    {formatTimestamp((message as any).receivedAt ?? (message as any).timestamp)}
                  </span>
                </>
              )}
              {tokenStats && (
                <>
                  <span>•</span>
                  <span className="font-mono opacity-80">
                    {tokenStats}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </MessageBubble>
    </div>
  );
};
