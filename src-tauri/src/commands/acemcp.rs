/**
 * Acemcp Integration Module
 *
 * 集成 acemcp 语义搜索能力，用于提示词优化时自动添加项目上下文
 *
 * 功能：
 * 1. 与 acemcp MCP server 通过 stdio 通信
 * 2. 提取用户提示词中的技术关键词
 * 3. 调用 search_context 工具获取相关代码
 * 4. 格式化上下文信息并附加到提示词
 */

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::process::Stdio;
use std::path::PathBuf;
use std::collections::HashSet;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use log::{debug, error, info, warn};
use regex::Regex;

// Windows: 导入 CommandExt trait 以使用 creation_flags
#[cfg(target_os = "windows")]
#[allow(unused_imports)]
use std::os::windows::process::CommandExt;

// 嵌入 sidecar 可执行文件作为编译时资源（Node.js 版本）
#[cfg(target_os = "windows")]
const ACEMCP_SIDECAR_BYTES: &[u8] = include_bytes!("../../binaries/acemcp-mcp-server.cjs");

#[cfg(target_os = "macos")]
const ACEMCP_SIDECAR_BYTES: &[u8] = include_bytes!("../../binaries/acemcp-mcp-server.cjs");

#[cfg(target_os = "linux")]
const ACEMCP_SIDECAR_BYTES: &[u8] = include_bytes!("../../binaries/acemcp-mcp-server.cjs");

// ============================================================================
// MCP Protocol Types
// ============================================================================

/// MCP JSON-RPC 请求
#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    params: Option<Value>,
}

/// MCP JSON-RPC 响应
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: u64,
    result: Option<Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}


/// 增强结果
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhancementResult {
    /// 原始提示词
    pub original_prompt: String,
    /// 增强后的提示词（包含上下文）
    pub enhanced_prompt: String,
    /// 找到的上下文条目数
    pub context_count: usize,
    /// 是否成功调用 acemcp
    pub acemcp_used: bool,
    /// 错误信息（如果有）
    pub error: Option<String>,
}

// ============================================================================
// 对话历史分析
// ============================================================================

/// 简化的消息结构（用于读取历史）
#[derive(Debug, Deserialize)]
struct HistoryMessage {
    role: String,
    content: String,
}

/// 从历史中提取的上下文信息
#[derive(Debug, Default)]
struct HistoryContextInfo {
    /// 提到的文件路径
    file_paths: HashSet<String>,
    /// 提到的函数/方法名
    function_names: HashSet<String>,
    /// 提到的模块/包名
    module_names: HashSet<String>,
    /// 关键词
    keywords: HashSet<String>,
}

/// 读取最近的对话历史
async fn load_recent_history(
    session_id: &str,
    project_id: &str,
    limit: usize
) -> Result<Vec<HistoryMessage>> {
    let history_file = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?
        .join(".claude")
        .join("projects")
        .join(project_id)
        .join(format!("{}.jsonl", session_id));

    if !history_file.exists() {
        debug!("History file not found: {:?}", history_file);
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&history_file)
        .map_err(|e| anyhow::anyhow!("Failed to read history file: {}", e))?;

    let mut messages = Vec::new();
    let lines: Vec<&str> = content.lines().collect();

    // 读取最后 N 条消息（倒序取）
    for line in lines.iter().rev().take(limit * 2) {
        if let Ok(msg) = serde_json::from_str::<HistoryMessage>(line) {
            // 只保留用户和助手的消息
            if msg.role == "user" || msg.role == "assistant" {
                messages.push(msg);
                if messages.len() >= limit {
                    break;
                }
            }
        }
    }

    messages.reverse();
    debug!("Loaded {} history messages", messages.len());
    Ok(messages)
}

/// 从历史消息中提取上下文信息
fn extract_context_from_history(history: &[HistoryMessage]) -> HistoryContextInfo {
    let mut info = HistoryContextInfo::default();

    // 编译正则表达式（延迟初始化以避免每次调用都编译）
    lazy_static::lazy_static! {
        // 匹配文件路径: path/to/file.ext 或 path/to/file.ext:123
        static ref FILE_PATH_RE: Regex = Regex::new(
            r"(?:^|\s)([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]{1,10})(?::\d+)?(?:\s|$|,|;)"
        ).unwrap();

        // 匹配函数名: functionName( 或 function_name(
        static ref FUNCTION_RE: Regex = Regex::new(
            r"\b([a-zA-Z_][a-zA-Z0-9_]{2,})\s*\("
        ).unwrap();

        // 匹配模块引用: @/components/Button 或 @utils/helper
        static ref MODULE_RE: Regex = Regex::new(
            r"@[a-zA-Z0-9_\-./]+"
        ).unwrap();

        // 匹配代码块中的标识符
        static ref IDENTIFIER_RE: Regex = Regex::new(
            r"\b([A-Z][a-zA-Z0-9]+|[a-z][a-zA-Z0-9]{3,})\b"
        ).unwrap();
    }

    for msg in history {
        let content = &msg.content;

        // 提取文件路径
        for cap in FILE_PATH_RE.captures_iter(content) {
            if let Some(path) = cap.get(1) {
                let path_str = path.as_str().to_string();
                // 过滤掉一些常见的误判（如 URL）
                if !path_str.starts_with("http") && !path_str.starts_with("www.") {
                    info.file_paths.insert(path_str);
                }
            }
        }

        // 提取函数名
        for cap in FUNCTION_RE.captures_iter(content) {
            if let Some(func) = cap.get(1) {
                let func_name = func.as_str();
                // 过滤常见的关键字
                if !matches!(func_name, "if" | "for" | "while" | "function" | "return") {
                    info.function_names.insert(func_name.to_string());
                }
            }
        }

        // 提取模块引用
        for cap in MODULE_RE.captures_iter(content) {
            info.module_names.insert(cap[0].to_string());
        }

        // 从代码块中提取标识符
        if content.contains("```") {
            let code_blocks: Vec<&str> = content.split("```").collect();
            for (i, block) in code_blocks.iter().enumerate() {
                // 奇数索引是代码块内容
                if i % 2 == 1 {
                    for cap in IDENTIFIER_RE.captures_iter(block) {
                        if let Some(ident) = cap.get(1) {
                            let ident_str = ident.as_str();
                            // 只保留长度适中的标识符
                            if ident_str.len() >= 3 && ident_str.len() <= 30 {
                                info.keywords.insert(ident_str.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    debug!(
        "Extracted context: {} files, {} functions, {} modules, {} keywords",
        info.file_paths.len(),
        info.function_names.len(),
        info.module_names.len(),
        info.keywords.len()
    );

    info
}

/// 生成智能搜索查询（结合历史和当前提示词）
fn generate_smart_query(
    current_prompt: &str,
    history_info: &HistoryContextInfo
) -> String {
    let mut query_parts = Vec::new();

    // 1. 当前提示词的关键词
    let current_keywords = extract_keywords(current_prompt);
    query_parts.push(current_keywords);

    // 2. 历史中的文件路径（取前3个）
    let file_paths: Vec<String> = history_info.file_paths.iter()
        .take(3)
        .map(|s| s.to_string())
        .collect();
    if !file_paths.is_empty() {
        query_parts.push(file_paths.join(" "));
    }

    // 3. 历史中的函数名（取前5个）
    let functions: Vec<String> = history_info.function_names.iter()
        .take(5)
        .map(|s| s.to_string())
        .collect();
    if !functions.is_empty() {
        query_parts.push(functions.join(" "));
    }

    // 4. 历史中的关键词（取前5个）
    let keywords: Vec<String> = history_info.keywords.iter()
        .take(5)
        .map(|s| s.to_string())
        .collect();
    if !keywords.is_empty() {
        query_parts.push(keywords.join(" "));
    }

    let final_query = query_parts.join(" ");
    debug!("Generated smart query: {}", final_query);
    final_query
}

// ============================================================================
// Acemcp Client
// ============================================================================

/// Acemcp MCP 客户端
struct AcemcpClient {
    child: tokio::process::Child,
    request_id: u64,
}

impl AcemcpClient {
    /// 获取或提取 sidecar 可执行文件路径
    fn get_or_extract_sidecar() -> Result<PathBuf> {
        if cfg!(debug_assertions) {
            // 开发模式：使用源码目录的 sidecar（Node.js 版本）
            let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
                .map_err(|e| anyhow::anyhow!("Failed to get CARGO_MANIFEST_DIR: {}", e))?;

            // Node.js 版本统一使用 .cjs 文件
            let exe_name = "acemcp-mcp-server.cjs";

            Ok(std::path::PathBuf::from(manifest_dir)
                .join("binaries")
                .join(exe_name))
        } else {
            // 发布模式：从嵌入资源提取到 ~/.acemcp/ 目录（与配置文件同目录）
            let acemcp_dir = dirs::home_dir()
                .ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?
                .join(".acemcp");

            // Node.js 版本统一使用 .cjs 文件
            let sidecar_name = "acemcp-mcp-server.cjs";
            let sidecar_path = acemcp_dir.join(sidecar_name);

            // 检查是否已提取
            if !sidecar_path.exists() {
                info!("Extracting embedded sidecar to: {:?}", sidecar_path);

                // 创建 .acemcp 目录
                std::fs::create_dir_all(&acemcp_dir)
                    .map_err(|e| anyhow::anyhow!("Failed to create .acemcp directory: {}", e))?;

                // 写入嵌入的 sidecar 字节
                std::fs::write(&sidecar_path, ACEMCP_SIDECAR_BYTES)
                    .map_err(|e| anyhow::anyhow!("Failed to extract sidecar: {}", e))?;

                // Unix 系统需要设置执行权限
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mut perms = std::fs::metadata(&sidecar_path)?.permissions();
                    perms.set_mode(0o755);
                    std::fs::set_permissions(&sidecar_path, perms)?;
                }

                info!("Sidecar extracted successfully ({} bytes)", ACEMCP_SIDECAR_BYTES.len());
            } else {
                debug!("Using existing sidecar at: {:?}", sidecar_path);
            }

            Ok(sidecar_path)
        }
    }

    /// 启动 acemcp MCP server (使用嵌入的 sidecar)
    async fn start(_app: &AppHandle) -> Result<Self> {
        info!("Starting acemcp sidecar...");

        // 获取或提取 sidecar 路径
        let sidecar_path = Self::get_or_extract_sidecar()?;

        info!("Sidecar path: {:?}", sidecar_path);

        // 检查文件是否存在
        if !sidecar_path.exists() {
            return Err(anyhow::anyhow!(
                "Sidecar executable not found at: {:?}. Please ensure the file exists.",
                sidecar_path
            ));
        }

        // Node.js 版本：通过 node 运行 .cjs 文件
        // 首先检查 node 是否可用
        let mut node_check_cmd = Command::new("node");
        node_check_cmd.arg("--version");

        // Windows: 隐藏检查命令的控制台窗口
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            node_check_cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let node_check = node_check_cmd.output().await;

        if node_check.is_err() {
            return Err(anyhow::anyhow!(
                "Node.js not found. Please install Node.js to use acemcp.\n\
                Download from: https://nodejs.org/"
            ));
        }

        // 使用 tokio Command 启动 sidecar（保持 stdio 通信）
        let mut cmd = Command::new("node");
        cmd.arg(&sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        // Windows: 隐藏控制台窗口
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let child = cmd.spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn sidecar: {}. Path: {:?}", e, sidecar_path))?;

        info!("Acemcp sidecar started successfully");

        Ok(Self {
            child,
            request_id: 0
        })
    }

    /// 发送 JSON-RPC 请求
    async fn send_request(&mut self, method: &str, params: Option<Value>) -> Result<Value> {
        self.request_id += 1;
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: self.request_id,
            method: method.to_string(),
            params,
        };

        let request_json = serde_json::to_string(&request)?;
        debug!("Sending MCP request: {}", request_json);

        // 发送请求（MCP 使用换行符分隔的 JSON）
        if let Some(stdin) = self.child.stdin.as_mut() {
            stdin.write_all(request_json.as_bytes()).await?;
            stdin.write_all(b"\n").await?;
            stdin.flush().await?;
        } else {
            return Err(anyhow::anyhow!("stdin not available"));
        }

        // 读取响应
        if let Some(stdout) = self.child.stdout.as_mut() {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();

            // 设置超时（30秒）
            let timeout = tokio::time::Duration::from_secs(30);
            match tokio::time::timeout(timeout, reader.read_line(&mut line)).await {
                Ok(Ok(_)) => {
                    debug!("Received MCP response: {}", line.trim());
                    let response: JsonRpcResponse = serde_json::from_str(&line)?;

                    if let Some(error) = response.error {
                        return Err(anyhow::anyhow!(
                            "MCP error {}: {}",
                            error.code,
                            error.message
                        ));
                    }

                    response.result.ok_or_else(|| anyhow::anyhow!("No result in response"))
                }
                Ok(Err(e)) => Err(anyhow::anyhow!("Failed to read response: {}", e)),
                Err(_) => Err(anyhow::anyhow!("Request timeout (30s)")),
            }
        } else {
            Err(anyhow::anyhow!("stdout not available"))
        }
    }

    /// 发送通知（notification，无需响应）
    async fn send_notification(&mut self, method: &str, params: Option<Value>) -> Result<()> {
        let notification = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        });

        let notification_json = serde_json::to_string(&notification)?;
        debug!("Sending MCP notification: {}", notification_json);

        // 发送通知（不等待响应）
        if let Some(stdin) = self.child.stdin.as_mut() {
            stdin.write_all(notification_json.as_bytes()).await?;
            stdin.write_all(b"\n").await?;
            stdin.flush().await?;
        } else {
            return Err(anyhow::anyhow!("stdin not available"));
        }

        Ok(())
    }

    /// 初始化 MCP 会话
    async fn initialize(&mut self) -> Result<()> {
        info!("Initializing MCP session...");
        let params = json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "claude-workbench",
                "version": "4.1.3"
            }
        });

        // 发送 initialize 请求并等待响应
        self.send_request("initialize", Some(params)).await?;

        // 发送 initialized 通知（不等待响应）
        self.send_notification("notifications/initialized", None).await?;

        info!("MCP session initialized successfully");
        Ok(())
    }

    /// 调用 search_context 工具
    async fn search_context(&mut self, project_path: &str, query: &str) -> Result<String> {
        info!("Calling search_context: project={}, query={}", project_path, query);

        let params = json!({
            "name": "search_context",
            "arguments": {
                "project_root_path": project_path.replace('\\', "/"),
                "query": query
            }
        });

        let result = self.send_request("tools/call", Some(params)).await?;

        // 解析结果
        if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
            if let Some(first) = content.first() {
                if let Some(text) = first.get("text").and_then(|t| t.as_str()) {
                    return Ok(text.to_string());
                }
            }
        }

        Err(anyhow::anyhow!("Invalid search_context response format"))
    }

    /// 多轮搜索：使用不同的查询策略获取更全面的上下文
    async fn multi_round_search(
        &mut self,
        project_path: &str,
        queries: &[String],
        max_total_length: usize,
    ) -> Result<String> {
        info!("Starting multi-round search with {} queries", queries.len());

        let mut all_results = Vec::new();
        let mut seen_snippets = HashSet::new(); // 用于去重

        for (round, query) in queries.iter().enumerate() {
            if query.trim().is_empty() {
                continue;
            }

            info!("Round {}: searching with query: {}", round + 1, query);

            match self.search_context(project_path, query).await {
                Ok(result) => {
                    // 简单去重：按代码片段切分
                    for snippet in result.split("\n\nPath:") {
                        if !snippet.trim().is_empty() {
                            // 生成简单的哈希来去重
                            let snippet_hash = format!("{:x}", md5::compute(snippet));
                            if !seen_snippets.contains(&snippet_hash) {
                                seen_snippets.insert(snippet_hash);

                                // 恢复 "Path:" 前缀（除了第一个）
                                if !all_results.is_empty() {
                                    all_results.push(format!("\n\nPath:{}", snippet));
                                } else {
                                    all_results.push(snippet.to_string());
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    warn!("Round {} search failed: {}", round + 1, e);
                    // 继续下一轮
                }
            }

            // 检查是否已经收集够了
            let current_length: usize = all_results.iter().map(|s| s.len()).sum();
            if current_length >= max_total_length {
                info!("Reached max length limit, stopping at round {}", round + 1);
                break;
            }

            // 轻微延迟，避免请求过快
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        let combined = all_results.join("");
        info!(
            "Multi-round search completed: {} unique snippets, {} total chars",
            seen_snippets.len(),
            combined.len()
        );

        Ok(combined)
    }

    /// 关闭客户端
    async fn shutdown(mut self) -> Result<()> {
        info!("Shutting down acemcp client...");

        // 尝试优雅关闭
        if let Err(e) = self.child.kill().await {
            warn!("Failed to kill acemcp process: {}", e);
        }

        Ok(())
    }
}

// ============================================================================
// 关键词提取
// ============================================================================

/// 从提示词中提取技术关键词
fn extract_keywords(prompt: &str) -> String {
    // 简单的关键词提取策略：
    // 1. 移除常见的停用词
    // 2. 保留技术术语和名词
    // 3. 限制长度

    let stopwords = [
        "请", "帮我", "我想", "如何", "怎么", "能否", "可以",
        "the", "a", "an", "is", "are", "was", "were",
        "please", "help", "me", "i", "want", "how", "can",
    ];

    let words: Vec<&str> = prompt
        .split_whitespace()
        .filter(|w| {
            // 过滤停用词和过短的词
            w.len() > 2 && !stopwords.contains(&w.to_lowercase().as_str())
        })
        .take(10) // 最多取10个关键词
        .collect();

    words.join(" ")
}

// ============================================================================
// Tauri Command
// ============================================================================

/// 使用 acemcp 增强提示词，添加项目上下文
/// UTF-8 安全的字符串截断函数
/// 如果 max_bytes 不在字符边界上，会向前寻找最近的边界，防止 panic
fn truncate_utf8_safe(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }

    // 从 max_bytes 开始向前查找字符边界
    let mut index = max_bytes;
    while index > 0 && !s.is_char_boundary(index) {
        index -= 1;
    }

    if index == 0 {
        // 极端情况：第一个字符就超过 max_bytes
        // 返回第一个字符的边界
        s.char_indices()
            .next()
            .map(|(_, ch)| &s[..ch.len_utf8()])
            .unwrap_or("")
    } else {
        &s[..index]
    }
}


#[tauri::command]
pub async fn enhance_prompt_with_context(
    app: AppHandle,
    prompt: String,
    project_path: String,
    session_id: Option<String>,      // 新增：会话 ID
    project_id: Option<String>,      // 新增：项目 ID
    max_context_length: Option<usize>,
    enable_multi_round: Option<bool>, // 新增：是否启用多轮搜索
) -> Result<EnhancementResult, String> {
    info!(
        "enhance_prompt_with_context: prompt_len={}, project={}, has_history={}, multi_round={}",
        prompt.len(),
        project_path,
        session_id.is_some(),
        enable_multi_round.unwrap_or(true)
    );

    // ⚡ 添加长度限制配置
    const MAX_PROMPT_LENGTH: usize = 80_000; // 最大提示词长度
    const MAX_TOTAL_OUTPUT_LENGTH: usize = 150_000; // 最大输出长度

    let max_length = max_context_length.unwrap_or(3000);

    // ⚡ 检查提示词长度
    if prompt.len() > MAX_PROMPT_LENGTH {
        warn!("Prompt too long ({} chars), exceeds maximum ({})",
            prompt.len(), MAX_PROMPT_LENGTH);
        return Ok(EnhancementResult {
            original_prompt: prompt.clone(),
            enhanced_prompt: prompt.clone(),
            context_count: 0,
            acemcp_used: false,
            error: Some(format!(
                "提示词过长（{} 字符），超过最大限制（{} 字符）。请缩短提示词或分批处理。",
                prompt.len(), MAX_PROMPT_LENGTH
            )),
        });
    }

    // 检查项目路径是否存在
    if !std::path::Path::new(&project_path).exists() {
        return Ok(EnhancementResult {
            original_prompt: prompt.clone(),
            enhanced_prompt: prompt,
            context_count: 0,
            acemcp_used: false,
            error: Some("Project path does not exist".to_string()),
        });
    }

    // 🎯 智能查询生成：根据是否有历史上下文选择策略
    let (search_queries, has_history) = if let (Some(sid), Some(pid)) = (&session_id, &project_id) {
        // 有历史：使用智能查询生成
        match load_recent_history(sid, pid, 10).await {
            Ok(history) if !history.is_empty() => {
                info!("✅ Loaded {} history messages for smart query generation", history.len());
                let history_info = extract_context_from_history(&history);
                let smart_query = generate_smart_query(&prompt, &history_info);

                // 生成多轮查询：基础查询 + 智能查询
                let queries = if enable_multi_round.unwrap_or(true) {
                    vec![
                        smart_query.clone(),                    // 第1轮：智能查询（历史+当前）
                        extract_keywords(&prompt),              // 第2轮：当前提示词关键词
                        history_info.file_paths.iter()          // 第3轮：历史文件路径
                            .take(2)
                            .cloned()
                            .collect::<Vec<_>>()
                            .join(" "),
                    ]
                } else {
                    vec![smart_query]
                };

                (queries, true)
            }
            Ok(_) => {
                info!("ℹ️  No history messages found, using basic keywords");
                (vec![extract_keywords(&prompt)], false)
            }
            Err(e) => {
                warn!("⚠️  Failed to load history: {}, falling back to basic keywords", e);
                (vec![extract_keywords(&prompt)], false)
            }
        }
    } else {
        // 无历史：使用简单关键词提取
        info!("ℹ️  No session context provided, using basic keywords");
        let keywords = extract_keywords(&prompt);

        // 多轮查询：从不同角度提取关键词
        let queries = if enable_multi_round.unwrap_or(true) {
            vec![
                keywords.clone(),
                // 可以添加更多查询策略
            ]
        } else {
            vec![keywords]
        };

        (queries, false)
    };

    // 过滤空查询
    let valid_queries: Vec<String> = search_queries.into_iter()
        .filter(|q| !q.trim().is_empty())
        .collect();

    if valid_queries.is_empty() {
        warn!("No valid search queries generated");
        return Ok(EnhancementResult {
            original_prompt: prompt.clone(),
            enhanced_prompt: prompt,
            context_count: 0,
            acemcp_used: false,
            error: Some("No keywords could be extracted from prompt".to_string()),
        });
    }

    info!("📋 Generated {} search queries (history_aware={})", valid_queries.len(), has_history);
    for (i, q) in valid_queries.iter().enumerate() {
        debug!("  Query {}: {}", i + 1, q);
    }

    // 启动 acemcp 客户端
    let mut client = match AcemcpClient::start(&app).await {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to start acemcp: {}", e);
            return Ok(EnhancementResult {
                original_prompt: prompt.clone(),
                enhanced_prompt: prompt,
                context_count: 0,
                acemcp_used: false,
                error: Some(format!("Failed to start acemcp: {}", e)),
            });
        }
    };

    // 初始化 MCP 会话
    if let Err(e) = client.initialize().await {
        error!("Failed to initialize MCP session: {}", e);
        let _ = client.shutdown().await;
        return Ok(EnhancementResult {
            original_prompt: prompt.clone(),
            enhanced_prompt: prompt,
            context_count: 0,
            acemcp_used: false,
            error: Some(format!("Failed to initialize MCP: {}", e)),
        });
    }

    // 🚀 执行搜索（单轮或多轮）
    let context_result = if valid_queries.len() > 1 && enable_multi_round.unwrap_or(true) {
        info!("🔄 Using multi-round search with {} queries", valid_queries.len());
        match client.multi_round_search(&project_path, &valid_queries, max_length * 2).await {
            Ok(ctx) => ctx,
            Err(e) => {
                error!("Failed to perform multi-round search: {}", e);
                let _ = client.shutdown().await;
                return Ok(EnhancementResult {
                    original_prompt: prompt.clone(),
                    enhanced_prompt: prompt,
                    context_count: 0,
                    acemcp_used: false,
                    error: Some(format!("Failed to search context: {}", e)),
                });
            }
        }
    } else {
        info!("🔍 Using single-round search");
        match client.search_context(&project_path, &valid_queries[0]).await {
            Ok(ctx) => ctx,
            Err(e) => {
                error!("Failed to search context: {}", e);
                let _ = client.shutdown().await;
                return Ok(EnhancementResult {
                    original_prompt: prompt.clone(),
                    enhanced_prompt: prompt,
                    context_count: 0,
                    acemcp_used: false,
                    error: Some(format!("Failed to search context: {}", e)),
                });
            }
        }
    };

    // 关闭客户端
    let _ = client.shutdown().await;

    // ⚡ 改进：智能处理上下文结果
    let trimmed_context = if context_result.len() > max_length {
        warn!("Context too long ({} chars), truncating to {} chars",
            context_result.len(), max_length);
        format!("{}...\n\n[上下文过长，已自动截断。建议在设置中降低 maxContextLength 参数]",
            truncate_utf8_safe(&context_result, max_length))
    } else {
        context_result.clone()
    };

    // 统计上下文条目数（简单计数 "Path:" 出现次数）
    let context_count = trimmed_context.matches("Path:").count();

    // ⚡ 改进：格式化增强后的提示词，并验证总长度
    let enhanced_prompt = if !trimmed_context.trim().is_empty() {
        let candidate = format!(
            "{}\n\n--- 项目上下文 (来自 acemcp 语义搜索) ---\n{}",
            prompt.trim(),
            trimmed_context
        );

        // 检查最终输出长度
        if candidate.len() > MAX_TOTAL_OUTPUT_LENGTH {
            warn!("Enhanced prompt too long ({} chars), exceeds maximum ({})",
                candidate.len(), MAX_TOTAL_OUTPUT_LENGTH);

            // 动态调整上下文长度
            let available_space = MAX_TOTAL_OUTPUT_LENGTH.saturating_sub(prompt.len() + 100); // 预留100字符给分隔符
            if available_space > 1000 {
                let adjusted_context = format!("{}...\n\n[上下文已自动调整以适应长度限制]",
                    truncate_utf8_safe(&trimmed_context, available_space));
                format!(
                    "{}\n\n--- 项目上下文 (来自 acemcp 语义搜索) ---\n{}",
                    prompt.trim(),
                    adjusted_context
                )
            } else {
                // 如果连最小的上下文都放不下，返回带警告的原提示词
                warn!("Cannot fit any context, prompt too long: {} chars", prompt.len());
                return Ok(EnhancementResult {
                    original_prompt: prompt.clone(),
                    enhanced_prompt: prompt.clone(),
                    context_count: 0,
                    acemcp_used: false,
                    error: Some(format!(
                        "提示词太长（{} 字符），无法添加项目上下文。\n\
                        建议：\n\
                        1. 缩短提示词长度\n\
                        2. 直接使用原提示词，不添加上下文",
                        prompt.len()
                    )),
                });
            }
        } else {
            candidate
        }
    } else {
        // 如果没有找到相关上下文，返回原提示词
        info!("No relevant context found");
        prompt.clone()
    };

    info!(
        "Enhanced prompt: original_len={}, context_len={}, enhanced_len={}, context_count={}",
        prompt.len(),
        trimmed_context.len(),
        enhanced_prompt.len(),
        context_count
    );

    Ok(EnhancementResult {
        original_prompt: prompt,
        enhanced_prompt,
        context_count,
        acemcp_used: true,
        error: None,
    })
}

/// 测试 acemcp 是否可用
#[tauri::command]
pub async fn test_acemcp_availability(app: AppHandle) -> Result<bool, String> {
    info!("Testing acemcp availability...");

    match AcemcpClient::start(&app).await {
        Ok(mut client) => {
            if let Err(e) = client.initialize().await {
                error!("Failed to initialize acemcp: {}", e);
                let _ = client.shutdown().await;
                return Ok(false);
            }
            let _ = client.shutdown().await;
            info!("Acemcp is available");
            Ok(true)
        }
        Err(e) => {
            error!("Acemcp not available: {}", e);
            Ok(false)
        }
    }
}

// ============================================================================
// Acemcp 配置管理
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcemcpConfigData {
    pub base_url: String,
    pub token: String,
    pub batch_size: Option<u32>,
    pub max_lines_per_blob: Option<u32>,
}

impl Default for AcemcpConfigData {
    fn default() -> Self {
        Self {
            base_url: String::new(),
            token: String::new(),
            batch_size: Some(10),
            max_lines_per_blob: Some(800),
        }
    }
}

/// 保存 acemcp 配置到 ~/.acemcp/config.toml
/// 只更新指定的字段，保留其他现有配置（如 TEXT_EXTENSIONS, EXCLUDE_PATTERNS 等）
#[tauri::command]
pub async fn save_acemcp_config(
    base_url: String,
    token: String,
    batch_size: Option<u32>,
    max_lines_per_blob: Option<u32>,
) -> Result<(), String> {
    use std::fs;
    use std::collections::HashMap;

    info!("Saving acemcp config: base_url={}", base_url);

    let config_dir = dirs::home_dir()
        .ok_or("Cannot find home directory")?
        .join(".acemcp");

    let config_file = config_dir.join("config.toml");

    // 注意：不再主动创建 .acemcp 目录
    // acemcp 核心进程首次运行时会自动创建此目录和配置文件
    // 如果目录不存在，说明 acemcp 尚未运行，提示用户先测试连接
    if !config_dir.exists() {
        return Err(format!(
            "配置目录不存在：{:?}\n\n\
            这是因为 acemcp 尚未运行。请先点击「测试连接」按钮，\n\
            这会触发 acemcp 启动并自动创建配置目录。",
            config_dir
        ));
    }

    // 读取现有配置（如果存在）
    let mut existing_lines: HashMap<String, String> = HashMap::new();
    let mut other_lines = Vec::new();

    if config_file.exists() {
        let existing_content = fs::read_to_string(&config_file)
            .map_err(|e| format!("Failed to read existing config: {}", e))?;

        for line in existing_content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                other_lines.push(line.to_string());
                continue;
            }

            // 提取键名
            if let Some(eq_pos) = trimmed.find('=') {
                let key = trimmed[..eq_pos].trim();
                // 保留非 UI 管理的字段
                if key != "BASE_URL" && key != "TOKEN" && key != "BATCH_SIZE" && key != "MAX_LINES_PER_BLOB" {
                    existing_lines.insert(key.to_string(), line.to_string());
                }
            }
        }
    }

    // 构建新的 TOML 内容
    let mut toml_content = String::new();

    // UI 管理的字段
    toml_content.push_str(&format!("BASE_URL = \"{}\"\n", base_url));
    toml_content.push_str(&format!("TOKEN = \"{}\"\n", token));

    if let Some(batch_size) = batch_size {
        toml_content.push_str(&format!("BATCH_SIZE = {}\n", batch_size));
    }

    if let Some(max_lines) = max_lines_per_blob {
        toml_content.push_str(&format!("MAX_LINES_PER_BLOB = {}\n", max_lines));
    }

    // 保留的其他配置
    for line in existing_lines.values() {
        toml_content.push_str(line);
        toml_content.push('\n');
    }

    // 空行和注释
    for line in other_lines {
        if !line.trim().is_empty() {
            toml_content.push_str(&line);
            toml_content.push('\n');
        }
    }

    fs::write(&config_file, toml_content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    info!("Acemcp config saved to: {:?}", config_file);
    Ok(())
}

/// 加载 acemcp 配置从 ~/.acemcp/config.toml
/// 自动迁移旧的 settings.toml 配置文件
#[tauri::command]
pub async fn load_acemcp_config() -> Result<AcemcpConfigData, String> {
    use std::fs;

    let acemcp_dir = dirs::home_dir()
        .ok_or("Cannot find home directory")?
        .join(".acemcp");

    let config_file = acemcp_dir.join("config.toml");
    let old_config_file = acemcp_dir.join("settings.toml");

    // 迁移逻辑：如果 settings.toml 存在而 config.toml 不存在，自动迁移
    if !config_file.exists() && old_config_file.exists() {
        info!("Migrating configuration from settings.toml to config.toml");
        match fs::rename(&old_config_file, &config_file) {
            Ok(_) => info!("✅ Configuration migrated successfully"),
            Err(e) => {
                warn!("Failed to migrate config file: {}. Will try to copy instead.", e);
                // 如果重命名失败（可能是跨设备），尝试复制
                if let Ok(content) = fs::read_to_string(&old_config_file) {
                    if let Err(copy_err) = fs::write(&config_file, content) {
                        return Err(format!("Failed to migrate config: {}", copy_err));
                    }
                    info!("✅ Configuration copied successfully");
                }
            }
        }
    }

    if !config_file.exists() {
        info!("Acemcp config file not found, returning defaults");
        return Ok(AcemcpConfigData::default());
    }

    let content = fs::read_to_string(&config_file)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    // 简单的 TOML 解析（只解析我们需要的字段）
    let mut base_url = String::new();
    let mut token = String::new();
    let mut batch_size = None;
    let mut max_lines_per_blob = None;

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("BASE_URL") {
            if let Some(value) = extract_toml_string_value(line) {
                base_url = value;
            }
        } else if line.starts_with("TOKEN") {
            if let Some(value) = extract_toml_string_value(line) {
                token = value;
            }
        } else if line.starts_with("BATCH_SIZE") {
            if let Some(value) = extract_toml_number_value(line) {
                batch_size = Some(value);
            }
        } else if line.starts_with("MAX_LINES_PER_BLOB") {
            if let Some(value) = extract_toml_number_value(line) {
                max_lines_per_blob = Some(value);
            }
        }
    }

    info!("Loaded acemcp config from: {:?}", config_file);
    Ok(AcemcpConfigData {
        base_url,
        token,
        batch_size,
        max_lines_per_blob,
    })
}

/// 提取 TOML 字符串值
fn extract_toml_string_value(line: &str) -> Option<String> {
    // 解析格式: KEY = "value"
    if let Some(eq_pos) = line.find('=') {
        let value_part = line[eq_pos + 1..].trim();
        if value_part.starts_with('"') && value_part.ends_with('"') {
            return Some(value_part[1..value_part.len() - 1].to_string());
        }
    }
    None
}

/// 提取 TOML 数字值
fn extract_toml_number_value(line: &str) -> Option<u32> {
    // 解析格式: KEY = 123
    if let Some(eq_pos) = line.find('=') {
        let value_part = line[eq_pos + 1..].trim();
        return value_part.parse::<u32>().ok();
    }
    None
}

// ============================================================================
// 后台预索引
// ============================================================================

/// 后台预索引项目（不阻塞 UI）
/// 在用户选择项目后自动调用，提前完成索引以加快后续搜索
#[tauri::command]
pub async fn preindex_project(app: AppHandle, project_path: String) -> Result<(), String> {
    info!("Starting background pre-indexing for project: {}", project_path);

    // 检查项目路径是否存在
    if !std::path::Path::new(&project_path).exists() {
        warn!("Project path does not exist, skipping pre-index: {}", project_path);
        return Ok(());
    }

    // 启动后台任务进行索引
    tauri::async_runtime::spawn(async move {
        match preindex_project_internal(&app, &project_path).await {
            Ok(_) => {
                info!("✅ Background pre-indexing completed for: {}", project_path);
            }
            Err(e) => {
                warn!("⚠️ Background pre-indexing failed for {}: {}", project_path, e);
            }
        }
    });

    // 立即返回，不等待索引完成
    Ok(())
}

/// 内部预索引实现
async fn preindex_project_internal(app: &AppHandle, project_path: &str) -> Result<()> {
    info!("🔄 Pre-indexing project: {}", project_path);

    // 启动 acemcp 客户端
    let mut client = AcemcpClient::start(app).await?;

    // 初始化 MCP 会话
    client.initialize().await?;

    // 调用 search_context，触发自动索引
    // 使用一个通用的查询来触发索引，不关心搜索结果
    let _ = client.search_context(project_path, "preindex initialization").await;

    // 关闭客户端
    client.shutdown().await?;

    Ok(())
}

// ============================================================================
// Sidecar 导出（用于 CLI 配置）
// ============================================================================

/// 导出嵌入的 acemcp sidecar 到指定路径
/// 用户可以将导出的文件配置到 Claude Code CLI 中使用
#[tauri::command]
pub async fn export_acemcp_sidecar(target_path: String) -> Result<String, String> {
    use std::fs;

    info!("Exporting acemcp sidecar to: {}", target_path);

    // 处理 ~/ 路径
    let expanded_path = if target_path.starts_with("~/") {
        let home = dirs::home_dir().ok_or("Cannot find home directory")?;
        home.join(&target_path[2..])
    } else if target_path == "~" {
        dirs::home_dir().ok_or("Cannot find home directory")?
    } else {
        std::path::PathBuf::from(&target_path)
    };

    info!("Expanded path: {:?}", expanded_path);

    // 判断是否为目录
    let is_directory = expanded_path.is_dir()
        || expanded_path.extension().is_none();

    info!("Is directory: {}", is_directory);

    let final_path = if is_directory {
        // Node.js 版本统一使用 .cjs 文件
        let exe_name = "acemcp-mcp-server.cjs";
        let path = expanded_path.join(exe_name);
        info!("Using filename: {:?}", path);
        path
    } else {
        expanded_path
    };

    // 创建父目录
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // 写入 sidecar 字节
    fs::write(&final_path, ACEMCP_SIDECAR_BYTES)
        .map_err(|e| format!("Failed to export sidecar: {}", e))?;

    // Unix 系统设置执行权限
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&final_path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&final_path, perms)
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    let final_path_str = final_path.to_string_lossy().to_string();
    info!("✅ Sidecar exported successfully to: {}", final_path_str);

    Ok(final_path_str)
}

/// 获取 ~/.acemcp/ 目录中的 sidecar 路径（如果存在）
#[tauri::command]
pub async fn get_extracted_sidecar_path() -> Result<Option<String>, String> {
    let acemcp_dir = dirs::home_dir()
        .ok_or("Cannot find home directory")?
        .join(".acemcp");

    // Node.js 版本统一使用 .cjs 文件
    let sidecar_name = "acemcp-mcp-server.cjs";
    let sidecar_path = acemcp_dir.join(sidecar_name);

    if sidecar_path.exists() {
        Ok(Some(sidecar_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}
