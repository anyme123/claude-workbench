import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

interface MessageContentProps {
  /** Markdown内容 */
  content: string;
  /** 自定义类名 */
  className?: string;
  /** 是否正在流式输出 */
  isStreaming?: boolean;
}

/**
 * 消息内容渲染组件
 * 支持Markdown + 代码高亮
 */
export const MessageContent: React.FC<MessageContentProps> = ({
  content,
  className,
  isStreaming = false
}) => {
  const { theme } = useTheme();
  const syntaxTheme = getClaudeSyntaxTheme(theme === 'dark');

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 代码块渲染
          code(props: any) {
            const { node, inline, className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            return !inline && language ? (
              <div className="relative group my-4">
                {/* 文件名/语言标签 */}
                <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border rounded-t-lg">
                  <span className="text-xs font-mono text-muted-foreground">
                    {language}
                  </span>
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      try {
                        const code = String(children).replace(/\n$/, '');
                        
                        // ⚡ 修复：使用后端 Tauri 命令，绕过浏览器限制
                        const { invoke } = await import('@tauri-apps/api/core');
                        await invoke('write_to_clipboard', { text: code });
                        
                        console.log('[CodeBlock] Copied to clipboard via Tauri:', code.substring(0, 50) + '...');
                        
                        // 简短的成功提示
                        e.currentTarget.textContent = '已复制!';
                        setTimeout(() => {
                          e.currentTarget.textContent = '复制';
                        }, 2000);
                      } catch (error) {
                        console.error('[CodeBlock] Tauri copy failed, trying browser API:', error);
                        
                        // 降级到浏览器 API
                        try {
                          await navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
                          console.log('[CodeBlock] Copied via browser API');
                          
                          e.currentTarget.textContent = '已复制!';
                          setTimeout(() => {
                            e.currentTarget.textContent = '复制';
                          }, 2000);
                        } catch (fallbackError) {
                          console.error('[CodeBlock] All copy methods failed:', fallbackError);
                          e.currentTarget.textContent = '复制失败';
                          setTimeout(() => {
                            e.currentTarget.textContent = '复制';
                          }, 2000);
                        }
                      }
                    }}
                    className="text-xs px-2 py-1 rounded bg-background hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                  >
                    复制
                  </button>
                </div>
                
                {/* 代码内容 */}
                <div className="rounded-b-lg overflow-hidden">
                  <SyntaxHighlighter
                    style={syntaxTheme}
                    language={language}
                    PreTag="div"
                    showLineNumbers={true}
                    customStyle={{
                      margin: 0,
                      background: 'transparent',
                      lineHeight: '1.6'
                    }}
                    codeTagProps={{
                      style: {
                        fontSize: '0.875rem',
                        userSelect: 'text',
                        WebkitUserSelect: 'text',
                        cursor: 'text'
                      }
                    }}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              </div>
            ) : (
              <code className={cn("px-1.5 py-0.5 rounded bg-muted text-xs", className)} {...rest}>
                {children}
              </code>
            );
          },
          
          // 链接渲染
          a({ node, children, href, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
                {...props}
              >
                {children}
              </a>
            );
          },
          
          // 表格渲染
          table({ node, children, ...props }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full divide-y divide-border" {...props}>
                  {children}
                </table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
      
      {/* 流式输出指示器 */}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
      )}
    </div>
  );
};
