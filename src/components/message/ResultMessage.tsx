import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { tokenExtractor } from "@/lib/tokenExtractor";
import type { ClaudeStreamMessage } from "@/types/claude";

interface ResultMessageProps {
  message: ClaudeStreamMessage;
  className?: string;
}

const formatTimestamp = (timestamp: string | undefined): string => {
  if (!timestamp) {
    return "";
  }

  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
};

const getResultContent = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const COLLAPSE_HEIGHT = 300; // px

export const ResultMessage: React.FC<ResultMessageProps> = ({ message, className }) => {
  const isError = Boolean((message as any).is_error) || Boolean(message.subtype?.toLowerCase().includes("error"));
  if (!isError) {
    return null;
  }

  const { theme } = useTheme();
  const syntaxTheme = useMemo(() => getClaudeSyntaxTheme(theme === "dark"), [theme]);

  const timestamp = formatTimestamp((message as any).receivedAt ?? (message as any).timestamp);
  const resultContent = getResultContent((message as any).result);
  const errorMessage = getResultContent((message as any).error);
  const contentRef = useRef<HTMLDivElement>(null);
  const [shouldCollapse, setShouldCollapse] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // 读取实际高度，决定是否需要折叠
    const height = el.scrollHeight;
    const needCollapse = height > COLLAPSE_HEIGHT;
    setShouldCollapse(needCollapse);
    setCollapsed(needCollapse); // 初始时仅当超出阈值才折叠
  }, [resultContent, errorMessage]);

  const usageSummary = React.useMemo(() => {
    if (!message.usage) {
      return null;
    }

    const extracted = tokenExtractor.extract({
      type: "result",
      usage: message.usage,
    });

    const totalTokens =
      extracted.input_tokens +
      extracted.output_tokens +
      extracted.cache_creation_tokens +
      extracted.cache_read_tokens;

    return `Total tokens: ${totalTokens} (${extracted.input_tokens} in, ${extracted.output_tokens} out` +
      (extracted.cache_creation_tokens > 0 ? `, ${extracted.cache_creation_tokens} creation` : "") +
      (extracted.cache_read_tokens > 0 ? `, ${extracted.cache_read_tokens} read` : "") +
      `)`;
  }, [message.usage]);

  const cost = (message as any).cost_usd ?? (message as any).total_cost_usd;
  const durationMs = (message as any).duration_ms;
  const numTurns = (message as any).num_turns;

  return (
    <div className={cn("my-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3", className)}>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-destructive">执行失败</h4>
            {timestamp && <span className="text-xs font-mono text-destructive/80">{timestamp}</span>}
          </div>

          {(resultContent || errorMessage) && (
            <div className="relative">
              <div
                ref={contentRef}
                className={cn(
                  "prose prose-sm dark:prose-invert max-w-none transition-[max-height]",
                  shouldCollapse && collapsed && "overflow-hidden"
                )}
                style={
                  shouldCollapse && collapsed
                    ? { maxHeight: `${COLLAPSE_HEIGHT}px` }
                    : undefined
                }
              >
                {resultContent && (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code(props: any) {
                        const { inline, className: codeClassName, children, ...rest } = props;
                        const match = /language-(\w+)/.exec(codeClassName || "");
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={syntaxTheme as any}
                            language={match[1]}
                            PreTag="div"
                          >
                            {String(children).replace(/\n$/, "")}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={codeClassName} {...rest}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {resultContent}
                  </ReactMarkdown>
                )}

                {errorMessage && (
                  <div className="text-sm text-destructive mt-2 whitespace-pre-wrap break-words">
                    {errorMessage}
                  </div>
                )}
              </div>

              {shouldCollapse && collapsed && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-destructive/10 via-destructive/5 to-transparent" />
              )}

              {shouldCollapse && (
                <div className="mt-2">
                  <button
                    onClick={() => setCollapsed((v) => !v)}
                    className="text-xs text-destructive hover:text-destructive/80 underline underline-offset-2"
                  >
                    {collapsed ? "展开全部" : "收起内容"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1 text-xs text-muted-foreground">
            {typeof cost === "number" && <div>Cost: ${cost.toFixed(4)} USD</div>}
            {typeof durationMs === "number" && <div>Duration: {(durationMs / 1000).toFixed(2)}s</div>}
            {typeof numTurns === "number" && <div>Turns: {numTurns}</div>}
            {usageSummary && <div>{usageSummary}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

ResultMessage.displayName = "ResultMessage";

