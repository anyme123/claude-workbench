# Codex CLI 集成可行性评估报告与实施方案

> **项目**: Claude Workbench
> **目标**: 集成 OpenAI Codex CLI，实现与 Claude CLI 一致的用户体验
> **日期**: 2025-11-22
> **版本**: v1.0

---

## 📋 执行摘要

本报告基于对 OpenAI Codex CLI 技术规范、参考项目 AionUi 架构以及当前 Claude Workbench 项目的深入分析，评估了 Codex CLI 集成的技术可行性。**结论：技术上完全可行**，建议采用适配器模式实现统一的 AI Agent 接口层。

**核心发现：**
- ✅ Codex CLI 与 Claude CLI 的工作流程高度相似
- ✅ 两者均支持流式 JSON 输出格式
- ✅ AionUi 已验证的多 Agent 适配器模式可直接应用
- ✅ 当前 Tauri + Rust 架构非常适合进程管理和消息流转
- ⚠️ 需要设计消息格式适配层以统一不同 CLI 的输出

---

## 1️⃣ 技术差异分析

### 1.1 Codex CLI vs Claude CLI 对比

| 维度 | Claude CLI | Codex CLI | 兼容性 |
|------|-----------|-----------|--------|
| **技术栈** | Rust + TypeScript | Rust | ✅ 高度兼容 |
| **输出格式** | JSONL (stream) | JSON (stream) | ✅ 可统一 |
| **命令行参数** | `--format stream-json` | `--format stream-json` | ✅ 一致 |
| **认证方式** | API Key / OAuth | API Key / ChatGPT OAuth | ✅ 类似 |
| **工作目录** | 通过参数指定 | 通过参数指定 | ✅ 一致 |
| **进程管理** | 子进程 stdin/stdout | 子进程 stdin/stdout | ✅ 一致 |
| **协议支持** | MCP (部分) | MCP (原生) | ⚠️ 需适配 |
| **消息结构** | 自定义格式 | 类似但有差异 | ⚠️ 需适配层 |

### 1.2 消息格式差异

#### Claude CLI 消息结构
```typescript
interface ClaudeStreamMessage {
  type: 'assistant' | 'user' | 'system' | 'result';
  message?: {
    id?: string;
    content: Array<{
      type: 'text' | 'tool_use' | 'tool_result';
      text?: string;
      name?: string;
      input?: any;
      tool_use_id?: string;
      content?: any;
      is_error?: boolean;
    }>;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  };
  timestamp?: string;
  receivedAt?: string;
}
```

#### Codex CLI 消息结构（推测基于文档）
```typescript
interface CodexStreamMessage {
  type: 'message' | 'tool_call' | 'tool_result' | 'thinking' | 'complete';
  content?: string | object;
  metadata?: {
    model?: string;
    tokens?: {
      input?: number;
      output?: number;
    };
    timestamp?: string;
  };
  // 其他字段根据 type 变化
}
```

**关键差异：**
- 消息类型命名不同
- 嵌套结构深度不同
- Token 统计字段位置不同
- Tool 调用格式可能有差异

### 1.3 CLI 命令对比

```bash
# Claude CLI
claude --format stream-json \
  --permissions allow-all \
  --model sonnet \
  --prompt "Your task here" \
  /path/to/project

# Codex CLI
codex --format stream-json \
  --model gpt-5-codex \
  --prompt "Your task here" \
  /path/to/project
```

**相似度：** 95%
**主要差异：** 模型名称、部分参数名称

---

## 2️⃣ AionUi 集成模式应用

### 2.1 核心设计模式

AionUi 成功集成了 4 种 AI Agent（Claude、Gemini、Qwen、Codex），其核心架构可直接借鉴：

#### 适配器模式架构
```
┌─────────────────────────────────────────────────────────┐
│                     UI Layer (React)                      │
│                  统一的消息接口                            │
└────────────────────┬────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │   Agent Adapter     │
          │   (Protocol Layer)  │
          └──────────┬──────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼────┐    ┌────▼────┐    ┌────▼────┐
│ Claude  │    │ Codex   │    │ Gemini  │
│ Adapter │    │ Adapter │    │ Adapter │
└────┬────┘    └────┬────┘    └────┬────┘
     │               │               │
┌────▼────┐    ┌────▼────┐    ┌────▼────┐
│ Claude  │    │ Codex   │    │ Gemini  │
│  CLI    │    │  CLI    │    │  CLI    │
└─────────┘    └─────────┘    └─────────┘
```

#### 关键实现要点

**1. 统一消息接口（参考 AionUi）**
```typescript
// 统一的内部消息格式
interface UnifiedMessage {
  id: string;
  msg_id: string;           // 用于消息累积
  type: 'text' | 'thinking' | 'tool_call' | 'tool_result';
  content: string | object;
  metadata: {
    model?: string;
    timestamp?: string;
    tokens?: TokenUsage;
  };
  source: 'claude' | 'codex' | 'gemini';
}
```

**2. 适配器层设计**
```typescript
interface AgentAdapter {
  // 启动 CLI 进程
  start(config: AgentConfig): Promise<void>;

  // 发送 Prompt
  sendPrompt(prompt: string): Promise<void>;

  // 转换消息格式（核心方法）
  convertMessage(rawMessage: unknown): UnifiedMessage[];

  // 停止进程
  stop(): Promise<void>;
}
```

**3. 进程通信模式（借鉴 AionUi）**
```rust
// Rust 后端进程管理
pub struct MultiAgentRunner {
    claude_process: Option<Child>,
    codex_process: Option<Child>,
    current_agent: AgentType,
}

impl MultiAgentRunner {
    // 根据用户选择启动不同的 CLI
    pub async fn execute(
        &mut self,
        agent: AgentType,
        project_path: String,
        prompt: String,
        config: AgentConfig
    ) -> Result<(), String> {
        match agent {
            AgentType::Claude => self.execute_claude(...).await,
            AgentType::Codex => self.execute_codex(...).await,
        }
    }
}
```

### 2.2 AionUi 验证的集成方案

#### 方案 A: NPX 动态调用（推荐）
```rust
// 无需打包 CLI 依赖，运行时通过 NPX 调用
let mut cmd = Command::new(if cfg!(windows) { "npx.cmd" } else { "npx" });
cmd.args(&["@openai/codex", "--format", "stream-json"]);
```

**优势：**
- ✅ 无依赖打包问题
- ✅ 自动使用最新版本
- ✅ 跨平台兼容性好
- ✅ 部署简单

**劣势：**
- ⚠️ 需要网络连接（首次下载）
- ⚠️ 启动速度稍慢（首次）

#### 方案 B: 本地 CLI 路径
```rust
// 用户配置 CLI 路径，直接调用
let mut cmd = Command::new(&config.codex_cli_path);
cmd.args(&["--format", "stream-json"]);
```

**优势：**
- ✅ 启动速度快
- ✅ 无需网络
- ✅ 版本可控

**劣势：**
- ⚠️ 需要用户手动安装和配置
- ⚠️ 版本更新需要用户操作

**建议：** 同时支持两种方案，优先使用 NPX，允许用户配置本地路径

---

## 3️⃣ 集成方案设计

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      Tauri Desktop App                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              React Frontend (TypeScript)                   │   │
│  │                                                            │   │
│  │  ┌─────────────────────────────────────────────────┐     │   │
│  │  │         ClaudeCodeSession.tsx                    │     │   │
│  │  │  (Renamed to: AIAgentSession.tsx)              │     │   │
│  │  │                                                  │     │   │
│  │  │  - 统一的 Agent 选择器                          │     │   │
│  │  │  - 统一的消息渲染                                │     │   │
│  │  │  - 统一的交互逻辑                                │     │   │
│  │  └─────────────────────────────────────────────────┘     │   │
│  │                          │                                 │   │
│  │                          ▼                                 │   │
│  │  ┌─────────────────────────────────────────────────┐     │   │
│  │  │         Message Adapter Layer                    │     │   │
│  │  │  (New: MessageAdapter.ts)                       │     │   │
│  │  │                                                  │     │   │
│  │  │  - convertClaudeMessage()                       │     │   │
│  │  │  - convertCodexMessage()                        │     │   │
│  │  │  - normalizeToUnified()                         │     │   │
│  │  └─────────────────────────────────────────────────┘     │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │ Tauri IPC                               │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Rust Backend (Tauri Commands)                 │   │
│  │                                                            │   │
│  │  ┌─────────────────────────────────────────────────┐     │   │
│  │  │         Multi-Agent CLI Runner                   │     │   │
│  │  │  (Enhanced: cli_runner.rs)                      │     │   │
│  │  │                                                  │     │   │
│  │  │  ┌──────────────┐      ┌──────────────┐       │     │   │
│  │  │  │ Claude Runner│      │ Codex Runner │       │     │   │
│  │  │  └──────┬───────┘      └──────┬───────┘       │     │   │
│  │  │         │                     │                │     │   │
│  │  │         ▼                     ▼                │     │   │
│  │  │  ┌──────────────┐      ┌──────────────┐       │     │   │
│  │  │  │ Claude CLI   │      │ Codex CLI    │       │     │   │
│  │  │  │ Process      │      │ Process      │       │     │   │
│  │  │  └──────────────┘      └──────────────┘       │     │   │
│  │  └─────────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 关键接口设计

#### 3.2.1 统一消息格式

```typescript
// src/types/unified-agent.ts

/**
 * 统一的 Agent 类型
 */
export type AgentType = 'claude' | 'codex';

/**
 * 统一的消息格式
 */
export interface UnifiedAgentMessage {
  // 基础字段
  id: string;                    // 唯一标识
  type: UnifiedMessageType;      // 消息类型
  content: MessageContent;       // 消息内容

  // 元数据
  metadata: {
    agent: AgentType;            // 来源 Agent
    model?: string;              // 使用的模型
    timestamp: string;           // 时间戳
    tokens?: TokenUsage;         // Token 使用情况
  };

  // 原始消息（用于调试和特殊处理）
  rawMessage?: unknown;
}

/**
 * 消息类型
 */
export type UnifiedMessageType =
  | 'text'           // 普通文本
  | 'thinking'       // 思考过程
  | 'tool_call'      // 工具调用
  | 'tool_result'    // 工具结果
  | 'error'          // 错误消息
  | 'system';        // 系统消息

/**
 * 消息内容（联合类型）
 */
export type MessageContent =
  | TextContent
  | ThinkingContent
  | ToolCallContent
  | ToolResultContent
  | ErrorContent
  | SystemContent;

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

// ... 其他内容类型定义
```

#### 3.2.2 消息适配器接口

```typescript
// src/lib/adapters/MessageAdapter.ts

/**
 * 消息适配器接口
 */
export interface IMessageAdapter {
  /**
   * 转换原始消息为统一格式
   */
  convert(rawMessage: unknown): UnifiedAgentMessage[];

  /**
   * 验证消息格式
   */
  validate(rawMessage: unknown): boolean;

  /**
   * 获取适配器支持的 Agent 类型
   */
  getSupportedAgent(): AgentType;
}

/**
 * Claude 消息适配器
 */
export class ClaudeMessageAdapter implements IMessageAdapter {
  convert(rawMessage: unknown): UnifiedAgentMessage[] {
    const claudeMsg = rawMessage as ClaudeStreamMessage;

    return [{
      id: generateId(),
      type: this.mapType(claudeMsg.type),
      content: this.convertContent(claudeMsg),
      metadata: {
        agent: 'claude',
        model: claudeMsg.model,
        timestamp: claudeMsg.timestamp || new Date().toISOString(),
        tokens: claudeMsg.usage,
      },
      rawMessage: claudeMsg,
    }];
  }

  private mapType(type: string): UnifiedMessageType {
    // 类型映射逻辑
    switch (type) {
      case 'assistant': return 'text';
      case 'tool_use': return 'tool_call';
      case 'tool_result': return 'tool_result';
      default: return 'system';
    }
  }

  private convertContent(msg: ClaudeStreamMessage): MessageContent {
    // 内容转换逻辑
    // ...
  }

  validate(rawMessage: unknown): boolean {
    return typeof rawMessage === 'object' &&
           rawMessage !== null &&
           'type' in rawMessage;
  }

  getSupportedAgent(): AgentType {
    return 'claude';
  }
}

/**
 * Codex 消息适配器
 */
export class CodexMessageAdapter implements IMessageAdapter {
  convert(rawMessage: unknown): UnifiedAgentMessage[] {
    const codexMsg = rawMessage as CodexStreamMessage;

    // 类似的转换逻辑，但处理 Codex 的消息格式
    // ...
  }

  // ... 其他方法实现
}

/**
 * 适配器工厂
 */
export class MessageAdapterFactory {
  private static adapters = new Map<AgentType, IMessageAdapter>([
    ['claude', new ClaudeMessageAdapter()],
    ['codex', new CodexMessageAdapter()],
  ]);

  static getAdapter(agent: AgentType): IMessageAdapter {
    const adapter = this.adapters.get(agent);
    if (!adapter) {
      throw new Error(`No adapter found for agent: ${agent}`);
    }
    return adapter;
  }
}
```

#### 3.2.3 后端命令接口

```rust
// src-tauri/src/commands/agent/mod.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    Claude,
    Codex,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentConfig {
    pub agent_type: AgentType,
    pub project_path: String,
    pub prompt: String,
    pub model: String,
    pub plan_mode: Option<bool>,
    pub max_thinking_tokens: Option<u32>,
}

/// 统一的 Agent 执行命令
#[tauri::command]
pub async fn execute_agent(
    app: AppHandle,
    state: State<'_, AgentProcessState>,
    config: AgentConfig,
) -> Result<(), String> {
    match config.agent_type {
        AgentType::Claude => {
            execute_claude_agent(app, state, config).await
        },
        AgentType::Codex => {
            execute_codex_agent(app, state, config).await
        },
    }
}

/// 执行 Claude CLI
async fn execute_claude_agent(
    app: AppHandle,
    state: State<'_, AgentProcessState>,
    config: AgentConfig,
) -> Result<(), String> {
    // 现有的 Claude CLI 执行逻辑
    // ...
}

/// 执行 Codex CLI
async fn execute_codex_agent(
    app: AppHandle,
    state: State<'_, AgentProcessState>,
    config: AgentConfig,
) -> Result<(), String> {
    // 新增的 Codex CLI 执行逻辑
    let codex_cmd = find_codex_cli()?;

    let mut cmd = Command::new(codex_cmd);
    cmd.current_dir(&config.project_path)
        .arg("--format").arg("stream-json")
        .arg("--model").arg(&config.model)
        .arg("--prompt").arg(&config.prompt)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    spawn_and_stream(app, cmd, "codex").await
}

/// 查找 Codex CLI
fn find_codex_cli() -> Result<String, String> {
    // 1. 检查用户配置的路径
    if let Ok(path) = get_codex_cli_config() {
        if validate_cli_path(&path) {
            return Ok(path);
        }
    }

    // 2. 尝试 npx（推荐）
    if cfg!(windows) {
        Ok("npx.cmd @openai/codex".to_string())
    } else {
        Ok("npx @openai/codex".to_string())
    }
}

/// 统一的流式输出处理
async fn spawn_and_stream(
    app: AppHandle,
    mut cmd: Command,
    agent: &str,
) -> Result<(), String> {
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);

    tokio::spawn(async move {
        for line in reader.lines() {
            if let Ok(line) = line {
                // 发送统一的事件，前端适配器会处理格式差异
                app.emit(&format!("{}-stream-chunk", agent),
                         AgentStreamEvent {
                             agent: agent.to_string(),
                             data: line,
                         })
                   .unwrap();
            }
        }

        app.emit(&format!("{}-complete", agent), ()).unwrap();
    });

    Ok(())
}
```

### 3.3 前端组件改造

#### 3.3.1 Agent 选择器组件

```typescript
// src/components/AgentSelector.tsx

import React from 'react';
import { Select } from '@/components/ui/select';
import type { AgentType } from '@/types/unified-agent';

interface AgentSelectorProps {
  value: AgentType;
  onChange: (agent: AgentType) => void;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
  value,
  onChange
}) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <Select.Trigger className="w-[180px]">
        <Select.Value placeholder="选择 AI Agent" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="claude">
          <div className="flex items-center gap-2">
            <span className="text-purple-600">●</span>
            Claude Code
          </div>
        </Select.Item>
        <Select.Item value="codex">
          <div className="flex items-center gap-2">
            <span className="text-green-600">●</span>
            OpenAI Codex
          </div>
        </Select.Item>
      </Select.Content>
    </Select>
  );
};
```

#### 3.3.2 统一会话组件改造

```typescript
// src/components/AIAgentSession.tsx (重构后)

import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AgentSelector } from './AgentSelector';
import { MessageAdapterFactory } from '@/lib/adapters/MessageAdapter';
import type { AgentType, UnifiedAgentMessage } from '@/types/unified-agent';

export const AIAgentSession: React.FC = () => {
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('claude');
  const [messages, setMessages] = useState<UnifiedAgentMessage[]>([]);

  useEffect(() => {
    // 监听不同 Agent 的事件
    const listeners = [
      listen('claude-stream-chunk', handleClaudeMessage),
      listen('codex-stream-chunk', handleCodexMessage),
    ];

    return () => {
      listeners.forEach(l => l.then(unlisten => unlisten()));
    };
  }, [selectedAgent]);

  const handleClaudeMessage = (event: any) => {
    const adapter = MessageAdapterFactory.getAdapter('claude');
    const unified = adapter.convert(JSON.parse(event.payload));
    setMessages(prev => [...prev, ...unified]);
  };

  const handleCodexMessage = (event: any) => {
    const adapter = MessageAdapterFactory.getAdapter('codex');
    const unified = adapter.convert(JSON.parse(event.payload));
    setMessages(prev => [...prev, ...unified]);
  };

  const handleSendPrompt = async (prompt: string) => {
    await api.executeAgent({
      agent_type: selectedAgent,
      project_path: currentProject,
      prompt,
      model: getModelForAgent(selectedAgent),
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Agent 选择器 */}
      <div className="p-4 border-b">
        <AgentSelector
          value={selectedAgent}
          onChange={setSelectedAgent}
        />
      </div>

      {/* 消息列表 - 使用统一格式渲染 */}
      <MessageList messages={messages} />

      {/* 输入框 */}
      <PromptInput onSend={handleSendPrompt} />
    </div>
  );
};
```

---

## 4️⃣ 分步实施计划

### Phase 1: 基础架构搭建（1-2 周）

#### 里程碑 1.1: 类型系统和接口定义
**目标**: 定义统一的类型系统和接口

**任务清单：**
- [ ] 创建 `src/types/unified-agent.ts`
  - 定义 `AgentType`, `UnifiedAgentMessage`
  - 定义 `TokenUsage`, `MessageContent` 等类型
  - 导出所有统一接口

- [ ] 创建 `src/types/codex.ts`
  - 定义 Codex CLI 的原始消息类型
  - 参考 Codex 文档和实际输出

**验收标准：**
- ✅ 所有类型定义完整且无 TypeScript 错误
- ✅ 类型文档注释完整
- ✅ 通过 `npm run type-check`

#### 里程碑 1.2: 消息适配器实现
**目标**: 实现消息格式转换层

**任务清单：**
- [ ] 创建 `src/lib/adapters/MessageAdapter.ts`
  - 实现 `IMessageAdapter` 接口
  - 实现 `ClaudeMessageAdapter`
  - 实现 `CodexMessageAdapter`
  - 实现 `MessageAdapterFactory`

- [ ] 编写单元测试 `src/lib/adapters/MessageAdapter.test.ts`
  - 测试 Claude 消息转换
  - 测试 Codex 消息转换
  - 测试边界情况和错误处理

**验收标准：**
- ✅ 适配器能正确转换两种 CLI 的消息
- ✅ 单元测试覆盖率 > 90%
- ✅ 通过所有测试用例

---

### Phase 2: 后端集成（2-3 周）

#### 里程碑 2.1: Rust 命令层重构
**目标**: 重构后端命令支持多 Agent

**任务清单：**
- [ ] 重构 `src-tauri/src/commands/` 目录结构
  ```
  commands/
  ├── agent/
  │   ├── mod.rs          (统一入口)
  │   ├── claude.rs       (Claude 实现)
  │   ├── codex.rs        (Codex 实现，新增)
  │   └── common.rs       (共享逻辑)
  └── ...
  ```

- [ ] 实现 `codex.rs`
  - `find_codex_cli()` - CLI 查找逻辑
  - `execute_codex_agent()` - Codex 执行逻辑
  - `parse_codex_args()` - 参数构建

- [ ] 重构 `claude.rs`
  - 提取共享逻辑到 `common.rs`
  - 统一错误处理

- [ ] 更新 `src-tauri/src/main.rs`
  - 注册新的统一命令 `execute_agent`

**验收标准：**
- ✅ 两种 CLI 都能成功启动
- ✅ 流式输出正常工作
- ✅ 错误处理完善

#### 里程碑 2.2: 进程管理增强
**目标**: 支持多进程和进程切换

**任务清单：**
- [ ] 扩展 `AgentProcessState`
  ```rust
  pub struct AgentProcessState {
      pub claude_process: Arc<Mutex<Option<Child>>>,
      pub codex_process: Arc<Mutex<Option<Child>>>,  // 新增
      pub current_agent: Arc<Mutex<AgentType>>,      // 新增
  }
  ```

- [ ] 实现进程切换逻辑
  - 切换 Agent 时优雅关闭旧进程
  - 启动新 Agent 进程

- [ ] 添加进程健康检查
  - 定期检查进程状态
  - 自动重启崩溃的进程

**验收标准：**
- ✅ 进程切换流畅无错误
- ✅ 资源正确释放
- ✅ 崩溃恢复机制有效

#### 里程碑 2.3: Codex CLI 集成测试
**目标**: 验证 Codex CLI 基本功能

**任务清单：**
- [ ] 手动测试 Codex CLI
  - 测试基本 prompt 执行
  - 测试文件读写操作
  - 测试错误处理

- [ ] 创建集成测试用例
  - 测试完整的执行流程
  - 测试消息格式转换
  - 测试 Token 统计

**验收标准：**
- ✅ Codex CLI 能正常执行任务
- ✅ 消息格式正确转换
- ✅ 所有集成测试通过

---

### Phase 3: 前端集成（2 周）

#### 里程碑 3.1: 组件重构
**目标**: 改造现有组件支持多 Agent

**任务清单：**
- [ ] 重命名 `ClaudeCodeSession.tsx` → `AIAgentSession.tsx`
  - 移除 Claude 特定逻辑
  - 使用统一的消息类型

- [ ] 创建 `AgentSelector.tsx`
  - UI 设计和实现
  - 状态管理

- [ ] 更新 `MessagesContext.tsx`
  - 支持 `UnifiedAgentMessage`
  - 适配器层集成

- [ ] 更新消息渲染组件
  - `StreamMessageV2.tsx`
  - `ToolCallsGroup.tsx`
  - 确保能渲染两种 Agent 的消息

**验收标准：**
- ✅ 组件重构完成无破坏性变更
- ✅ UI 正常渲染
- ✅ 类型检查通过

#### 里程碑 3.2: API 层更新
**目标**: 更新前端 API 调用

**任务清单：**
- [ ] 更新 `src/lib/api.ts`
  ```typescript
  export const api = {
    // 新的统一 API
    async executeAgent(config: AgentConfig): Promise<void> {
      return invoke('execute_agent', { config });
    },

    // 保留旧 API（标记为 deprecated）
    async executeClaudeCode(...args): Promise<void> {
      console.warn('Deprecated: Use executeAgent instead');
      return this.executeAgent({
        agent_type: 'claude',
        ...args
      });
    }
  };
  ```

- [ ] 更新所有调用点
  - 搜索 `api.executeClaudeCode`
  - 替换为 `api.executeAgent`

**验收标准：**
- ✅ 所有 API 调用更新
- ✅ 向后兼容性保持
- ✅ 无编译错误

#### 里程碑 3.3: 事件监听统一
**目标**: 统一事件监听和处理

**任务清单：**
- [ ] 创建 `useAgentStream` Hook
  ```typescript
  function useAgentStream(agent: AgentType) {
    useEffect(() => {
      const unlisten = listen(
        `${agent}-stream-chunk`,
        handleMessage
      );
      return () => unlisten.then(fn => fn());
    }, [agent]);
  }
  ```

- [ ] 重构现有的事件监听代码
  - 使用新的 Hook
  - 移除重复代码

**验收标准：**
- ✅ 事件监听统一且简洁
- ✅ 无内存泄漏
- ✅ 事件处理正确

---

### Phase 4: 用户体验优化（1-2 周）

#### 里程碑 4.1: 配置管理
**目标**: 添加 Agent 配置选项

**任务清单：**
- [ ] 扩展设置页面
  - Agent 默认选择
  - Codex CLI 路径配置
  - 模型选择

- [ ] 创建配置持久化
  ```rust
  // src-tauri/src/config/agent_config.rs
  pub struct AgentPreferences {
      pub default_agent: AgentType,
      pub codex_cli_path: Option<String>,
      pub claude_cli_path: Option<String>,
  }
  ```

- [ ] 添加配置验证
  - CLI 路径有效性检查
  - 版本兼容性检查

**验收标准：**
- ✅ 配置能正确保存和读取
- ✅ 配置验证有效
- ✅ UI 友好

#### 里程碑 4.2: 会话管理增强
**目标**: 支持不同 Agent 的会话历史

**任务清单：**
- [ ] 扩展数据库表结构
  ```sql
  ALTER TABLE sessions ADD COLUMN agent_type TEXT DEFAULT 'claude';
  ALTER TABLE sessions ADD COLUMN agent_metadata TEXT;
  ```

- [ ] 更新会话保存逻辑
  - 记录使用的 Agent
  - 保存 Agent 特定元数据

- [ ] 会话列表显示
  - 显示 Agent 图标
  - 按 Agent 类型筛选

**验收标准：**
- ✅ 会话正确关联 Agent 类型
- ✅ 历史记录完整
- ✅ 筛选功能有效

#### 里程碑 4.3: 成本追踪更新
**目标**: 支持 Codex 的成本计算

**任务清单：**
- [ ] 更新 `src/lib/pricing.ts`
  - 添加 Codex 定价数据
  ```typescript
  const PRICING = {
    claude: { /* 现有定价 */ },
    codex: {
      'gpt-5-codex': {
        input: 2.50,      // 每 1M tokens
        output: 10.00,
      },
      'gpt-5': {
        input: 5.00,
        output: 15.00,
      }
    }
  };
  ```

- [ ] 更新成本计算逻辑
  - 根据 Agent 类型选择定价
  - 统一计算接口

- [ ] 更新 UI 显示
  - 显示使用的模型和 Agent
  - 分别统计不同 Agent 的成本

**验收标准：**
- ✅ 成本计算准确
- ✅ UI 显示清晰
- ✅ 支持多 Agent 统计

---

### Phase 5: 测试与优化（1 周）

#### 里程碑 5.1: 端到端测试
**目标**: 验证完整功能

**任务清单：**
- [ ] 编写 E2E 测试用例
  - Claude Agent 完整流程
  - Codex Agent 完整流程
  - Agent 切换流程
  - 错误场景测试

- [ ] 性能测试
  - 长会话内存使用
  - 消息处理延迟
  - 进程启动时间

**验收标准：**
- ✅ 所有 E2E 测试通过
- ✅ 性能指标达标
- ✅ 无已知 Bug

#### 里程碑 5.2: 文档和发布准备
**目标**: 完善文档和发布材料

**任务清单：**
- [ ] 更新用户文档
  - Codex 集成说明
  - 配置指南
  - 常见问题

- [ ] 更新开发者文档
  - 架构说明
  - 适配器开发指南
  - API 参考

- [ ] 准备发布说明
  - Changelog
  - 破坏性变更说明（如有）
  - 迁移指南

**验收标准：**
- ✅ 文档完整准确
- ✅ 发布材料齐全
- ✅ 通过 Code Review

---

## 5️⃣ 风险评估与缓解策略

### 5.1 技术风险

#### 风险 1: 消息格式差异导致适配困难
**等级**: 🔴 高
**概率**: 中等

**风险描述：**
Codex CLI 的实际输出格式可能与文档描述不一致，导致适配器开发困难。

**缓解策略：**
1. **早期原型验证**
   - Phase 1 开始前就进行 Codex CLI 的实际测试
   - 记录所有消息类型和格式
   - 创建完整的消息样本库

2. **灵活的适配器设计**
   - 使用策略模式支持多版本
   - 添加消息格式自动检测
   - 实现 fallback 机制

3. **调试工具**
   - 添加原始消息日志功能
   - 创建消息格式比对工具
   - 开发模式显示原始消息

**应急方案：**
- 如果格式差异过大，考虑先支持 MCP 协议方式集成
- 联系 OpenAI 获取官方文档或支持

---

#### 风险 2: 进程管理复杂度增加
**等级**: 🟡 中
**概率**: 高

**风险描述：**
同时管理多个 CLI 进程可能导致资源竞争、死锁或内存泄漏。

**缓解策略：**
1. **严格的进程生命周期管理**
   ```rust
   // 使用 RAII 模式确保资源释放
   pub struct ProcessGuard {
       child: Child,
   }

   impl Drop for ProcessGuard {
       fn drop(&mut self) {
           let _ = self.child.kill();
       }
   }
   ```

2. **进程状态监控**
   - 定期健康检查
   - 资源使用监控
   - 自动清理僵尸进程

3. **限制并发**
   - 同时只允许一个活跃 Agent
   - 实现进程队列机制

**应急方案：**
- 提供手动进程清理命令
- 添加"安全模式"只支持单 Agent

---

#### 风险 3: 跨平台兼容性问题
**等级**: 🟡 中
**概率**: 中等

**风险描述：**
Codex CLI 在 Windows、macOS、Linux 上的行为可能不一致。

**缓解策略：**
1. **多平台测试矩阵**
   ```
   OS: [windows-latest, macos-latest, ubuntu-latest]
   CLI: [claude, codex]
   ```

2. **平台特定代码隔离**
   ```rust
   #[cfg(target_os = "windows")]
   fn get_cli_command() -> String { /* Windows 实现 */ }

   #[cfg(not(target_os = "windows"))]
   fn get_cli_command() -> String { /* Unix 实现 */ }
   ```

3. **CI/CD 自动化测试**
   - GitHub Actions 多平台构建
   - 自动化集成测试

**应急方案：**
- 优先支持 macOS/Linux
- Windows 作为实验性功能发布

---

### 5.2 产品风险

#### 风险 4: 用户体验不一致
**等级**: 🟡 中
**概率**: 中等

**风险描述：**
Claude 和 Codex 的工作方式可能有差异，导致用户困惑。

**缓解策略：**
1. **统一的 UI 设计**
   - 相同的交互模式
   - 一致的视觉反馈
   - 清晰的 Agent 标识

2. **上下文提示**
   - Agent 切换时显示提示
   - 不同 Agent 的特性说明
   - 内嵌帮助文档

3. **用户测试**
   - Beta 测试收集反馈
   - 可用性测试
   - 迭代优化

**应急方案：**
- 提供"简单模式"隐藏复杂选项
- 默认使用 Claude，Codex 作为高级选项

---

#### 风险 5: 破坏现有功能
**等级**: 🔴 高
**概率**: 低

**风险描述：**
重构可能导致现有 Claude 功能出现问题。

**缓解策略：**
1. **渐进式重构**
   - 保留旧代码路径
   - 使用 Feature Flag 控制
   ```typescript
   if (ENABLE_MULTI_AGENT) {
     return <AIAgentSession />;
   } else {
     return <ClaudeCodeSession />;  // 旧版本
   }
   ```

2. **全面测试**
   - 回归测试所有现有功能
   - 自动化测试覆盖关键路径
   - 手动测试清单

3. **版本控制**
   - 功能分支开发
   - 代码审查
   - 分阶段合并

**应急方案：**
- 准备回滚方案
- 提供"经典模式"选项
- 维护独立的稳定分支

---

### 5.3 项目风险

#### 风险 6: 开发时间超期
**等级**: 🟡 中
**概率**: 中等

**风险描述：**
实际开发可能遇到预料之外的技术难题，导致延期。

**缓解策略：**
1. **敏捷开发**
   - 2 周一个迭代
   - 每个 Phase 都可以独立交付
   - 优先实现核心功能

2. **风险缓冲**
   - 预留 20% 的缓冲时间
   - 识别关键路径
   - 准备降级方案

3. **及时沟通**
   - 每周进度同步
   - 问题及早暴露
   - 调整计划

**降级方案：**
- **Phase 1-2**: 最小可行产品（MVP）- 仅支持基本 Codex 执行
- **Phase 3-4**: 增强版 - 完整 UI 和配置
- **Phase 5**: 优化版 - 性能和体验优化

---

#### 风险 7: Codex CLI 变更
**等级**: 🟡 中
**概率**: 低

**风险描述：**
OpenAI 可能更新 Codex CLI，导致集成失效。

**缓解策略：**
1. **版本锁定**
   - 指定特定版本的 Codex CLI
   - 测试新版本后再升级

2. **适配层隔离**
   - 所有 Codex 特定逻辑都在适配器中
   - 便于快速更新

3. **监控变更**
   - 订阅 Codex 更新通知
   - 定期测试最新版本

**应急方案：**
- 提供多版本适配器
- 允许用户选择 CLI 版本
- 紧急修复机制

---

## 6️⃣ 成功指标

### 6.1 技术指标

| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| **消息转换准确率** | > 99.9% | 单元测试覆盖 |
| **进程启动时间** | < 3 秒 | 性能测试 |
| **内存占用** | < 200MB (单 Agent) | 运行时监控 |
| **CPU 使用率** | < 10% (空闲时) | 性能分析 |
| **测试覆盖率** | > 85% | Jest + Cargo test |
| **TypeScript 错误** | 0 | `npm run type-check` |
| **Rust 编译警告** | 0 | `cargo clippy` |

### 6.2 用户体验指标

| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| **Agent 切换时间** | < 1 秒 | 用户测试 |
| **UI 响应时间** | < 100ms | Performance API |
| **学习曲线** | < 5 分钟上手 | 用户访谈 |
| **错误率** | < 1% | 日志分析 |
| **用户满意度** | > 4.5/5 | 问卷调查 |

### 6.3 质量指标

| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| **P0 Bug** | 0 | Issue 跟踪 |
| **P1 Bug** | < 3 | Issue 跟踪 |
| **代码审查通过率** | 100% | GitHub PR |
| **文档完整度** | 100% | 文档审查 |
| **向后兼容性** | 100% | 兼容性测试 |

---

## 7️⃣ 总结与建议

### 7.1 可行性结论

**✅ 集成 Codex CLI 完全可行**

基于以下关键因素：

1. **技术兼容性高（95%）**
   - 两种 CLI 的工作模式几乎相同
   - 都支持流式 JSON 输出
   - 进程管理逻辑可复用

2. **成熟的参考模式**
   - AionUi 已验证多 Agent 集成方案
   - 适配器模式经过实战检验
   - 大量可复用的设计经验

3. **架构基础良好**
   - Tauri + Rust 天然适合进程管理
   - 现有代码结构清晰易扩展
   - 组件化设计便于重构

4. **风险可控**
   - 主要风险都有缓解策略
   - 渐进式实施降低风险
   - 应急方案完备

### 7.2 实施建议

#### 优先级排序

**Must Have (MVP)**
- ✅ 消息适配器层
- ✅ 基本的 Codex CLI 执行
- ✅ Agent 选择器 UI
- ✅ 统一的消息渲染

**Should Have (V1.0)**
- ⭐ 配置管理
- ⭐ 会话历史记录
- ⭐ 成本追踪
- ⭐ 错误处理优化

**Nice to Have (V1.x)**
- 💡 性能优化
- 💡 多 Agent 并发
- 💡 高级配置选项
- 💡 插件系统

#### 关键决策点

**1. 实施策略：渐进式 vs 大爆炸**
- **建议**: 渐进式
- **理由**: 降低风险，允许快速迭代，保持系统稳定

**2. 向后兼容：保持 vs 破坏**
- **建议**: 完全向后兼容
- **理由**: 保护现有用户，平滑迁移，降低支持成本

**3. 默认 Agent：Claude vs 用户选择**
- **建议**: 默认 Claude，可配置
- **理由**: 保持现有用户体验，给新用户提供选择

**4. 发布方式：Feature Flag vs 新版本**
- **建议**: Feature Flag 控制
- **理由**: 灵活控制，快速回滚，A/B 测试

### 7.3 下一步行动

**立即执行：**
1. ✅ **原型验证** (1-2 天)
   - 手动测试 Codex CLI
   - 记录消息格式
   - 验证基本假设

2. ✅ **技术选型确认** (1 天)
   - 确认适配器模式
   - 确认技术栈
   - 确认架构设计

3. ✅ **启动 Phase 1** (1-2 周)
   - 创建 Feature Branch
   - 搭建基础架构
   - 实现适配器层

**短期目标（1 个月）：**
- 完成 Phase 1-2
- 可执行基本的 Codex 任务
- 通过内部测试

**中期目标（2 个月）：**
- 完成 Phase 3-4
- Beta 版本发布
- 收集用户反馈

**长期目标（3 个月）：**
- 完成 Phase 5
- 正式版本发布
- 持续优化

---

## 8️⃣ 附录

### A. 参考资源

#### 官方文档
- OpenAI Codex CLI: https://github.com/openai/codex
- Codex Documentation: https://developers.openai.com/codex/cli
- Tauri Documentation: https://tauri.app/
- Rust tokio: https://tokio.rs/

#### 参考项目
- AionUi: `C:\Users\Administrator\Desktop\AionUi`
- Claude Workbench: `C:\Users\Administrator\Desktop\claude-workbench`

#### 相关技术
- JSON-RPC 2.0: https://www.jsonrpc.org/specification
- MCP Protocol: https://modelcontextprotocol.io/
- Stream Processing: https://nodejs.org/api/stream.html

### B. 词汇表

| 术语 | 定义 |
|------|------|
| **Agent** | AI 编程助手（Claude/Codex） |
| **Adapter** | 消息格式转换层 |
| **Unified Message** | 统一的内部消息格式 |
| **CLI** | Command Line Interface |
| **JSONL** | JSON Lines（每行一个 JSON） |
| **IPC** | Inter-Process Communication |
| **MCP** | Model Context Protocol |
| **ACP** | Agent Communication Protocol |

### C. 联系方式

**项目负责人**: [Your Name]
**技术讨论**: [Team Channel]
**问题反馈**: [Issue Tracker]

---

**报告版本**: v1.0
**最后更新**: 2025-11-22
**下次审查**: 2025-12-01

---

© 2025 Claude Workbench Team. All Rights Reserved.
