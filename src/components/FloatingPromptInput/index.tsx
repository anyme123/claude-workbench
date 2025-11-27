import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect, useReducer } from "react";
import { AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FloatingPromptInputProps, FloatingPromptInputRef, ThinkingMode, ModelType, ModelConfig } from "./types";
import { THINKING_MODES, MODELS } from "./constants";
import { useImageHandling } from "./hooks/useImageHandling";
import { useFileSelection } from "./hooks/useFileSelection";
import { useSlashCommands } from "./hooks/useSlashCommands";
import { usePromptEnhancement } from "./hooks/usePromptEnhancement";
import { api } from "@/lib/api";
import { getEnabledProviders } from "@/lib/promptEnhancementService";
import { inputReducer, initialState } from "./reducer";

// Import sub-components
import { InputArea } from "./InputArea";
import { AttachmentPreview } from "./AttachmentPreview";
import { ControlBar } from "./ControlBar";
import { ExpandedModal } from "./ExpandedModal";

// Re-export types for external use
export type { FloatingPromptInputRef, FloatingPromptInputProps, ThinkingMode, ModelType } from "./types";

/**
 * FloatingPromptInput - Refactored modular component
 */
const FloatingPromptInputInner = (
  {
    onSend,
    isLoading = false,
    disabled = false,
    defaultModel = "sonnet",
    sessionModel,
    projectPath,
    sessionId,
    projectId,
    className,
    onCancel,
    getConversationContext,
    messages,
    isPlanMode = false,
    onTogglePlanMode,
    sessionCost,
    sessionStats,
    hasMessages = false,
    session,
    executionEngineConfig: externalEngineConfig,
    onExecutionEngineConfigChange,
  }: FloatingPromptInputProps,
  ref: React.Ref<FloatingPromptInputRef>,
) => {
  // Helper function to convert backend model string to frontend ModelType
  const parseSessionModel = (modelStr?: string): ModelType | null => {
    if (!modelStr) return null;

    const lowerModel = modelStr.toLowerCase();
    if (lowerModel.includes("opus")) return "opus";
    if (lowerModel.includes("sonnet") && lowerModel.includes("1m")) return "sonnet1m";
    if (lowerModel.includes("sonnet")) return "sonnet";

    return null;
  };

  // Use Reducer for state management
  const [state, dispatch] = useReducer(inputReducer, {
    ...initialState,
    selectedModel: parseSessionModel(sessionModel) || defaultModel,
    executionEngineConfig: externalEngineConfig || initialState.executionEngineConfig,
  });

  // Initialize enableProjectContext from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('enable_project_context');
      if (stored === 'true') {
        dispatch({ type: "SET_ENABLE_PROJECT_CONTEXT", payload: true });
      }
    } catch {
      // Ignore error
    }
  }, []);

  // Sync external config changes
  useEffect(() => {
    if (externalEngineConfig && externalEngineConfig.engine !== state.executionEngineConfig.engine) {
      dispatch({ type: "SET_EXECUTION_ENGINE_CONFIG", payload: externalEngineConfig });
    }
  }, [externalEngineConfig]);

  // Persist execution engine config
  useEffect(() => {
    try {
      localStorage.setItem('execution_engine_config', JSON.stringify(state.executionEngineConfig));
      onExecutionEngineConfigChange?.(state.executionEngineConfig);
    } catch (error) {
      console.error('[ExecutionEngine] Failed to save config to localStorage:', error);
    }
  }, [state.executionEngineConfig, onExecutionEngineConfigChange]);

  // Dynamic model list
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>(MODELS);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Custom hooks
  const {
    imageAttachments,
    embeddedImages,
    dragActive,
    handlePaste,
    handleRemoveImageAttachment,
    handleRemoveEmbeddedImage,
    handleDrag,
    handleDrop,
    addImage,
    setImageAttachments,
    setEmbeddedImages,
  } = useImageHandling({
    prompt: state.prompt,
    projectPath,
    isExpanded: state.isExpanded,
    onPromptChange: (p) => dispatch({ type: "SET_PROMPT", payload: p }),
    textareaRef,
    expandedTextareaRef,
  });

  const {
    showFilePicker,
    filePickerQuery,
    detectAtSymbol,
    updateFilePickerQuery,
    handleFileSelect,
    handleFilePickerClose,
    setShowFilePicker,
    setFilePickerQuery,
  } = useFileSelection({
    prompt: state.prompt,
    projectPath,
    cursorPosition: state.cursorPosition,
    isExpanded: state.isExpanded,
    onPromptChange: (p) => dispatch({ type: "SET_PROMPT", payload: p }),
    onCursorPositionChange: (p) => dispatch({ type: "SET_CURSOR_POSITION", payload: p }),
    textareaRef,
    expandedTextareaRef,
  });

  const {
    showSlashCommandPicker,
    slashCommandQuery,
    detectSlashSymbol,
    updateSlashCommandQuery,
    handleSlashCommandSelect,
    handleSlashCommandPickerClose,
    setShowSlashCommandPicker,
    setSlashCommandQuery,
  } = useSlashCommands({
    prompt: state.prompt,
    cursorPosition: state.cursorPosition,
    isExpanded: state.isExpanded,
    onPromptChange: (p) => dispatch({ type: "SET_PROMPT", payload: p }),
    onCursorPositionChange: (p) => dispatch({ type: "SET_CURSOR_POSITION", payload: p }),
    textareaRef,
    expandedTextareaRef,
  });

  const {
    isEnhancing,
    handleEnhancePromptWithAPI,
    enableDualAPI,
    setEnableDualAPI,
  } = usePromptEnhancement({
    prompt: state.prompt,
    isExpanded: state.isExpanded,
    onPromptChange: (p) => dispatch({ type: "SET_PROMPT", payload: p }),
    getConversationContext,
    messages,
    textareaRef,
    expandedTextareaRef,
    projectPath,
    sessionId,
    projectId,
    enableProjectContext: state.enableProjectContext,
    enableMultiRound: true,
  });

  // Persist project context switch
  useEffect(() => {
    try {
      localStorage.setItem('enable_project_context', state.enableProjectContext.toString());
    } catch (error) {
      console.warn('Failed to save enable_project_context to localStorage:', error);
    }
  }, [state.enableProjectContext]);

  // Restore session model
  useEffect(() => {
    const parsedSessionModel = parseSessionModel(sessionModel);
    if (parsedSessionModel) {
      dispatch({ type: "SET_MODEL", payload: parsedSessionModel });
    }
  }, [sessionModel]);

  // Load custom models
  useEffect(() => {
    const loadCustomModel = async () => {
      try {
        const settings = await api.getClaudeSettings();
        const envVars = settings?.data?.env || settings?.env;

        if (envVars && typeof envVars === 'object') {
          const customModel = envVars.ANTHROPIC_MODEL ||
                             envVars.ANTHROPIC_DEFAULT_SONNET_MODEL ||
                             envVars.ANTHROPIC_DEFAULT_OPUS_MODEL;

          if (customModel && typeof customModel === 'string') {
            const isThirdPartyModel = !customModel.toLowerCase().includes('claude') &&
                                     !customModel.toLowerCase().includes('sonnet') &&
                                     !customModel.toLowerCase().includes('opus');

            if (isThirdPartyModel) {
              const customModelConfig: ModelConfig = {
                id: "custom" as ModelType,
                name: customModel,
                description: "Third-party model from settings.json",
                icon: <Sparkles className="h-4 w-4" />
              };

              setAvailableModels(prev => {
                const hasCustom = prev.some(m => m.id === "custom");
                if (!hasCustom) return [...prev, customModelConfig];
                return prev;
              });
            }
          }
        }
      } catch (error) {
        console.error('[FloatingPromptInput] Failed to load custom model:', error);
      }
    };

    loadCustomModel();
  }, []);

  // Imperative handle
  useImperativeHandle(ref, () => ({
    addImage,
    setPrompt: (text: string) => dispatch({ type: "SET_PROMPT", payload: text }),
  }));

  // Toggle thinking mode
  const handleToggleThinkingMode = async () => {
    const newMode: ThinkingMode = state.selectedThinkingMode === "off" ? "on" : "off";
    dispatch({ type: "SET_THINKING_MODE", payload: newMode });

    try {
      const thinkingMode = THINKING_MODES.find(m => m.id === newMode);
      const enabled = newMode === "on";
      const tokens = thinkingMode?.tokens;
      await api.updateThinkingMode(enabled, tokens);
    } catch (error) {
      console.error("Failed to update thinking mode:", error);
      dispatch({ type: "SET_THINKING_MODE", payload: state.selectedThinkingMode === "off" ? "on" : "off" });
    }
  };

  // Focus management
  useEffect(() => {
    if (state.isExpanded && expandedTextareaRef.current) {
      expandedTextareaRef.current.focus();
    } else if (!state.isExpanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [state.isExpanded]);

  // Auto-resize textarea
  const adjustTextareaHeight = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = state.isExpanded ? 600 : 300;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
    if (textarea.scrollHeight > maxHeight) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  };

  useEffect(() => {
    const textarea = state.isExpanded ? expandedTextareaRef.current : textareaRef.current;
    adjustTextareaHeight(textarea);
  }, [state.prompt, state.isExpanded]);

  // Tab key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeElement = document.activeElement;
        const isInTextarea = activeElement?.tagName === 'TEXTAREA';
        if (!isInTextarea && !disabled) {
          e.preventDefault();
          handleToggleThinkingMode();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disabled]);

  // Event handlers
  const handleSend = () => {
    // Allow sending if there's text content OR image attachments
    if ((state.prompt.trim() || imageAttachments.length > 0) && !disabled) {
      let finalPrompt = state.prompt.trim();
      if (imageAttachments.length > 0) {
        // Codex CLI doesn't recognize @ prefix syntax, use direct paths instead
        // Claude Code CLI uses @ prefix to reference files
        const isCodex = state.executionEngineConfig.engine === 'codex';
        const imagePathMentions = imageAttachments.map(attachment => {
          if (isCodex) {
            // For Codex: use direct path without @ prefix
            return attachment.filePath.includes(' ') ? `"${attachment.filePath}"` : attachment.filePath;
          } else {
            // For Claude Code: use @ prefix for file reference
            return attachment.filePath.includes(' ') ? `@"${attachment.filePath}"` : `@${attachment.filePath}`;
          }
        }).join(' ');

        finalPrompt = finalPrompt + (finalPrompt.endsWith(' ') || finalPrompt === '' ? '' : ' ') + imagePathMentions;
      }
      onSend(finalPrompt, state.selectedModel, undefined);
      dispatch({ type: "RESET_INPUT" });
      setImageAttachments([]);
      setEmbeddedImages([]);
      setTimeout(() => {
        const textarea = state.isExpanded ? expandedTextareaRef.current : textareaRef.current;
        if (textarea) textarea.style.height = 'auto';
      }, 0);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPosition = e.target.selectionStart || 0;
    detectSlashSymbol(newValue, newCursorPosition);
    detectAtSymbol(newValue, newCursorPosition);
    updateSlashCommandQuery(newValue, newCursorPosition);
    updateFilePickerQuery(newValue, newCursorPosition);
    dispatch({ type: "SET_PROMPT", payload: newValue });
    dispatch({ type: "SET_CURSOR_POSITION", payload: newCursorPosition });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showFilePicker && e.key === 'Escape') {
      e.preventDefault();
      setShowFilePicker(false);
      setFilePickerQuery("");
      return;
    }
    if (showSlashCommandPicker && e.key === 'Escape') {
      e.preventDefault();
      setShowSlashCommandPicker(false);
      setSlashCommandQuery("");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !state.isExpanded && !showFilePicker && !showSlashCommandPicker) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Expanded Modal */}
      <AnimatePresence>
        {state.isExpanded && (
          <ExpandedModal
            ref={expandedTextareaRef}
            prompt={state.prompt}
            disabled={disabled}
            imageAttachments={imageAttachments}
            embeddedImages={embeddedImages}
            executionEngineConfig={state.executionEngineConfig}
            setExecutionEngineConfig={(config) => dispatch({ type: "SET_EXECUTION_ENGINE_CONFIG", payload: config })}
            selectedModel={state.selectedModel}
            setSelectedModel={(model) => dispatch({ type: "SET_MODEL", payload: model })}
            availableModels={availableModels}
            selectedThinkingMode={state.selectedThinkingMode}
            handleToggleThinkingMode={handleToggleThinkingMode}
            isPlanMode={isPlanMode}
            onTogglePlanMode={onTogglePlanMode}
            isEnhancing={isEnhancing}
            projectPath={projectPath}
            enableProjectContext={state.enableProjectContext}
            setEnableProjectContext={(enable) => dispatch({ type: "SET_ENABLE_PROJECT_CONTEXT", payload: enable })}
            enableDualAPI={enableDualAPI}
            setEnableDualAPI={setEnableDualAPI}
            getEnabledProviders={getEnabledProviders}
            handleEnhancePromptWithAPI={handleEnhancePromptWithAPI}
            onClose={() => dispatch({ type: "SET_EXPANDED", payload: false })}
            onRemoveAttachment={handleRemoveImageAttachment}
            onRemoveEmbedded={handleRemoveEmbeddedImage}
            onTextChange={handleTextChange}
            onPaste={handlePaste}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onSend={handleSend}
          />
        )}
      </AnimatePresence>

      {/* Main Floating Input */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] shadow-[var(--glass-shadow)]",
        className
      )}>
        <AttachmentPreview
          imageAttachments={imageAttachments}
          embeddedImages={embeddedImages}
          onRemoveAttachment={handleRemoveImageAttachment}
          onRemoveEmbedded={handleRemoveEmbeddedImage}
          className="border-b border-border/50 p-4"
        />

        <div className="p-4 space-y-2">
          <InputArea
            ref={textareaRef}
            prompt={state.prompt}
            disabled={disabled}
            dragActive={dragActive}
            showFilePicker={showFilePicker}
            showSlashCommandPicker={showSlashCommandPicker}
            projectPath={projectPath}
            filePickerQuery={filePickerQuery}
            slashCommandQuery={slashCommandQuery}
            onTextChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onExpand={() => dispatch({ type: "SET_EXPANDED", payload: true })}
            onFileSelect={handleFileSelect}
            onFilePickerClose={handleFilePickerClose}
            onSlashCommandSelect={handleSlashCommandSelect}
            onSlashCommandPickerClose={handleSlashCommandPickerClose}
          />

          <ControlBar
            disabled={disabled}
            isLoading={isLoading}
            prompt={state.prompt}
            hasAttachments={imageAttachments.length > 0}
            executionEngineConfig={state.executionEngineConfig}
            setExecutionEngineConfig={(config) => dispatch({ type: "SET_EXECUTION_ENGINE_CONFIG", payload: config })}
            selectedModel={state.selectedModel}
            setSelectedModel={(model) => dispatch({ type: "SET_MODEL", payload: model })}
            availableModels={availableModels}
            selectedThinkingMode={state.selectedThinkingMode}
            handleToggleThinkingMode={handleToggleThinkingMode}
            isPlanMode={isPlanMode}
            onTogglePlanMode={onTogglePlanMode}
            hasMessages={hasMessages}
            sessionCost={sessionCost}
            sessionStats={sessionStats}
            showCostPopover={state.showCostPopover}
            setShowCostPopover={(show) => dispatch({ type: "SET_SHOW_COST_POPOVER", payload: show })}
            messages={messages}
            session={session}
            isEnhancing={isEnhancing}
            projectPath={projectPath}
            enableProjectContext={state.enableProjectContext}
            setEnableProjectContext={(enable) => dispatch({ type: "SET_ENABLE_PROJECT_CONTEXT", payload: enable })}
            enableDualAPI={enableDualAPI}
            setEnableDualAPI={setEnableDualAPI}
            getEnabledProviders={getEnabledProviders}
            handleEnhancePromptWithAPI={handleEnhancePromptWithAPI}
            onCancel={onCancel || (() => {})}
            onSend={handleSend}
          />
        </div>
      </div>
    </>
  );
};

export const FloatingPromptInput = forwardRef(FloatingPromptInputInner);
