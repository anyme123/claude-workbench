import React from "react";
import { translationMiddleware } from "@/lib/translationMiddleware";

/**
 * Translate tool内容（仅在中英文切换开启且文本判定为英文时执行）
 */
export const useToolContentTranslation = () => {
  const [translatedContent, setTranslatedContent] = React.useState<Map<string, string>>(new Map());

  const translateContent = React.useCallback(async (content: string, cacheKey: string) => {
    if (translatedContent.has(cacheKey)) {
      return translatedContent.get(cacheKey)!;
    }

    try {
      const isEnabled = await translationMiddleware.isEnabled();
      if (!isEnabled) {
        return content;
      }

      const detectedLanguage = await translationMiddleware.detectLanguage(content);
      if (detectedLanguage === "en") {
        const result = await translationMiddleware.translateClaudeResponse(content, true);
        if (result.wasTranslated) {
          setTranslatedContent(prev => new Map(prev).set(cacheKey, result.translatedText));
          return result.translatedText;
        }
      }

      return content;
    } catch (error) {
      console.error("[ToolWidgets] Translation failed for content:", error);
      return content;
    }
  }, [translatedContent]);

  return { translateContent };
};

