/**
 * ✅ Code Preview Component - 代码预览子组件
 *
 * 从 WriteWidget 中提取，用于展示代码预览
 * 支持流式输出时的打字机效果
 */

import React, { useRef, useEffect } from "react";
import { Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";
import { useTypewriter } from "@/hooks/useTypewriter";

export interface CodePreviewProps {
  /** 代码内容 */
  codeContent: string;
  /** 编程语言 */
  language: string;
  /** 是否截断 */
  truncated: boolean;
  /** 截断限制（用于显示提示） */
  truncateLimit?: number;
  /** 最大化回调 */
  onMaximize?: () => void;
  /** 是否正在流式输出 */
  isStreaming?: boolean;
  /** 打字机速度（毫秒/字符） */
  typewriterSpeed?: number;
}

/**
 * 代码预览组件
 *
 * Features:
 * - 语法高亮
 * - 截断提示
 * - 最大化按钮
 * - 流式输出打字机效果
 */
export const CodePreview: React.FC<CodePreviewProps> = ({
  codeContent,
  language,
  truncated,
  truncateLimit = 5000,
  onMaximize,
  isStreaming = false,
  typewriterSpeed = 2, // 代码输出速度更快
}) => {
  const { theme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 使用打字机效果
  const {
    displayedText,
    isTyping,
    skipToEnd
  } = useTypewriter(codeContent, {
    enabled: isStreaming,
    speed: typewriterSpeed,
    isStreaming,
  });

  // 决定显示的内容
  const textToDisplay = isStreaming ? displayedText : codeContent;

  // 流式输出时自动滚动到底部
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [textToDisplay, isStreaming]);

  // 双击跳过打字效果
  const handleDoubleClick = () => {
    if (isTyping) {
      skipToEnd();
    }
  };

  return (
    <div
      className="rounded-lg border bg-zinc-100 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-800 overflow-hidden w-full"
      style={{
        height: truncated ? '440px' : 'auto',
        maxHeight: truncated ? '440px' : undefined,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* 头部 */}
      <div className="px-4 py-2 border-b border-zinc-300 dark:border-zinc-800 bg-zinc-200/50 dark:bg-zinc-950 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">预览</span>
          {/* 打字中指示器 */}
          {isTyping && (
            <span className="inline-block w-1.5 h-3 bg-emerald-500 animate-pulse rounded-full" />
          )}
        </div>
        {truncated && onMaximize && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs whitespace-nowrap">
              截断为 {truncateLimit.toLocaleString()} 个字符
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onMaximize}
              title="查看完整内容"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* 代码内容 */}
      <div
        ref={scrollRef}
        className="overflow-auto flex-1"
        onDoubleClick={handleDoubleClick}
        title={isTyping ? "双击跳过打字效果" : undefined}
      >
        <SyntaxHighlighter
          language={language}
          style={getClaudeSyntaxTheme(theme === 'dark')}
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
            fontSize: '0.75rem',
            lineHeight: '1.5',
            overflowX: 'auto'
          }}
          wrapLongLines={false}
        >
          {textToDisplay}
        </SyntaxHighlighter>
        {/* 打字中光标 */}
        {isTyping && (
          <span className="inline-block w-2 h-4 ml-1 mb-4 bg-emerald-500 animate-pulse rounded-sm" />
        )}
      </div>
    </div>
  );
};
