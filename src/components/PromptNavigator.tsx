import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { List, X, Search, LayoutList, LayoutGrid, Hash, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
 * 高亮搜索关键词
 */
const highlightText = (text: string, keyword: string): React.ReactNode => {
  if (!keyword.trim()) return text;

  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{part}</mark>
      : part
  );
};

/**
 * 提示词快速导航组件
 *
 * 功能特性：
 * - 搜索/过滤提示词
 * - 紧凑/标准模式切换
 * - 快速跳转到指定提示词
 * - 键盘导航支持
 */
export const PromptNavigator: React.FC<PromptNavigatorProps> = ({
  messages,
  isOpen,
  onClose,
  onPromptClick
}) => {
  // 搜索关键词
  const [searchQuery, setSearchQuery] = useState('');
  // 紧凑模式
  const [isCompact, setIsCompact] = useState(false);
  // 快速跳转输入
  const [jumpInput, setJumpInput] = useState('');
  // 显示快速跳转
  const [showJumpInput, setShowJumpInput] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // 提取所有用户提示词
  const prompts = useMemo<PromptItem[]>(() => {
    let promptIndex = 0;
    const items: PromptItem[] = [];

    for (const message of messages) {
      const messageType = (message as any).type || (message.message as any)?.role;

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

  // 过滤后的提示词
  const filteredPrompts = useMemo(() => {
    if (!searchQuery.trim()) return prompts;

    const query = searchQuery.toLowerCase();
    return prompts.filter(prompt =>
      prompt.content.toLowerCase().includes(query) ||
      `#${prompt.promptIndex + 1}`.includes(query)
    );
  }, [prompts, searchQuery]);

  // 快速跳转处理
  const handleJump = useCallback(() => {
    const num = parseInt(jumpInput, 10);
    if (!isNaN(num) && num >= 1 && num <= prompts.length) {
      onPromptClick(num - 1);
      setJumpInput('');
      setShowJumpInput(false);
    }
  }, [jumpInput, prompts.length, onPromptClick]);

  // 键盘快捷键
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl/Cmd + F 聚焦搜索
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
    // Ctrl/Cmd + G 快速跳转
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
      e.preventDefault();
      setShowJumpInput(true);
      setTimeout(() => jumpInputRef.current?.focus(), 0);
    }
    // Escape 关闭
    if (e.key === 'Escape') {
      if (showJumpInput) {
        setShowJumpInput(false);
      } else if (searchQuery) {
        setSearchQuery('');
      } else {
        onClose();
      }
    }
  }, [showJumpInput, searchQuery, onClose]);

  // 滚动到顶部/底部
  const scrollToTop = useCallback(() => {
    scrollAreaRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollAreaRef.current?.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  // 打开时聚焦搜索框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // 自动切换紧凑模式（提示词超过20条时）
  useEffect(() => {
    if (prompts.length > 20 && !isCompact) {
      setIsCompact(true);
    }
  }, [prompts.length]);

  return (
    <div
      className={cn(
        "h-full bg-background flex flex-col transition-all duration-300 ease-in-out",
        isOpen ? "w-80 border-l shadow-lg" : "w-0"
      )}
      style={{ overflow: 'hidden' }}
      onKeyDown={handleKeyDown}
    >
      {isOpen && (
        <>
          {/* 头部 */}
          <div className="flex items-center justify-between p-3 border-b flex-shrink-0">
            <div className="flex items-center gap-2">
              <List className="h-4 w-4" />
              <h3 className="font-semibold text-sm">提示词导航</h3>
              <span className="text-xs text-muted-foreground">
                ({filteredPrompts.length}/{prompts.length})
              </span>
            </div>
            <div className="flex items-center gap-1">
              {/* 紧凑模式切换 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCompact(!isCompact)}
                    className={cn("h-7 w-7 p-0", isCompact && "bg-accent")}
                  >
                    {isCompact ? <LayoutList className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isCompact ? '标准模式' : '紧凑模式'}
                </TooltipContent>
              </Tooltip>

              {/* 快速跳转 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowJumpInput(!showJumpInput);
                      setTimeout(() => jumpInputRef.current?.focus(), 0);
                    }}
                    className={cn("h-7 w-7 p-0", showJumpInput && "bg-accent")}
                  >
                    <Hash className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  快速跳转 (Ctrl+G)
                </TooltipContent>
              </Tooltip>

              {/* 关闭按钮 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-7 w-7 p-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="p-2 border-b flex-shrink-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="搜索提示词... (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-8 text-sm"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* 快速跳转输入 */}
            {showJumpInput && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">跳转到:</span>
                <Input
                  ref={jumpInputRef}
                  type="number"
                  min={1}
                  max={prompts.length}
                  placeholder={`1-${prompts.length}`}
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleJump();
                    }
                  }}
                  className="h-7 text-sm flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleJump}
                  disabled={!jumpInput || parseInt(jumpInput) < 1 || parseInt(jumpInput) > prompts.length}
                  className="h-7 px-2 text-xs"
                >
                  跳转
                </Button>
              </div>
            )}
          </div>

          {/* 列表 */}
          <ScrollArea className="flex-1" ref={scrollAreaRef}>
            <div className={cn("p-2", isCompact ? "space-y-0.5" : "space-y-1")}>
              {filteredPrompts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {searchQuery ? '未找到匹配的提示词' : '暂无提示词'}
                </div>
              ) : (
                filteredPrompts.map((prompt) => (
                  <div
                    key={prompt.promptIndex}
                    onClick={() => onPromptClick(prompt.promptIndex)}
                    className={cn(
                      "rounded-lg border cursor-pointer transition-all",
                      "hover:bg-accent hover:border-primary/50",
                      "active:scale-[0.99]",
                      isCompact ? "p-2" : "p-3 space-y-1.5"
                    )}
                  >
                    {isCompact ? (
                      /* 紧凑模式 - 单行显示 */
                      <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          #{prompt.promptIndex + 1}
                        </span>
                        <span className="text-xs truncate flex-1 text-muted-foreground">
                          {highlightText(truncateText(prompt.content, 50), searchQuery)}
                        </span>
                      </div>
                    ) : (
                      /* 标准模式 - 多行显示 */
                      <>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">
                            #{prompt.promptIndex + 1}
                          </div>
                          {prompt.timestamp && (
                            <div className="text-xs text-muted-foreground">
                              {new Date(prompt.timestamp).toLocaleString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          )}
                        </div>
                        <div className="text-sm leading-relaxed line-clamp-2">
                          {highlightText(truncateText(prompt.content, 80), searchQuery)}
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* 底部工具栏 */}
          <div className="p-2 border-t bg-muted/30 flex-shrink-0">
            <div className="flex items-center justify-between">
              {/* 快速滚动按钮 */}
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={scrollToTop}
                      className="h-6 w-6 p-0"
                      disabled={filteredPrompts.length === 0}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">滚动到顶部</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={scrollToBottom}
                      className="h-6 w-6 p-0"
                      disabled={filteredPrompts.length === 0}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">滚动到底部</TooltipContent>
                </Tooltip>
              </div>

              {/* 统计信息 */}
              <div className="text-xs text-muted-foreground">
                {searchQuery ? (
                  <span>找到 {filteredPrompts.length} 条</span>
                ) : (
                  <span>共 {prompts.length} 个提示词</span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
