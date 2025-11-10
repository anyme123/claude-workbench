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
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use log::{debug, error, info, warn};

// 嵌入 sidecar 可执行文件作为编译时资源
#[cfg(target_os = "windows")]
const ACEMCP_SIDECAR_BYTES: &[u8] = include_bytes!("../../binaries/acemcp-sidecar-x86_64-pc-windows-msvc.exe");

#[cfg(target_os = "macos")]
const ACEMCP_SIDECAR_BYTES: &[u8] = include_bytes!("../../binaries/acemcp-sidecar-aarch64-apple-darwin");

#[cfg(target_os = "linux")]
const ACEMCP_SIDECAR_BYTES: &[u8] = include_bytes!("../../binaries/acemcp-sidecar-x86_64-unknown-linux-gnu");

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
            // 开发模式：使用源码目录的 sidecar
            let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
                .map_err(|e| anyhow::anyhow!("Failed to get CARGO_MANIFEST_DIR: {}", e))?;

            let exe_name = if cfg!(windows) {
                "acemcp-sidecar-x86_64-pc-windows-msvc.exe"
            } else if cfg!(target_os = "macos") {
                "acemcp-sidecar-aarch64-apple-darwin"
            } else {
                "acemcp-sidecar-x86_64-unknown-linux-gnu"
            };

            Ok(std::path::PathBuf::from(manifest_dir)
                .join("binaries")
                .join(exe_name))
        } else {
            // 发布模式：从嵌入资源提取到 ~/.acemcp/ 目录（与配置文件同目录）
            let acemcp_dir = dirs::home_dir()
                .ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?
                .join(".acemcp");

            let sidecar_name = if cfg!(windows) {
                "acemcp-sidecar.exe"
            } else {
                "acemcp-sidecar"
            };
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

        // 使用 tokio Command 启动 sidecar（保持 stdio 通信）
        let mut cmd = Command::new(&sidecar_path);
        cmd.stdin(Stdio::piped())
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
#[tauri::command]
pub async fn enhance_prompt_with_context(
    app: AppHandle,
    prompt: String,
    project_path: String,
    max_context_length: Option<usize>,
) -> Result<EnhancementResult, String> {
    info!(
        "enhance_prompt_with_context: prompt_len={}, project={}",
        prompt.len(),
        project_path
    );

    let max_length = max_context_length.unwrap_or(3000);

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

    // 提取关键词
    let keywords = extract_keywords(&prompt);
    if keywords.is_empty() {
        warn!("No keywords extracted from prompt");
        return Ok(EnhancementResult {
            original_prompt: prompt.clone(),
            enhanced_prompt: prompt,
            context_count: 0,
            acemcp_used: false,
            error: Some("No keywords could be extracted from prompt".to_string()),
        });
    }

    info!("Extracted keywords: {}", keywords);

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

    // 调用 search_context
    let context_result = match client.search_context(&project_path, &keywords).await {
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
    };

    // 关闭客户端
    let _ = client.shutdown().await;

    // 处理上下文结果
    let trimmed_context = if context_result.len() > max_length {
        format!("{}...\n\n(上下文过长，已截断)", &context_result[..max_length])
    } else {
        context_result.clone()
    };

    // 统计上下文条目数（简单计数 "Path:" 出现次数）
    let context_count = trimmed_context.matches("Path:").count();

    // 格式化增强后的提示词
    let enhanced_prompt = if !trimmed_context.trim().is_empty() {
        format!(
            "{}\n\n--- 项目上下文 (来自 acemcp 语义搜索) ---\n{}",
            prompt.trim(),
            trimmed_context
        )
    } else {
        // 如果没有找到相关上下文，返回原提示词
        info!("No relevant context found");
        prompt.clone()
    };

    info!(
        "Enhanced prompt: original_len={}, enhanced_len={}, context_count={}",
        prompt.len(),
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

/// 保存 acemcp 配置到 ~/.acemcp/settings.toml
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

    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    let config_file = config_dir.join("settings.toml");

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

/// 加载 acemcp 配置从 ~/.acemcp/settings.toml
#[tauri::command]
pub async fn load_acemcp_config() -> Result<AcemcpConfigData, String> {
    use std::fs;

    let config_file = dirs::home_dir()
        .ok_or("Cannot find home directory")?
        .join(".acemcp")
        .join("settings.toml");

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
        let exe_name = if cfg!(windows) {
            "acemcp-sidecar.exe"
        } else {
            "acemcp-sidecar"
        };
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

    let sidecar_name = if cfg!(windows) {
        "acemcp-sidecar.exe"
    } else {
        "acemcp-sidecar"
    };
    let sidecar_path = acemcp_dir.join(sidecar_name);

    if sidecar_path.exists() {
        Ok(Some(sidecar_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}
