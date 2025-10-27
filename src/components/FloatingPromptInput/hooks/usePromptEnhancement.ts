import { useState } from "react";
import { api } from "@/lib/api";
import { ModelType } from "../types";
import { callEnhancementAPI, getProvider } from "@/lib/promptEnhancementService";

export interface UsePromptEnhancementOptions {
  prompt: string;
  selectedModel: ModelType;
  isExpanded: boolean;
  onPromptChange: (newPrompt: string) => void;
  getConversationContext?: () => string[];
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  expandedTextareaRef: React.RefObject<HTMLTextAreaElement>;
}

export function usePromptEnhancement({
  prompt,
  selectedModel,
  isExpanded,
  onPromptChange,
  getConversationContext,
  textareaRef,
  expandedTextareaRef,
}: UsePromptEnhancementOptions) {
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Handle enhance prompt using Claude Code SDK
  const handleEnhancePrompt = async () => {
    console.log('[handleEnhancePrompt] Started, current prompt:', prompt);
    const trimmedPrompt = prompt.trim();
    
    if (!trimmedPrompt) {
      console.log('[handleEnhancePrompt] Empty prompt, setting default message');
      onPromptChange("请描述您想要完成的任务，我会帮您优化这个提示词");
      return;
    }
    
    // Get conversation context if available
    const context = getConversationContext ? getConversationContext() : undefined;
    console.log('[handleEnhancePrompt] Got context with', context?.length || 0, 'messages');
    
    console.log('[handleEnhancePrompt] Enhancing with Claude Code SDK, model:', selectedModel);
    setIsEnhancing(true);
    
    try {
      // Call Claude Code SDK to enhance the prompt with context
      const result = await api.enhancePrompt(trimmedPrompt, selectedModel, context);
      console.log('[handleEnhancePrompt] Enhancement result:', result);
      
      if (result && result.trim()) {
        onPromptChange(result.trim());
        
        // Focus the textarea
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        target?.focus();
      } else {
        onPromptChange(trimmedPrompt + '\n\n⚠️ 增强功能返回空结果，请重试');
      }
    } catch (error) {
      console.error('[handleEnhancePrompt] Failed to enhance prompt:', error);
      let errorMessage = '未知错误';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
      }
      
      console.log('[handleEnhancePrompt] Error message to display:', errorMessage);
      onPromptChange(trimmedPrompt + `\n\n❌ ${errorMessage}`);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Handle enhance prompt using Gemini CLI
  const handleEnhancePromptWithGemini = async () => {
    console.log('[handleEnhancePromptWithGemini] Starting Gemini enhancement...');
    const trimmedPrompt = prompt.trim();
    
    if (!trimmedPrompt) {
      onPromptChange("请描述您想要完成的任务，我会帮您优化这个提示词");
      return;
    }
    
    const context = getConversationContext ? getConversationContext() : undefined;
    setIsEnhancing(true);
    
    try {
      const result = await api.enhancePromptWithGemini(trimmedPrompt, context);
      
      if (result && result.trim()) {
        onPromptChange(result.trim());
        
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        target?.focus();
      } else {
        onPromptChange(trimmedPrompt + '\n\n⚠️ Gemini优化功能返回空结果，请重试');
      }
    } catch (error) {
      console.error('[handleEnhancePromptWithGemini] Failed:', error);
      let errorMessage = '未知错误';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      onPromptChange(trimmedPrompt + '\n\n❌ Gemini: ' + errorMessage);
    } finally {
      setIsEnhancing(false);
    }
  };

  // ⚡ 新增：使用第三方API优化提示词
  const handleEnhancePromptWithAPI = async (providerId: string) => {
    console.log('[handleEnhancePromptWithAPI] Starting with provider:', providerId);
    const trimmedPrompt = prompt.trim();
    
    if (!trimmedPrompt) {
      onPromptChange("请描述您想要完成的任务");
      return;
    }
    
    // 获取提供商配置
    const provider = getProvider(providerId);
    if (!provider) {
      onPromptChange(trimmedPrompt + '\n\n❌ 提供商配置未找到');
      return;
    }
    
    if (!provider.enabled) {
      onPromptChange(trimmedPrompt + '\n\n❌ 提供商已禁用，请在设置中启用');
      return;
    }
    
    const context = getConversationContext ? getConversationContext() : undefined;
    setIsEnhancing(true);
    
    try {
      const result = await callEnhancementAPI(provider, trimmedPrompt, context);
      
      if (result && result.trim()) {
        onPromptChange(result.trim());
        
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        target?.focus();
      } else {
        onPromptChange(trimmedPrompt + '\n\n⚠️ API返回空结果，请重试');
      }
    } catch (error) {
      console.error('[handleEnhancePromptWithAPI] Failed:', error);
      let errorMessage = '未知错误';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      onPromptChange(trimmedPrompt + `\n\n❌ ${provider.name}: ${errorMessage}`);
    } finally {
      setIsEnhancing(false);
    }
  };

  return {
    isEnhancing,
    handleEnhancePrompt,
    handleEnhancePromptWithGemini,
    handleEnhancePromptWithAPI,
  };
}
