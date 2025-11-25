/**
 * 提示词上下文配置服务
 * 管理提示词优化时的上下文提取配置
 */

export interface PromptContextConfig {
  /**
   * 提取的最大消息数量
   * @default 15
   */
  maxMessages: number;
  
  /**
   * 助手消息的最大字符长度（超过会被截断）
   * @default 2000
   */
  maxAssistantMessageLength: number;
  
  /**
   * 用户消息的最大字符长度（超过会被截断）
   * @default 1000
   */
  maxUserMessageLength: number;
  
  /**
   * 是否包含执行结果
   * @default true
   */
  includeExecutionResults: boolean;
  
  /**
   * 执行结果的最大字符长度
   * @default 500
   */
  maxExecutionResultLength: number;
}

const STORAGE_KEY = 'prompt_context_config';

/**
 * 默认配置
 *
 * maxMessages 说明：
 * - 这是用户+助手的混合消息数量（不是纯用户消息）
 * - 8 条 ≈ 4 轮对话，通常足以覆盖当前任务的上下文
 * - 超过此阈值会触发 AI 智能筛选，而非简单截取
 */
export const DEFAULT_CONTEXT_CONFIG: PromptContextConfig = {
  maxMessages: 8,  // 降低阈值：更早触发 AI 筛选，提高上下文质量
  maxAssistantMessageLength: 2000,
  maxUserMessageLength: 1000,
  includeExecutionResults: true,
  maxExecutionResultLength: 500,
};

/**
 * 预设配置模板
 *
 * 阈值参考：
 * - minimal: 4 条 ≈ 2 轮对话（快速任务）
 * - balanced: 8 条 ≈ 4 轮对话（日常使用）
 * - detailed: 16 条 ≈ 8 轮对话（复杂任务）
 */
export const CONTEXT_PRESETS = {
  minimal: {
    name: '精简模式',
    description: '最少上下文，适合简单任务（2轮对话）',
    config: {
      maxMessages: 4,  // 2 轮对话
      maxAssistantMessageLength: 500,
      maxUserMessageLength: 500,
      includeExecutionResults: false,
      maxExecutionResultLength: 0,
    } as PromptContextConfig,
  },
  balanced: {
    name: '平衡模式',
    description: '默认配置，适合大多数场景（4轮对话）',
    config: DEFAULT_CONTEXT_CONFIG,
  },
  detailed: {
    name: '详细模式',
    description: '完整上下文，适合复杂任务（8轮对话）',
    config: {
      maxMessages: 16,  // 8 轮对话
      maxAssistantMessageLength: 5000,
      maxUserMessageLength: 2000,
      includeExecutionResults: true,
      maxExecutionResultLength: 1000,
    } as PromptContextConfig,
  },
};

/**
 * 加载配置
 */
export function loadContextConfig(): PromptContextConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_CONTEXT_CONFIG;
    }
    
    const config = JSON.parse(stored) as PromptContextConfig;
    // 合并默认值，确保新增字段有默认值
    return {
      ...DEFAULT_CONTEXT_CONFIG,
      ...config,
    };
  } catch (error) {
    console.error('[PromptContextConfig] Failed to load config:', error);
    return DEFAULT_CONTEXT_CONFIG;
  }
}

/**
 * 保存配置
 */
export function saveContextConfig(config: PromptContextConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('[PromptContextConfig] Failed to save config:', error);
  }
}

/**
 * 重置为默认配置
 */
export function resetContextConfig(): void {
  saveContextConfig(DEFAULT_CONTEXT_CONFIG);
}

/**
 * 应用预设配置
 */
export function applyPreset(presetKey: keyof typeof CONTEXT_PRESETS): void {
  const preset = CONTEXT_PRESETS[presetKey];
  if (preset) {
    saveContextConfig(preset.config);
  }
}

