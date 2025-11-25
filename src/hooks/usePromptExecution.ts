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

import { useCallback } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { api, type Session } from '@/lib/api';
import { translationMiddleware, isSlashCommand, type TranslationResult } from '@/lib/translationMiddleware';
import type { ClaudeStreamMessage } from '@/types/claude';
import type { ModelType } from '@/components/FloatingPromptInput/types';
import { codexConverter } from '@/lib/codexConverter';
import type { CodexExecutionMode } from '@/types/codex';

// ============================================================================
// Global Type Declarations
// ============================================================================

// Extend window object for Codex pending prompt tracking
declare global {
  interface Window {
    __codexPendingPrompt?: {
      sessionId: string;
      projectPath: string;
      promptIndex: number;
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

  // 🆕 Codex Integration
  executionEngine?: 'claude' | 'codex'; // 执行引擎选择 (默认: 'claude')
  codexMode?: CodexExecutionMode;       // Codex 执行模式
  codexModel?: string;                  // Codex 模型 (e.g., 'gpt-5.1-codex-max')

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
  setExtractedSessionInfo: React.Dispatch<React.SetStateAction<{ sessionId: string; projectId: string } | null>>;
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
        // 🆕 Codex Event Listeners
        // ====================================================================
        if (executionEngine === 'codex') {
          // Reset Codex converter state for new session
          codexConverter.reset();

          // Listen for Codex JSONL output
          const codexOutputUnlisten = await listen<string>('codex-output', (evt) => {
            if (!isMountedRef.current) return;

            // Convert Codex JSONL event to ClaudeStreamMessage
            const message = codexConverter.convertEvent(evt.payload);
            if (message) {
              setMessages(prev => [...prev, message]);
              setRawJsonlOutput((prev) => [...prev, evt.payload]);

              // Extract and save Codex session ID from thread.started
              if (message.type === 'system' && message.subtype === 'init' && (message as any).session_id) {
                const codexSessionId = (message as any).session_id;
                setClaudeSessionId(codexSessionId);

                // Save session info for resuming
                const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                setExtractedSessionInfo({ sessionId: codexSessionId, projectId });

                // Mark as not first prompt anymore
                setIsFirstPrompt(false);

                // If this is a new Codex session and prompt not yet recorded, record now
                if (isUserInitiated && codexPendingInfo && codexPendingInfo.promptIndex === undefined) {
                  api.recordCodexPromptSent(codexSessionId, projectPath, codexPendingInfo.promptText)
                    .then((idx) => {
                      codexPendingInfo.promptIndex = idx;
                      codexPendingInfo.sessionId = codexSessionId;
                      window.__codexPendingPrompt = {
                        sessionId: codexSessionId,
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
                    sessionId: codexSessionId,
                    projectPath,
                    promptIndex: codexPendingInfo.promptIndex
                  };
                }
              }
            }
          });

          // Listen for Codex errors
          const codexErrorUnlisten = await listen<string>('codex-error', (evt) => {
            setError(evt.payload);
          });

          // Listen for Codex completion
          const codexCompleteUnlisten = await listen<boolean>('codex-complete', async (_evt) => {
            setIsLoading(false);
            hasActiveSessionRef.current = false;
            isListeningRef.current = false;

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
          });

          unlistenRefs.current = [codexOutputUnlisten, codexErrorUnlisten, codexCompleteUnlisten];
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

        // ====================================================================
        // Helper: Attach Session-Specific Listeners
        // ====================================================================
        const attachSessionSpecificListeners = async (sid: string) => {
          console.log('[usePromptExecution] Attaching session-specific listeners for', sid);

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
        // Generic Listeners (Catch-all)
        // ====================================================================
        const genericOutputUnlisten = await listen<string>('claude-output', async (event) => {
          // Always handle generic events as fallback to ensure output visibility
          handleStreamMessage(event.payload, userInputTranslation || undefined);

          // Attempt to extract session_id on the fly (for the very first init)
          try {
            const msg = JSON.parse(event.payload) as ClaudeStreamMessage;
            if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
              if (!currentSessionId || currentSessionId !== msg.session_id) {
                console.log('[usePromptExecution] Detected new session_id from generic listener:', msg.session_id);
                currentSessionId = msg.session_id;
                setClaudeSessionId(msg.session_id);

                // If we haven't extracted session info before, do it now
                if (!extractedSessionInfo) {
                  const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                  setExtractedSessionInfo({ sessionId: msg.session_id, projectId });
                }

                // Record prompt after system:init (user message already written to JSONL)
                if (!hasRecordedPrompt && isUserInitiated) {
                  const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
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
              }
            }
          } catch {
            /* ignore parse errors */
          }
        });

        const genericErrorUnlisten = await listen<string>('claude-error', (evt) => {
          console.error('Claude error:', evt.payload);
          setError(evt.payload);
        });

        const genericCompleteUnlisten = await listen<boolean>('claude-complete', (evt) => {
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
      } else {
        // ====================================================================
        // Claude Code Execution Branch
        // ====================================================================
        if (effectiveSession && !isFirstPrompt) {
          // Resume existing session
          console.log('[usePromptExecution] Resuming session:', effectiveSession.id);
          try {
            await api.resumeClaudeCode(projectPath, effectiveSession.id, processedPrompt, model, isPlanMode, maxThinkingTokens);
          } catch (resumeError) {
            console.warn('[usePromptExecution] Resume failed, falling back to continue mode:', resumeError);
            // Fallback to continue mode if resume fails
            await api.continueClaudeCode(projectPath, processedPrompt, model, isPlanMode, maxThinkingTokens);
          }
        } else {
          // Start new session
          console.log('[usePromptExecution] Starting new session');
          setIsFirstPrompt(false);
          await api.executeClaudeCode(projectPath, processedPrompt, model, isPlanMode, maxThinkingTokens);
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
    executionEngine,  // 🆕 Codex integration
    codexMode,        // 🆕 Codex integration
    codexModel,       // 🆕 Codex integration
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
