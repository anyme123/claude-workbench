/**
 * ✅ Thinking Widget - AI 思考过程展示
 *
 * 迁移自 ToolWidgets.tsx (原 2766-2860 行)
 * 用于展示 AI 的思考过程和 Token 使用情况
 */

import React from "react";
import { Brain, Bot, Sparkles } from "lucide-react";
import { useToolTranslation } from "../common/useToolTranslation";

export interface ThinkingWidgetProps {
  /** 思考内容 */
  thinking: string;
  /** 签名（未使用） */
  signature?: string;
  /** Token 使用统计 */
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  };
}

/**
 * AI 思考过程 Widget
 *
 * 展示 AI 的思考内容和 Token 使用，支持翻译
 */
export const ThinkingWidget: React.FC<ThinkingWidgetProps> = ({
  thinking,
  usage,
}) => {
  const { translateContent } = useToolTranslation();
  const [translatedThinking, setTranslatedThinking] = React.useState<string>('');

  // 去除空白
  const trimmedThinking = thinking.trim();

  // 判断是否有内容
  const hasContent = trimmedThinking.length > 0;

  // 翻译思考内容
  React.useEffect(() => {
    const translateThinking = async () => {
      if (hasContent) {
        const cacheKey = `thinking-${trimmedThinking.substring(0, 100)}`;
        const translated = await translateContent(trimmedThinking, cacheKey);
        setTranslatedThinking(translated);
      }
    };

    translateThinking();
  }, [trimmedThinking, hasContent, translateContent]);

  // 格式化 Token 使用情况
  const formatThinkingTokens = (usage: any) => {
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

  // 思考中状态
  if (!hasContent) {
    return (
      <div className="rounded-lg border border-gray-500/20 bg-gray-500/5 overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2">
          <div className="relative">
            <Bot className="h-4 w-4 text-gray-500" />
            <Sparkles className="h-2.5 w-2.5 text-gray-400 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <span className="text-sm font-medium italic text-gray-600 dark:text-gray-400">
            思考中...
          </span>
        </div>
      </div>
    );
  }

  // 有内容时展示思考结果
  const displayContent = translatedThinking || trimmedThinking;

  return (
    <div className="rounded-lg border border-green-500/20 bg-green-500/5 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">思考过程</span>
          </div>

          {/* Token 使用展示 */}
          {usage && (
            <div className="text-xs text-green-600/80 dark:text-green-400/80">
              {formatThinkingTokens(usage)}
            </div>
          )}
        </div>

        <pre className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-gray-500/5 p-3 rounded-lg italic leading-relaxed">
          {displayContent}
        </pre>
      </div>
    </div>
  );
};
