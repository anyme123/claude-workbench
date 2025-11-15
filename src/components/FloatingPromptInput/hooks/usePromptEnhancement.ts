import { useState } from "react";
import { api } from "@/lib/api";
import { callEnhancementAPI, getProvider } from "@/lib/promptEnhancementService";

export interface UsePromptEnhancementOptions {
  prompt: string;
  isExpanded: boolean;
  onPromptChange: (newPrompt: string) => void;
  getConversationContext?: () => string[];
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  expandedTextareaRef: React.RefObject<HTMLTextAreaElement>;
  projectPath?: string;
  sessionId?: string;      // 🆕 会话 ID（用于历史上下文）
  projectId?: string;      // 🆕 项目 ID（用于历史上下文）
  enableProjectContext: boolean;
  enableMultiRound?: boolean; // 🆕 启用多轮搜索
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
  isExpanded,
  onPromptChange,
  getConversationContext,
  textareaRef,
  expandedTextareaRef,
  projectPath,
  sessionId,      // 🆕
  projectId,      // 🆕
  enableProjectContext,
  enableMultiRound = true, // 🆕 默认启用多轮搜索
}: UsePromptEnhancementOptions) {
  const [isEnhancing, setIsEnhancing] = useState(false);

  /**
   * 获取项目上下文（如果启用）
   * 🆕 v2: 支持历史上下文感知和多轮搜索
   */
  const getProjectContext = async (): Promise<string | null> => {
    if (!enableProjectContext || !projectPath) {
      return null;
    }

    try {
      console.log('[getProjectContext] Fetching project context from acemcp...');
      console.log('[getProjectContext] Has session info:', { sessionId, projectId });

      // 🆕 传递会话信息以启用历史上下文感知
      const result = await api.enhancePromptWithContext(
        prompt.trim(),
        projectPath,
        sessionId,        // 🆕 传递会话 ID
        projectId,        // 🆕 传递项目 ID
        3000,
        enableMultiRound  // 🆕 启用多轮搜索
      );

      if (result.acemcpUsed && result.contextCount > 0) {
        console.log('[getProjectContext] Found context:', result.contextCount, 'items');
        console.log('[getProjectContext] Enhanced prompt length:', result.enhancedPrompt.length);
        console.log('[getProjectContext] Enhanced prompt preview:', result.enhancedPrompt.substring(0, 500));

        // 只返回上下文部分（不包括原提示词）
        const contextMatch = result.enhancedPrompt.match(/--- 项目上下文.*?---\n([\s\S]*)/);

        if (contextMatch) {
          const extractedContext = contextMatch[0];
          console.log('[getProjectContext] Extracted context length:', extractedContext.length);
          console.log('[getProjectContext] Extracted context preview:', extractedContext.substring(0, 300));
          return extractedContext;
        } else {
          console.warn('[getProjectContext] Failed to extract context with regex');
          return null;
        }
      }

      return null;
    } catch (error) {
      console.error('[getProjectContext] Failed:', error);
      return null;
    }
  };

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

    setIsEnhancing(true);

    try {
      // 获取项目上下文（如果启用）
      const projectContext = await getProjectContext();

      // 获取对话上下文
      let context = getConversationContext ? getConversationContext() : undefined;

      // 如果有项目上下文，附加到 context 数组
      if (projectContext) {
        console.log('[handleEnhancePromptWithAPI] Adding project context to conversation context');
        context = context ? [...context, projectContext] : [projectContext];
      }

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

  return {
    isEnhancing,
    handleEnhancePromptWithAPI,
  };
}
