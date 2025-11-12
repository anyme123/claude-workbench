/**
 * 统一Token数据提取和显示工具
 *
 * 解决Claude Workbench中token字段命名不一致的问题：
 * - 消息使用: cache_creation_tokens, cache_read_tokens
 * - 数据库使用: cache_write_tokens, cache_read_tokens
 * - API类型使用: cache_creation_tokens, cache_read_tokens
 *
 * 核心功能：
 * 1. 统一提取每条消息的实际token使用数据
 * 2. 智能字段映射和标准化
 * 3. 处理消息的双重usage字段 (message.usage 和 usage)
 * 4. 提供准确的四种token数据：输入、输出、缓存创建、缓存读取
 *
 * @author Claude Code Assistant
 * @version 1.0.0
 * @date 2025-09-26
 */

// 导入现有类型定义
import type { ClaudeStreamMessage } from '@/types/claude';
/**
 * 扩展消息类型以支持所有token字段变体
 */
export interface ExtendedClaudeStreamMessage {
  type?: string;
  message?: {
    usage?: RawTokenUsage;
    [key: string]: any;
  };
  usage?: RawTokenUsage;
  [key: string]: any;
}

/**
 * 标准化的Token使用数据接口
 */
export interface StandardizedTokenUsage {
  /** 输入token数量 */
  input_tokens: number;
  /** 输出token数量 */
  output_tokens: number;
  /** 缓存创建token数量 */
  cache_creation_tokens: number;
  /** 缓存读取token数量 */
  cache_read_tokens: number;
  /** 总token数量 */
  total_tokens: number;
}

/**
 * 原始Token使用数据接口（支持各种字段命名变体）
 *
 * 基于代码分析发现的字段变体：
 * - cache_creation_input_tokens (ConversationMetrics.tsx)
 * - cache_read_input_tokens (ConversationMetrics.tsx)
 * - cache_creation_tokens (标准API)
 * - cache_write_tokens (数据库)
 * - cache_read_tokens (标准)
 * - cache_creation (JSONL中的对象格式)
 */
export interface RawTokenUsage {
  input_tokens?: number;
  output_tokens?: number;

  // 缓存创建token的各种命名方式
  cache_creation_tokens?: number;
  cache_write_tokens?: number;
  cache_creation_input_tokens?: number; // 发现于ConversationMetrics

  // cache_creation对象格式（JSONL中的格式）
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };

  // 缓存读取token的各种命名方式
  cache_read_tokens?: number;
  cache_read_input_tokens?: number; // 发现于ConversationMetrics

  // 总token数量的不同命名方式
  total_tokens?: number;
  tokens?: number;
}

/**
 * 消息显示选项
 */
export interface TokenDisplayOptions {
  /** 是否显示详细信息 */
  showDetails?: boolean;
  /** 是否显示成本信息 */
  showCost?: boolean;
  /** 是否显示缓存效率 */
  showCacheEfficiency?: boolean;
  /** 是否使用紧凑模式 */
  compact?: boolean;
  /** 自定义格式化函数 */
  customFormatter?: (tokens: StandardizedTokenUsage) => string;
}

/**
 * Token工具提示信息
 */
export interface TokenTooltipInfo {
  /** 主要内容 */
  content: string;
  /** 详细breakdown */
  breakdown: {
    input: string;
    output: string;
    cache_creation: string;
    cache_read: string;
    total: string;
  };
  /** 效率指标 */
  efficiency?: {
    cache_hit_rate: string;
    cost_savings: string;
  };
}

/**
 * 标准化原始usage对象 (核心标准化逻辑)
 *
 * 这是所有token标准化的核心函数，处理所有字段命名变体。
 *
 * @param rawUsage - 原始usage对象
 * @returns 标准化的token使用数据
 */
export function normalizeRawUsage(rawUsage: RawTokenUsage | null | undefined): StandardizedTokenUsage {
  if (!rawUsage) {
    return {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      total_tokens: 0,
    };
  }

  // 提取基础token数据
  const input_tokens = rawUsage.input_tokens ?? 0;
  const output_tokens = rawUsage.output_tokens ?? 0;

  // 智能映射缓存创建token（处理所有发现的命名变体）
  // ⚠️ 修复：cache_creation_input_tokens 已经包含了所有缓存写入的总和，
  // 不应该再累加 cache_creation 对象中的子项，否则会导致重复计算
  let cache_creation_tokens = 0;

  // 优先级1：使用API标准字段（这些字段已经是总和）
  if (rawUsage.cache_creation_input_tokens !== undefined) {
    cache_creation_tokens = rawUsage.cache_creation_input_tokens;
  } else if (rawUsage.cache_creation_tokens !== undefined) {
    cache_creation_tokens = rawUsage.cache_creation_tokens;
  } else if (rawUsage.cache_write_tokens !== undefined) {
    cache_creation_tokens = rawUsage.cache_write_tokens;
  }
  // 优先级2：如果没有总和字段，才从cache_creation对象计算
  else if ((rawUsage as any).cache_creation) {
    const cacheCreation = (rawUsage as any).cache_creation;
    if (cacheCreation.ephemeral_5m_input_tokens) {
      cache_creation_tokens += cacheCreation.ephemeral_5m_input_tokens;
    }
    if (cacheCreation.ephemeral_1h_input_tokens) {
      cache_creation_tokens += cacheCreation.ephemeral_1h_input_tokens;
    }
  }

  // 智能映射缓存读取token（处理所有发现的命名变体）
  const cache_read_tokens =
    rawUsage.cache_read_tokens ??
    rawUsage.cache_read_input_tokens ?? 0;

  // 计算总token数量（优先使用记录值，否则计算）
  const total_tokens = rawUsage.total_tokens ?? rawUsage.tokens ??
    (input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens);

  return {
    input_tokens,
    output_tokens,
    cache_creation_tokens,
    cache_read_tokens,
    total_tokens,
  };
}

/**
 * 从ClaudeStreamMessage中提取token数据
 *
 * 智能处理多种字段命名方式和数据结构：
 * 1. 优先从 message.usage 获取数据
 * 2. 降级到顶层 usage 字段
 * 3. 映射所有发现的字段命名变体
 * 4. 安全处理null/undefined值
 * 5. 向后兼容现有代码
 * 6. 处理cache_creation对象格式
 *
 * @param message - Claude流消息对象
 * @returns 标准化的token使用数据
 */
export function extractMessageTokens(message: ClaudeStreamMessage | ExtendedClaudeStreamMessage): StandardizedTokenUsage {
  // 尝试从不同位置获取usage数据（基于代码分析的优先级）
  const primaryUsage = (message as ExtendedClaudeStreamMessage).message?.usage; // 优先级1：message.usage (主要使用)
  const secondaryUsage = message.usage; // 优先级2：顶层usage
  const rawUsage: RawTokenUsage = primaryUsage || secondaryUsage || {};

  // 委托给核心标准化函数
  return normalizeRawUsage(rawUsage);
}

/**
 * 格式化token数据为显示字符串
 *
 * @param tokens - 标准化的token使用数据
 * @param options - 显示选项
 * @returns 格式化的显示字符串
 */
export function formatMessageTokenDisplay(
  tokens: StandardizedTokenUsage,
  options: TokenDisplayOptions = {}
): string {
  const { showDetails = false, compact = false, customFormatter } = options;

  // 使用自定义格式化器
  if (customFormatter) {
    return customFormatter(tokens);
  }

  // 紧凑模式 - 仅显示总数
  if (compact) {
    return `${tokens.total_tokens.toLocaleString()}`;
  }

  // 详细模式 - 显示分解信息
  if (showDetails) {
    const parts = [];

    if (tokens.input_tokens > 0) {
      parts.push(`输入: ${tokens.input_tokens.toLocaleString()}`);
    }

    if (tokens.output_tokens > 0) {
      parts.push(`输出: ${tokens.output_tokens.toLocaleString()}`);
    }

    if (tokens.cache_creation_tokens > 0) {
      parts.push(`缓存创建: ${tokens.cache_creation_tokens.toLocaleString()}`);
    }

    if (tokens.cache_read_tokens > 0) {
      parts.push(`缓存读取: ${tokens.cache_read_tokens.toLocaleString()}`);
    }

    return parts.length > 0 ? parts.join(' | ') : '0';
  }

  // 标准模式 - 显示主要信息
  const inputOutput = `${tokens.input_tokens.toLocaleString()}→${tokens.output_tokens.toLocaleString()}`;
  const cacheInfo = tokens.cache_creation_tokens > 0 || tokens.cache_read_tokens > 0
    ? ` (缓存: ${(tokens.cache_creation_tokens + tokens.cache_read_tokens).toLocaleString()})`
    : '';

  return `${inputOutput}${cacheInfo}`;
}

/**
 * 创建token信息的详细工具提示
 *
 * @param tokens - 标准化的token使用数据
 * @param model - 模型名称（用于成本计算）
 * @returns 工具提示信息对象
 */
export function createMessageTokenTooltip(
  tokens: StandardizedTokenUsage,
  model?: string
): TokenTooltipInfo {
  // 构建详细breakdown
  const breakdown = {
    input: `输入Token: ${tokens.input_tokens.toLocaleString()}`,
    output: `输出Token: ${tokens.output_tokens.toLocaleString()}`,
    cache_creation: tokens.cache_creation_tokens > 0
      ? `缓存创建: ${tokens.cache_creation_tokens.toLocaleString()}`
      : '',
    cache_read: tokens.cache_read_tokens > 0
      ? `缓存读取: ${tokens.cache_read_tokens.toLocaleString()}`
      : '',
    total: `总计: ${tokens.total_tokens.toLocaleString()} tokens`,
  };

  // 计算缓存效率（如果有缓存数据）
  let efficiency;
  if (tokens.cache_creation_tokens > 0 || tokens.cache_read_tokens > 0) {
    const cache_total = tokens.cache_creation_tokens + tokens.cache_read_tokens;
    const cache_hit_rate = tokens.total_tokens > 0
      ? ((cache_total / tokens.total_tokens) * 100).toFixed(1)
      : '0';

    efficiency = {
      cache_hit_rate: `缓存利用率: ${cache_hit_rate}%`,
      cost_savings: model ? `模型: ${model}` : '成本节约: 计算中...'
    };
  }

  // 构建主要内容
  const content = [
    breakdown.input,
    breakdown.output,
    breakdown.cache_creation,
    breakdown.cache_read,
    '---',
    breakdown.total,
  ].filter(Boolean).join('\n');

  return {
    content,
    breakdown,
    efficiency,
  };
}

/**
 * 批量提取多条消息的token数据
 *
 * @param messages - Claude流消息数组
 * @returns 标准化的token使用数据数组
 */
export function extractBatchMessageTokens(messages: ClaudeStreamMessage[]): StandardizedTokenUsage[] {
  return messages.map(message => extractMessageTokens(message));
}

/**
 * 计算消息会话的总token使用量
 *
 * @param messages - Claude流消息数组
 * @returns 会话总计token使用数据
 */
export function calculateSessionTokenTotals(messages: ClaudeStreamMessage[]): StandardizedTokenUsage {
  const tokenData = extractBatchMessageTokens(messages);

  return tokenData.reduce((total, current) => ({
    input_tokens: total.input_tokens + current.input_tokens,
    output_tokens: total.output_tokens + current.output_tokens,
    cache_creation_tokens: total.cache_creation_tokens + current.cache_creation_tokens,
    cache_read_tokens: total.cache_read_tokens + current.cache_read_tokens,
    total_tokens: total.total_tokens + current.total_tokens,
  }), {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    total_tokens: 0,
  });
}

/**
 * 验证token数据的完整性和准确性
 *
 * @param tokens - 标准化的token使用数据
 * @returns 验证结果和警告信息
 */
export function validateTokenData(tokens: StandardizedTokenUsage): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // 检查负数
  if (tokens.input_tokens < 0) warnings.push('输入token数量为负数');
  if (tokens.output_tokens < 0) warnings.push('输出token数量为负数');
  if (tokens.cache_creation_tokens < 0) warnings.push('缓存创建token数量为负数');
  if (tokens.cache_read_tokens < 0) warnings.push('缓存读取token数量为负数');

  // 检查总数一致性
  const calculated_total = tokens.input_tokens + tokens.output_tokens +
                          tokens.cache_creation_tokens + tokens.cache_read_tokens;
  if (Math.abs(tokens.total_tokens - calculated_total) > 1) {
    warnings.push(`总token数量不一致: 记录为${tokens.total_tokens}，计算为${calculated_total}`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

// 导出主要功能
export const tokenExtractor = {
  extract: extractMessageTokens,
  format: formatMessageTokenDisplay,
  tooltip: createMessageTokenTooltip,
  batch: extractBatchMessageTokens,
  sessionTotal: calculateSessionTokenTotals,
  validate: validateTokenData,
};

// 默认导出
export default tokenExtractor;