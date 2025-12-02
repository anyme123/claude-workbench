# Gemini CLI 集成计划

## 概述

将 Google Gemini CLI 作为第三个 AI 引擎集成到 Any Code 项目中，与现有的 Claude Code CLI 和 OpenAI Codex 并列。

## Gemini CLI 关键特性

### Headless 模式

Gemini CLI 支持通过 `--prompt` 或 `-p` 参数以非交互方式运行：

```bash
gemini --prompt "Your prompt here" --output-format stream-json
```

### 输出格式

| 格式 | 参数 | 用途 |
|------|------|------|
| text | `--output-format text` | 默认纯文本输出 |
| json | `--output-format json` | 结构化 JSON（等待完成） |
| **stream-json** | `--output-format stream-json` | **推荐：流式 JSONL 输出** |

### 流式 JSON 事件类型

```typescript
// Gemini CLI stream-json 事件类型
type GeminiEventType =
  | "init"        // 会话初始化：{ session_id, model, timestamp }
  | "message"     // 消息：{ role: "user" | "assistant", content, delta?, timestamp }
  | "tool_use"    // 工具调用：{ tool_name, tool_id, parameters, timestamp }
  | "tool_result" // 工具结果：{ tool_id, status, output, timestamp }
  | "error"       // 错误：{ type, message, code? }
  | "result"      // 最终结果：{ status, stats: { total_tokens, tool_calls, ... } }
```

### 认证方式

1. **Google OAuth**（推荐）：免费 60 req/min，1000 req/day
2. **API Key**：`GEMINI_API_KEY` 环境变量
3. **Vertex AI**：`GOOGLE_API_KEY` + `GOOGLE_GENAI_USE_VERTEXAI=true`

---

## 集成架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Any Code                                │
├───────────────────┬───────────────────┬─────────────────────────┤
│   Claude CLI      │   OpenAI Codex    │   Gemini CLI (新增)      │
│   (claude)        │   (codex)         │   (gemini)              │
├───────────────────┴───────────────────┴─────────────────────────┤
│                    统一的消息转换层                               │
│         将各 CLI 输出转换为统一的 ClaudeStreamMessage 格式         │
├─────────────────────────────────────────────────────────────────┤
│                    React 前端 (统一 UI)                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 实现步骤

### Phase 1: Rust 后端模块 (2-3 天)

#### 1.1 创建 Gemini 命令模块

**文件结构：**
```
src-tauri/src/commands/gemini/
├── mod.rs           # 模块入口
├── session.rs       # 会话管理 (execute, resume, cancel)
├── config.rs        # 配置管理 (认证、模型选择)
├── parser.rs        # JSONL 事件解析器
└── types.rs         # 类型定义
```

#### 1.2 核心类型定义 (`types.rs`)

```rust
use serde::{Deserialize, Serialize};

/// Gemini 流式事件
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GeminiStreamEvent {
    Init {
        session_id: String,
        model: String,
        timestamp: String,
    },
    Message {
        role: String,
        content: String,
        #[serde(default)]
        delta: bool,
        timestamp: String,
    },
    ToolUse {
        tool_name: String,
        tool_id: String,
        parameters: serde_json::Value,
        timestamp: String,
    },
    ToolResult {
        tool_id: String,
        status: String,
        output: String,
        timestamp: String,
    },
    Error {
        #[serde(rename = "type")]
        error_type: String,
        message: String,
        code: Option<i32>,
    },
    Result {
        status: String,
        stats: GeminiStats,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GeminiStats {
    pub total_tokens: Option<u64>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub duration_ms: Option<u64>,
    pub tool_calls: Option<u32>,
}

/// Gemini 执行选项
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiExecutionOptions {
    pub project_path: String,
    pub prompt: String,
    pub model: Option<String>,  // 默认 gemini-2.5-pro
    pub approval_mode: Option<String>,  // auto_edit, yolo
    pub include_directories: Option<Vec<String>>,
}
```

#### 1.3 会话执行核心 (`session.rs`)

```rust
#[tauri::command]
pub async fn execute_gemini(
    options: GeminiExecutionOptions,
    app_handle: AppHandle,
) -> Result<(), String> {
    let gemini_path = find_gemini_binary()?;

    // 构建命令参数
    let mut args = vec![
        "--prompt".to_string(),
        options.prompt.clone(),
        "--output-format".to_string(),
        "stream-json".to_string(),
    ];

    if let Some(model) = &options.model {
        args.push("--model".to_string());
        args.push(model.clone());
    }

    // 添加 yolo 模式支持
    if options.approval_mode == Some("yolo".to_string()) {
        args.push("--yolo".to_string());
    }

    // 创建进程
    let mut cmd = Command::new(&gemini_path);
    cmd.args(&args)
       .current_dir(&options.project_path)
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    spawn_gemini_process(app_handle, cmd, options.project_path).await
}
```

#### 1.4 事件解析与转换 (`parser.rs`)

```rust
use crate::commands::gemini::types::GeminiStreamEvent;

/// 将 Gemini 事件转换为统一的 ClaudeStreamMessage 格式
pub fn convert_to_claude_message(event: &GeminiStreamEvent) -> serde_json::Value {
    match event {
        GeminiStreamEvent::Init { session_id, model, .. } => {
            json!({
                "type": "system",
                "subtype": "init",
                "session_id": session_id,
                "model": model,
                "geminiMetadata": { "provider": "gemini" }
            })
        }
        GeminiStreamEvent::Message { role, content, delta, .. } => {
            json!({
                "type": if *role == "assistant" { "assistant" } else { "user" },
                "message": {
                    "content": [{
                        "type": "text",
                        "text": content
                    }],
                    "role": role
                },
                "geminiMetadata": { "delta": delta }
            })
        }
        GeminiStreamEvent::ToolUse { tool_name, tool_id, parameters, .. } => {
            json!({
                "type": "tool_use",
                "tool_name": tool_name,
                "tool_id": tool_id,
                "input": parameters,
                "geminiMetadata": { "provider": "gemini" }
            })
        }
        GeminiStreamEvent::Result { stats, .. } => {
            json!({
                "type": "result",
                "usage": {
                    "input_tokens": stats.input_tokens.unwrap_or(0),
                    "output_tokens": stats.output_tokens.unwrap_or(0)
                },
                "geminiMetadata": {
                    "duration_ms": stats.duration_ms,
                    "tool_calls": stats.tool_calls
                }
            })
        }
        // ... 其他事件类型
    }
}
```

---

### Phase 2: 二进制检测与配置 (1 天)

#### 2.1 扩展 `claude_binary.rs`

```rust
/// 检测 Gemini CLI 二进制
pub fn find_gemini_binary() -> Result<String, String> {
    // 1. 检查环境变量
    if let Ok(path) = std::env::var("GEMINI_CLI_PATH") {
        if Path::new(&path).exists() {
            return Ok(path);
        }
    }

    // 2. 检查 npm 全局安装
    let npm_paths = [
        // Windows
        "%APPDATA%\\npm\\gemini.cmd",
        "%APPDATA%\\npm\\node_modules\\@google\\gemini-cli\\dist\\cli.js",
        // macOS/Linux
        "/usr/local/bin/gemini",
        "$HOME/.npm-global/bin/gemini",
    ];

    // 3. 检查 Homebrew (macOS)
    // /opt/homebrew/bin/gemini

    Err("Gemini CLI not found. Install with: npm install -g @google/gemini-cli".to_string())
}
```

#### 2.2 添加 Gemini 配置管理 (`config.rs`)

```rust
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiConfig {
    pub auth_method: GeminiAuthMethod,
    pub default_model: String,
    pub approval_mode: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GeminiAuthMethod {
    GoogleOAuth,
    ApiKey,
    VertexAI,
}

impl Default for GeminiConfig {
    fn default() -> Self {
        Self {
            auth_method: GeminiAuthMethod::GoogleOAuth,
            default_model: "gemini-2.5-pro".to_string(),
            approval_mode: "auto_edit".to_string(),
        }
    }
}
```

---

### Phase 3: 前端集成 (2-3 天)

#### 3.1 TypeScript 类型定义 (`src/types/gemini.ts`)

```typescript
// Gemini 特有的元数据
export interface GeminiMetadata {
  provider: "gemini";
  delta?: boolean;
  duration_ms?: number;
  tool_calls?: number;
}

// 扩展 ClaudeStreamMessage
declare module "./claude" {
  interface ClaudeStreamMessage {
    geminiMetadata?: GeminiMetadata;
  }
}

// Gemini 执行选项
export interface GeminiExecutionOptions {
  projectPath: string;
  prompt: string;
  model?: string;
  approvalMode?: "auto_edit" | "yolo";
  includeDirectories?: string[];
}

// Gemini 配置
export interface GeminiConfig {
  authMethod: "google_oauth" | "api_key" | "vertex_ai";
  defaultModel: string;
  approvalMode: string;
  apiKey?: string;
  googleCloudProject?: string;
}
```

#### 3.2 API 层扩展 (`src/lib/api.ts`)

```typescript
// Gemini CLI 操作
async executeGemini(options: GeminiExecutionOptions): Promise<void> {
  return invoke("execute_gemini", { options });
}

async cancelGemini(sessionId?: string): Promise<void> {
  return invoke("cancel_gemini", { sessionId });
}

async getGeminiConfig(): Promise<GeminiConfig> {
  return invoke("get_gemini_config");
}

async updateGeminiConfig(config: Partial<GeminiConfig>): Promise<void> {
  return invoke("update_gemini_config", { config });
}

async checkGeminiInstalled(): Promise<{ installed: boolean; path?: string; version?: string }> {
  return invoke("check_gemini_installed");
}
```

#### 3.3 UI 组件

**引擎选择器扩展：**
```tsx
// 现有引擎选择下拉框添加 Gemini 选项
const engines = [
  { id: "claude", name: "Claude Code", icon: ClaudeIcon },
  { id: "codex", name: "OpenAI Codex", icon: CodexIcon },
  { id: "gemini", name: "Gemini CLI", icon: GeminiIcon },  // 新增
];
```

**Gemini 设置面板：**
- 认证方式选择（Google OAuth / API Key / Vertex AI）
- 模型选择（gemini-2.5-pro, gemini-2.5-flash 等）
- 审批模式（auto_edit, yolo）
- 安装状态检测

---

### Phase 4: 功能对齐与优化 (2 天)

#### 4.1 特性映射

| 功能 | Claude CLI | Codex | Gemini CLI |
|------|-----------|-------|------------|
| 流式输出 | JSONL | JSON Events | stream-json (JSONL) |
| 工具调用 | 支持 | 支持 | 支持 |
| 会话恢复 | `--resume` | `--resume` | 待确认 |
| 权限模式 | `--allowedTools` | `--mode` | `--approval-mode` / `--yolo` |
| 上下文目录 | 自动 | 自动 | `--include-directories` |
| MCP 支持 | 支持 | N/A | 支持 |

#### 4.2 消息格式统一

确保所有 Gemini 事件都能正确转换为现有 UI 可渲染的格式：

```typescript
// 消息渲染器检查 geminiMetadata
function renderMessage(msg: ClaudeStreamMessage) {
  const isGemini = !!msg.geminiMetadata;

  // 统一渲染逻辑
  switch (msg.type) {
    case "assistant":
      return <AssistantMessage content={msg.message?.content} provider={isGemini ? "gemini" : "claude"} />;
    // ...
  }
}
```

---

## 配置文件结构

### `~/.gemini/settings.json`

Gemini CLI 自身的配置（由 CLI 管理）

### Any Code 内部配置

```json
{
  "gemini": {
    "enabled": true,
    "authMethod": "google_oauth",
    "defaultModel": "gemini-2.5-pro",
    "approvalMode": "auto_edit",
    "env": {
      "GEMINI_API_KEY": "...",
      "GOOGLE_CLOUD_PROJECT": "..."
    }
  }
}
```

---

## 测试清单

- [ ] Gemini CLI 二进制检测（Windows/macOS/Linux）
- [ ] Google OAuth 认证流程
- [ ] API Key 认证流程
- [ ] 基本会话执行与流式输出
- [ ] 工具调用展示（文件操作、Shell 命令等）
- [ ] 会话取消功能
- [ ] 错误处理与用户提示
- [ ] Token 统计与成本追踪
- [ ] 多标签页并行会话
- [ ] 与 Claude/Codex 的 UI 一致性

---

## 风险与注意事项

1. **认证复杂性**：Gemini 支持多种认证方式，需要良好的 UI 引导
2. **输出格式差异**：stream-json 格式与 Claude JSONL 略有不同，需要仔细适配
3. **功能差异**：部分 Claude Code 特有功能（如 MCP）Gemini 也支持，但配置方式不同
4. **免费配额**：需要在 UI 中提示用户配额限制（60 req/min, 1000 req/day）

---

## 时间估算

| 阶段 | 工作内容 | 预计时间 |
|------|----------|----------|
| Phase 1 | Rust 后端模块 | 2-3 天 |
| Phase 2 | 二进制检测与配置 | 1 天 |
| Phase 3 | 前端集成 | 2-3 天 |
| Phase 4 | 功能对齐与优化 | 2 天 |
| 测试 | 全面测试与 Bug 修复 | 2 天 |
| **总计** | | **9-11 天** |

---

## 参考资源

- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli)
- [Headless Mode 文档](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md)
- [认证指南](https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.md)
- [配置指南](https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/configuration.md)
