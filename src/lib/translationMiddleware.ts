import { api, type TranslationConfig } from './api';

/**
 * 翻译中间件 - 提供透明的中英文翻译功能
 * 
 * 核心功能：
 * 1. 中文输入自动翻译为英文发送给Claude API
 * 2. Claude英文响应自动翻译为中文显示给用户
 * 3. 对用户完全透明
 */
export class TranslationMiddleware {
  private config: TranslationConfig | null = null;
  private initialized = false;

  constructor() {
    this.init();
  }

  /**
   * 初始化翻译中间件
   */
  private async init(): Promise<void> {
    try {
      this.config = await api.getTranslationConfig();
      this.initialized = true;
      console.log('[TranslationMiddleware] Initialized with config:', this.config);
    } catch (error) {
      console.error('[TranslationMiddleware] Failed to initialize:', error);
      this.config = {
        enabled: false,
        api_base_url: "https://api.siliconflow.cn/v1",
        api_key: "sk-ednywbvnfwerfcxnqjkmnhxvgcqoyuhmjvfywrshpxsgjbzm",
        model: "tencent/Hunyuan-MT-7B",
        timeout_seconds: 30,
        cache_ttl_seconds: 3600,
      };
      this.initialized = true;
    }
  }

  /**
   * 确保中间件已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * 检查翻译功能是否启用
   */
  public async isEnabled(): Promise<boolean> {
    await this.ensureInitialized();
    return this.config?.enabled ?? false;
  }

  /**
   * 检测文本语言
   */
  public async detectLanguage(text: string): Promise<string> {
    try {
      return await api.detectTextLanguage(text);
    } catch (error) {
      console.error('[TranslationMiddleware] Language detection failed:', error);
      // 简单的中英文检测回退
      const chineseChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
      return chineseChars && chineseChars.length > text.length * 0.3 ? 'zh' : 'en';
    }
  }

  /**
   * 检测是否为斜杠命令
   * 
   * @param text 输入文本
   * @returns 是否为斜杠命令
   */
  private isSlashCommand(text: string): boolean {
    const trimmedText = text.trim();
    
    // 检查是否以斜杠开头
    if (!trimmedText.startsWith('/')) {
      return false;
    }
    
    // 排除双斜杠注释（如 // 注释）
    if (trimmedText.startsWith('//')) {
      return false;
    }
    
    // 排除直接的URL（整个字符串是URL）
    if (trimmedText.match(/^https?:\/\/|^ftp:\/\/|^file:\/\/|^\/\//)) {
      return false;
    }
    
    return true;
  }

  /**
   * 翻译用户输入（中文->英文）
   *
   * 在发送给Claude API之前调用此方法
   * 如果输入是中文，则翻译为英文
   * 如果输入已经是英文或翻译功能未启用，则直接返回原文
   *
   * 特殊处理：
   * - 跳过斜杠命令（以 / 开头的命令）的翻译，保持原样传递
   * - 增强了斜杠命令检测的鲁棒性，避免误判URL等情况
   *
   * @param userInput 用户输入的原始文本
   * @returns 处理后的文本（翻译后的英文或原始文本）
   */
  public async translateUserInput(userInput: string): Promise<{
    translatedText: string;
    originalText: string;
    wasTranslated: boolean;
    detectedLanguage: string;
  }> {
    await this.ensureInitialized();

    // 检查是否为斜杠命令 - 如果是，直接返回原文不翻译
    if (this.isSlashCommand(userInput)) {
      const trimmedInput = userInput.trim();
      const commandPreview = trimmedInput.split('\n')[0];
      console.log('[TranslationMiddleware] ✅ Detected slash command, skipping translation:', {
        command: commandPreview,
        originalLength: userInput.length,
        trimmedLength: trimmedInput.length
      });
      
      // 对于斜杠命令，我们仍然检测语言，但不进行翻译
      const detectedLang = await this.detectLanguage(userInput);
      return {
        translatedText: userInput,
        originalText: userInput,
        wasTranslated: false,
        detectedLanguage: detectedLang,
      };
    }

    // 检查翻译功能是否启用
    if (!this.config?.enabled) {
      const detectedLang = await this.detectLanguage(userInput);
      return {
        translatedText: userInput,
        originalText: userInput,
        wasTranslated: false,
        detectedLanguage: detectedLang,
      };
    }

    try {
      // 检测语言
      const detectedLanguage = await this.detectLanguage(userInput);
      console.log('[TranslationMiddleware] Detected input language:', detectedLanguage);

      // 如果是中文，翻译为英文
      if (detectedLanguage === 'zh') {
        console.log('[TranslationMiddleware] Translating Chinese input to English...');
        const translatedText = await api.translateText(userInput, 'en');
        
        console.log('[TranslationMiddleware] Input translation complete:', {
          original: userInput,
          translated: translatedText,
        });

        return {
          translatedText,
          originalText: userInput,
          wasTranslated: true,
          detectedLanguage,
        };
      }

      // 如果已经是英文或其他语言，直接返回
      return {
        translatedText: userInput,
        originalText: userInput,
        wasTranslated: false,
        detectedLanguage,
      };
    } catch (error) {
      console.error('[TranslationMiddleware] Failed to translate user input:', error);
      // 降级策略：翻译失败时返回原文
      const detectedLang = await this.detectLanguage(userInput);
      return {
        translatedText: userInput,
        originalText: userInput,
        wasTranslated: false,
        detectedLanguage: detectedLang,
      };
    }
  }

  /**
   * 翻译Claude响应（英文->中文）
   * 
   * 在显示Claude响应给用户之前调用此方法
   * 如果响应是英文且用户原始输入是中文，则翻译为中文
   * 如果翻译功能未启用或用户输入本来就是英文，则直接返回原文
   * 
   * @param claudeResponse Claude API返回的响应文本
   * @param userInputWasChinese 用户原始输入是否为中文（用于决定是否需要翻译响应）
   * @returns 处理后的响应文本（翻译后的中文或原始文本）
   */
  public async translateClaudeResponse(
    claudeResponse: string,
    userInputWasChinese: boolean = false
  ): Promise<{
    translatedText: string;
    originalText: string;
    wasTranslated: boolean;
    detectedLanguage: string;
  }> {
    await this.ensureInitialized();

    // 检查翻译功能是否启用
    if (!this.config?.enabled) {
      const detectedLang = await this.detectLanguage(claudeResponse);
      return {
        translatedText: claudeResponse,
        originalText: claudeResponse,
        wasTranslated: false,
        detectedLanguage: detectedLang,
      };
    }

    try {
      // 检测响应语言
      const detectedLanguage = await this.detectLanguage(claudeResponse);
      console.log('[TranslationMiddleware] Detected response language:', detectedLanguage);

      // 只有当响应是英文且用户原始输入是中文时，才翻译响应
      if (detectedLanguage === 'en' && userInputWasChinese) {
        console.log('[TranslationMiddleware] Translating English response to Chinese...');
        const translatedText = await api.translateText(claudeResponse, 'zh');
        
        console.log('[TranslationMiddleware] Response translation complete:', {
          original: claudeResponse.substring(0, 100) + '...',
          translated: translatedText.substring(0, 100) + '...',
        });

        return {
          translatedText,
          originalText: claudeResponse,
          wasTranslated: true,
          detectedLanguage,
        };
      }

      // 其他情况直接返回原文
      return {
        translatedText: claudeResponse,
        originalText: claudeResponse,
        wasTranslated: false,
        detectedLanguage,
      };
    } catch (error) {
      console.error('[TranslationMiddleware] Failed to translate Claude response:', error);
      // 降级策略：翻译失败时返回原文
      const detectedLang = await this.detectLanguage(claudeResponse);
      return {
        translatedText: claudeResponse,
        originalText: claudeResponse,
        wasTranslated: false,
        detectedLanguage: detectedLang,
      };
    }
  }

  /**
   * 批量翻译文本（用于处理多条消息）
   */
  public async translateBatch(
    texts: string[],
    targetLanguage?: string
  ): Promise<string[]> {
    await this.ensureInitialized();

    if (!this.config?.enabled) {
      return texts;
    }

    try {
      return await api.translateBatch(texts, targetLanguage);
    } catch (error) {
      console.error('[TranslationMiddleware] Batch translation failed:', error);
      return texts; // 降级策略：返回原文
    }
  }

  /**
   * 更新翻译配置
   */
  public async updateConfig(config: TranslationConfig): Promise<void> {
    try {
      await api.updateTranslationConfig(config);
      this.config = config;
      console.log('[TranslationMiddleware] Configuration updated:', config);
    } catch (error) {
      console.error('[TranslationMiddleware] Failed to update configuration:', error);
      throw error;
    }
  }

  /**
   * 获取当前配置
   */
  public async getConfig(): Promise<TranslationConfig> {
    await this.ensureInitialized();
    return this.config!;
  }

  /**
   * 启用/禁用翻译功能
   */
  public async setEnabled(enabled: boolean): Promise<void> {
    await this.ensureInitialized();
    if (this.config) {
      this.config.enabled = enabled;
      await this.updateConfig(this.config);
    }
  }

  /**
   * 清空翻译缓存
   */
  public async clearCache(): Promise<void> {
    try {
      await api.clearTranslationCache();
      console.log('[TranslationMiddleware] Cache cleared');
    } catch (error) {
      console.error('[TranslationMiddleware] Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * 获取缓存统计信息
   */
  public async getCacheStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    activeEntries: number;
  }> {
    try {
      const stats = await api.getTranslationCacheStats();
      return {
        totalEntries: stats.total_entries,
        expiredEntries: stats.expired_entries,
        activeEntries: stats.active_entries,
      };
    } catch (error) {
      console.error('[TranslationMiddleware] Failed to get cache stats:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const translationMiddleware = new TranslationMiddleware();

/**
 * 工具函数：检测是否为斜杠命令
 * 可以在其他组件中使用，确保检测逻辑的一致性
 * 
 * @param text 输入文本
 * @returns 是否为斜杠命令
 */
export function isSlashCommand(text: string): boolean {
  const trimmedText = text.trim();
  
  // 检查是否以斜杠开头
  if (!trimmedText.startsWith('/')) {
    return false;
  }
  
  // 排除双斜杠注释（如 // 注释）
  if (trimmedText.startsWith('//')) {
    return false;
  }
  
  // 排除直接的URL（整个字符串是URL）
  if (trimmedText.match(/^https?:\/\/|^ftp:\/\/|^file:\/\/|^\/\//)) {
    return false;
  }
  
  return true;
}

/**
 * 翻译结果接口
 */
export interface TranslationResult {
  translatedText: string;
  originalText: string;
  wasTranslated: boolean;
  detectedLanguage: string;
}

/**
 * 翻译中间件状态接口
 */
export interface TranslationStatus {
  enabled: boolean;
  cacheEntries: number;
  lastError?: string;
}
