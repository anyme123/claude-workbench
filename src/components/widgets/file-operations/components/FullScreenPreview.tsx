/**
 * ✅ Full Screen Preview Component - 全屏预览子组件
 *
 * 从 WriteWidget 中提取，用于全屏展示文件内容
 */

import React from "react";
import { FileText, ExternalLink, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface FullScreenPreviewProps {
  /** 是否显示 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 文件路径 */
  filePath: string;
  /** 文件内容 */
  content: string;
  /** 编程语言 */
  language: string;
  /** 是否为 Markdown */
  isMarkdown: boolean;
  /** 系统打开回调 */
  onOpenInSystem?: () => void;
}

/**
 * 全屏预览组件（Portal 渲染）
 *
 * Features:
 * - Portal 渲染到 body
 * - ESC 键关闭
 * - Markdown 特殊渲染
 * - 系统打开按钮
 */
export const FullScreenPreview: React.FC<FullScreenPreviewProps> = ({
  isOpen,
  onClose,
  filePath,
  content,
  language,
  isMarkdown,
  onOpenInSystem,
}) => {
  const { theme } = useTheme();

  // ESC 键关闭
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
      style={{ zIndex: 9999 }}
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-6xl h-[90vh] bg-zinc-950 border border-border rounded-lg shadow-2xl flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-mono text-muted-foreground truncate">{filePath}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenInSystem && (
              <button
                className="h-8 px-3 text-xs border border-border bg-background hover:bg-muted/50 rounded-md flex items-center gap-1"
                onClick={onOpenInSystem}
                type="button"
              >
                <ExternalLink className="h-3 w-3" />
                打开
              </button>
            )}
            <button
              className="h-8 w-8 hover:bg-muted/50 rounded-md flex items-center justify-center"
              onClick={onClose}
              type="button"
              title="关闭 (ESC)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-6">
            {isMarkdown ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <SyntaxHighlighter
                language={language}
                style={getClaudeSyntaxTheme(theme === 'dark')}
                customStyle={{
                  margin: 0,
                  background: 'transparent',
                  fontSize: '0.75rem',
                  lineHeight: '1.5',
                }}
                showLineNumbers
                wrapLongLines={true}
              >
                {content}
              </SyntaxHighlighter>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
