# Codex CLI 集成 - 详细执行计划

> **项目**: Claude Workbench - Codex Integration
> **开始日期**: 2025-11-22
> **预计完成**: 2026-02-15 (12 周)
> **当前阶段**: Phase 1 - 基础架构搭建

---

## 🎯 项目目标

将 OpenAI Codex CLI 集成到 Claude Workbench，实现：
- ✅ 统一的 AI Agent 接口
- ✅ 无缝的用户体验
- ✅ 完全向后兼容
- ✅ 高性能和稳定性

---

## 📅 整体时间线

```
Week 1-2  : Phase 1 - 基础架构搭建
Week 3-5  : Phase 2 - 后端集成
Week 6-7  : Phase 3 - 前端集成
Week 8-9  : Phase 4 - 用户体验优化
Week 10   : Phase 5 - 测试与文档
Week 11-12: Buffer & 发布准备
```

---

## 📋 Phase 1: 基础架构搭建 (Week 1-2)

### 目标
建立统一的类型系统和消息适配器层，为后续开发奠定基础。

### 任务清单

#### Task 1.1: 环境准备和原型验证 (Day 1)
**负责人**: Developer
**优先级**: 🔴 Critical

**子任务:**
- [x] 创建 Feature Branch
  ```bash
  git checkout -b feature/codex-integration
  git push -u origin feature/codex-integration
  ```

- [ ] 安装和测试 Codex CLI
  ```bash
  npm install -g @openai/codex
  codex --version
  codex --help
  ```

- [ ] 记录 Codex 消息格式
  ```bash
  # 创建测试项目
  mkdir codex-test
  cd codex-test
  echo "console.log('test')" > test.js

  # 执行并记录输出
  codex --format stream-json --prompt "add error handling" > output.jsonl
  ```

- [ ] 创建消息样本文件
  - `docs/codex-message-samples.json`
  - 记录至少 10 种不同类型的消息

**验收标准:**
- ✅ Codex CLI 可正常运行
- ✅ 消息格式完整记录
- ✅ Feature Branch 创建完成

**预计时间**: 4-6 小时

---

#### Task 1.2: 统一类型系统定义 (Day 2-3)
**负责人**: Developer
**优先级**: 🔴 Critical

**文件结构:**
```
src/types/
├── unified-agent.ts       (新建) - 统一接口定义
├── codex.ts              (新建) - Codex 类型定义
├── claude.ts             (重构) - 从 claude.ts 提取
└── index.ts              (更新) - 统一导出
```

**实现步骤:**

**Step 1: 创建 `src/types/unified-agent.ts`**
```typescript
/**
 * Unified Agent Type System
 *
 * 定义跨 CLI 的统一消息格式和接口
 */

// ==================== 基础类型 ====================

/**
 * 支持的 AI Agent 类型
 */
export type AgentType = 'claude' | 'codex';

/**
 * 统一消息类型
 */
export type UnifiedMessageType =
  | 'text'           // 普通文本消息
  | 'thinking'       // 思考过程
  | 'tool_call'      // 工具调用
  | 'tool_result'    // 工具执行结果
  | 'error'          // 错误消息
  | 'system'         // 系统消息
  | 'plan'           // 计划更新
  | 'complete';      // 完成标记

// ==================== 核心接口 ====================

/**
 * 统一的 Agent 消息格式
 */
export interface UnifiedAgentMessage {
  // 唯一标识
  id: string;

  // 消息类型
  type: UnifiedMessageType;

  // 消息内容（联合类型）
  content: MessageContent;

  // 元数据
  metadata: MessageMetadata;

  // 原始消息（用于调试）
  rawMessage?: unknown;
}

/**
 * 消息元数据
 */
export interface MessageMetadata {
  // 来源 Agent
  agent: AgentType;

  // 使用的模型
  model?: string;

  // 时间戳 (ISO 8601)
  timestamp: string;

  // Token 使用情况
  tokens?: TokenUsage;

  // 会话 ID
  sessionId?: string;

  // 自定义元数据
  custom?: Record<string, unknown>;
}

/**
 * Token 使用统计
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
}

// ==================== 消息内容类型 ====================

/**
 * 消息内容（联合类型）
 */
export type MessageContent =
  | TextContent
  | ThinkingContent
  | ToolCallContent
  | ToolResultContent
  | ErrorContent
  | SystemContent
  | PlanContent
  | CompleteContent;

/**
 * 文本内容
 */
export interface TextContent {
  type: 'text';
  text: string;
  /** 是否为流式块（用于累积） */
  isStreamChunk?: boolean;
  /** 流式消息的共享 ID（用于合并） */
  streamMessageId?: string;
}

/**
 * 思考过程内容
 */
export interface ThinkingContent {
  type: 'thinking';
  text: string;
  /** 思考阶段 */
  stage?: 'analyzing' | 'planning' | 'executing' | 'reviewing';
}

/**
 * 工具调用内容
 */
export interface ToolCallContent {
  type: 'tool_call';
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
  /** 调用状态 */
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

/**
 * 工具结果内容
 */
export interface ToolResultContent {
  type: 'tool_result';
  /** 对应的工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 执行结果 */
  result: unknown;
  /** 是否为错误 */
  isError: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 错误内容
 */
export interface ErrorContent {
  type: 'error';
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code?: string;
  /** 错误详情 */
  details?: unknown;
  /** 堆栈跟踪 */
  stack?: string;
}

/**
 * 系统内容
 */
export interface SystemContent {
  type: 'system';
  /** 系统消息 */
  message: string;
  /** 消息级别 */
  level?: 'info' | 'warning' | 'error';
}

/**
 * 计划内容
 */
export interface PlanContent {
  type: 'plan';
  /** 计划描述 */
  description: string;
  /** 计划步骤 */
  steps?: string[];
  /** 当前步骤索引 */
  currentStep?: number;
}

/**
 * 完成标记
 */
export interface CompleteContent {
  type: 'complete';
  /** 完成消息 */
  message?: string;
  /** 是否成功 */
  success: boolean;
  /** 摘要信息 */
  summary?: {
    totalTokens?: number;
    duration?: number;
    filesModified?: number;
  };
}

// ==================== 配置接口 ====================

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** Agent 类型 */
  agentType: AgentType;

  /** 项目路径 */
  projectPath: string;

  /** Prompt */
  prompt: string;

  /** 模型名称 */
  model: string;

  /** 计划模式（只读） */
  planMode?: boolean;

  /** 最大思考 tokens */
  maxThinkingTokens?: number;

  /** CLI 路径（可选，用于自定义路径） */
  cliPath?: string;

  /** 环境变量 */
  env?: Record<string, string>;

  /** 额外参数 */
  extraArgs?: string[];
}

/**
 * Agent 执行结果
 */
export interface AgentExecutionResult {
  /** 是否成功 */
  success: boolean;

  /** 消息列表 */
  messages: UnifiedAgentMessage[];

  /** 错误信息（如果失败） */
  error?: string;

  /** 执行时长（毫秒） */
  duration: number;

  /** Token 使用统计 */
  totalTokens?: TokenUsage;
}

// ==================== 适配器接口 ====================

/**
 * 消息适配器接口
 */
export interface IMessageAdapter {
  /**
   * 转换原始消息为统一格式
   * @param rawMessage 原始消息
   * @returns 统一格式的消息数组（一条原始消息可能转换为多条）
   */
  convert(rawMessage: unknown): UnifiedAgentMessage[];

  /**
   * 验证消息格式
   * @param rawMessage 原始消息
   * @returns 是否为有效消息
   */
  validate(rawMessage: unknown): boolean;

  /**
   * 获取适配器支持的 Agent 类型
   */
  getSupportedAgent(): AgentType;

  /**
   * 重置适配器状态（用于新会话）
   */
  reset?(): void;
}

// ==================== 工具函数类型 ====================

/**
 * 消息过滤器函数
 */
export type MessageFilter = (message: UnifiedAgentMessage) => boolean;

/**
 * 消息转换器函数
 */
export type MessageTransformer = (message: UnifiedAgentMessage) => UnifiedAgentMessage;

/**
 * 消息合并器函数（用于流式消息累积）
 */
export type MessageMerger = (
  existing: UnifiedAgentMessage,
  incoming: UnifiedAgentMessage
) => UnifiedAgentMessage;
```

**Step 2: 创建 `src/types/codex.ts`**
```typescript
/**
 * OpenAI Codex CLI Message Types
 *
 * 基于实际 Codex CLI 输出定义的类型
 */

// ==================== 原始消息类型 ====================

/**
 * Codex 流式消息（顶层）
 */
export interface CodexStreamMessage {
  // 消息类型
  type: CodexMessageType;

  // 消息内容（根据 type 变化）
  content?: unknown;

  // 元数据
  metadata?: CodexMetadata;

  // 时间戳
  timestamp?: string;

  // 其他字段（根据实际输出调整）
  [key: string]: unknown;
}

/**
 * Codex 消息类型枚举
 */
export type CodexMessageType =
  | 'message'        // 普通消息
  | 'thinking'       // 思考过程
  | 'tool_call'      // 工具调用
  | 'tool_result'    // 工具结果
  | 'error'          // 错误
  | 'complete'       // 完成
  | 'plan';          // 计划

/**
 * Codex 元数据
 */
export interface CodexMetadata {
  model?: string;
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
  sessionId?: string;
  [key: string]: unknown;
}

// ==================== 具体消息类型 ====================

/**
 * Codex 文本消息
 */
export interface CodexTextMessage extends CodexStreamMessage {
  type: 'message';
  content: {
    text: string;
    role?: 'assistant' | 'user' | 'system';
  };
}

/**
 * Codex 思考消息
 */
export interface CodexThinkingMessage extends CodexStreamMessage {
  type: 'thinking';
  content: {
    text: string;
    stage?: string;
  };
}

/**
 * Codex 工具调用消息
 */
export interface CodexToolCallMessage extends CodexStreamMessage {
  type: 'tool_call';
  content: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Codex 工具结果消息
 */
export interface CodexToolResultMessage extends CodexStreamMessage {
  type: 'tool_result';
  content: {
    toolCallId: string;
    result: unknown;
    isError: boolean;
    error?: string;
  };
}

/**
 * Codex 错误消息
 */
export interface CodexErrorMessage extends CodexStreamMessage {
  type: 'error';
  content: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

/**
 * Codex 完成消息
 */
export interface CodexCompleteMessage extends CodexStreamMessage {
  type: 'complete';
  content: {
    success: boolean;
    message?: string;
    summary?: {
      totalTokens?: number;
      duration?: number;
    };
  };
}

// ==================== 类型守卫 ====================

export function isCodexTextMessage(msg: CodexStreamMessage): msg is CodexTextMessage {
  return msg.type === 'message';
}

export function isCodexThinkingMessage(msg: CodexStreamMessage): msg is CodexThinkingMessage {
  return msg.type === 'thinking';
}

export function isCodexToolCallMessage(msg: CodexStreamMessage): msg is CodexToolCallMessage {
  return msg.type === 'tool_call';
}

export function isCodexToolResultMessage(msg: CodexStreamMessage): msg is CodexToolResultMessage {
  return msg.type === 'tool_result';
}

export function isCodexErrorMessage(msg: CodexStreamMessage): msg is CodexErrorMessage {
  return msg.type === 'error';
}

export function isCodexCompleteMessage(msg: CodexStreamMessage): msg is CodexCompleteMessage {
  return msg.type === 'complete';
}
```

**Step 3: 更新 `src/types/index.ts`**
```typescript
// 现有导出
export * from './claude';
export * from './navigation';

// 新增导出
export * from './unified-agent';
export * from './codex';
```

**验收标准:**
- ✅ 类型定义完整无遗漏
- ✅ TypeScript 编译无错误
- ✅ 类型文档注释完整
- ✅ 通过 `npm run type-check`

**预计时间**: 8-12 小时

---

#### Task 1.3: 实现消息适配器 (Day 4-6)
**负责人**: Developer
**优先级**: 🔴 Critical

**文件结构:**
```
src/lib/adapters/
├── MessageAdapter.ts         (新建) - 适配器接口和工厂
├── ClaudeMessageAdapter.ts   (新建) - Claude 适配器
├── CodexMessageAdapter.ts    (新建) - Codex 适配器
├── utils.ts                  (新建) - 共享工具函数
└── index.ts                  (新建) - 统一导出
```

**实现步骤:**

**Step 1: 创建工具函数 `src/lib/adapters/utils.ts`**
```typescript
import { v4 as uuidv4 } from 'uuid';
import type { UnifiedAgentMessage, MessageMetadata } from '@/types/unified-agent';

/**
 * 生成唯一 ID
 */
export function generateMessageId(): string {
  return uuidv4();
}

/**
 * 格式化时间戳为 ISO 8601
 */
export function normalizeTimestamp(timestamp?: string | number): string {
  if (!timestamp) {
    return new Date().toISOString();
  }

  if (typeof timestamp === 'number') {
    return new Date(timestamp).toISOString();
  }

  // 验证是否为有效的 ISO 8601
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

/**
 * 安全的 JSON 解析
 */
export function safeJsonParse<T = unknown>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * 提取嵌套值
 */
export function getNestedValue(obj: any, path: string): unknown {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * 验证消息结构
 */
export function validateMessageStructure(msg: unknown): msg is Record<string, unknown> {
  return typeof msg === 'object' && msg !== null;
}
```

**Step 2: 创建 Claude 适配器**
```typescript
// src/lib/adapters/ClaudeMessageAdapter.ts
import type {
  IMessageAdapter,
  UnifiedAgentMessage,
  UnifiedMessageType,
  MessageContent,
  AgentType,
  TokenUsage,
} from '@/types/unified-agent';
import type { ClaudeStreamMessage } from '@/types/claude';
import { generateMessageId, normalizeTimestamp, validateMessageStructure } from './utils';

export class ClaudeMessageAdapter implements IMessageAdapter {
  private streamMessageMap = new Map<string, string>(); // 用于跟踪流式消息的 msg_id

  convert(rawMessage: unknown): UnifiedAgentMessage[] {
    if (!this.validate(rawMessage)) {
      console.warn('[ClaudeAdapter] Invalid message structure:', rawMessage);
      return [];
    }

    const claudeMsg = rawMessage as ClaudeStreamMessage;
    const messages: UnifiedAgentMessage[] = [];

    // 根据消息类型转换
    if (claudeMsg.type === 'assistant') {
      messages.push(...this.convertAssistantMessage(claudeMsg));
    } else if (claudeMsg.type === 'user') {
      messages.push(this.convertUserMessage(claudeMsg));
    } else if (claudeMsg.type === 'system') {
      messages.push(this.convertSystemMessage(claudeMsg));
    } else if (claudeMsg.type === 'result') {
      messages.push(this.convertResultMessage(claudeMsg));
    }

    return messages;
  }

  private convertAssistantMessage(msg: ClaudeStreamMessage): UnifiedAgentMessage[] {
    const messages: UnifiedAgentMessage[] = [];
    const content = msg.message?.content;

    if (!Array.isArray(content)) {
      return messages;
    }

    for (const item of content) {
      if (item.type === 'text') {
        messages.push(this.createUnifiedMessage({
          type: 'text',
          content: {
            type: 'text',
            text: item.text || '',
            isStreamChunk: true,
            streamMessageId: msg.message?.id,
          },
          msg,
        }));
      } else if (item.type === 'tool_use') {
        messages.push(this.createUnifiedMessage({
          type: 'tool_call',
          content: {
            type: 'tool_call',
            toolCallId: item.id || generateMessageId(),
            toolName: item.name || 'unknown',
            arguments: item.input || {},
          },
          msg,
        }));
      } else if (item.type === 'tool_result') {
        messages.push(this.createUnifiedMessage({
          type: 'tool_result',
          content: {
            type: 'tool_result',
            toolCallId: item.tool_use_id || '',
            toolName: 'unknown', // Claude 不提供工具名
            result: item.content,
            isError: Boolean(item.is_error),
            error: item.is_error ? String(item.content) : undefined,
          },
          msg,
        }));
      }
    }

    return messages;
  }

  private convertUserMessage(msg: ClaudeStreamMessage): UnifiedAgentMessage {
    return this.createUnifiedMessage({
      type: 'text',
      content: {
        type: 'text',
        text: typeof msg.message === 'string' ? msg.message : JSON.stringify(msg.message),
      },
      msg,
    });
  }

  private convertSystemMessage(msg: ClaudeStreamMessage): UnifiedAgentMessage {
    return this.createUnifiedMessage({
      type: 'system',
      content: {
        type: 'system',
        message: typeof msg.message === 'string' ? msg.message : JSON.stringify(msg.message),
        level: 'info',
      },
      msg,
    });
  }

  private convertResultMessage(msg: ClaudeStreamMessage): UnifiedAgentMessage {
    const isError = Boolean((msg as any).is_error || msg.subtype?.toLowerCase().includes('error'));

    return this.createUnifiedMessage({
      type: isError ? 'error' : 'system',
      content: isError
        ? {
            type: 'error',
            message: String((msg as any).error || (msg as any).result || 'Unknown error'),
            code: (msg as any).code,
          }
        : {
            type: 'system',
            message: String((msg as any).result || ''),
            level: 'info',
          },
      msg,
    });
  }

  private createUnifiedMessage(params: {
    type: UnifiedMessageType;
    content: MessageContent;
    msg: ClaudeStreamMessage;
  }): UnifiedAgentMessage {
    return {
      id: generateMessageId(),
      type: params.type,
      content: params.content,
      metadata: {
        agent: 'claude',
        model: params.msg.model || (params.msg.message as any)?.model,
        timestamp: normalizeTimestamp(
          params.msg.timestamp ||
          (params.msg as any).receivedAt ||
          (params.msg as any).sentAt
        ),
        tokens: this.extractTokens(params.msg),
      },
      rawMessage: params.msg,
    };
  }

  private extractTokens(msg: ClaudeStreamMessage): TokenUsage | undefined {
    if (!msg.usage) {
      return undefined;
    }

    return {
      input_tokens: msg.usage.input_tokens || 0,
      output_tokens: msg.usage.output_tokens || 0,
      cache_creation_tokens: msg.usage.cache_creation_tokens || 0,
      cache_read_tokens: msg.usage.cache_read_tokens || 0,
      total_tokens:
        (msg.usage.input_tokens || 0) +
        (msg.usage.output_tokens || 0) +
        (msg.usage.cache_creation_tokens || 0) +
        (msg.usage.cache_read_tokens || 0),
    };
  }

  validate(rawMessage: unknown): boolean {
    if (!validateMessageStructure(rawMessage)) {
      return false;
    }

    const msg = rawMessage as Record<string, unknown>;
    return typeof msg.type === 'string';
  }

  getSupportedAgent(): AgentType {
    return 'claude';
  }

  reset(): void {
    this.streamMessageMap.clear();
  }
}
```

**Step 3: 创建 Codex 适配器**
```typescript
// src/lib/adapters/CodexMessageAdapter.ts
import type {
  IMessageAdapter,
  UnifiedAgentMessage,
  UnifiedMessageType,
  MessageContent,
  AgentType,
  TokenUsage,
} from '@/types/unified-agent';
import type { CodexStreamMessage } from '@/types/codex';
import { generateMessageId, normalizeTimestamp, validateMessageStructure } from './utils';

export class CodexMessageAdapter implements IMessageAdapter {
  convert(rawMessage: unknown): UnifiedAgentMessage[] {
    if (!this.validate(rawMessage)) {
      console.warn('[CodexAdapter] Invalid message structure:', rawMessage);
      return [];
    }

    const codexMsg = rawMessage as CodexStreamMessage;

    // 根据 Codex 消息类型转换
    switch (codexMsg.type) {
      case 'message':
        return [this.convertTextMessage(codexMsg)];
      case 'thinking':
        return [this.convertThinkingMessage(codexMsg)];
      case 'tool_call':
        return [this.convertToolCallMessage(codexMsg)];
      case 'tool_result':
        return [this.convertToolResultMessage(codexMsg)];
      case 'error':
        return [this.convertErrorMessage(codexMsg)];
      case 'complete':
        return [this.convertCompleteMessage(codexMsg)];
      case 'plan':
        return [this.convertPlanMessage(codexMsg)];
      default:
        console.warn('[CodexAdapter] Unknown message type:', codexMsg.type);
        return [];
    }
  }

  private convertTextMessage(msg: CodexStreamMessage): UnifiedAgentMessage {
    const content = msg.content as any;

    return this.createUnifiedMessage({
      type: 'text',
      content: {
        type: 'text',
        text: content?.text || String(content || ''),
        isStreamChunk: true,
      },
      msg,
    });
  }

  private convertThinkingMessage(msg: CodexStreamMessage): UnifiedAgentMessage {
    const content = msg.content as any;

    return this.createUnifiedMessage({
      type: 'thinking',
      content: {
        type: 'thinking',
        text: content?.text || String(content || ''),
        stage: content?.stage,
      },
      msg,
    });
  }

  private convertToolCallMessage(msg: CodexStreamMessage): UnifiedAgentMessage {
    const content = msg.content as any;

    return this.createUnifiedMessage({
      type: 'tool_call',
      content: {
        type: 'tool_call',
        toolCallId: content?.id || generateMessageId(),
        toolName: content?.name || 'unknown',
        arguments: content?.arguments || {},
      },
      msg,
    });
  }

  private convertToolResultMessage(msg: CodexStreamMessage): UnifiedAgentMessage {
    const content = msg.content as any;

    return this.createUnifiedMessage({
      type: 'tool_result',
      content: {
        type: 'tool_result',
        toolCallId: content?.toolCallId || '',
        toolName: content?.name || 'unknown',
        result: content?.result,
        isError: Boolean(content?.isError),
        error: content?.error,
      },
      msg,
    });
  }

  private convertErrorMessage(msg: CodexStreamMessage): UnifiedAgentMessage {
    const content = msg.content as any;

    return this.createUnifiedMessage({
      type: 'error',
      content: {
        type: 'error',
        message: content?.message || String(content || 'Unknown error'),
        code: content?.code,
        details: content?.details,
      },
      msg,
    });
  }

  private convertCompleteMessage(msg: CodexStreamMessage): UnifiedAgentMessage {
    const content = msg.content as any;

    return this.createUnifiedMessage({
      type: 'complete',
      content: {
        type: 'complete',
        message: content?.message,
        success: Boolean(content?.success ?? true),
        summary: content?.summary,
      },
      msg,
    });
  }

  private convertPlanMessage(msg: CodexStreamMessage): UnifiedAgentMessage {
    const content = msg.content as any;

    return this.createUnifiedMessage({
      type: 'plan',
      content: {
        type: 'plan',
        description: content?.description || String(content || ''),
        steps: content?.steps,
        currentStep: content?.currentStep,
      },
      msg,
    });
  }

  private createUnifiedMessage(params: {
    type: UnifiedMessageType;
    content: MessageContent;
    msg: CodexStreamMessage;
  }): UnifiedAgentMessage {
    return {
      id: generateMessageId(),
      type: params.type,
      content: params.content,
      metadata: {
        agent: 'codex',
        model: params.msg.metadata?.model,
        timestamp: normalizeTimestamp(params.msg.timestamp),
        tokens: this.extractTokens(params.msg),
      },
      rawMessage: params.msg,
    };
  }

  private extractTokens(msg: CodexStreamMessage): TokenUsage | undefined {
    const tokens = msg.metadata?.tokens;
    if (!tokens) {
      return undefined;
    }

    return {
      input_tokens: tokens.input || 0,
      output_tokens: tokens.output || 0,
      total_tokens: tokens.total || (tokens.input || 0) + (tokens.output || 0),
    };
  }

  validate(rawMessage: unknown): boolean {
    if (!validateMessageStructure(rawMessage)) {
      return false;
    }

    const msg = rawMessage as Record<string, unknown>;
    return typeof msg.type === 'string';
  }

  getSupportedAgent(): AgentType {
    return 'codex';
  }

  reset(): void {
    // Codex 适配器无状态
  }
}
```

**Step 4: 创建适配器工厂**
```typescript
// src/lib/adapters/MessageAdapter.ts
import type { IMessageAdapter, AgentType } from '@/types/unified-agent';
import { ClaudeMessageAdapter } from './ClaudeMessageAdapter';
import { CodexMessageAdapter } from './CodexMessageAdapter';

/**
 * 消息适配器工厂
 */
export class MessageAdapterFactory {
  private static adapters = new Map<AgentType, IMessageAdapter>([
    ['claude', new ClaudeMessageAdapter()],
    ['codex', new CodexMessageAdapter()],
  ]);

  /**
   * 获取指定 Agent 的适配器
   */
  static getAdapter(agent: AgentType): IMessageAdapter {
    const adapter = this.adapters.get(agent);
    if (!adapter) {
      throw new Error(`No adapter found for agent: ${agent}`);
    }
    return adapter;
  }

  /**
   * 注册自定义适配器
   */
  static registerAdapter(agent: AgentType, adapter: IMessageAdapter): void {
    this.adapters.set(agent, adapter);
  }

  /**
   * 重置所有适配器状态
   */
  static resetAll(): void {
    for (const adapter of this.adapters.values()) {
      adapter.reset?.();
    }
  }
}

// 便捷导出
export { ClaudeMessageAdapter } from './ClaudeMessageAdapter';
export { CodexMessageAdapter } from './CodexMessageAdapter';
export * from './utils';
```

**验收标准:**
- ✅ 适配器能正确转换消息
- ✅ 边界情况处理完善
- ✅ 类型安全无错误
- ✅ 代码注释完整

**预计时间**: 12-16 小时

---

#### Task 1.4: 单元测试 (Day 7-8)
**负责人**: Developer
**优先级**: 🟡 High

**测试文件:**
```
src/lib/adapters/__tests__/
├── ClaudeMessageAdapter.test.ts
├── CodexMessageAdapter.test.ts
├── MessageAdapter.test.ts
└── utils.test.ts
```

**测试用例示例:**
```typescript
// src/lib/adapters/__tests__/ClaudeMessageAdapter.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeMessageAdapter } from '../ClaudeMessageAdapter';
import type { ClaudeStreamMessage } from '@/types/claude';

describe('ClaudeMessageAdapter', () => {
  let adapter: ClaudeMessageAdapter;

  beforeEach(() => {
    adapter = new ClaudeMessageAdapter();
  });

  describe('convert', () => {
    it('should convert assistant text message', () => {
      const claudeMsg: ClaudeStreamMessage = {
        type: 'assistant',
        message: {
          id: 'msg_123',
          content: [
            { type: 'text', text: 'Hello world' }
          ]
        },
        usage: {
          input_tokens: 10,
          output_tokens: 20
        }
      };

      const result = adapter.convert(claudeMsg);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect(result[0].content).toMatchObject({
        type: 'text',
        text: 'Hello world'
      });
      expect(result[0].metadata.agent).toBe('claude');
      expect(result[0].metadata.tokens).toMatchObject({
        input_tokens: 10,
        output_tokens: 20
      });
    });

    it('should convert tool use message', () => {
      const claudeMsg: ClaudeStreamMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'read_file',
              input: { path: '/test.txt' }
            }
          ]
        }
      };

      const result = adapter.convert(claudeMsg);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool_call');
      expect(result[0].content).toMatchObject({
        type: 'tool_call',
        toolCallId: 'tool_123',
        toolName: 'read_file',
        arguments: { path: '/test.txt' }
      });
    });

    it('should handle invalid message gracefully', () => {
      const result = adapter.convert(null);
      expect(result).toHaveLength(0);
    });
  });

  describe('validate', () => {
    it('should validate correct message', () => {
      expect(adapter.validate({ type: 'assistant' })).toBe(true);
    });

    it('should reject invalid message', () => {
      expect(adapter.validate(null)).toBe(false);
      expect(adapter.validate({})).toBe(false);
      expect(adapter.validate('string')).toBe(false);
    });
  });

  describe('getSupportedAgent', () => {
    it('should return claude', () => {
      expect(adapter.getSupportedAgent()).toBe('claude');
    });
  });
});
```

**验收标准:**
- ✅ 测试覆盖率 > 90%
- ✅ 所有测试通过
- ✅ 边界情况覆盖完整
- ✅ `npm run test` 无错误

**预计时间**: 8-12 小时

---

### Phase 1 总结

**预计完成时间**: 10-14 天
**关键输出:**
- ✅ 统一类型系统
- ✅ 消息适配器层
- ✅ 单元测试（>90% 覆盖率）

**下一步**: Phase 2 - 后端集成

---

## 📋 Phase 2: 后端集成 (Week 3-5)

### 目标
实现 Rust 后端对 Codex CLI 的支持，建立统一的 Agent 执行接口。

### 任务清单

#### Task 2.1: 后端目录重构 (Day 9-10)
**优先级**: 🔴 Critical

**重构计划:**
```
src-tauri/src/commands/
├── agent/                    (新建目录)
│   ├── mod.rs               (统一入口)
│   ├── types.rs             (共享类型)
│   ├── config.rs            (配置管理)
│   ├── claude.rs            (Claude 实现)
│   ├── codex.rs             (Codex 实现，新建)
│   └── common.rs            (共享逻辑，新建)
└── ... (其他命令)
```

详细实现见后续任务...

---

*(后续 Phase 2-5 的详细任务清单将在执行过程中逐步展开)*

---

## 🎯 当前重点：Phase 1 执行

**立即开始的任务:**
1. Task 1.1: 环境准备 (今天)
2. Task 1.2: 类型定义 (明天开始)
3. Task 1.3: 适配器实现 (本周完成)

**执行策略:**
- 🔴 遵循 TDD（测试驱动开发）
- 🔴 每个 Task 完成后立即提交
- 🔴 保持与主分支同步

---

**文档版本**: v1.0
**最后更新**: 2025-11-22
**下次更新**: 完成 Task 1.1 后
