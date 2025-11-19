/**
 * ✅ Tool Translation Hook - 统一的工具内容翻译逻辑
 *
 * 从 ToolWidgets.tsx 中提取，供所有 Widget 组件复用
 * 提供智能缓存和语言检测
 *
 * @example
 * const { translateContent } = useToolTranslation();
 * const translated = await translateContent('Hello world', 'greeting-key');
 */

import React from 'react';
import { translationMiddleware } from '@/lib/translationMiddleware';

/**
 * 工具内容翻译 Hook
 *
 * Features:
 * - 自动检测内容语言
 * - 内存缓存避免重复翻译
 * - 优雅的错误处理
 */
export const useToolTranslation = () => {
  const [translatedContent, setTranslatedContent] = React.useState<Map<string, string>>(new Map());

  /**
   * 翻译内容
   * @param content 要翻译的内容
   * @param cacheKey 缓存键（用于避免重复翻译）
   * @returns 翻译后的内容，如果翻译失败或未启用则返回原内容
   */
  const translateContent = React.useCallback(async (content: string, cacheKey: string) => {
    // 检查缓存
    if (translatedContent.has(cacheKey)) {
      return translatedContent.get(cacheKey)!;
    }

    try {
      // 检查翻译是否启用
      const isEnabled = await translationMiddleware.isEnabled();
      if (!isEnabled) {
        return content;
      }

      // 检测语言，只翻译英文内容
      const detectedLanguage = await translationMiddleware.detectLanguage(content);
      if (detectedLanguage === 'en') {
        const result = await translationMiddleware.translateClaudeResponse(content, true);
        if (result.wasTranslated) {
          // 更新缓存
          setTranslatedContent(prev => new Map(prev).set(cacheKey, result.translatedText));
          return result.translatedText;
        }
      }

      return content;
    } catch (error) {
      console.error('[useToolTranslation] Translation failed:', error);
      return content;
    }
  }, [translatedContent]);

  /**
   * 清空翻译缓存
   */
  const clearCache = React.useCallback(() => {
    setTranslatedContent(new Map());
  }, []);

  return {
    translateContent,
    clearCache,
    cacheSize: translatedContent.size,
  };
};
