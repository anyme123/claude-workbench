/**
 * 提示词优化服务
 * 支持多个第三方API提供商（OpenAI、Deepseek、通义千问等）
 *
 * ⚡ 使用 Tauri HTTP 客户端绕过 CORS 限制
 */

import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export interface PromptEnhancementProvider {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
  apiFormat?: 'openai' | 'gemini' | 'anthropic';  // ⚡ API 格式类型（支持 OpenAI、Gemini、Anthropic）
}

export interface PromptEnhancementConfig {
  providers: PromptEnhancementProvider[];
  lastUsedProviderId?: string;
}

const STORAGE_KEY = 'prompt_enhancement_providers';
const ENCRYPTION_KEY = 'prompt_enhancement_encryption_salt';

/**
 * URL 智能识别与规范化工具
 */

// 已知的 Gemini API 域名
const GEMINI_DOMAINS = [
  'generativelanguage.googleapis.com',
  'aiplatform.googleapis.com',
];

// 已知的 Anthropic API 域名
const ANTHROPIC_DOMAINS = [
  'api.anthropic.com',
  'anthropic.com',
];

/**
 * 根据 URL 自动检测 API 格式
 * @param apiUrl API 地址
 * @returns 检测到的 API 格式
 */
export function detectApiFormat(apiUrl: string): 'openai' | 'gemini' | 'anthropic' {
  const url = apiUrl.toLowerCase().trim();

  // 检测是否为 Gemini API
  for (const domain of GEMINI_DOMAINS) {
    if (url.includes(domain)) {
      return 'gemini';
    }
  }

  // 检测是否为 Anthropic API
  for (const domain of ANTHROPIC_DOMAINS) {
    if (url.includes(domain)) {
      return 'anthropic';
    }
  }

  // 检测 URL 路径中是否包含 /messages（Anthropic 特征）
  if (url.includes('/v1/messages')) {
    return 'anthropic';
  }

  // 默认使用 OpenAI 格式（最通用的兼容格式）
  return 'openai';
}

/**
 * 规范化 OpenAI 格式的 API URL
 * 支持用户输入简化的基础 URL，自动补全端点路径
 *
 * @param baseUrl 用户输入的基础 URL
 * @returns 规范化后的完整 API URL（不含 /chat/completions，因为会在调用时添加）
 */
export function normalizeOpenAIUrl(baseUrl: string): string {
  let url = baseUrl.trim();

  // 移除末尾斜杠
  while (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  // 如果已经包含 /chat/completions，移除它（因为调用时会添加）
  if (url.endsWith('/chat/completions')) {
    url = url.slice(0, -'/chat/completions'.length);
  }

  // 如果不包含 /v1，添加它
  if (!url.endsWith('/v1')) {
    // 检查是否包含其他版本路径如 /v2，如果有则不添加
    if (!url.match(/\/v\d+$/)) {
      url = `${url}/v1`;
    }
  }

  return url;
}

/**
 * 规范化 Gemini 格式的 API URL
 *
 * @param baseUrl 用户输入的基础 URL
 * @returns 规范化后的基础 URL
 */
export function normalizeGeminiUrl(baseUrl: string): string {
  let url = baseUrl.trim();

  // 移除末尾斜杠
  while (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  return url;
}

/**
 * 规范化 Anthropic 格式的 API URL
 * 支持用户输入简化的基础 URL，自动补全端点路径
 *
 * @param baseUrl 用户输入的基础 URL
 * @returns 规范化后的完整 API URL（不含 /messages，因为会在调用时添加）
 */
export function normalizeAnthropicUrl(baseUrl: string): string {
  let url = baseUrl.trim();

  // 移除末尾斜杠
  while (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  // 如果已经包含 /messages，移除它（因为调用时会添加）
  if (url.endsWith('/messages')) {
    url = url.slice(0, -'/messages'.length);
  }

  // 如果不包含 /v1，添加它
  if (!url.endsWith('/v1')) {
    // 检查是否包含其他版本路径如 /v2，如果有则不添加
    if (!url.match(/\/v\d+$/)) {
      url = `${url}/v1`;
    }
  }

  return url;
}

/**
 * 根据 API 格式规范化 URL
 */
export function normalizeApiUrl(apiUrl: string, apiFormat?: 'openai' | 'gemini' | 'anthropic'): string {
  const format = apiFormat || detectApiFormat(apiUrl);

  if (format === 'gemini') {
    return normalizeGeminiUrl(apiUrl);
  } else if (format === 'anthropic') {
    return normalizeAnthropicUrl(apiUrl);
  } else {
    return normalizeOpenAIUrl(apiUrl);
  }
}

/**
 * 预设提供商模板
 */
export const PRESET_PROVIDERS = {
  openai: {
    name: 'OpenAI GPT-4',
    apiUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiFormat: 'openai' as const,
    // ⚡ 不设置 temperature 和 maxTokens，让API使用默认值
  },
  deepseek: {
    name: 'Deepseek Chat',
    apiUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiFormat: 'openai' as const,
  },
  qwen: {
    name: '通义千问 Max',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    apiFormat: 'openai' as const,
  },
  siliconflow: {
    name: 'SiliconFlow Qwen',
    apiUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-72B-Instruct',
    apiFormat: 'openai' as const,
  },
  gemini: {
    name: 'Google Gemini 2.0',
    apiUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.0-flash-exp',
    apiFormat: 'gemini' as const,
  },
  anthropic: {
    name: 'Anthropic Claude',
    apiUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
    apiFormat: 'anthropic' as const,
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
  // ⚡ 只包含必需字段，可选参数由用户决定是否添加
  const requestBody: any = {
    model: provider.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: false  // 🔧 明确禁用流式响应
  };

  // 只在用户设置时才添加可选参数
  if (provider.temperature !== undefined && provider.temperature !== null) {
    requestBody.temperature = provider.temperature;
  }
  if (provider.maxTokens !== undefined && provider.maxTokens !== null) {
    requestBody.max_tokens = provider.maxTokens;
  }

  // ⚡ 智能规范化 API URL（支持用户输入简化的基础 URL）
  const normalizedUrl = normalizeOpenAIUrl(provider.apiUrl);
  const fullEndpoint = `${normalizedUrl}/chat/completions`;

  console.log('[PromptEnhancement] OpenAI URL normalized:', provider.apiUrl, '->', fullEndpoint);

  // ⚡ 使用 Tauri HTTP 客户端绕过 CORS 限制
  const response = await tauriFetch(fullEndpoint, {
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

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    throw new Error(`Failed to parse API response: ${parseError}`);
  }

  // 检查响应数据完整性
  if (!data.choices || data.choices.length === 0) {
    if (data.error) {
      throw new Error(`API error: ${JSON.stringify(data.error)}`);
    }
    throw new Error(`API returned no choices`);
  }

  const choice = data.choices[0];
  if (!choice.message) {
    throw new Error(`Choice has no message`);
  }

  const content = choice.message.content;
  if (!content || content.trim() === '') {
    if (choice.finish_reason) {
      throw new Error(`Content is empty. Finish reason: ${choice.finish_reason}`);
    }
    throw new Error('API returned empty content');
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
  const requestBody: any = {
    contents: [
      {
        parts: [
          { text: systemPrompt + '\n\n' + userPrompt }
        ]
      }
    ],
  };
  
  // ⚡ 只在用户设置时才添加可选参数
  const generationConfig: any = {};
  if (provider.temperature !== undefined && provider.temperature !== null) {
    generationConfig.temperature = provider.temperature;
  }
  if (provider.maxTokens !== undefined && provider.maxTokens !== null) {
    generationConfig.maxOutputTokens = provider.maxTokens;
  }
  
  // 只在有配置时才添加 generationConfig
  if (Object.keys(generationConfig).length > 0) {
    requestBody.generationConfig = generationConfig;
  }

  // ⚡ 修复：处理 apiUrl 末尾可能有的斜杠，避免双斜杠
  const baseUrl = provider.apiUrl.endsWith('/') ? provider.apiUrl.slice(0, -1) : provider.apiUrl;

  // Gemini API 格式：/v1beta/models/{model}:generateContent
  const endpoint = `${baseUrl}/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;

  // ⚡ 使用 Tauri HTTP 客户端绕过 CORS 限制
  const response = await tauriFetch(endpoint, {
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
 * 调用 Anthropic 格式的API（/v1/messages）
 */
async function callAnthropicFormat(
  provider: PromptEnhancementProvider,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  // Anthropic API 请求格式
  const requestBody: any = {
    model: provider.model,
    max_tokens: provider.maxTokens || 4096,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt }
    ],
  };

  // 只在用户设置时才添加可选参数
  if (provider.temperature !== undefined && provider.temperature !== null) {
    requestBody.temperature = provider.temperature;
  }

  // ⚡ 智能规范化 API URL（支持用户输入简化的基础 URL）
  const normalizedUrl = normalizeAnthropicUrl(provider.apiUrl);
  const fullEndpoint = `${normalizedUrl}/messages`;

  console.log('[PromptEnhancement] Anthropic URL normalized:', provider.apiUrl, '->', fullEndpoint);

  // ⚡ 使用 Tauri HTTP 客户端绕过 CORS 限制
  const response = await tauriFetch(fullEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    throw new Error(`Failed to parse Anthropic API response: ${parseError}`);
  }

  // 检查响应数据完整性
  if (!data.content || data.content.length === 0) {
    if (data.error) {
      throw new Error(`Anthropic API error: ${JSON.stringify(data.error)}`);
    }
    throw new Error(`Anthropic API returned no content`);
  }

  // Anthropic 返回格式: { content: [{ type: 'text', text: '...' }] }
  const textContent = data.content.find((c: any) => c.type === 'text');
  if (!textContent || !textContent.text) {
    throw new Error('Anthropic API returned empty text content');
  }

  return textContent.text.trim();
}

/**
 * 调用提示词优化API（支持多种格式）
 */
export async function callEnhancementAPI(
  provider: PromptEnhancementProvider,
  prompt: string,
  context?: string[]
): Promise<string> {
  const systemPrompt = `你是一个专业的提示词优化助手，专门为 Claude Code 编程助手优化用户的提示词。

【优化目标】
1. 保持用户的原始意图和所有具体信息不变
2. 使提示词更清晰、更可执行、更结构化
3. 基于对话上下文补充必要的技术细节
4. 使用准确的技术术语，避免歧义

【优化原则】
- ✅ 保持技术性和实用性
- ✅ 只优化表达方式，不改变核心需求
- ✅ 如果用户的意图已经很明确，只需微调即可
- ✅ 必须完整保留所有文件路径（C:\\Users\\...、/home/...、~/...）原样不变
- ✅ 必须保留所有项目引用和对比目标及其路径信息
- ✅ 必须保留具体技术细节：URL、路径、版本号、文件名等
- ❌ 不要添加角色扮演（如"请你扮演..."）
- ❌ 不要添加过多的礼貌用语或客套话
- ❌ 不要改变用户的问题类型（如把技术问题改成分析报告）
- ❌ 不要添加用户没有要求的额外任务
- ❌ 不要删除或抽象化具体的路径、URL 或技术标识符

${context && context.length > 0 ? `\n【当前对话上下文】\n${context.join('\n')}\n` : ''}

【关键：信息保留规则】
当用户提供以下信息时，必须原样保留：
- 文件路径（如"路径为C:\\Users\\Admin\\project"）→ 必须保留 "C:\\Users\\Admin\\project"
- 项目引用（如"对比XX项目"）→ 必须保留项目名称和路径
- URL（如 https://...）→ 必须保持不变
- 版本号、配置值 → 必须保持不变

【示例】
❌ 错误示例：
  输入："优化登录功能 对比某某项目，路径为C:\\code\\app"
  输出："优化登录功能，参考其他项目的实现"  ← 路径信息丢失！

✅ 正确示例：
  输入："优化登录功能 对比某某项目，路径为C:\\code\\app"
  输出："优化当前项目的登录功能，参考 C:\\code\\app 项目的登录实现方式，对比两者的认证流程和安全措施，提供改进建议"

【输出要求】
直接返回优化后的提示词，不要添加任何解释、评论或元信息。`;

  const userPrompt = `请优化以下提示词：\n\n${prompt}`;

  // ⚡ 智能检测 API 格式：优先使用用户指定的格式，否则自动检测
  const effectiveFormat = provider.apiFormat || detectApiFormat(provider.apiUrl);

  console.log('[PromptEnhancement] Calling API:', provider.name, 'format:', effectiveFormat, '(user specified:', provider.apiFormat || 'auto-detect', ')');

  try {
    // 根据API格式调用不同的函数
    if (effectiveFormat === 'gemini') {
      return await callGeminiFormat(provider, systemPrompt, userPrompt);
    } else if (effectiveFormat === 'anthropic') {
      return await callAnthropicFormat(provider, systemPrompt, userPrompt);
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

