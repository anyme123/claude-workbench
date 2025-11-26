import { useState, useCallback } from 'react';
import { translationMiddleware, type TranslationResult } from '@/lib/translationMiddleware';
import { progressiveTranslationManager, TranslationPriority, type TranslationState } from '@/lib/progressiveTranslation';
import { extractMessageContent as extractContentUtil } from '@/lib/contentExtraction';
import { normalizeUsageData } from '@/lib/utils';
import type { ClaudeStreamMessage } from '@/types/claude';

/**
 * useMessageTranslation Hook
 *
 * 管理消息翻译系统，包括：
 * - 实时消息翻译处理
 * - 渐进式历史消息翻译
 * - 8种内容提取策略
 * - 翻译状态管理
 *
 * 从 ClaudeCodeSession.tsx 提取（Phase 3）
 */

interface UseMessageTranslationConfig {
  isMountedRef: React.MutableRefObject<boolean>;
  lastTranslationResult?: TranslationResult;
  onMessagesUpdate: (updater: (prev: ClaudeStreamMessage[]) => ClaudeStreamMessage[]) => void;
}

interface UseMessageTranslationReturn {
  translationEnabled: boolean;
  translationStates: TranslationState;
  processMessageWithTranslation: (
    message: ClaudeStreamMessage,
    payload: string,
    currentTranslationResult?: TranslationResult
  ) => Promise<void>;
  initializeProgressiveTranslation: (messages: ClaudeStreamMessage[]) => Promise<void>;
  applyTranslationToMessage: (message: ClaudeStreamMessage, result: TranslationResult) => ClaudeStreamMessage;
}

export function useMessageTranslation(config: UseMessageTranslationConfig): UseMessageTranslationReturn {
  const { isMountedRef, lastTranslationResult, onMessagesUpdate } = config;

  // Translation states
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translationStates, setTranslationStates] = useState<TranslationState>({});

  /**
   * 处理翻译完成回调
   */
  const handleTranslationComplete = useCallback((
    messageId: string,
    _originalMessage: ClaudeStreamMessage,
    result: TranslationResult,
    messageIndex: number
  ) => {
    console.log('[useMessageTranslation] ✅ Translation completed for message:', messageId);

    // Update translation state
    setTranslationStates(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        status: 'translated',
        translatedContent: result.translatedText
      }
    }));

    // Update the actual message in the messages array
    onMessagesUpdate(prevMessages => {
      return prevMessages.map((msg, index) => {
        if (index === messageIndex) {
          // Apply the translation
          return applyTranslationToMessage(msg, result);
        }
        return msg;
      });
    });
  }, [onMessagesUpdate]);

  /**
   * 应用翻译结果到消息对象
   */
  const applyTranslationToMessage = useCallback((
    message: ClaudeStreamMessage,
    result: TranslationResult
  ): ClaudeStreamMessage => {
    let processedMessage = { ...message };

    // Apply translation based on the message structure
    if (typeof message.content === 'string') {
      processedMessage.content = result.translatedText;
    } else if (Array.isArray(message.content)) {
      processedMessage.content = message.content.map((item: any) => {
        if (item && (item.type === 'text' || typeof item === 'string')) {
          return typeof item === 'string'
            ? { type: 'text', text: result.translatedText }
            : { ...item, text: result.translatedText };
        }
        return item;
      });
    } else if (message.message?.content) {
      if (typeof message.message.content === 'string') {
        processedMessage.message = {
          ...message.message,
          content: [{ type: 'text', text: result.translatedText }]
        };
      } else if (Array.isArray(message.message.content)) {
        processedMessage.message = {
          ...message.message,
          content: message.message.content.map((item: any) => {
            if (item && (item.type === 'text' || typeof item === 'string')) {
              return typeof item === 'string'
                ? { type: 'text', text: result.translatedText }
                : { ...item, text: result.translatedText };
            }
            return item;
          })
        };
      }
    } else if ((message as any).result) {
      (processedMessage as any).result = result.translatedText;
    } else if ((message as any).summary) {
      (processedMessage as any).summary = result.translatedText;
    }

    return processedMessage;
  }, []);

  /**
   * 处理单个消息的翻译（支持8种内容提取策略）
   */
  const processMessageWithTranslation = useCallback(async (
    message: ClaudeStreamMessage,
    payload: string,
    currentTranslationResult?: TranslationResult
  ) => {
    try {
      // Don't process if component unmounted
      if (!isMountedRef.current) return;

      // Add received timestamp for non-user messages (only if not already set)
      if (message.type !== "user") {
        const now = new Date().toISOString();
        // Only set receivedAt if it doesn't exist (preserve original timestamp for history)
        if (!message.receivedAt) {
          message.receivedAt = now;
        }
        // NEVER override timestamp - it should always be the original event time
        // Only set it if it's completely missing
        if (!message.timestamp) {
          message.timestamp = now;
        }
      }

      // 🌐 Translation: Process Claude response
      let processedMessage = { ...message };

      try {
        const isEnabled = await translationMiddleware.isEnabled();

        // 使用传递的翻译结果或状态中的结果
        const effectiveTranslationResult = currentTranslationResult || lastTranslationResult;

        console.log('[useMessageTranslation] Translation debug:', {
          isEnabled,
          hasCurrentResult: !!currentTranslationResult,
          hasStateResult: !!lastTranslationResult,
          hasEffectiveResult: !!effectiveTranslationResult,
          messageType: message.type,
          messageContent: message.content ? 'has content' : 'no content'
        });

        // 🔧 EXPANDED MESSAGE TYPE SUPPORT: Cover all possible Claude Code response types
        const isClaudeResponse = message.type === "assistant" ||
                               message.type === "result" ||
                               (message.type === "system" && message.subtype !== "init") ||
                               // Handle any message with actual content regardless of type
                               !!(message.content || message.message?.content || (message as any).text || (message as any).result || (message as any).summary || (message as any).error);

        if (isEnabled && isClaudeResponse) {
          console.log('[useMessageTranslation] Found Claude response message, checking translation conditions...');

          // 🌟 COMPREHENSIVE CONTENT EXTRACTION STRATEGY
          // This ensures we capture ALL possible text content from Claude Code SDK responses
          let textContent = '';
          let contentSources: string[] = [];

          // Method 1: Direct content string
          if (typeof message.content === 'string' && message.content.trim()) {
            textContent = message.content;
            contentSources.push('direct_content');
          }
          // Method 2: Array content (Claude API format)
          else if (Array.isArray(message.content)) {
            const arrayContent = message.content
              .filter((item: any) => item && (item.type === 'text' || typeof item === 'string'))
              .map((item: any) => {
                if (typeof item === 'string') return item;
                if (item.type === 'text') return item.text || '';
                return item.content || item.text || '';
              })
              .join('\n');
            if (arrayContent.trim()) {
              textContent = arrayContent;
              contentSources.push('array_content');
            }
          }
          // Method 3: Object with text property
          else if (message.content?.text && typeof message.content.text === 'string') {
            textContent = message.content.text;
            contentSources.push('content_text');
          }
          // Method 4: Nested in message.content (Claude Code SDK primary format)
          else if (message.message?.content) {
            const messageContent: any = message.message.content;
            if (typeof messageContent === 'string' && messageContent.trim()) {
              textContent = messageContent;
              contentSources.push('message_content_string');
            } else if (Array.isArray(messageContent)) {
              const nestedContent = messageContent
                .filter((item: any) => item && (item.type === 'text' || typeof item === 'string'))
                .map((item: any) => {
                  if (typeof item === 'string') return item;
                  if (item.type === 'text') return item.text || '';
                  return item.content || item.text || '';
                })
                .join('\n');
              if (nestedContent.trim()) {
                textContent = nestedContent;
                contentSources.push('message_content_array');
              }
            }
          }

          // Method 5: Direct text property
          if (!textContent && (message as any).text && typeof (message as any).text === 'string') {
            textContent = (message as any).text;
            contentSources.push('direct_text');
          }

          // Method 6: Result field (for result-type messages)
          if (!textContent && (message as any).result && typeof (message as any).result === 'string') {
            textContent = (message as any).result;
            contentSources.push('result_field');
          }

          // Method 7: Error field (for error messages)
          if (!textContent && (message as any).error && typeof (message as any).error === 'string') {
            textContent = (message as any).error;
            contentSources.push('error_field');
          }

          // Method 8: Summary field (for summary messages)
          if (!textContent && (message as any).summary && typeof (message as any).summary === 'string') {
            textContent = (message as any).summary;
            contentSources.push('summary_field');
          }

          console.log('[useMessageTranslation] Content extraction results:', {
            textContentLength: textContent.length,
            contentSources,
            messageType: message.type,
            hasMessageContent: !!message.message?.content,
            textPreview: textContent.substring(0, 100)
          });

          if (textContent.trim()) {
            console.log('[useMessageTranslation] 🔄 Processing content for translation...', {
              contentLength: textContent.length,
              messageType: message.type,
              preview: textContent.substring(0, 100) + (textContent.length > 100 ? '...' : '')
            });

            // Attempt translation - the middleware will handle language detection and decide whether to translate
            const responseTranslation = await translationMiddleware.translateClaudeResponse(textContent);

            if (responseTranslation.wasTranslated) {
                console.log('[useMessageTranslation] ✅ Claude response translated:', {
                  original: responseTranslation.originalText.substring(0, 50) + '...',
                  translated: responseTranslation.translatedText.substring(0, 50) + '...',
                  detectedLanguage: responseTranslation.detectedLanguage
                });

                // 🔧 COMPREHENSIVE MESSAGE UPDATE STRATEGY
                // Update the message content based on where we found the original content
                console.log('[useMessageTranslation] Updating message content with translation using sources:', contentSources);

                // Update based on the content source that was found
                const primarySource = contentSources[0];

                switch (primarySource) {
                  case 'direct_content':
                    processedMessage.content = responseTranslation.translatedText;
                    console.log('[useMessageTranslation] ✅ Updated direct content');
                    break;

                  case 'array_content':
                    if (Array.isArray(message.content)) {
                      processedMessage.content = message.content.map((item: any) => {
                        if (item && (item.type === 'text' || typeof item === 'string')) {
                          return typeof item === 'string'
                            ? { type: 'text', text: responseTranslation.translatedText }
                            : { ...item, text: responseTranslation.translatedText };
                        }
                        return item;
                      });
                      console.log('[useMessageTranslation] ✅ Updated array content');
                    }
                    break;

                  case 'content_text':
                    processedMessage.content = {
                      ...message.content,
                      text: responseTranslation.translatedText
                    };
                    console.log('[useMessageTranslation] ✅ Updated content.text');
                    break;

                  case 'message_content_string':
                    if (message.message) {
                      processedMessage.message = {
                        ...message.message,
                        content: [{ type: 'text', text: responseTranslation.translatedText }]
                      };
                      console.log('[useMessageTranslation] ✅ Updated message.content string');
                    }
                    break;

                  case 'message_content_array':
                    if (message.message?.content && Array.isArray(message.message.content)) {
                      processedMessage.message = {
                        ...message.message,
                        content: message.message.content.map((item: any) => {
                          if (item && (item.type === 'text' || typeof item === 'string')) {
                            return typeof item === 'string'
                              ? { type: 'text', text: responseTranslation.translatedText }
                              : { ...item, text: responseTranslation.translatedText };
                          }
                          return item;
                        })
                      };
                      console.log('[useMessageTranslation] ✅ Updated message.content array');
                    }
                    break;

                  case 'direct_text':
                    (processedMessage as any).text = responseTranslation.translatedText;
                    console.log('[useMessageTranslation] ✅ Updated direct text');
                    break;

                  case 'result_field':
                    (processedMessage as any).result = responseTranslation.translatedText;
                    console.log('[useMessageTranslation] ✅ Updated result field');
                    break;

                  case 'error_field':
                    (processedMessage as any).error = responseTranslation.translatedText;
                    console.log('[useMessageTranslation] ✅ Updated error field');
                    break;

                  case 'summary_field':
                    (processedMessage as any).summary = responseTranslation.translatedText;
                    console.log('[useMessageTranslation] ✅ Updated summary field');
                    break;

                  default:
                    // Fallback: Create new content structure
                    processedMessage.content = [{
                      type: 'text',
                      text: responseTranslation.translatedText
                    }];
                    console.log('[useMessageTranslation] ⚠️ Used fallback content structure');
                }

                // Add translation metadata
                processedMessage.translationMeta = {
                  wasTranslated: responseTranslation.wasTranslated,
                  detectedLanguage: responseTranslation.detectedLanguage,
                  originalText: responseTranslation.originalText
                };

                console.log('[useMessageTranslation] Final processed message structure:', {
                  type: processedMessage.type,
                  hasContent: !!processedMessage.content,
                  hasMessage: !!processedMessage.message,
                  messageContentLength: processedMessage.message?.content?.length || 'none'
                });
            }
          }
        }
      } catch (translationError) {
        console.error('[useMessageTranslation] Response translation failed:', translationError);
        // Continue with original message if translation fails
      }

      // 🔧 SAFE MESSAGE PROCESSING: Normalize usage data to handle cache token field mapping
      try {
        // Use the standardized usage normalization function to handle field name mapping
        if (processedMessage.message?.usage) {
          processedMessage.message.usage = normalizeUsageData(processedMessage.message.usage);
          console.log('[useMessageTranslation] ✅ Normalized message.usage data:', processedMessage.message.usage);
        }
        if (processedMessage.usage) {
          processedMessage.usage = normalizeUsageData(processedMessage.usage);
          console.log('[useMessageTranslation] ✅ Normalized top-level usage data:', processedMessage.usage);
        }
        onMessagesUpdate((prev) => [...prev, processedMessage]);
      } catch (usageError) {
        console.warn('[useMessageTranslation] Error normalizing usage data, adding message without usage:', usageError);
        // Remove problematic usage data and add message anyway
        const safeMessage = { ...processedMessage };
        delete safeMessage.usage;
        if (safeMessage.message) {
          delete safeMessage.message.usage;
        }
        onMessagesUpdate((prev) => [...prev, safeMessage]);
      }
    } catch (err) {
      console.error('[useMessageTranslation] Failed to parse message:', err, payload);
    }
  }, [isMountedRef, lastTranslationResult, onMessagesUpdate]);

  /**
   * 初始化渐进式翻译（后台翻译历史消息）
   */
  const initializeProgressiveTranslation = useCallback(async (messages: ClaudeStreamMessage[]): Promise<void> => {
    try {
      // Check if translation is enabled
      const isEnabled = await progressiveTranslationManager.isTranslationEnabled();
      setTranslationEnabled(isEnabled);

      if (!isEnabled) {
        console.log('[useMessageTranslation] Progressive translation disabled');
        return;
      }

      console.log('[useMessageTranslation] 🔄 Initializing progressive translation for', messages.length, 'messages');

      // Initialize translation states
      const initialStates: TranslationState = {};

      // Get the most recent messages (last 10) for priority translation
      const recentMessages = messages.slice(-10);

      messages.forEach((message, index) => {
        const messageId = `${message.timestamp || Date.now()}_${index}`;

        // Extract text content for translation
        let textContent = extractContentUtil(message).text;

        if (textContent.trim()) {
          initialStates[messageId] = {
            status: 'original',
            originalContent: textContent,
            translatedContent: undefined
          };

          // Determine priority
          const isRecent = recentMessages.includes(message);
          const priority = isRecent ? TranslationPriority.HIGH : TranslationPriority.NORMAL;

          // Add to translation queue
          progressiveTranslationManager.addTask(
            messageId,
            textContent,
            priority,
            (result) => {
              if (result && result.wasTranslated) {
                handleTranslationComplete(messageId, message, result, index);
              }
            }
          );
        }
      });

      setTranslationStates(initialStates);
      console.log('[useMessageTranslation] ✅ Progressive translation initialized:', Object.keys(initialStates).length, 'translatable messages');

    } catch (error) {
      console.error('[useMessageTranslation] Failed to initialize progressive translation:', error);
    }
  }, [handleTranslationComplete]);

  return {
    translationEnabled,
    translationStates,
    processMessageWithTranslation,
    initializeProgressiveTranslation,
    applyTranslationToMessage
  };
}
