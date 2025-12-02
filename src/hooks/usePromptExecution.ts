/**
 * usePromptExecution Hook
 *
 * Manages Claude Code prompt execution including:
 * - Input validation and queueing
 * - Event listener setup (generic and session-specific)
 * - Translation processing
 * - Thinking instruction handling
 * - API execution (new session, resume, continue)
 * - Error handling and state management
 *
 * Extracted from ClaudeCodeSession component (296 lines)
 */

import { useCallback, useRef, useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { api, type Session } from '@/lib/api';
import { translationMiddleware, isSlashCommand, type TranslationResult } from '@/lib/translationMiddleware';
import type { ClaudeStreamMessage } from '@/types/claude';
import type { ModelType } from '@/components/FloatingPromptInput/types';
// 🔧 FIX: 移除全局单例导入,改为在每个会话中动态创建实例
// import { codexConverter } from '@/lib/codexConverter'; // REMOVED - 避免全局单例污染
import type { CodexExecutionMode } from '@/types/codex';

// ============================================================================
// Global Type Declarations
// ============================================================================

// Extend window object for Codex/Gemini pending prompt tracking
declare global {
  interface Window {
    __codexPendingPrompt?: {
      sessionId: string;
      projectPath: string;
      promptIndex: number;
    };
    __geminiPendingPrompt?: {
      sessionId: string;
      projectPath: string;
      promptIndex: number;
    };
    __geminiPendingSession?: {
      sessionId: string;
      projectPath: string;
    };
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

interface QueuedPrompt {
  id: string;
  prompt: string;
  model: ModelType;
}

interface UsePromptExecutionConfig {
  // State
  projectPath: string;
  isLoading: boolean;
  claudeSessionId: string | null;
  effectiveSession: Session | null;
  isPlanMode: boolean;
  lastTranslationResult: TranslationResult | null;
  isActive: boolean;
  isFirstPrompt: boolean;
  extractedSessionInfo: { sessionId: string; projectId: string } | null;

  // 🆕 Execution Engine Integration (Claude/Codex/Gemini)
  executionEngine?: 'claude' | 'codex' | 'gemini'; // 执行引擎选择 (默认: 'claude')
  codexMode?: CodexExecutionMode;       // Codex 执行模式
  codexModel?: string;                  // Codex 模型 (e.g., 'gpt-5.1-codex-max')
  geminiModel?: string;                 // Gemini 模型 (e.g., 'gemini-2.5-pro')
  geminiApprovalMode?: 'auto_edit' | 'yolo' | 'default'; // Gemini 审批模式

  // Refs
  hasActiveSessionRef: React.MutableRefObject<boolean>;
  unlistenRefs: React.MutableRefObject<UnlistenFn[]>;
  isMountedRef: React.MutableRefObject<boolean>;
  isListeningRef: React.MutableRefObject<boolean>;
  queuedPromptsRef: React.MutableRefObject<QueuedPrompt[]>;

  // State Setters
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<ClaudeStreamMessage[]>>;
  setClaudeSessionId: (id: string | null) => void;
  setLastTranslationResult: (result: TranslationResult | null) => void;
  setQueuedPrompts: React.Dispatch<React.SetStateAction<QueuedPrompt[]>>;
  setRawJsonlOutput: React.Dispatch<React.SetStateAction<string[]>>;
  setExtractedSessionInfo: React.Dispatch<React.SetStateAction<{ sessionId: string; projectId: string; engine?: 'claude' | 'codex' | 'gemini' } | null>>;
  setIsFirstPrompt: (isFirst: boolean) => void;

  // External Hook Functions
  processMessageWithTranslation: (message: ClaudeStreamMessage, payload: string, currentTranslationResult?: TranslationResult) => Promise<void>;
}

interface UsePromptExecutionReturn {
  handleSendPrompt: (prompt: string, model: ModelType, maxThinkingTokens?: number) => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePromptExecution(config: UsePromptExecutionConfig): UsePromptExecutionReturn {
  const {
    projectPath,
    isLoading,
    claudeSessionId,
    effectiveSession,
    isPlanMode,
    isActive,
    isFirstPrompt,
    extractedSessionInfo,
    executionEngine = 'claude', // 🆕 默认使用 Claude Code
    codexMode = 'read-only',     // 🆕 Codex 默认只读模式
    codexModel,                  // 🆕 Codex 模型
    geminiModel,                 // 🆕 Gemini 模型
    geminiApprovalMode,          // 🆕 Gemini 审批模式
    hasActiveSessionRef,
    unlistenRefs,
    isMountedRef,
    isListeningRef,
    queuedPromptsRef,
    setIsLoading,
    setError,
    setMessages,
    setClaudeSessionId,
    setLastTranslationResult,
    setQueuedPrompts,
    setRawJsonlOutput,
    setExtractedSessionInfo,
    setIsFirstPrompt,
    processMessageWithTranslation
  } = config;

  // ============================================================================
  // 🔧 Fix: 使用 ref 存储 isPlanMode，确保异步回调获取最新值
  // 解决问题：批准计划后自动发送的提示词仍带 --plan 标志
  // ============================================================================
  const isPlanModeRef = useRef(isPlanMode);
  useEffect(() => {
    isPlanModeRef.current = isPlanMode;
  }, [isPlanMode]);

  // ============================================================================
  // Main Prompt Execution Function
  // ============================================================================

  const handleSendPrompt = useCallback(async (
    prompt: string,
    model: ModelType,
    maxThinkingTokens?: number
  ) => {
    console.log('[usePromptExecution] handleSendPrompt called with:', {
      prompt,
      model,
      projectPath,
      claudeSessionId,
      effectiveSession,
      maxThinkingTokens
    });

    // ========================================================================
    // 1️⃣ Validation & Queueing
    // ========================================================================

    if (!projectPath) {
      setError("请先选择项目目录");
      return;
    }

    // Check if this is a slash command and handle it appropriately
    const isSlashCommandInput = isSlashCommand(prompt);
    const trimmedPrompt = prompt.trim();

    if (isSlashCommandInput) {
      const commandPreview = trimmedPrompt.split('\n')[0];
      console.log('[usePromptExecution] [OK] Detected slash command, bypassing translation:', {
        command: commandPreview,
        model: model,
        projectPath: projectPath
      });
    }

    console.log('[usePromptExecution] Using model:', model);

    // If already loading, queue the prompt
    if (isLoading) {
      const newPrompt: QueuedPrompt = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        prompt,
        model
      };
      setQueuedPrompts(prev => [...prev, newPrompt]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      hasActiveSessionRef.current = true;

      // Record API start time
      const apiStartTime = Date.now();

      // Record prompt sent (save Git state before sending)
      // Only record real user input, exclude auto Warmup and Skills messages
      let recordedPromptIndex = -1;
      const isUserInitiated = !prompt.includes('Warmup') 
        && !prompt.includes('<command-name>')
        && !prompt.includes('Launching skill:');
      const codexPendingInfo = executionEngine === 'codex' ? {
        sessionId: effectiveSession?.id || null,
        projectPath,
        promptText: prompt,
        promptIndex: undefined as number | undefined,
      } : undefined;
      const geminiPendingInfo = executionEngine === 'gemini' ? {
        sessionId: effectiveSession?.id || null,
        projectPath,
        promptText: prompt,
        promptIndex: undefined as number | undefined,
      } : undefined;
      
      // 对于已有会话，立即记录；对于新会话，在收到 session_id 后记录
      if (effectiveSession && isUserInitiated) {
        try {
          if (executionEngine === 'codex') {
            // ✅ Codex 使用专用的记录 API（写入 ~/.codex/git-records/）
            recordedPromptIndex = await api.recordCodexPromptSent(
              effectiveSession.id,
              projectPath,
              prompt
            );
            console.log('[Codex Revert] [OK] Recorded Codex prompt #', recordedPromptIndex, '(existing session)');
            if (codexPendingInfo) {
              codexPendingInfo.promptIndex = recordedPromptIndex;
              codexPendingInfo.sessionId = effectiveSession.id;
            }
          } else if (executionEngine === 'gemini') {
            // 🔧 FIX: Gemini must wait for real CLI session ID from init event
            // Don't record here even for existing sessions - Gemini CLI may generate new session ID
            console.log('[Gemini Revert] [WAIT] Will record prompt after Gemini CLI session ID is received');
            // geminiPendingInfo will be used in the init event handler
          } else {
            // Claude Code 使用原有的记录 API（写入 .claude-sessions/）
            recordedPromptIndex = await api.recordPromptSent(
              effectiveSession.id,
              effectiveSession.project_id,
              projectPath,
              prompt
            );
            console.log('[Prompt Revert] [OK] Recorded Claude prompt #', recordedPromptIndex, '(existing session)');
          }
        } catch (err) {
          console.error('[Prompt Revert] [ERROR] Failed to record prompt:', err);
        }
      } else if (isUserInitiated) {
        console.log('[Prompt Revert] [WAIT] Will record prompt after session_id is received (new session)');
      }

      // Translation state
      let processedPrompt = prompt;
      let userInputTranslation: TranslationResult | null = null;

      // For resuming sessions, ensure we have the session ID
      if (effectiveSession && !claudeSessionId) {
        setClaudeSessionId(effectiveSession.id);
      }

      // ========================================================================
      // 2️⃣ Event Listener Setup (Only for Active Tabs)
      // ========================================================================

      if (!isListeningRef.current && isActive) {
        // Clean up previous listeners
        unlistenRefs.current.forEach(unlisten => unlisten && typeof unlisten === 'function' && unlisten());
        unlistenRefs.current = [];

        // Mark as setting up listeners
        isListeningRef.current = true;

        // ====================================================================
        // 🆕 Codex Event Listeners (with session isolation support)
        // ====================================================================
        if (executionEngine === 'codex') {
          // 🔧 CRITICAL FIX: 创建会话级别的转换器实例,避免全局单例污染
          // 问题: 全局 codexConverter 单例会在多个标签页间共享状态(threadId, itemMap, toolResults)
          // 解决: 每个会话创建独立的转换器实例
          const { CodexEventConverter } = await import('@/lib/codexConverter');
          const sessionCodexConverter = new CodexEventConverter();

          // 🔧 FIX: Track current Codex session ID for channel isolation
          let currentCodexSessionId: string | null = null;
          // 🔧 FIX: Track processed message IDs to prevent duplicates
          const processedCodexMessages = new Set<string>();
          // 🔧 FIX: Track pending prompt recording Promise to avoid race condition
          let pendingPromptRecordingPromise: Promise<void> | null = null;

          // Helper function to generate message ID for deduplication
          const getCodexMessageId = (payload: string): string => {
            // Use payload hash as ID since Codex doesn't provide unique message IDs
            let hash = 0;
            for (let i = 0; i < payload.length; i++) {
              const char = payload.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash;
            }
            return `codex-${hash}`;
          };

          // Helper function to process Codex output
          const processCodexOutput = (payload: string) => {
            if (!isMountedRef.current) return;

            // 🔧 FIX: Deduplicate messages
            const messageId = getCodexMessageId(payload);
            if (processedCodexMessages.has(messageId)) {
              console.log('[usePromptExecution] Skipping duplicate Codex message:', messageId);
              return;
            }
            processedCodexMessages.add(messageId);

            // 🔧 FIX: 使用会话级别的转换器实例
            const message = sessionCodexConverter.convertEvent(payload);
            if (message) {
              setMessages(prev => [...prev, message]);
              setRawJsonlOutput((prev) => [...prev, payload]);

              // Extract and save Codex thread_id from thread.started for session resuming
              // NOTE: claudeSessionId is already set to the backend channel ID in codex-session-init handler
              // Here we only save the thread_id for session resuming purposes (different from channel ID)
              if (message.type === 'system' && message.subtype === 'init' && (message as any).session_id) {
                const codexThreadId = (message as any).session_id;  // This is the Codex thread_id
                // 🔧 FIX: Don't override claudeSessionId here - it's already set to backend channel ID
                // setClaudeSessionId(codexThreadId);  // REMOVED - would break event channel subscription

                // Save session info for resuming (uses thread_id, not channel ID)
                const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                setExtractedSessionInfo({ sessionId: codexThreadId, projectId, engine: 'codex' });

                // Mark as not first prompt anymore
                setIsFirstPrompt(false);

                // If this is a new Codex session and prompt not yet recorded, record now
                if (isUserInitiated && codexPendingInfo && codexPendingInfo.promptIndex === undefined) {
                  // 🔧 FIX: Store Promise to allow processCodexComplete to wait for it
                  pendingPromptRecordingPromise = api.recordCodexPromptSent(codexThreadId, projectPath, codexPendingInfo.promptText)
                    .then((idx) => {
                      codexPendingInfo.promptIndex = idx;
                      codexPendingInfo.sessionId = codexThreadId;
                      window.__codexPendingPrompt = {
                        sessionId: codexThreadId,
                        projectPath,
                        promptIndex: idx
                      };
                      console.log('[usePromptExecution] Recorded Codex prompt after init with index', idx);
                    })
                    .catch(err => {
                      console.warn('[usePromptExecution] Failed to record Codex prompt after init:', err);
                    });
                } else if (codexPendingInfo && codexPendingInfo.promptIndex !== undefined) {
                  // Update pending sessionId for completion handler
                  window.__codexPendingPrompt = {
                    sessionId: codexThreadId,
                    projectPath,
                    promptIndex: codexPendingInfo.promptIndex
                  };
                }
              }
            }
          };

          // Helper function to process Codex completion
          const processCodexComplete = async () => {
            setIsLoading(false);
            hasActiveSessionRef.current = false;
            isListeningRef.current = false;

            // 🆕 Clean up listeners to prevent memory leak
            unlistenRefs.current.forEach(u => u && typeof u === 'function' && u());
            unlistenRefs.current = [];

            // 🔧 FIX: Wait for pending prompt recording to complete (race condition fix)
            if (pendingPromptRecordingPromise) {
              console.log('[usePromptExecution] Waiting for pending prompt recording to complete...');
              await pendingPromptRecordingPromise;
              pendingPromptRecordingPromise = null;
            }

            // 🆕 Record prompt completion for rewind support
            if (window.__codexPendingPrompt) {
              const pendingPrompt = window.__codexPendingPrompt;
              try {
                await api.recordCodexPromptCompleted(
                  pendingPrompt.sessionId,
                  pendingPrompt.projectPath,
                  pendingPrompt.promptIndex
                );
                console.log('[usePromptExecution] Recorded Codex prompt completion #', pendingPrompt.promptIndex);
              } catch (err) {
                console.warn('[usePromptExecution] Failed to record Codex prompt completion:', err);
              }
              // Clear the pending prompt
              delete window.__codexPendingPrompt;
            }

            // Process queued prompts
            if (queuedPromptsRef.current.length > 0) {
              const [nextPrompt, ...remainingPrompts] = queuedPromptsRef.current;
              setQueuedPrompts(remainingPrompts);

              setTimeout(() => {
                handleSendPrompt(nextPrompt.prompt, nextPrompt.model);
              }, 100);
            }
          };

          // Helper function to attach session-specific listeners
          const attachCodexSessionListeners = async (sessionId: string) => {
            console.log('[usePromptExecution] Attaching Codex session-specific listeners for:', sessionId);

            const specificOutputUnlisten = await listen<string>(`codex-output:${sessionId}`, (evt) => {
              processCodexOutput(evt.payload);
            });

            const specificCompleteUnlisten = await listen<boolean>(`codex-complete:${sessionId}`, async () => {
              console.log('[usePromptExecution] Received codex-complete (session-specific):', sessionId);
              await processCodexComplete();
            });

            // Replace existing listeners with session-specific ones
            unlistenRefs.current.forEach((u) => u && typeof u === 'function' && u());
            unlistenRefs.current = [specificOutputUnlisten, specificCompleteUnlisten];
          };

          // 🔧 FIX: Listen for session init event to get session ID for channel isolation
          const codexSessionInitUnlisten = await listen<{ type: string; session_id: string }>('codex-session-init', async (evt) => {
            // 🔧 FIX: Only process if this tab has an active session
            if (!hasActiveSessionRef.current) return;
            console.log('[usePromptExecution] Received codex-session-init:', evt.payload);
            if (evt.payload.session_id && !currentCodexSessionId) {
              currentCodexSessionId = evt.payload.session_id;
              // 🔧 FIX: Set claudeSessionId to the backend channel ID for reconnection and cancellation
              // This is different from the Codex thread_id which is used for resuming sessions
              setClaudeSessionId(currentCodexSessionId);
              // Switch to session-specific listeners
              await attachCodexSessionListeners(currentCodexSessionId);
            }
          });

          // 🔧 FIX: 移除全局监听器,避免跨会话串流
          // Listen for Codex JSONL output (global fallback) - REMOVED to prevent cross-session data leakage
          // 问题: 多个标签页都监听全局 'codex-output' 事件,导致消息被多个会话接收
          // 解决: 仅在会话ID未知的早期阶段处理全局事件,且必须验证会话归属
          const codexOutputUnlisten = await listen<string>('codex-output', (evt) => {
            // 🔧 CRITICAL FIX: 只在尚未收到会话ID时处理全局事件
            if (!hasActiveSessionRef.current) return;
            if (currentCodexSessionId) {
              // 已经有会话ID,不再处理全局事件(应该由会话特定监听器处理)
              console.log('[usePromptExecution] Ignoring global codex-output (session-specific listener active)');
              return;
            }
            // 只在会话ID未知的早期阶段处理
            processCodexOutput(evt.payload);
          });

          // Listen for Codex errors
          const codexErrorUnlisten = await listen<string>('codex-error', (evt) => {
            // 🔧 FIX: Only process if this tab has an active session
            if (!hasActiveSessionRef.current) return;
            setError(evt.payload);
          });

          // 🔧 FIX: 移除全局完成事件监听器,避免跨会话串流
          // Listen for Codex completion (global fallback) - FIXED to prevent cross-session interference
          const codexCompleteUnlisten = await listen<boolean>('codex-complete', async () => {
            // 🔧 CRITICAL FIX: 只在尚未收到会话ID时处理全局事件
            if (!hasActiveSessionRef.current) return;
            if (currentCodexSessionId) {
              // 已经有会话ID,不再处理全局完成事件(应该由会话特定监听器处理)
              console.log('[usePromptExecution] Ignoring global codex-complete (session-specific listener active)');
              return;
            }
            console.log('[usePromptExecution] Received codex-complete (global fallback)');
            await processCodexComplete();
          });

          unlistenRefs.current = [codexSessionInitUnlisten, codexOutputUnlisten, codexErrorUnlisten, codexCompleteUnlisten];
        } else if (executionEngine === 'gemini') {
          // ====================================================================
          // 🆕 Gemini Event Listeners
          // ====================================================================

          // 🔧 Track current Gemini session ID for channel isolation
          let currentGeminiSessionId: string | null = null;
          // 🔧 Track processed message IDs to prevent duplicates
          const processedGeminiMessages = new Set<string>();
          // 🔧 FIX: Track pending prompt recording Promise to avoid race condition
          let pendingGeminiPromptRecordingPromise: Promise<void> | null = null;

          // Helper function to generate message ID for deduplication
          const getGeminiMessageId = (payload: string): string => {
            let hash = 0;
            for (let i = 0; i < payload.length; i++) {
              const char = payload.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash;
            }
            return `gemini-${hash}`;
          };

          // Helper function to convert Gemini unified message to ClaudeStreamMessage
          const convertGeminiToClaudeMessage = (data: any): ClaudeStreamMessage | null => {
            try {
              // The backend already converts to unified format, we just need to ensure type compatibility
              // Note: geminiMetadata is already included in data from backend conversion

              if (data.type === 'system' && data.subtype === 'init') {
                return {
                  type: 'system',
                  subtype: 'init',
                  session_id: data.session_id,
                  model: data.model,
                  timestamp: data.timestamp,
                  engine: 'gemini' as const
                };
              }

              if (data.type === 'assistant' || data.type === 'user') {
                return {
                  type: data.type,
                  message: data.message,
                  timestamp: data.timestamp,
                  engine: 'gemini' as const
                };
              }

              if (data.type === 'result') {
                return {
                  type: 'result',
                  subtype: data.subtype || 'success',
                  usage: data.usage,
                  timestamp: data.timestamp,
                  engine: 'gemini' as const
                };
              }

              if (data.type === 'system' && data.subtype === 'error') {
                return {
                  type: 'system',
                  subtype: 'error',
                  error: data.error,
                  timestamp: data.timestamp,
                  engine: 'gemini' as const
                };
              }

              // Fallback for unknown types
              return {
                type: 'system',
                subtype: 'raw',
                message: { content: [{ type: 'text', text: JSON.stringify(data) }] },
                engine: 'gemini' as const
              };
            } catch (err) {
              console.error('[usePromptExecution] Failed to convert Gemini message:', err);
              return null;
            }
          };

          // Helper function to process Gemini output
          const processGeminiOutput = (payload: string) => {
            if (!isMountedRef.current) return;

            // 🔧 FIX: Deduplicate messages
            const messageId = getGeminiMessageId(payload);
            if (processedGeminiMessages.has(messageId)) {
              console.log('[usePromptExecution] Skipping duplicate Gemini message:', messageId);
              return;
            }
            processedGeminiMessages.add(messageId);

            try {
              const data = JSON.parse(payload);

              // 🔧 FIX: Skip user messages from Gemini - already added by frontend
              // Gemini CLI echoes back user messages, but we already display them
              if (data.type === 'user' && !data.message?.content?.some((c: any) => c.type === 'tool_result')) {
                console.log('[usePromptExecution] Skipping Gemini user message (already shown)');
                return;
              }

              // 🔧 FIX: Handle delta messages - merge with last message of same type
              const isDelta = data.geminiMetadata?.delta || data.delta;
              const msgType = data.type;

              if (isDelta && msgType === 'assistant') {
                // Delta message - merge with last assistant message
                setMessages(prev => {
                  const lastIdx = prev.length - 1;
                  const lastMsg = prev[lastIdx];

                  // Check if last message is assistant and can be merged
                  if (lastMsg && lastMsg.type === 'assistant') {
                    const lastContent = lastMsg.message?.content;
                    const newContent = data.message?.content;

                    if (Array.isArray(lastContent) && Array.isArray(newContent)) {
                      // Find text blocks to merge
                      const lastTextIdx = lastContent.findIndex((c: any) => c.type === 'text');
                      const newText = newContent.find((c: any) => c.type === 'text')?.text || '';

                      if (lastTextIdx >= 0 && newText) {
                        // Merge text content
                        const updatedContent = [...lastContent];
                        updatedContent[lastTextIdx] = {
                          ...updatedContent[lastTextIdx],
                          text: (updatedContent[lastTextIdx].text || '') + newText
                        };

                        const updatedMsg = {
                          ...lastMsg,
                          message: {
                            ...lastMsg.message,
                            content: updatedContent
                          }
                        };

                        return [...prev.slice(0, lastIdx), updatedMsg];
                      }
                    }
                  }

                  // Cannot merge, add as new message
                  const message = convertGeminiToClaudeMessage(data);
                  return message ? [...prev, message] : prev;
                });
                setRawJsonlOutput((prev) => [...prev, payload]);
                return;
              }

              // Non-delta message - add normally
              const message = convertGeminiToClaudeMessage(data);

              if (message) {
                setMessages(prev => [...prev, message]);
                setRawJsonlOutput((prev) => [...prev, payload]);

                // 🔧 NOTE: Session ID handling moved to gemini-cli-session-id event listener
                // The init message from gemini-output may contain backend's temporary ID (gemini-{uuid})
                // We now use the dedicated gemini-cli-session-id event which provides the REAL CLI session ID
              }
            } catch (err) {
              console.error('[usePromptExecution] Failed to process Gemini output:', err, payload);
            }
          };

          // Helper function to process Gemini completion
          const processGeminiComplete = async () => {
            setIsLoading(false);
            hasActiveSessionRef.current = false;
            isListeningRef.current = false;

            // Clean up listeners
            unlistenRefs.current.forEach(u => u && typeof u === 'function' && u());
            unlistenRefs.current = [];

            // 🔧 FIX: Wait for pending prompt recording to complete (race condition fix)
            if (pendingGeminiPromptRecordingPromise) {
              console.log('[usePromptExecution] Waiting for pending Gemini prompt recording to complete...');
              await pendingGeminiPromptRecordingPromise;
              pendingGeminiPromptRecordingPromise = null;
            }

            // 🆕 Record prompt completion for rewind support
            if (window.__geminiPendingPrompt) {
              const pendingPrompt = window.__geminiPendingPrompt;
              try {
                await api.recordGeminiPromptCompleted(
                  pendingPrompt.sessionId,
                  pendingPrompt.projectPath,
                  pendingPrompt.promptIndex
                );
                console.log('[usePromptExecution] Recorded Gemini prompt completion #', pendingPrompt.promptIndex);
              } catch (err) {
                console.warn('[usePromptExecution] Failed to record Gemini prompt completion:', err);
              }
              // Clear the pending prompt
              delete window.__geminiPendingPrompt;
            }

            // Clear pending session
            delete window.__geminiPendingSession;

            // Process queued prompts
            if (queuedPromptsRef.current.length > 0) {
              const [nextPrompt, ...remainingPrompts] = queuedPromptsRef.current;
              setQueuedPrompts(remainingPrompts);

              setTimeout(() => {
                handleSendPrompt(nextPrompt.prompt, nextPrompt.model);
              }, 100);
            }
          };

          // Helper function to attach session-specific listeners
          const attachGeminiSessionListeners = async (sessionId: string) => {
            console.log('[usePromptExecution] Attaching Gemini session-specific listeners for:', sessionId);

            const specificOutputUnlisten = await listen<string>(`gemini-output:${sessionId}`, (evt) => {
              processGeminiOutput(evt.payload);
            });

            const specificCompleteUnlisten = await listen<boolean>(`gemini-complete:${sessionId}`, async () => {
              console.log('[usePromptExecution] Received gemini-complete (session-specific):', sessionId);
              await processGeminiComplete();
            });

            // 🔧 FIX: Append session-specific listeners instead of replacing all
            // This preserves global listeners like geminiCliSessionIdUnlisten
            unlistenRefs.current.push(specificOutputUnlisten, specificCompleteUnlisten);
          };

          // Listen for session init event (backend emits this with backend channel ID)
          const geminiSessionInitUnlisten = await listen<any>('gemini-session-init', async (evt) => {
            if (!hasActiveSessionRef.current) return;
            console.log('[usePromptExecution] Received gemini-session-init:', evt.payload);

            // 🔧 FIX: evt.payload is already an object, no need to JSON.parse
            const data = evt.payload;
            if (data.session_id && !currentGeminiSessionId) {
              const backendSessionId = data.session_id as string; // e.g., gemini-{uuid}
              currentGeminiSessionId = backendSessionId;
              // Note: Don't set claudeSessionId yet, wait for real Gemini CLI session ID from gemini-cli-session-id event

              // Switch to session-specific listeners
              await attachGeminiSessionListeners(backendSessionId);
            }
          });

          // 🔧 FIX: Listen for real Gemini CLI session ID (emitted when CLI returns init event)
          // This is the REAL session ID that should be used for prompt recording
          const geminiCliSessionIdUnlisten = await listen<{ backend_session_id: string; cli_session_id: string }>('gemini-cli-session-id', async (evt) => {
            if (!hasActiveSessionRef.current) return;
            console.log('[usePromptExecution] Received gemini-cli-session-id:', evt.payload);

            const { cli_session_id: realCliSessionId } = evt.payload;
            if (!realCliSessionId) return;

            // Update state with real CLI session ID
            setClaudeSessionId(realCliSessionId);
            const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
            setExtractedSessionInfo({ sessionId: realCliSessionId, projectId, engine: 'gemini' });
            setIsFirstPrompt(false);

            // 🔧 FIX: Record prompt sent using REAL Gemini CLI session ID
            if (isUserInitiated && geminiPendingInfo && geminiPendingInfo.promptIndex === undefined) {
              console.log('[Gemini Revert] Recording prompt with REAL CLI session ID:', realCliSessionId);
              pendingGeminiPromptRecordingPromise = api.recordGeminiPromptSent(realCliSessionId, projectPath, geminiPendingInfo.promptText)
                .then((idx) => {
                  geminiPendingInfo.promptIndex = idx;
                  geminiPendingInfo.sessionId = realCliSessionId;
                  window.__geminiPendingPrompt = {
                    sessionId: realCliSessionId,
                    projectPath,
                    promptIndex: idx
                  };
                  console.log('[Gemini Revert] Recorded prompt with REAL CLI session ID, index:', idx);
                })
                .catch(err => {
                  console.warn('[Gemini Revert] Failed to record prompt with real CLI session ID:', err);
                });
            }

            // Store pending session info with real CLI session ID
            window.__geminiPendingSession = {
              sessionId: realCliSessionId,
              projectPath
            };
          });

          // 🔧 FIX: 移除全局监听器,避免跨会话串流
          // Listen for Gemini output (global fallback) - FIXED to prevent cross-session data leakage
          const geminiOutputUnlisten = await listen<string>('gemini-output', (evt) => {
            // 🔧 CRITICAL FIX: 只在尚未收到会话ID时处理全局事件
            if (!hasActiveSessionRef.current) return;
            if (currentGeminiSessionId) {
              // 已经有会话ID,不再处理全局事件(应该由会话特定监听器处理)
              console.log('[usePromptExecution] Ignoring global gemini-output (session-specific listener active)');
              return;
            }
            // 只在会话ID未知的早期阶段处理
            processGeminiOutput(evt.payload);
          });

          // Listen for Gemini errors
          const geminiErrorUnlisten = await listen<string>('gemini-error', (evt) => {
            if (!hasActiveSessionRef.current) return;
            console.error('[usePromptExecution] Gemini error:', evt.payload);
            try {
              const data = JSON.parse(evt.payload);
              setError(data.error?.message || evt.payload);
            } catch {
              setError(evt.payload);
            }
          });

          // 🔧 FIX: 移除全局完成事件监听器,避免跨会话串流
          // Listen for Gemini completion (global fallback) - FIXED to prevent cross-session interference
          const geminiCompleteUnlisten = await listen<boolean>('gemini-complete', async () => {
            // 🔧 CRITICAL FIX: 只在尚未收到会话ID时处理全局事件
            if (!hasActiveSessionRef.current) return;
            if (currentGeminiSessionId) {
              // 已经有会话ID,不再处理全局完成事件(应该由会话特定监听器处理)
              console.log('[usePromptExecution] Ignoring global gemini-complete (session-specific listener active)');
              return;
            }
            console.log('[usePromptExecution] Received gemini-complete (global fallback)');
            await processGeminiComplete();
          });

          unlistenRefs.current = [geminiSessionInitUnlisten, geminiCliSessionIdUnlisten, geminiOutputUnlisten, geminiErrorUnlisten, geminiCompleteUnlisten];
        } else {
          // --------------------------------------------------------------------
          // Claude Code Event Listener Setup Strategy
          // --------------------------------------------------------------------
          // Claude Code may emit a *new* session_id even when we pass --resume.
          // If we listen only on the old session-scoped channel we will miss the
          // stream until the user navigates away & back. To avoid this we:
          //   • Always start with GENERIC listeners (no suffix) so we catch the
          //     very first "system:init" message regardless of the session id.
          //   • Once that init message provides the *actual* session_id, we
          //     dynamically switch to session-scoped listeners and stop the
          //     generic ones to prevent duplicate handling.
          // --------------------------------------------------------------------

        let currentSessionId: string | null = claudeSessionId || effectiveSession?.id || null;

        // 🔧 FIX: Track whether we've switched to session-specific listeners
        // Only ignore generic messages AFTER we've attached session-specific listeners
        let hasAttachedSessionListeners = false;

        // 🔧 FIX: Track processed message IDs to prevent duplicates from global and session-specific channels
        const processedClaudeMessages = new Set<string>();

        // 🔧 FIX: Track pending prompt recording Promise to avoid race condition
        let pendingClaudePromptRecordingPromise: Promise<void> | null = null;

        // Helper function to generate message ID for deduplication
        const getClaudeMessageId = (payload: string): string => {
          try {
            const msg = JSON.parse(payload) as ClaudeStreamMessage;
            // Use message ID if available, otherwise use payload hash
            if (msg.id) return `claude-${msg.id}`;
            if (msg.timestamp) return `claude-${msg.timestamp}-${msg.type}`;
          } catch {
            // Fall through to hash-based ID
          }
          // Fallback: use payload hash
          let hash = 0;
          for (let i = 0; i < payload.length; i++) {
            const char = payload.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          return `claude-${hash}`;
        };

        // ====================================================================
        // Helper: Attach Session-Specific Listeners
        // ====================================================================
        const attachSessionSpecificListeners = async (sid: string) => {
          console.log('[usePromptExecution] Attaching session-specific listeners for', sid);

          // 🔧 FIX: Mark that we've attached session-specific listeners
          hasAttachedSessionListeners = true;

          const specificOutputUnlisten = await listen<string>(`claude-output:${sid}`, async (evt) => {
            handleStreamMessage(evt.payload, userInputTranslation || undefined);
            
            // Handle user message recording in session-specific listener
            try {
              const msg = JSON.parse(evt.payload) as ClaudeStreamMessage;
              
              // 在收到第一条 user 消息后记录
              if (msg.type === 'user' && !hasRecordedPrompt && isUserInitiated) {
                // 检查这是否是我们发送的那条消息（通过内容匹配）
                let isOurMessage = false;
                const msgContent: any = msg.message?.content;
                
                if (msgContent) {
                  if (typeof msgContent === 'string') {
                    const contentStr = msgContent as string;
                    isOurMessage = contentStr.includes(prompt) || prompt.includes(contentStr);
                  } else if (Array.isArray(msgContent)) {
                    const textContent = msgContent
                      .filter((item: any) => item.type === 'text')
                      .map((item: any) => item.text)
                      .join('');
                    isOurMessage = textContent.includes(prompt) || prompt.includes(textContent);
                  }
                }
                
                if (isOurMessage) {
                  const projectId = extractedSessionInfo?.projectId || projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                  // 🔧 FIX: Store Promise to allow processComplete to wait for it
                  pendingClaudePromptRecordingPromise = (async () => {
                    try {
                      // 添加延迟以确保文件写入完成
                      await new Promise(resolve => setTimeout(resolve, 100));

                      recordedPromptIndex = await api.recordPromptSent(
                        sid,
                        projectId,
                        projectPath,
                        prompt
                      );
                      hasRecordedPrompt = true;
                      console.log('[Prompt Revert] [OK] Recorded user prompt #', recordedPromptIndex, '(session-specific listener)');
                    } catch (err) {
                      console.error('[Prompt Revert] [ERROR] Failed to record prompt:', err);
                    }
                  })();
                }
              }
            } catch {
              /* ignore parse errors */
            }
          });

          const specificErrorUnlisten = await listen<string>(`claude-error:${sid}`, (evt) => {
            console.error('Claude error (scoped):', evt.payload);
            setError(evt.payload);
          });

          const specificCompleteUnlisten = await listen<boolean>(`claude-complete:${sid}`, (evt) => {
            console.log('[usePromptExecution] Received claude-complete (scoped):', evt.payload);
            processComplete();
          });

          // Replace existing unlisten refs with these new ones (after cleaning up)
          unlistenRefs.current.forEach((u) => u && typeof u === 'function' && u());
          unlistenRefs.current = [specificOutputUnlisten, specificErrorUnlisten, specificCompleteUnlisten];
        };

        // ====================================================================
        // Helper: Process Stream Message
        // ====================================================================
        async function handleStreamMessage(payload: string, currentTranslationResult?: TranslationResult) {
          try {
            // Don't process if component unmounted
            if (!isMountedRef.current) return;

            // 🔧 FIX: Deduplicate messages to prevent duplicate processing
            // This can happen when both global and session-specific listeners receive the same message
            const messageId = getClaudeMessageId(payload);
            if (processedClaudeMessages.has(messageId)) {
              console.log('[usePromptExecution] Skipping duplicate Claude message:', messageId);
              return;
            }
            processedClaudeMessages.add(messageId);

            // Store raw JSONL
            setRawJsonlOutput((prev) => [...prev, payload]);

            const message = JSON.parse(payload) as ClaudeStreamMessage;

            // Use the shared translation function for consistency
            await processMessageWithTranslation(message, payload, currentTranslationResult);

          } catch (err) {
            console.error('Failed to parse message:', err, payload);
          }
        }

        // ====================================================================
        // Helper: Process Completion
        // ====================================================================
        const processComplete = async () => {
          // Calculate API execution time
          const apiDuration = (Date.now() - apiStartTime) / 1000; // seconds
          console.log('[usePromptExecution] API duration:', apiDuration.toFixed(1), 'seconds');

          // 🔧 FIX: Wait for pending prompt recording to complete (race condition fix)
          if (pendingClaudePromptRecordingPromise) {
            console.log('[usePromptExecution] Waiting for pending Claude prompt recording to complete...');
            await pendingClaudePromptRecordingPromise;
            pendingClaudePromptRecordingPromise = null;
          }

          // Mark prompt as completed (record Git state after completion)
          if (recordedPromptIndex >= 0) {
            // Use currentSessionId and extractedSessionInfo for new sessions
            const sessionId = effectiveSession?.id || currentSessionId;
            const projectId = effectiveSession?.project_id || extractedSessionInfo?.projectId || projectPath.replace(/[^a-zA-Z0-9]/g, '-');
            
            if (sessionId && projectId) {
              api.markPromptCompleted(
                sessionId,
                projectId,
                projectPath,
                recordedPromptIndex
              ).then(() => {
                console.log('[Prompt Revert] Marked prompt # as completed', recordedPromptIndex);
              }).catch(err => {
                console.error('[Prompt Revert] Failed to mark completed:', err);
              });
            } else {
              console.warn('[Prompt Revert] Cannot mark completed: missing sessionId or projectId');
            }
          }

          setIsLoading(false);
          hasActiveSessionRef.current = false;
          isListeningRef.current = false;

          // 🆕 Clean up listeners to prevent memory leak
          unlistenRefs.current.forEach(u => u && typeof u === 'function' && u());
          unlistenRefs.current = [];

          // Reset currentSessionId to allow detection of new session_id
          currentSessionId = null;
          console.log('[usePromptExecution] Session completed - reset session state for new input');

          // Process queued prompts after completion
          if (queuedPromptsRef.current.length > 0) {
            const [nextPrompt, ...remainingPrompts] = queuedPromptsRef.current;
            setQueuedPrompts(remainingPrompts);

            // Small delay to ensure UI updates
            setTimeout(() => {
              handleSendPrompt(nextPrompt.prompt, nextPrompt.model);
            }, 100);
          }
        };

        // Track if we've recorded the prompt for new sessions
        let hasRecordedPrompt = recordedPromptIndex >= 0;

        // ====================================================================
        // Generic Listeners (Catch-all) - FIXED to prevent cross-session data leakage
        // ====================================================================
        const genericOutputUnlisten = await listen<string>('claude-output', async (event) => {
          // 🔧 CRITICAL FIX: 只在尚未收到会话ID时处理全局事件
          if (!hasActiveSessionRef.current) return;

          // 🔒 CRITICAL FIX: Session Isolation - 严格隔离全局事件处理
          // 问题: 多个标签页都监听全局 'claude-output',导致消息被多个会话接收
          // 解决: 只在会话ID未知的早期阶段处理全局事件
          if (hasAttachedSessionListeners) {
             try {
                const msg = JSON.parse(event.payload) as ClaudeStreamMessage;
                // 只处理新会话的 init 消息(session_id 不同)
                if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id && msg.session_id !== currentSessionId) {
                   console.log('[usePromptExecution] Detected NEW session_id from generic listener:', msg.session_id);
                   // Fall through to processing below
                } else {
                   // ⚠️ 忽略所有其他消息 - 应该由会话特定监听器处理
                   console.log('[usePromptExecution] Ignoring global claude-output (session-specific listener active)');
                   return;
                }
             } catch {
                return;
             }
          }

          // Attempt to extract session_id on the fly (for the very first init)
          try {
            const msg = JSON.parse(event.payload) as ClaudeStreamMessage;
            
            // Always process the message if we haven't established a session yet
            // Or if it is the init message
            handleStreamMessage(event.payload, userInputTranslation || undefined);

            if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
              if (!currentSessionId || currentSessionId !== msg.session_id) {
                console.log('[usePromptExecution] Detected new session_id from generic listener:', msg.session_id);
                currentSessionId = msg.session_id;
                setClaudeSessionId(msg.session_id);

                // If we haven't extracted session info before, do it now
                if (!extractedSessionInfo) {
                  const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                  setExtractedSessionInfo({ sessionId: msg.session_id, projectId, engine: 'claude' });
                }

                // Record prompt after system:init (user message already written to JSONL)
                if (!hasRecordedPrompt && isUserInitiated) {
                  const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                  // 🔧 FIX: Store Promise to allow processComplete to wait for it
                  pendingClaudePromptRecordingPromise = (async () => {
                    try {
                      // Delay 200ms to ensure file is written
                      await new Promise(resolve => setTimeout(resolve, 200));

                      recordedPromptIndex = await api.recordPromptSent(
                        msg.session_id,
                        projectId,
                        projectPath,
                        prompt
                      );
                      hasRecordedPrompt = true;
                      console.log('[Prompt Revert] [OK] Recorded user prompt #', recordedPromptIndex, '(after system:init)');
                    } catch (err) {
                      console.error('[Prompt Revert] [ERROR] Failed to record prompt:', err);
                    }
                  })();
                }

                // Switch to session-specific listeners
                await attachSessionSpecificListeners(msg.session_id);
              }
            }
            
            // Record after first user message (user message already written to JSONL)
            // This ensures backend can correctly read and calculate index
            if (msg.type === 'user' && !hasRecordedPrompt && isUserInitiated && currentSessionId) {
              // 检查这是否是我们发送的那条消息（通过内容匹配）
              let isOurMessage = false;
              const msgContent: any = msg.message?.content;
              
              if (msgContent) {
                if (typeof msgContent === 'string') {
                  const contentStr = msgContent as string;
                  isOurMessage = contentStr.includes(prompt) || prompt.includes(contentStr);
                } else if (Array.isArray(msgContent)) {
                  const textContent = msgContent
                    .filter((item: any) => item.type === 'text')
                    .map((item: any) => item.text)
                    .join('');
                  isOurMessage = textContent.includes(prompt) || prompt.includes(textContent);
                }
              }
              
              if (isOurMessage) {
                const projectId = extractedSessionInfo?.projectId || projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                // 🔧 FIX: Store Promise to allow processComplete to wait for it
                pendingClaudePromptRecordingPromise = (async () => {
                  try {
                    // 添加延迟以确保文件写入完成
                    await new Promise(resolve => setTimeout(resolve, 100));

                    recordedPromptIndex = await api.recordPromptSent(
                      currentSessionId,
                      projectId,
                      projectPath,
                      prompt
                    );
                    hasRecordedPrompt = true;
                    console.log('[Prompt Revert] [OK] Recorded user prompt #', recordedPromptIndex, '(after user message in JSONL)');
                  } catch (err) {
                    console.error('[Prompt Revert] [ERROR] Failed to record prompt:', err);
                  }
                })();
              }
            }
          } catch {
            /* ignore parse errors */
          }
        });

        const genericErrorUnlisten = await listen<string>('claude-error', (evt) => {
          // 🔧 FIX: Only process if this tab has an active session
          if (!hasActiveSessionRef.current) return;
          console.error('Claude error:', evt.payload);
          setError(evt.payload);
        });

        const genericCompleteUnlisten = await listen<boolean>('claude-complete', (evt) => {
          // 🔧 FIX: Only process if this tab has an active session
          if (!hasActiveSessionRef.current) return;
          console.log('[usePromptExecution] Received claude-complete (generic):', evt.payload);
          processComplete();
        });

        // Store the generic unlisteners for now; they may be replaced later.
        unlistenRefs.current = [genericOutputUnlisten, genericErrorUnlisten, genericCompleteUnlisten];

        } // End of Claude Code event listener setup

        // ========================================================================
        // 3️⃣ Translation Processing
        // ========================================================================

        // Skip translation entirely for slash commands
        if (!isSlashCommandInput) {
          try {
            const isEnabled = await translationMiddleware.isEnabled();
            if (isEnabled) {
              console.log('[usePromptExecution] Translation enabled, processing user input...');
              userInputTranslation = await translationMiddleware.translateUserInput(prompt);
              processedPrompt = userInputTranslation.translatedText;

              if (userInputTranslation.wasTranslated) {
                console.log('[usePromptExecution] User input translated:', {
                  original: userInputTranslation.originalText,
                  translated: userInputTranslation.translatedText,
                  language: userInputTranslation.detectedLanguage
                });
              }
            }
          } catch (translationError) {
            console.error('[usePromptExecution] Translation failed, using original prompt:', translationError);
            // Continue with original prompt if translation fails
          }
        } else {
          const commandPreview = trimmedPrompt.split('\n')[0];
          console.log('[usePromptExecution] [OK] Slash command detected, skipping translation:', {
            command: commandPreview,
            translationEnabled: await translationMiddleware.isEnabled()
          });
        }

        // Store the translation result AFTER all processing for response translation
        if (userInputTranslation) {
          setLastTranslationResult(userInputTranslation);
          console.log('[usePromptExecution] Stored translation result for response processing:', userInputTranslation);
        }

        // ========================================================================
        // 4️⃣ maxThinkingTokens Processing (No longer modifying prompt)
        // ========================================================================

        // maxThinkingTokens is now passed as API parameter, not added to prompt
        if (maxThinkingTokens) {
          console.log('[usePromptExecution] Extended thinking enabled with maxThinkingTokens:', maxThinkingTokens);
        }

        // ========================================================================
        // 5️⃣ Add User Message to UI
        // ========================================================================

        const userMessage: ClaudeStreamMessage = {
          type: "user",
          message: {
            content: [
              {
                type: "text",
                text: prompt // Always show original user input
              }
            ]
          },
          sentAt: new Date().toISOString(),
          ...(executionEngine === 'codex' ? { engine: 'codex' as const } : {}),
          ...(executionEngine === 'gemini' ? { engine: 'gemini' as const } : {}),
          // Add translation metadata for debugging/info
          translationMeta: userInputTranslation ? {
            wasTranslated: userInputTranslation.wasTranslated,
            detectedLanguage: userInputTranslation.detectedLanguage,
            translatedText: userInputTranslation.translatedText
          } : undefined
        };
        setMessages(prev => [...prev, userMessage]);
      }

      // ========================================================================
      // 6️⃣ API Execution
      // ========================================================================

      // Execute the appropriate command based on execution engine
      // Use processedPrompt (potentially translated) for API calls
      if (executionEngine === 'codex') {
        // ====================================================================
        // 🆕 Codex Execution Branch
        // ====================================================================

        // 📝 Git 记录逻辑说明：
        // - 已有会话：已在前面第 201-230 行通过 recordCodexPromptSent 记录
        // - 新会话：在事件监听器 codex-output 收到 thread.started 后记录
        // 此处仅设置 pendingPrompt 供 completion 使用

        if (effectiveSession && !isFirstPrompt) {
          // Resume existing Codex session
          try {
            await api.resumeCodex(effectiveSession.id, {
              projectPath,
              prompt: processedPrompt,
              mode: codexMode || 'read-only',
              model: codexModel || model,
              json: true
            });
          } catch (resumeError) {
            // Fallback to resume last if specific resume fails
            await api.resumeLastCodex({
              projectPath,
              prompt: processedPrompt,
              mode: codexMode || 'read-only',
              model: codexModel || model,
              json: true
            });
          }
        } else {
          // Start new Codex session
          setIsFirstPrompt(false);
          await api.executeCodex({
            projectPath,
            prompt: processedPrompt,
            mode: codexMode || 'read-only',
            model: codexModel || model,
            json: true
          });
        }

        // 🆕 Store pending prompt info for completion recording
        // 已有会话: recordedPromptIndex 已在前面设置
        // 新会话: codexPendingInfo.promptIndex 将在 thread.started 事件后设置
        const pendingIndex = recordedPromptIndex >= 0 ? recordedPromptIndex : codexPendingInfo?.promptIndex;
        const pendingSessionId = effectiveSession?.id || codexPendingInfo?.sessionId || null;
        if (pendingIndex !== undefined && pendingSessionId) {
          window.__codexPendingPrompt = {
            sessionId: pendingSessionId,
            projectPath,
            promptIndex: pendingIndex
          };
        }
      } else if (executionEngine === 'gemini') {
        // ====================================================================
        // 🆕 Gemini Execution Branch
        // ====================================================================
        // Note: geminiModel and geminiApprovalMode come from hook parameters

        // Determine if we're resuming a session
        const resumingSession = effectiveSession && !isFirstPrompt;
        const sessionId = resumingSession ? effectiveSession.id : undefined;

        console.log('[usePromptExecution] Executing Gemini with:', {
          projectPath,
          prompt: processedPrompt.substring(0, 100) + '...',
          model: geminiModel || 'gemini-2.5-pro',
          approvalMode: geminiApprovalMode || 'auto_edit',
          resumingSession,
          sessionId
        });

        if (resumingSession) {
          console.log('[usePromptExecution] Resuming Gemini session:', sessionId);
        } else {
          console.log('[usePromptExecution] Starting new Gemini session');
          setIsFirstPrompt(false);
        }

        await api.executeGemini({
          projectPath,
          prompt: processedPrompt,
          model: geminiModel || 'gemini-2.5-pro',
          approvalMode: geminiApprovalMode || 'auto_edit',
          sessionId: sessionId,  // 🔑 Pass session ID for resumption
          debug: false
        });

        // 🆕 Store pending prompt info for completion recording
        // 已有会话: recordedPromptIndex 已在前面设置
        // 新会话: geminiPendingInfo.promptIndex 将在 gemini-session-init 事件后设置
        const pendingIndex = recordedPromptIndex >= 0 ? recordedPromptIndex : geminiPendingInfo?.promptIndex;
        const pendingSessionId = effectiveSession?.id || geminiPendingInfo?.sessionId || null;
        if (pendingIndex !== undefined && pendingSessionId) {
          window.__geminiPendingPrompt = {
            sessionId: pendingSessionId,
            projectPath,
            promptIndex: pendingIndex
          };
          console.log('[Gemini Rewind] Set pending prompt:', { sessionId: pendingSessionId, promptIndex: pendingIndex });
        }

      } else {
        // ====================================================================
        // Claude Code Execution Branch
        // ====================================================================
        // 🔧 Fix: 使用 isPlanModeRef.current 获取最新值，确保批准计划后不带 --plan
        const currentPlanMode = isPlanModeRef.current;
        console.log('[usePromptExecution] Using plan mode:', currentPlanMode);

        if (effectiveSession && !isFirstPrompt) {
          // Resume existing session
          console.log('[usePromptExecution] Resuming session:', effectiveSession.id);
          try {
            await api.resumeClaudeCode(projectPath, effectiveSession.id, processedPrompt, model, currentPlanMode, maxThinkingTokens);
          } catch (resumeError) {
            console.warn('[usePromptExecution] Resume failed, falling back to continue mode:', resumeError);
            // Fallback to continue mode if resume fails
            await api.continueClaudeCode(projectPath, processedPrompt, model, currentPlanMode, maxThinkingTokens);
          }
        } else {
          // Start new session
          console.log('[usePromptExecution] Starting new session');
          setIsFirstPrompt(false);
          await api.executeClaudeCode(projectPath, processedPrompt, model, currentPlanMode, maxThinkingTokens);
        }
      }

    } catch (err) {
      // ========================================================================
      // 7️⃣ Error Handling
      // ========================================================================
      console.error("Failed to send prompt:", err);
      setError("发送提示失败");
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      // Reset session state on error
      setClaudeSessionId(null);
    }
  }, [
    projectPath,
    isLoading,
    claudeSessionId,
    effectiveSession,
    isPlanMode,
    isActive,
    isFirstPrompt,
    extractedSessionInfo,
    executionEngine,  // 🆕 Codex/Gemini integration
    codexMode,        // 🆕 Codex integration
    codexModel,       // 🆕 Codex integration
    geminiModel,      // 🆕 Gemini integration
    geminiApprovalMode, // 🆕 Gemini integration
    hasActiveSessionRef,
    unlistenRefs,
    isMountedRef,
    isListeningRef,
    queuedPromptsRef,
    setIsLoading,
    setError,
    setMessages,
    setClaudeSessionId,
    setLastTranslationResult,
    setQueuedPrompts,
    setRawJsonlOutput,
    setExtractedSessionInfo,
    setIsFirstPrompt,
    processMessageWithTranslation
  ]);

  // ============================================================================
  // Return Hook Interface
  // ============================================================================

  return {
    handleSendPrompt
  };
}
