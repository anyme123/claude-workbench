/**
 * Claude ↔ Codex Session 转换模块
 *
 * 实现 Claude 与 Codex 引擎之间的 Session 双向转换功能。
 * 支持：
 * - Claude → Codex：将 Claude session 转换为 Codex 可执行的 session
 * - Codex → Claude：将 Codex session 转换为 Claude 可加载的历史记录
 *
 * 核心特性：
 * - 自动识别引擎类型（UUID vs rollout-前缀）
 * - 生成新的 Session ID（避免冲突）
 * - 元数据中记录转换来源（可追溯）
 * - 工具调用名称映射（bash ↔ shell_command 等）
 * - 仅支持已完成的 Session 转换
 */

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use once_cell::sync::Lazy;

// ================================
// 数据结构定义
// ================================

/// 转换来源信息 - 记录 Session 的转换历史
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionSource {
    /// 源引擎类型: "claude" | "codex"
    pub engine: String,
    /// 源 Session ID
    pub session_id: String,
    /// 转换时间戳 (ISO 8601)
    pub converted_at: String,
    /// 源项目路径
    pub source_project_path: String,
}

/// 转换结果 - 返回给前端的转换信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionResult {
    /// 是否成功
    pub success: bool,
    /// 新生成的 Session ID
    pub new_session_id: String,
    /// 目标引擎类型
    pub target_engine: String,
    /// 转换的消息数量
    pub message_count: usize,
    /// 转换来源信息
    pub source: ConversionSource,
    /// 目标文件路径
    pub target_path: String,
    /// 错误信息 (如果失败)
    pub error: Option<String>,
}

// ================================
// Claude 消息结构
// ================================

/// Claude JSONL 消息条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMessage {
    /// 消息类型: "user" | "assistant" | "system" | "result"
    #[serde(rename = "type")]
    pub message_type: String,

    /// 子类型 (可选)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtype: Option<String>,

    /// 消息内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<ClaudeMessageContent>,

    /// 时间戳 (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,

    /// 接收时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub received_at: Option<String>,

    /// 发送时间 (用户消息)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sent_at: Option<String>,

    /// 模型信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Session ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,

    /// 转换元数据
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversion_source: Option<ConversionSource>,

    /// 扩展字段 (允许其他未定义字段)
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// Claude 消息内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMessageContent {
    pub role: String,
    pub content: Vec<ClaudeContentBlock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
}

/// Claude 内容块 - 使用标签联合类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClaudeContentBlock {
    #[serde(rename = "text")]
    Text { text: String },

    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },

    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_error: Option<bool>,
    },

    #[serde(rename = "thinking")]
    Thinking { thinking: String },
}

/// Token 使用统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_tokens: Option<u64>,
}

// ================================
// Codex 事件结构
// ================================

/// Codex JSONL 事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexEvent {
    #[serde(rename = "type")]
    pub event_type: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<CodexUsage>,
}

/// Codex Usage 统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexUsage {
    pub input_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_input_tokens: Option<u64>,
    pub output_tokens: u64,
}

// ================================
// 工具名称映射表
// ================================

/// Codex → Claude 工具名称映射
pub static CODEX_TO_CLAUDE_TOOL_MAP: Lazy<HashMap<&'static str, &'static str>> = Lazy::new(|| {
    let mut m = HashMap::new();
    // Command execution
    m.insert("shell_command", "bash");
    m.insert("shell", "bash");
    m.insert("terminal", "bash");
    m.insert("execute", "bash");
    m.insert("run_command", "bash");
    // File operations
    m.insert("edit_file", "edit");
    m.insert("modify_file", "edit");
    m.insert("update_file", "edit");
    m.insert("patch_file", "edit");
    m.insert("edited", "edit");
    m.insert("str_replace_editor", "edit");
    m.insert("apply_patch", "edit");
    m.insert("read_file", "read");
    m.insert("view_file", "read");
    m.insert("create_file", "write");
    m.insert("write_file", "write");
    m.insert("save_file", "write");
    m.insert("delete_file", "bash");
    // Search operations
    m.insert("search_files", "grep");
    m.insert("find_files", "glob");
    m.insert("list_files", "ls");
    m.insert("list_directory", "ls");
    // Web operations
    m.insert("web_search", "websearch");
    m.insert("search_web", "websearch");
    m.insert("fetch_url", "webfetch");
    m.insert("get_url", "webfetch");
    m
});

/// Claude → Codex 工具名称映射 (反向)
pub static CLAUDE_TO_CODEX_TOOL_MAP: Lazy<HashMap<&'static str, &'static str>> = Lazy::new(|| {
    let mut m = HashMap::new();
    m.insert("bash", "shell_command");
    m.insert("edit", "edit_file");
    m.insert("read", "read_file");
    m.insert("write", "write_file");
    m.insert("grep", "search_files");
    m.insert("glob", "find_files");
    m.insert("ls", "list_directory");
    m.insert("websearch", "web_search");
    m.insert("webfetch", "fetch_url");
    m
});

/// 映射 Codex 工具名到 Claude 工具名
/// MCP 工具 (mcp__ 前缀) 不进行映射
pub fn map_codex_to_claude_tool(codex_name: &str) -> String {
    if codex_name.starts_with("mcp__") {
        return codex_name.to_string();
    }
    let lower = codex_name.to_lowercase();
    CODEX_TO_CLAUDE_TOOL_MAP
        .get(lower.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| codex_name.to_string())
}

/// 映射 Claude 工具名到 Codex 工具名
/// MCP 工具 (mcp__ 前缀) 不进行映射
pub fn map_claude_to_codex_tool(claude_name: &str) -> String {
    if claude_name.starts_with("mcp__") {
        return claude_name.to_string();
    }
    let lower = claude_name.to_lowercase();
    CLAUDE_TO_CODEX_TOOL_MAP
        .get(lower.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| claude_name.to_string())
}

// ================================
// Claude → Codex 转换器
// ================================

/// Claude Session → Codex Session 转换器
pub struct ClaudeToCodexConverter {
    source_session_id: String,
    project_id: String,          // 实际的目录名（如 C--Users-...）
    project_path: String,        // 原始项目路径
    new_session_uuid: String,    // 纯 UUID（用于文件内容）
    new_session_filename: String, // rollout-{uuid}（用于文件名）
}

impl ClaudeToCodexConverter {
    pub fn new(source_session_id: String, project_id: String, project_path: String) -> Self {
        let uuid = uuid::Uuid::new_v4().to_string();
        let new_session_uuid = uuid.clone();

        // 生成带时间戳的文件名：rollout-2025-12-01T09-26-15-{uuid}
        let now = chrono::Utc::now();
        let timestamp = now.format("%Y-%m-%dT%H-%M-%S").to_string();
        let new_session_filename = format!("rollout-{}-{}", timestamp, uuid);

        Self {
            source_session_id,
            project_id,
            project_path,
            new_session_uuid,
            new_session_filename,
        }
    }

    pub fn convert(&self) -> Result<ConversionResult, String> {
        log::info!(
            "Converting Claude session {} to Codex",
            self.source_session_id
        );

        // 1. 读取源 Claude session
        let claude_messages = self.read_claude_session()?;

        // 2. 验证 session 已完成
        self.validate_session_completed(&claude_messages)?;

        // 3. 转换消息为 Codex 事件
        let mut codex_events = Vec::new();

        // 3a. 创建 session_meta 事件 (首行)
        let first_timestamp = claude_messages
            .first()
            .and_then(|m| {
                m.timestamp
                    .clone()
                    .or_else(|| m.sent_at.clone())
                    .or_else(|| m.received_at.clone())
            })
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
        let model = claude_messages.iter().find_map(|m| m.model.clone());
        codex_events.push(self.create_session_meta(&first_timestamp, model.as_deref()));

        // 3b. 转换每条消息（拆分多内容块为多个事件）
        for msg in &claude_messages {
            codex_events.extend(self.convert_claude_message(msg));
        }

        // 4. 写入目标文件
        let target_path = self.write_codex_session(&codex_events)?;

        log::info!(
            "Successfully converted {} messages to Codex session {}",
            codex_events.len(),
            self.new_session_filename
        );

        Ok(ConversionResult {
            success: true,
            new_session_id: self.new_session_filename.clone(), // 返回文件名（带 rollout- 前缀）
            target_engine: "codex".to_string(),
            message_count: codex_events.len(),
            source: ConversionSource {
                engine: "claude".to_string(),
                session_id: self.source_session_id.clone(),
                converted_at: chrono::Utc::now().to_rfc3339(),
                source_project_path: self.project_path.clone(),
            },
            target_path,
            error: None,
        })
    }

    /// 读取 Claude session 文件
    fn read_claude_session(&self) -> Result<Vec<ClaudeMessage>, String> {
        let claude_dir = super::super::claude::get_claude_dir()
            .map_err(|e| format!("Failed to get Claude directory: {}", e))?;

        // 直接使用 project_id（实际的目录名）
        let session_path = claude_dir
            .join("projects")
            .join(&self.project_id)
            .join(format!("{}.jsonl", self.source_session_id));

        if !session_path.exists() {
            return Err(format!(
                "Claude session file not found: {}",
                session_path.display()
            ));
        }

        let file = std::fs::File::open(&session_path)
            .map_err(|e| format!("Failed to open session file: {}", e))?;

        let reader = BufReader::new(file);
        let mut messages = Vec::new();

        for line in reader.lines() {
            let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
            if line.trim().is_empty() {
                continue;
            }

            match serde_json::from_str::<ClaudeMessage>(&line) {
                Ok(msg) => messages.push(msg),
                Err(e) => log::warn!("Failed to parse Claude message: {}", e),
            }
        }

        if messages.is_empty() {
            return Err("Claude session is empty".to_string());
        }

        log::info!("Read {} messages from Claude session", messages.len());
        Ok(messages)
    }

    /// 验证 session 已完成（最后一条消息不应该是 user）
    fn validate_session_completed(&self, messages: &[ClaudeMessage]) -> Result<(), String> {
        if messages.is_empty() {
            return Err("Session is empty".to_string());
        }

        if let Some(last) = messages.last() {
            if last.message_type == "user" {
                return Err(
                    "Session appears incomplete (ends with user message)".to_string()
                );
            }
        }

        Ok(())
    }

    /// 创建 session_meta 事件（Codex session 文件的首行）
    fn create_session_meta(&self, timestamp: &str, model: Option<&str>) -> CodexEvent {
        CodexEvent {
            event_type: "session_meta".to_string(),
            timestamp: Some(timestamp.to_string()),
            payload: Some(serde_json::json!({
                "id": self.new_session_uuid, // 使用纯 UUID（不带 rollout- 前缀）
                "timestamp": timestamp,
                "cwd": self.project_path,
                "originator": "session_converter",
                "cli_version": "converted",
                "source": "conversion",
                "model_provider": model.map(|_| "converted").unwrap_or("unknown"),
                "conversion_source": {
                    "engine": "claude",
                    "session_id": self.source_session_id,
                    "converted_at": chrono::Utc::now().to_rfc3339(),
                    "source_project_path": self.project_path
                }
            })),
            thread_id: None,
            usage: None,
        }
    }

    /// 转换单条 Claude 消息为多个 Codex 事件
    fn convert_claude_message(&self, msg: &ClaudeMessage) -> Vec<CodexEvent> {
        let mut events = Vec::new();
        let timestamp = msg
            .timestamp
            .clone()
            .or_else(|| msg.received_at.clone())
            .or_else(|| msg.sent_at.clone())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

        match msg.message_type.as_str() {
            "user" => {
                if let Some(ref content) = msg.message {
                    events.push(self.create_user_response_item(&content.content, &timestamp));
                }
            }
            "assistant" => {
                if let Some(ref content) = msg.message {
                    // 拆分多内容块为多个事件
                    events.extend(self.convert_assistant_content(&content.content, &timestamp));
                }
            }
            _ => {
                // 跳过其他类型（system等）
            }
        }

        events
    }

    /// 创建用户消息事件
    fn create_user_response_item(
        &self,
        blocks: &[ClaudeContentBlock],
        timestamp: &str,
    ) -> CodexEvent {
        let content: Vec<Value> = blocks
            .iter()
            .filter_map(|b| match b {
                ClaudeContentBlock::Text { text } => {
                    // Codex 使用 input_text 类型
                    Some(serde_json::json!({"type": "input_text", "text": text}))
                }
                _ => None,
            })
            .collect();

        CodexEvent {
            event_type: "response_item".to_string(),
            timestamp: Some(timestamp.to_string()),
            payload: Some(serde_json::json!({
                "type": "message",
                "role": "user",
                "content": content
            })),
            thread_id: None,
            usage: None,
        }
    }

    /// 转换 assistant 内容块为多个 Codex 事件
    fn convert_assistant_content(
        &self,
        blocks: &[ClaudeContentBlock],
        timestamp: &str,
    ) -> Vec<CodexEvent> {
        let mut events = Vec::new();

        for block in blocks {
            match block {
                ClaudeContentBlock::Text { text } => {
                    events.push(CodexEvent {
                        event_type: "response_item".to_string(),
                        timestamp: Some(timestamp.to_string()),
                        payload: Some(serde_json::json!({
                            "type": "message",
                            "role": "assistant",
                            "content": [{ "type": "output_text", "text": text }] // Codex 使用 output_text
                        })),
                        thread_id: None,
                        usage: None,
                    });
                }
                ClaudeContentBlock::ToolUse { id, name, input } => {
                    // 生成新的 call_id
                    let new_id = format!("call_{}", uuid::Uuid::new_v4());
                    let codex_tool_name = map_claude_to_codex_tool(name);
                    let arguments = serde_json::to_string(input).unwrap_or_default();

                    events.push(CodexEvent {
                        event_type: "response_item".to_string(),
                        timestamp: Some(timestamp.to_string()),
                        payload: Some(serde_json::json!({
                            "type": "function_call",
                            "name": codex_tool_name,
                            "arguments": arguments,
                            "call_id": new_id,
                            "timestamp": timestamp,
                            "original_tool_use_id": id
                        })),
                        thread_id: None,
                        usage: None,
                    });
                }
                ClaudeContentBlock::ToolResult {
                    tool_use_id,
                    content,
                    is_error,
                } => {
                    let output_str = match content {
                        Value::String(s) => s.clone(),
                        _ => serde_json::to_string(content).unwrap_or_default(),
                    };

                    events.push(CodexEvent {
                        event_type: "response_item".to_string(),
                        timestamp: Some(timestamp.to_string()),
                        payload: Some(serde_json::json!({
                            "type": "function_call_output",
                            "call_id": tool_use_id,
                            "output": output_str,
                            "is_error": is_error.unwrap_or(false),
                            "timestamp": timestamp
                        })),
                        thread_id: None,
                        usage: None,
                    });
                }
                ClaudeContentBlock::Thinking { thinking } => {
                    events.push(CodexEvent {
                        event_type: "event_msg".to_string(),
                        timestamp: Some(timestamp.to_string()),
                        payload: Some(serde_json::json!({
                            "item": {
                                "id": format!("reasoning_{}", uuid::Uuid::new_v4()),
                                "type": "reasoning",
                                "text": thinking
                            },
                            "phase": "completed"
                        })),
                        thread_id: None,
                        usage: None,
                    });
                }
            }
        }

        events
    }

    /// 写入 Codex session 文件
    fn write_codex_session(&self, events: &[CodexEvent]) -> Result<String, String> {
        let sessions_dir = super::config::get_codex_sessions_dir()
            .map_err(|e| format!("Failed to get Codex sessions directory: {}", e))?;

        // 创建日期目录结构 YYYY/MM/DD
        let now = chrono::Utc::now();
        let date_dir = sessions_dir
            .join(now.format("%Y").to_string())
            .join(now.format("%m").to_string())
            .join(now.format("%d").to_string());

        std::fs::create_dir_all(&date_dir)
            .map_err(|e| format!("Failed to create date directory: {}", e))?;

        let file_path = date_dir.join(format!("{}.jsonl", self.new_session_filename));

        let mut file = std::fs::File::create(&file_path)
            .map_err(|e| format!("Failed to create session file: {}", e))?;

        // 逐行写入 JSONL
        for event in events {
            let line = serde_json::to_string(event)
                .map_err(|e| format!("Failed to serialize event: {}", e))?;
            writeln!(file, "{}", line)
                .map_err(|e| format!("Failed to write event: {}", e))?;
        }

        Ok(file_path.to_string_lossy().to_string())
    }
}

// ================================
// Codex → Claude 转换器
// ================================

/// Codex Session → Claude Session 转换器
pub struct CodexToClaudeConverter {
    source_session_id: String,
    project_id: String,      // 实际的目录名（如 C--Users-...）
    project_path: String,    // 原始项目路径
    new_session_id: String,  // UUID 格式
}

impl CodexToClaudeConverter {
    pub fn new(source_session_id: String, project_id: String, project_path: String) -> Self {
        let new_session_id = uuid::Uuid::new_v4().to_string();
        Self {
            source_session_id,
            project_id,
            project_path,
            new_session_id,
        }
    }

    pub fn convert(&self) -> Result<ConversionResult, String> {
        log::info!(
            "Converting Codex session {} to Claude",
            self.source_session_id
        );

        // 1. 读取源 Codex session
        let codex_events = self.read_codex_session()?;

        // 2. 验证 session 已完成
        self.validate_session_completed(&codex_events)?;

        // 3. 转换事件为 Claude 消息
        let mut claude_messages: Vec<ClaudeMessage> = Vec::new();

        for event in &codex_events {
            if let Some(msg) = self.convert_codex_event(event) {
                claude_messages.push(msg);
            }
        }

        // 4. 写入目标文件
        let target_path = self.write_claude_session(&claude_messages)?;

        log::info!(
            "Successfully converted {} events to Claude session {}",
            claude_messages.len(),
            self.new_session_id
        );

        Ok(ConversionResult {
            success: true,
            new_session_id: self.new_session_id.clone(),
            target_engine: "claude".to_string(),
            message_count: claude_messages.len(),
            source: ConversionSource {
                engine: "codex".to_string(),
                session_id: self.source_session_id.clone(),
                converted_at: chrono::Utc::now().to_rfc3339(),
                source_project_path: self.project_path.clone(),
            },
            target_path,
            error: None,
        })
    }

    /// 读取 Codex session 文件
    fn read_codex_session(&self) -> Result<Vec<CodexEvent>, String> {
        let sessions_dir = super::config::get_codex_sessions_dir()
            .map_err(|e| format!("Failed to get Codex sessions directory: {}", e))?;

        // 使用 codex/session.rs 中的 find_session_file 函数
        let session_path = super::session::find_session_file(&sessions_dir, &self.source_session_id)
            .ok_or_else(|| {
                format!("Codex session file not found: {}", self.source_session_id)
            })?;

        let file = std::fs::File::open(&session_path)
            .map_err(|e| format!("Failed to open session file: {}", e))?;

        let reader = BufReader::new(file);
        let mut events = Vec::new();

        for line in reader.lines() {
            let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
            if line.trim().is_empty() {
                continue;
            }

            match serde_json::from_str::<CodexEvent>(&line) {
                Ok(event) => events.push(event),
                Err(e) => log::warn!("Failed to parse Codex event: {}", e),
            }
        }

        if events.is_empty() {
            return Err("Codex session is empty".to_string());
        }

        log::info!("Read {} events from Codex session", events.len());
        Ok(events)
    }

    /// 验证 session 已完成
    fn validate_session_completed(&self, _events: &[CodexEvent]) -> Result<(), String> {
        // Codex session 的完成性检查可以更灵活
        // 暂时只检查是否为空
        Ok(())
    }

    /// 转换单个 Codex 事件为 Claude 消息
    fn convert_codex_event(&self, event: &CodexEvent) -> Option<ClaudeMessage> {
        let timestamp = event
            .timestamp
            .clone()
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

        match event.event_type.as_str() {
            "session_meta" => self.convert_session_meta(event, &timestamp),
            "response_item" => self.convert_response_item(event, &timestamp),
            "event_msg" => self.convert_event_msg(event, &timestamp),
            _ => None,
        }
    }

    /// 转换 session_meta 事件
    fn convert_session_meta(&self, event: &CodexEvent, timestamp: &str) -> Option<ClaudeMessage> {
        let payload = event.payload.as_ref()?;
        Some(ClaudeMessage {
            message_type: "system".to_string(),
            subtype: Some("init".to_string()),
            message: None,
            timestamp: Some(timestamp.to_string()),
            received_at: Some(timestamp.to_string()),
            sent_at: None,
            model: payload.get("model").and_then(|v| v.as_str()).map(String::from),
            session_id: Some(self.new_session_id.clone()),
            conversion_source: Some(ConversionSource {
                engine: "codex".to_string(),
                session_id: self.source_session_id.clone(),
                converted_at: chrono::Utc::now().to_rfc3339(),
                source_project_path: self.project_path.clone(),
            }),
            extra: HashMap::new(),
        })
    }

    /// 转换 response_item 事件
    fn convert_response_item(&self, event: &CodexEvent, timestamp: &str) -> Option<ClaudeMessage> {
        let payload = event.payload.as_ref()?;
        let item_type = payload.get("type")?.as_str()?;
        let role = payload
            .get("role")
            .and_then(|v| v.as_str())
            .unwrap_or("assistant");

        match item_type {
            "message" => {
                let content = payload.get("content")?.as_array()?;
                let blocks: Vec<ClaudeContentBlock> = content
                    .iter()
                    .filter_map(|item| {
                        if item.get("type")?.as_str()? == "text" {
                            Some(ClaudeContentBlock::Text {
                                text: item.get("text")?.as_str()?.to_string(),
                            })
                        } else {
                            None
                        }
                    })
                    .collect();

                if blocks.is_empty() {
                    return None;
                }

                Some(ClaudeMessage {
                    message_type: if role == "user" { "user" } else { "assistant" }.to_string(),
                    subtype: None,
                    message: Some(ClaudeMessageContent {
                        role: role.to_string(),
                        content: blocks,
                        usage: None,
                    }),
                    timestamp: Some(timestamp.to_string()),
                    received_at: if role != "user" {
                        Some(timestamp.to_string())
                    } else {
                        None
                    },
                    sent_at: if role == "user" {
                        Some(timestamp.to_string())
                    } else {
                        None
                    },
                    model: None,
                    session_id: None,
                    conversion_source: None,
                    extra: HashMap::new(),
                })
            }
            "function_call" => {
                let name = payload.get("name")?.as_str()?;
                let arguments = payload.get("arguments")?.as_str()?;
                let call_id = payload.get("call_id")?.as_str()?;

                let claude_tool_name = map_codex_to_claude_tool(name);
                let input: Value = serde_json::from_str(arguments).unwrap_or(Value::Null);

                Some(ClaudeMessage {
                    message_type: "assistant".to_string(),
                    subtype: None,
                    message: Some(ClaudeMessageContent {
                        role: "assistant".to_string(),
                        content: vec![ClaudeContentBlock::ToolUse {
                            id: call_id.to_string(),
                            name: claude_tool_name,
                            input,
                        }],
                        usage: None,
                    }),
                    timestamp: Some(timestamp.to_string()),
                    received_at: Some(timestamp.to_string()),
                    sent_at: None,
                    model: None,
                    session_id: None,
                    conversion_source: None,
                    extra: HashMap::new(),
                })
            }
            "function_call_output" => {
                let call_id = payload.get("call_id")?.as_str()?;
                let output = payload.get("output").and_then(|v| v.as_str()).unwrap_or("");
                let is_error = payload.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);

                Some(ClaudeMessage {
                    message_type: "assistant".to_string(),
                    subtype: None,
                    message: Some(ClaudeMessageContent {
                        role: "assistant".to_string(),
                        content: vec![ClaudeContentBlock::ToolResult {
                            tool_use_id: call_id.to_string(),
                            content: Value::String(output.to_string()),
                            is_error: Some(is_error),
                        }],
                        usage: None,
                    }),
                    timestamp: Some(timestamp.to_string()),
                    received_at: Some(timestamp.to_string()),
                    sent_at: None,
                    model: None,
                    session_id: None,
                    conversion_source: None,
                    extra: HashMap::new(),
                })
            }
            _ => None,
        }
    }

    /// 转换 event_msg 事件
    fn convert_event_msg(&self, event: &CodexEvent, timestamp: &str) -> Option<ClaudeMessage> {
        let payload = event.payload.as_ref()?;
        let item = payload.get("item")?;
        let item_type = item.get("type")?.as_str()?;

        match item_type {
            "reasoning" => {
                let text = item.get("text")?.as_str()?;
                Some(ClaudeMessage {
                    message_type: "assistant".to_string(),
                    subtype: None,
                    message: Some(ClaudeMessageContent {
                        role: "assistant".to_string(),
                        content: vec![ClaudeContentBlock::Thinking {
                            thinking: text.to_string(),
                        }],
                        usage: None,
                    }),
                    timestamp: Some(timestamp.to_string()),
                    received_at: Some(timestamp.to_string()),
                    sent_at: None,
                    model: None,
                    session_id: None,
                    conversion_source: None,
                    extra: HashMap::new(),
                })
            }
            "agent_message" => {
                let text = item.get("text")?.as_str()?;
                Some(ClaudeMessage {
                    message_type: "assistant".to_string(),
                    subtype: None,
                    message: Some(ClaudeMessageContent {
                        role: "assistant".to_string(),
                        content: vec![ClaudeContentBlock::Text {
                            text: text.to_string(),
                        }],
                        usage: None,
                    }),
                    timestamp: Some(timestamp.to_string()),
                    received_at: Some(timestamp.to_string()),
                    sent_at: None,
                    model: None,
                    session_id: None,
                    conversion_source: None,
                    extra: HashMap::new(),
                })
            }
            "todo_list" | "file_change" | "mcp_tool_call" => {
                // 转换为 system 消息
                Some(ClaudeMessage {
                    message_type: "system".to_string(),
                    subtype: Some(item_type.to_string()),
                    message: Some(ClaudeMessageContent {
                        role: "system".to_string(),
                        content: vec![ClaudeContentBlock::Text {
                            text: format!("[Codex {}]: {}", item_type, item.to_string()),
                        }],
                        usage: None,
                    }),
                    timestamp: Some(timestamp.to_string()),
                    received_at: Some(timestamp.to_string()),
                    sent_at: None,
                    model: None,
                    session_id: None,
                    conversion_source: None,
                    extra: HashMap::new(),
                })
            }
            "command_execution" => {
                let command = item.get("command")?.as_str()?;
                let output = item
                    .get("aggregated_output")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let exit_code = item.get("exit_code").and_then(|v| v.as_i64()).unwrap_or(0);
                let item_id = item
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("cmd_unknown");

                Some(ClaudeMessage {
                    message_type: "assistant".to_string(),
                    subtype: None,
                    message: Some(ClaudeMessageContent {
                        role: "assistant".to_string(),
                        content: vec![
                            ClaudeContentBlock::ToolUse {
                                id: item_id.to_string(),
                                name: "bash".to_string(),
                                input: serde_json::json!({ "command": command }),
                            },
                            ClaudeContentBlock::ToolResult {
                                tool_use_id: item_id.to_string(),
                                content: Value::String(output.to_string()),
                                is_error: Some(exit_code != 0),
                            },
                        ],
                        usage: None,
                    }),
                    timestamp: Some(timestamp.to_string()),
                    received_at: Some(timestamp.to_string()),
                    sent_at: None,
                    model: None,
                    session_id: None,
                    conversion_source: None,
                    extra: HashMap::new(),
                })
            }
            _ => None,
        }
    }

    /// 写入 Claude session 文件
    fn write_claude_session(&self, messages: &[ClaudeMessage]) -> Result<String, String> {
        let claude_dir = super::super::claude::get_claude_dir()
            .map_err(|e| format!("Failed to get Claude directory: {}", e))?;

        // 直接使用 project_id（实际的目录名）
        let project_dir = claude_dir.join("projects").join(&self.project_id);

        std::fs::create_dir_all(&project_dir)
            .map_err(|e| format!("Failed to create project directory: {}", e))?;

        let file_path = project_dir.join(format!("{}.jsonl", self.new_session_id));

        let mut file = std::fs::File::create(&file_path)
            .map_err(|e| format!("Failed to create session file: {}", e))?;

        for msg in messages {
            let line = serde_json::to_string(msg)
                .map_err(|e| format!("Failed to serialize message: {}", e))?;
            writeln!(file, "{}", line)
                .map_err(|e| format!("Failed to write message: {}", e))?;
        }

        Ok(file_path.to_string_lossy().to_string())
    }
}

// ================================
// Tauri Commands
// ================================

/// 根据文件存在性判断 session 的源引擎类型
fn detect_session_engine(session_id: &str, project_id: &str) -> Result<String, String> {
    // 1. 检查是否为 Codex session（查找 sessions 目录）
    if let Ok(sessions_dir) = super::config::get_codex_sessions_dir() {
        if super::session::find_session_file(&sessions_dir, session_id).is_some() {
            return Ok("codex".to_string());
        }
    }

    // 2. 检查是否为 Claude session（查找 projects 目录）
    if let Ok(claude_dir) = super::super::claude::get_claude_dir() {
        let session_path = claude_dir
            .join("projects")
            .join(project_id)
            .join(format!("{}.jsonl", session_id));
        if session_path.exists() {
            return Ok("claude".to_string());
        }
    }

    Err(format!("Session {} not found in either Claude or Codex directories", session_id))
}

/// 统一转换接口
#[tauri::command]
pub async fn convert_session(
    session_id: String,
    target_engine: String,
    project_id: String,
    project_path: String,
) -> Result<ConversionResult, String> {
    log::info!(
        "Converting session {} to engine: {}, project_id: {}, project_path: {}",
        session_id,
        target_engine,
        project_id,
        project_path
    );

    // 根据文件存在性检测源引擎
    let source_engine = detect_session_engine(&session_id, &project_id)?;

    if source_engine == target_engine {
        return Err(format!(
            "Session {} is already a {} session",
            session_id, target_engine
        ));
    }

    match target_engine.as_str() {
        "codex" => {
            let converter = ClaudeToCodexConverter::new(session_id, project_id, project_path);
            converter.convert()
        }
        "claude" => {
            let converter = CodexToClaudeConverter::new(session_id, project_id, project_path);
            converter.convert()
        }
        _ => Err(format!("Unknown target engine: {}", target_engine)),
    }
}

/// 便捷接口：Claude → Codex
#[tauri::command]
pub async fn convert_claude_to_codex(
    session_id: String,
    project_id: String,
    project_path: String,
) -> Result<ConversionResult, String> {
    convert_session(session_id, "codex".to_string(), project_id, project_path).await
}

/// 便捷接口：Codex → Claude
#[tauri::command]
pub async fn convert_codex_to_claude(
    session_id: String,
    project_id: String,
    project_path: String,
) -> Result<ConversionResult, String> {
    convert_session(session_id, "claude".to_string(), project_id, project_path).await
}
