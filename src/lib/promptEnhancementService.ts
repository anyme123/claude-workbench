/**
 * 提示词优化服务
 * 支持多个第三方API提供商（OpenAI、Deepseek、通义千问等）
 */

export interface PromptEnhancementProvider {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
  apiFormat?: 'openai' | 'gemini';  // ⚡ 新增：API 格式类型
}

export interface PromptEnhancementConfig {
  providers: PromptEnhancementProvider[];
  lastUsedProviderId?: string;
}

const STORAGE_KEY = 'prompt_enhancement_providers';
const ENCRYPTION_KEY = 'prompt_enhancement_encryption_salt';

/**
 * 预设提供商模板
 */
export const PRESET_PROVIDERS = {
  openai: {
    name: 'OpenAI GPT-4',
    apiUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    temperature: 0.7,
    apiFormat: 'openai' as const,
  },
  deepseek: {
    name: 'Deepseek Chat',
    apiUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    temperature: 0.7,
    apiFormat: 'openai' as const,
  },
  qwen: {
    name: '通义千问 Max',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    temperature: 0.7,
    apiFormat: 'openai' as const,
  },
  siliconflow: {
    name: 'SiliconFlow Qwen',
    apiUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-72B-Instruct',
    temperature: 0.7,
    apiFormat: 'openai' as const,
  },
  gemini: {
    name: 'Google Gemini 2.0',
    apiUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.0-flash-exp',
    temperature: 0.7,
    apiFormat: 'gemini' as const,
  },
};

/**
 * 简单的XOR加密（前端基础保护，不是真正安全的加密）
 */
function simpleEncrypt(text: string, salt: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
  }
  return btoa(result);
}

function simpleDecrypt(encrypted: string, salt: string): string {
  try {
    const decoded = atob(encrypted);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
    }
    return result;
  } catch {
    return '';
  }
}

/**
 * 获取或创建加密盐
 */
function getEncryptionSalt(): string {
  let salt = localStorage.getItem(ENCRYPTION_KEY);
  if (!salt) {
    salt = Math.random().toString(36).substring(2, 15);
    localStorage.setItem(ENCRYPTION_KEY, salt);
  }
  return salt;
}

/**
 * 加载配置
 */
export function loadConfig(): PromptEnhancementConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { providers: [] };
    }
    
    const config = JSON.parse(stored) as PromptEnhancementConfig;
    const salt = getEncryptionSalt();
    
    // 解密API Key
    config.providers = config.providers.map(p => ({
      ...p,
      apiKey: simpleDecrypt(p.apiKey, salt),
    }));
    
    return config;
  } catch (error) {
    console.error('[PromptEnhancement] Failed to load config:', error);
    return { providers: [] };
  }
}

/**
 * 保存配置
 */
export function saveConfig(config: PromptEnhancementConfig): void {
  try {
    const salt = getEncryptionSalt();
    
    // 加密API Key后保存
    const encryptedConfig = {
      ...config,
      providers: config.providers.map(p => ({
        ...p,
        apiKey: simpleEncrypt(p.apiKey, salt),
      })),
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(encryptedConfig));
  } catch (error) {
    console.error('[PromptEnhancement] Failed to save config:', error);
  }
}

/**
 * 调用 OpenAI 格式的API
 */
async function callOpenAIFormat(
  provider: PromptEnhancementProvider,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const requestBody = {
    model: provider.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: provider.temperature || 0.7,
    max_tokens: provider.maxTokens || 2000,
  };

  const response = await fetch(`${provider.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('API returned empty response');
  }

  return content.trim();
}

/**
 * 调用 Gemini 格式的API
 */
async function callGeminiFormat(
  provider: PromptEnhancementProvider,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const requestBody = {
    contents: [
      {
        parts: [
          { text: systemPrompt + '\n\n' + userPrompt }
        ]
      }
    ],
    generationConfig: {
      temperature: provider.temperature || 0.7,
      maxOutputTokens: provider.maxTokens || 2000,
    }
  };

  // Gemini API 格式：/v1beta/models/{model}:generateContent
  const endpoint = `${provider.apiUrl}/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error('Gemini API returned empty response');
  }

  return content.trim();
}

/**
 * 调用提示词优化API（支持多种格式）
 */
export async function callEnhancementAPI(
  provider: PromptEnhancementProvider,
  prompt: string,
  context?: string[]
): Promise<string> {
  const systemPrompt = `你是一个专业的提示词优化助手。请优化用户的提示词，使其：
1. 更清晰、更具体
2. 包含必要的上下文信息
3. 结构化表达需求
4. 避免歧义

${context && context.length > 0 ? `\n当前对话上下文：\n${context.join('\n')}\n` : ''}

请直接返回优化后的提示词，不要添加解释。`;

  const userPrompt = `请优化以下提示词：\n\n${prompt}`;

  console.log('[PromptEnhancement] Calling API:', provider.name, provider.apiFormat || 'openai');

  try {
    // 根据API格式调用不同的函数
    if (provider.apiFormat === 'gemini') {
      return await callGeminiFormat(provider, systemPrompt, userPrompt);
    } else {
      // 默认使用 OpenAI 格式
      return await callOpenAIFormat(provider, systemPrompt, userPrompt);
    }
  } catch (error) {
    console.error('[PromptEnhancement] API call failed:', error);
    throw error;
  }
}

/**
 * 测试API连接
 */
export async function testAPIConnection(provider: PromptEnhancementProvider): Promise<{
  success: boolean;
  message: string;
  latency?: number;
}> {
  const startTime = Date.now();
  
  try {
    const testPrompt = 'Hello';
    await callEnhancementAPI(provider, testPrompt);
    
    const latency = Date.now() - startTime;
    return {
      success: true,
      message: `连接成功！延迟: ${latency}ms`,
      latency,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '连接失败',
    };
  }
}

/**
 * 获取所有启用的提供商
 */
export function getEnabledProviders(): PromptEnhancementProvider[] {
  const config = loadConfig();
  return config.providers.filter(p => p.enabled);
}

/**
 * 添加提供商
 */
export function addProvider(provider: PromptEnhancementProvider): void {
  const config = loadConfig();
  config.providers.push(provider);
  saveConfig(config);
}

/**
 * 更新提供商
 */
export function updateProvider(id: string, updates: Partial<PromptEnhancementProvider>): void {
  const config = loadConfig();
  const index = config.providers.findIndex(p => p.id === id);
  if (index >= 0) {
    config.providers[index] = { ...config.providers[index], ...updates };
    saveConfig(config);
  }
}

/**
 * 删除提供商
 */
export function deleteProvider(id: string): void {
  const config = loadConfig();
  config.providers = config.providers.filter(p => p.id !== id);
  saveConfig(config);
}

/**
 * 获取提供商
 */
export function getProvider(id: string): PromptEnhancementProvider | undefined {
  const config = loadConfig();
  return config.providers.find(p => p.id === id);
}

