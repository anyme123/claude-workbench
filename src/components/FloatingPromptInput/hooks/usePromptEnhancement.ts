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

/**
 * 以可撤销的方式更新 textarea 内容
 * 使用 document.execCommand 确保操作可以被 Ctrl+Z 撤销
 */
function updateTextareaWithUndo(textarea: HTMLTextAreaElement, newText: string) {
  // 保存当前焦点状态
  const hadFocus = document.activeElement === textarea;

  // 确保 textarea 获得焦点（execCommand 需要）
  if (!hadFocus) {
    textarea.focus();
  }

  // 选中全部文本
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  // 使用 execCommand 插入新文本（这会创建一个可撤销的历史记录）
  // 注意：execCommand 已被标记为废弃，但目前仍是唯一支持 undo 的方法
  const success = document.execCommand('insertText', false, newText);

  if (!success) {
    // 如果 execCommand 失败（某些浏览器可能不支持），使用备用方案
    // 虽然这不会创建 undo 历史，但至少能正常工作
    textarea.value = newText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 将光标移到末尾
  textarea.setSelectionRange(newText.length, newText.length);

  // 触发 input 事件以更新 React 状态
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  // 恢复焦点状态
  if (hadFocus) {
    textarea.focus();
  }
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
        // 使用可撤销的方式更新文本
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        if (target) {
          updateTextareaWithUndo(target, result.trim());
        }
      } else {
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        if (target) {
          updateTextareaWithUndo(target, trimmedPrompt + '\n\n⚠️ 增强功能返回空结果，请重试');
        }
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
      const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
      if (target) {
        updateTextareaWithUndo(target, trimmedPrompt + `\n\n❌ ${errorMessage}`);
      }
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
        // 使用可撤销的方式更新文本
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        if (target) {
          updateTextareaWithUndo(target, result.trim());
        }
      } else {
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        if (target) {
          updateTextareaWithUndo(target, trimmedPrompt + '\n\n⚠️ Gemini优化功能返回空结果，请重试');
        }
      }
    } catch (error) {
      console.error('[handleEnhancePromptWithGemini] Failed:', error);
      let errorMessage = '未知错误';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
      if (target) {
        updateTextareaWithUndo(target, trimmedPrompt + '\n\n❌ Gemini: ' + errorMessage);
      }
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
        // 使用可撤销的方式更新文本
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        if (target) {
          updateTextareaWithUndo(target, result.trim());
        }
      } else {
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        if (target) {
          updateTextareaWithUndo(target, trimmedPrompt + '\n\n⚠️ API返回空结果，请重试');
        }
      }
    } catch (error) {
      console.error('[handleEnhancePromptWithAPI] Failed:', error);
      let errorMessage = '未知错误';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
      if (target) {
        updateTextareaWithUndo(target, trimmedPrompt + `\n\n❌ ${provider.name}: ${errorMessage}`);
      }
    } finally {
      setIsEnhancing(false);
    }
  };

  // ⚡ 新增：使用 acemcp 添加项目上下文
  const handleEnhancePromptWithContext = async (projectPath: string) => {
    console.log('[handleEnhancePromptWithContext] Starting context enhancement...');
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      onPromptChange("请描述您想要完成的任务");
      return;
    }

    if (!projectPath) {
      onPromptChange(trimmedPrompt + '\n\n❌ 项目路径未提供');
      return;
    }

    setIsEnhancing(true);

    try {
      const result = await api.enhancePromptWithContext(trimmedPrompt, projectPath, 3000);
      console.log('[handleEnhancePromptWithContext] Result:', result);

      if (result.acemcpUsed && result.contextCount > 0) {
        // 成功找到上下文，使用增强后的提示词
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        if (target) {
          updateTextareaWithUndo(target, result.enhancedPrompt);
        }
      } else if (result.error) {
        // 有错误，显示错误信息
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        if (target) {
          updateTextareaWithUndo(target, trimmedPrompt + `\n\n⚠️ Acemcp: ${result.error}`);
        }
      } else {
        // 没有找到相关上下文
        const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
        if (target) {
          updateTextareaWithUndo(target, trimmedPrompt + '\n\n💡 未找到相关代码上下文，请确保提示词包含技术关键词');
        }
      }
    } catch (error) {
      console.error('[handleEnhancePromptWithContext] Failed:', error);
      let errorMessage = '未知错误';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
      if (target) {
        updateTextareaWithUndo(target, trimmedPrompt + `\n\n❌ Acemcp: ${errorMessage}`);
      }
    } finally {
      setIsEnhancing(false);
    }
  };

  return {
    isEnhancing,
    handleEnhancePrompt,
    handleEnhancePromptWithGemini,
    handleEnhancePromptWithAPI,
    handleEnhancePromptWithContext,
  };
}
