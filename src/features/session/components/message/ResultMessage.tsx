import React from "react";
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

export const ResultMessage: React.FC<ResultMessageProps> = ({ message, className }) => {
  const isError = Boolean((message as any).is_error) || Boolean(message.subtype?.toLowerCase().includes("error"));
  if (!isError) {
    return null;
  }

  const { theme } = useTheme();
  const syntaxTheme = React.useMemo(() => getClaudeSyntaxTheme(theme === "dark"), [theme]);

  const timestamp = formatTimestamp((message as any).receivedAt ?? (message as any).timestamp);
  const resultContent = getResultContent((message as any).result);
  const errorMessage = getResultContent((message as any).error);

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

          {resultContent && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
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
            </div>
          )}

          {errorMessage && (
            <div className="text-sm text-destructive">{errorMessage}</div>
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


