# OpenAI Codex 完整集成方案

## 📋 概述

本文档详细说明了如何将 OpenAI Codex 的 `exec` 模式完整集成到当前项目中,实现与 Claude Code 的无缝切换和统一的用户体验。

## 🎯 集成目标

1. **统一接口** - Codex 和 Claude Code 共享相同的消息处理流程
2. **事件映射** - 将 Codex 的 JSONL 事件转换为 ClaudeStreamMessage 格式
3. **模式切换** - 支持用户在 UI 中选择使用 Codex 或 Claude Code
4. **向后兼容** - 不破坏现有的 Claude Code 功能

## 📦 已完成的工作

### 1. 类型定义 (✅ 完成)

**文件:** `src/types/codex.ts`

**内容:**
- Codex 事件类型 (CodexEvent)
- Codex 项目类型 (CodexItem)
- 执行配置 (CodexExecutionOptions)
- 会话管理 (CodexSession)

**关键类型:**
```typescript
// 事件类型
export type CodexEvent =
  | CodexThreadStartedEvent
  | CodexTurnStartedEvent
  | CodexTurnCompletedEvent
  | CodexItemStartedEvent
  | CodexItemCompletedEvent
  | CodexErrorEvent;

// 项目类型
export type CodexItem =
  | CodexAgentMessageItem
  | CodexReasoningItem
  | CodexCommandExecutionItem
  | CodexFileChangeItem
  | CodexMcpToolCallItem
  | CodexWebSearchItem
  | CodexTodoListItem;

// 执行选项
export interface CodexExecutionOptions {
  projectPath: string;
  prompt: string;
  mode?: 'read-only' | 'full-auto' | 'danger-full-access';
  model?: string;
  json?: boolean;
  sessionId?: string;
  resumeLast?: boolean;
}
```

### 2. API 扩展 (✅ 完成)

**文件:** `src/lib/api.ts`

**新增方法:**
- `executeCodex()` - 执行 Codex 任务
- `resumeCodex()` - 恢复指定会话
- `resumeLastCodex()` - 恢复最后一个会话
- `cancelCodex()` - 取消执行
- `listCodexSessions()` - 列出所有会话
- `getCodexSession()` - 获取会话详情
- `deleteCodexSession()` - 删除会话
- `checkCodexAvailability()` - 检查 Codex 可用性
- `setCodexApiKey()` / `getCodexApiKey()` - API 密钥管理

**示例用法:**
```typescript
import { api } from '@/lib/api';

// 执行 Codex 任务
await api.executeCodex({
  projectPath: '/path/to/project',
  prompt: 'Review the code for security issues',
  mode: 'read-only',
  model: 'gpt-5.1-codex-max',
  json: true
});
```

### 3. 事件转换工具 (✅ 完成)

**文件:** `src/lib/codexConverter.ts`

**功能:**
- 解析 Codex JSONL 事件流
- 转换为 ClaudeStreamMessage 格式
- 维护会话状态和上下文
- 映射所有 Codex 项目类型到相应的 Claude 消息类型

**转换映射:**
| Codex 类型 | Claude 消息类型 | 说明 |
|-----------|----------------|------|
| `agent_message` | `assistant` | 助手回复 |
| `reasoning` | `thinking` | 思考过程 |
| `command_execution` | `tool_use` → `tool_result` | 命令执行 |
| `file_change` | `tool_use` → `tool_result` | 文件操作 |
| `mcp_tool_call` | `tool_use` → `tool_result` | MCP 工具调用 |
| `web_search` | `tool_use` → `tool_result` | 网络搜索 |
| `todo_list` | `system` (info) | 计划列表 |
| `turn.completed` | `system` (info) | Token 使用统计 |
| `error` | `system` (error) | 错误信息 |

**使用示例:**
```typescript
import { codexConverter } from '@/lib/codexConverter';

// 转换单个事件
const message = codexConverter.convertEvent(jsonlLine);
if (message) {
  setMessages(prev => [...prev, message]);
}

// 重置状态(新会话时)
codexConverter.reset();
```

### 4. ClaudeStreamMessage 类型扩展 (✅ 完成)

**文件:** `src/types/claude.ts`

**变更:**
- 添加 `"thinking"` 和 `"tool_use"` 到 type 联合类型
- 添加 `codexMetadata` 字段以保存原始 Codex 信息
- 添加 `role` 字段到 message 对象

## 🚧 待实施的工作

### 5. usePromptExecution Hook 更新 (⏳ 待完成)

**文件:** `src/hooks/usePromptExecution.ts`

**需要添加的功能:**

#### 5.1 添加执行模式参数
```typescript
interface UsePromptExecutionConfig {
  // ... 现有字段 ...

  // 🆕 新增字段
  executionEngine?: 'claude' | 'codex'; // 执行引擎选择
  codexMode?: 'read-only' | 'full-auto' | 'danger-full-access'; // Codex 执行模式
  codexModel?: string; // Codex 模型选择
}
```

#### 5.2 Codex 事件监听
```typescript
// 在事件监听设置部分添加
if (executionEngine === 'codex') {
  // Codex 事件监听器
  const codexOutputUnlisten = await listen<string>('codex-output', (evt) => {
    // 转换 Codex JSONL 事件
    const message = codexConverter.convertEvent(evt.payload);
    if (message && isMountedRef.current) {
      setMessages(prev => [...prev, message]);
    }
  });

  const codexErrorUnlisten = await listen<string>('codex-error', (evt) => {
    console.error('Codex error:', evt.payload);
    setError(evt.payload);
  });

  const codexCompleteUnlisten = await listen<boolean>('codex-complete', (evt) => {
    console.log('Codex execution complete');
    processComplete();
  });

  unlistenRefs.current = [codexOutputUnlisten, codexErrorUnlisten, codexCompleteUnlisten];
} else {
  // 现有的 Claude Code 事件监听逻辑...
}
```

#### 5.3 API 执行分支
```typescript
// 在 API 执行部分
if (executionEngine === 'codex') {
  if (effectiveSession && !isFirstPrompt) {
    // 恢复 Codex 会话
    await api.resumeCodex(effectiveSession.id, {
      projectPath,
      prompt: processedPrompt,
      mode: codexMode || 'read-only',
      model: codexModel || model,
      json: true
    });
  } else {
    // 新建 Codex 会话
    await api.executeCodex({
      projectPath,
      prompt: processedPrompt,
      mode: codexMode || 'read-only',
      model: codexModel || model,
      json: true
    });
  }
} else {
  // 现有的 Claude Code 执行逻辑...
}
```

### 6. UI 更新 - 执行引擎选择器 (⏳ 待完成)

**组件:** `src/components/FloatingPromptInput/index.tsx` 或新建 `ExecutionEngineSelector.tsx`

**需求:**
- 添加切换按钮/下拉菜单选择执行引擎 (Claude/Codex)
- Codex 模式选择器 (只读/编辑/完全访问)
- Codex 模型选择器
- API 密钥配置界面

**UI 设计建议:**
```
┌─────────────────────────────────────────┐
│ 执行引擎: [Claude Code ▼] [⚙️ 设置]     │
├─────────────────────────────────────────┤
│ 模型: [Sonnet ▼]                        │
│ 计划模式: [○ 关闭 ● 开启]               │
├─────────────────────────────────────────┤
│ [输入提示词...]                          │
└─────────────────────────────────────────┘

// 切换到 Codex 时
┌─────────────────────────────────────────┐
│ 执行引擎: [Codex ▼] [⚙️ 设置]           │
├─────────────────────────────────────────┤
│ 模型: [gpt-5.1-codex-max ▼]            │
│ 执行模式: [只读 ▼]                      │
├─────────────────────────────────────────┤
│ [输入提示词...]                          │
└─────────────────────────────────────────┘
```

### 7. 后端 Rust 实现 (⏳ 待完成)

**文件:** `src-tauri/src/commands/codex.rs` (新建)

**需要实现的 Tauri Commands:**

#### 7.1 核心执行方法
```rust
#[tauri::command]
async fn execute_codex(
    options: CodexExecutionOptions,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // 1. 构建 codex exec 命令
    let mut cmd = Command::new("codex");
    cmd.arg("exec");
    cmd.arg("--json"); // 启用 JSON 输出模式

    // 2. 添加选项
    match options.mode {
        CodexExecutionMode::FullAuto => cmd.arg("--full-auto"),
        CodexExecutionMode::DangerFullAccess => cmd.arg("--sandbox").arg("danger-full-access"),
        _ => {} // read-only 是默认模式
    };

    if let Some(model) = options.model {
        cmd.arg("--model").arg(model);
    }

    if options.skip_git_repo_check {
        cmd.arg("--skip-git-repo-check");
    }

    // 3. 设置工作目录和环境变量
    cmd.current_dir(&options.project_path);

    if let Some(api_key) = options.api_key {
        cmd.env("CODEX_API_KEY", api_key);
    }

    // 4. 添加提示词
    cmd.arg(&options.prompt);

    // 5. 启动进程并流式处理输出
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn codex: {}", e))?;

    // 6. 获取 stdout 和 stderr
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // 7. 读取 JSONL 输出并发送事件
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                // 发送 codex-output 事件到前端
                app_handle_clone.emit_all("codex-output", line).ok();
            }
        }

        // 发送完成事件
        app_handle_clone.emit_all("codex-complete", true).ok();
    });

    // 8. 处理错误输出
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                app_handle.emit_all("codex-error", line).ok();
            }
        }
    });

    Ok(())
}
```

#### 7.2 会话恢复方法
```rust
#[tauri::command]
async fn resume_codex(
    session_id: String,
    options: CodexExecutionOptions,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // 类似 execute_codex,但添加 resume 参数
    let mut cmd = Command::new("codex");
    cmd.arg("exec");
    cmd.arg("resume");
    cmd.arg(&session_id);
    cmd.arg("--json");

    // ... 其余逻辑类似 execute_codex
}

#[tauri::command]
async fn resume_last_codex(
    options: CodexExecutionOptions,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let mut cmd = Command::new("codex");
    cmd.arg("exec");
    cmd.arg("resume");
    cmd.arg("--last");
    cmd.arg("--json");

    // ... 其余逻辑类似
}
```

#### 7.3 会话管理
```rust
#[tauri::command]
async fn list_codex_sessions() -> Result<Vec<CodexSession>, String> {
    // 读取 ~/.codex/sessions 目录
    // 解析会话元数据
    // 返回会话列表
}

#[tauri::command]
async fn get_codex_session(session_id: String) -> Result<Option<CodexSession>, String> {
    // 读取指定会话的详细信息
}

#[tauri::command]
async fn delete_codex_session(session_id: String) -> Result<String, String> {
    // 删除会话文件
}
```

#### 7.4 辅助方法
```rust
#[tauri::command]
async fn check_codex_availability() -> Result<CodexAvailability, String> {
    // 执行 `codex --version` 检查 Codex 是否安装
    let output = Command::new("codex")
        .arg("--version")
        .output()
        .map_err(|e| format!("Codex not found: {}", e))?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(CodexAvailability {
            available: true,
            version: Some(version.trim().to_string()),
            error: None,
        })
    } else {
        Ok(CodexAvailability {
            available: false,
            version: None,
            error: Some("Codex CLI not installed".to_string()),
        })
    }
}

#[tauri::command]
async fn set_codex_api_key(api_key: String) -> Result<String, String> {
    // 保存 API key 到配置文件或环境变量
}

#[tauri::command]
async fn get_codex_api_key() -> Result<Option<String>, String> {
    // 读取并返回 masked API key
}
```

#### 7.5 进程取消
```rust
use std::sync::Arc;
use tokio::sync::Mutex;

// 全局进程注册表
lazy_static! {
    static ref CODEX_PROCESSES: Arc<Mutex<HashMap<String, Child>>> = Arc::new(Mutex::new(HashMap::new()));
}

#[tauri::command]
async fn cancel_codex(session_id: Option<String>) -> Result<(), String> {
    let mut processes = CODEX_PROCESSES.lock().await;

    if let Some(sid) = session_id {
        if let Some(mut child) = processes.remove(&sid) {
            child.kill().map_err(|e| format!("Failed to kill process: {}", e))?;
        }
    } else {
        // 取消所有进程
        for (_, mut child) in processes.drain() {
            child.kill().ok();
        }
    }

    Ok(())
}
```

**注册 Commands:**
```rust
// 在 src-tauri/src/main.rs
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // ... 现有 commands ...

            // Codex commands
            execute_codex,
            resume_codex,
            resume_last_codex,
            cancel_codex,
            list_codex_sessions,
            get_codex_session,
            delete_codex_session,
            check_codex_availability,
            set_codex_api_key,
            get_codex_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 8. 设置界面 (⏳ 待完成)

**组件:** `src/components/Settings/CodexSettings.tsx` (新建)

**功能:**
- Codex API 密钥配置
- 默认执行模式设置
- 默认模型选择
- Codex CLI 路径配置 (如果不在 PATH 中)
- 会话历史管理

### 9. 会话列表集成 (⏳ 待完成)

**文件:** `src/components/SessionList.tsx`

**功能:**
- 显示 Codex 会话
- 区分 Codex 和 Claude Code 会话 (添加图标/标签)
- 支持恢复 Codex 会话
- 支持删除 Codex 会话

## 📝 使用示例

### 前端完整使用流程

```typescript
// 1. 检查 Codex 可用性
const availability = await api.checkCodexAvailability();
if (!availability.available) {
  console.error('Codex not available:', availability.error);
  return;
}

// 2. 配置 API 密钥 (首次使用)
await api.setCodexApiKey('sk-...');

// 3. 执行 Codex 任务
await api.executeCodex({
  projectPath: '/path/to/project',
  prompt: 'Review security vulnerabilities in authentication module',
  mode: 'read-only',
  model: 'gpt-5.1-codex-max',
  json: true
});

// 4. 监听事件并显示消息
listen<string>('codex-output', (evt) => {
  const message = codexConverter.convertEvent(evt.payload);
  if (message) {
    setMessages(prev => [...prev, message]);
  }
});

// 5. 恢复会话
const sessions = await api.listCodexSessions();
const lastSession = sessions[sessions.length - 1];
await api.resumeCodex(lastSession.id, {
  projectPath: '/path/to/project',
  prompt: 'Fix the issues you found',
  json: true
});
```

## 🔧 配置与环境

### 环境变量
- `CODEX_API_KEY` - OpenAI Codex API 密钥
- `CODEX_MODEL` - 默认模型 (可选)

### 配置文件
```json
// ~/.claude/settings.json
{
  "codex": {
    "default_mode": "read-only",
    "default_model": "gpt-5.1-codex-max",
    "api_key_masked": "sk-...***...xyz"
  }
}
```

## 🧪 测试计划

### 单元测试
- [ ] CodexEventConverter 事件转换测试
- [ ] API 方法调用测试
- [ ] 类型定义正确性测试

### 集成测试
- [ ] 完整执行流程测试
- [ ] 会话恢复测试
- [ ] 取消执行测试
- [ ] 错误处理测试

### E2E 测试
- [ ] UI 切换执行引擎测试
- [ ] 消息显示一致性测试
- [ ] 多会话管理测试

## 📊 实施进度

| 任务 | 状态 | 完成度 |
|------|------|--------|
| 类型定义 | ✅ 完成 | 100% |
| API 扩展 | ✅ 完成 | 100% |
| 事件转换工具 | ✅ 完成 | 100% |
| ClaudeStreamMessage 扩展 | ✅ 完成 | 100% |
| usePromptExecution 更新 | ⏳ 待实施 | 0% |
| UI 执行引擎选择器 | ⏳ 待实施 | 0% |
| 后端 Rust 实现 | ⏳ 待实施 | 0% |
| 设置界面 | ⏳ 待实施 | 0% |
| 会话列表集成 | ⏳ 待实施 | 0% |
| 测试 | ⏳ 待实施 | 0% |

**总体完成度:** 40%

## 🚀 后续优化

1. **性能优化**
   - 大输出流的缓冲处理
   - 虚拟滚动优化 (已有基础)
   - 事件节流/防抖

2. **用户体验**
   - 执行进度指示器
   - Token 使用实时显示
   - 错误恢复机制

3. **高级功能**
   - 结构化输出支持 (`--output-schema`)
   - 输出文件保存 (`-o` 选项)
   - 自定义 Git 检查行为
   - 多项目并行执行

4. **安全性**
   - API 密钥加密存储
   - 危险操作二次确认
   - 沙箱模式强制执行

## 📚 参考文档

- [OpenAI Codex Exec 文档](https://github.com/openai/codex/blob/main/docs/exec.md)
- [当前项目架构文档](./ARCHITECTURE.md)
- [Claude Code CLI 文档](https://docs.claude.ai/code/)

## 💡 注意事项

1. **Codex 与 Claude Code 的差异**
   - Codex 默认是只读模式,需要显式启用文件编辑
   - Codex 的事件流格式与 Claude Code 不同,需要转换
   - Codex 的会话管理机制可能不同

2. **向后兼容性**
   - 确保所有现有 Claude Code 功能正常工作
   - 提供清晰的迁移路径
   - 支持混合使用场景

3. **API 密钥管理**
   - Codex 使用单独的 API 密钥
   - 需要安全存储和传输
   - 支持密钥轮换

---

**文档版本:** 1.0
**创建日期:** 2025-01-23
**最后更新:** 2025-01-23
**维护者:** Codex Integration Team
