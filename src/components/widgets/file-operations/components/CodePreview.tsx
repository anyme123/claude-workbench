/**
 * ✅ Code Preview Component - 代码预览子组件
 *
 * 从 WriteWidget 中提取，用于展示代码预览
 */

import React from "react";
import { Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";

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
}

/**
 * 代码预览组件
 *
 * Features:
 * - 语法高亮
 * - 截断提示
 * - 最大化按钮
 */
export const CodePreview: React.FC<CodePreviewProps> = ({
  codeContent,
  language,
  truncated,
  truncateLimit = 5000,
  onMaximize,
}) => {
  const { theme } = useTheme();

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
        <span className="text-xs font-mono text-muted-foreground">预览</span>
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
      <div className="overflow-auto flex-1">
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
          {codeContent}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};
