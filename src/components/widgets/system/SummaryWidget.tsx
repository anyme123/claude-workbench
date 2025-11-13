/**
 * ✅ Summary Widget - AI 摘要展示
 *
 * 迁移自 ToolWidgets.tsx (原 1978-2054 行)
 * 用于展示 AI 生成的会话摘要和 Token 使用情况
 */

import React from "react";
import { Info } from "lucide-react";
import { useToolTranslation } from "../common/useToolTranslation";

export interface SummaryWidgetProps {
  /** 摘要内容 */
  summary: string;
  /** Leaf UUID */
  leafUuid?: string;
  /** Token 使用统计 */
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  };
}

/**
 * AI 摘要 Widget
 *
 * 展示会话摘要、Token 使用情况和 Leaf ID
 */
export const SummaryWidget: React.FC<SummaryWidgetProps> = ({
  summary,
  leafUuid,
  usage,
}) => {
  const { translateContent } = useToolTranslation();
  const [translatedSummary, setTranslatedSummary] = React.useState<string>('');

  // 翻译摘要内容
  React.useEffect(() => {
    const translateSummary = async () => {
      if (summary?.trim()) {
        const cacheKey = `summary-${summary.substring(0, 100)}`;
        const translated = await translateContent(summary, cacheKey);
        setTranslatedSummary(translated);
      }
    };

    translateSummary();
  }, [summary, translateContent]);

  // 使用翻译后的内容，如果没有则使用原始内容
  const displaySummary = translatedSummary || summary;

  // 格式化 Token 使用情况
  const formatTokenUsage = (usage: any) => {
    if (!usage) return null;

    const { input_tokens = 0, output_tokens = 0, cache_creation_tokens = 0, cache_read_tokens = 0 } = usage;
    const parts = [
      { label: "in", value: input_tokens },
      { label: "out", value: output_tokens },
      { label: "creation", value: cache_creation_tokens },
      { label: "read", value: cache_read_tokens },
    ];

    const breakdown = parts
      .map(({ label, value }) => `${value} ${label}`)
      .join(", ");

    return `Tokens: ${breakdown}`;
  };

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5">
          <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Info className="h-4 w-4 text-blue-500" />
          </div>
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400">AI 总结</div>
          <p className="text-sm text-foreground">{displaySummary}</p>

          {/* Token 使用展示 */}
          {usage && (
            <div className="text-xs text-foreground/70 mt-2">
              {formatTokenUsage(usage)}
            </div>
          )}

          {/* Leaf UUID */}
          {leafUuid && (
            <div className="text-xs text-muted-foreground mt-2">
              ID: <code className="font-mono">{leafUuid.slice(0, 8)}...</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
