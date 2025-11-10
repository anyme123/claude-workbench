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
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use log::{debug, error, info, warn};

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

/// Search context 工具的参数
#[derive(Debug, Serialize)]
struct SearchContextParams {
    project_root_path: String,
    query: String,
}

/// 增强结果
#[derive(Debug, Serialize, Deserialize)]
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
    /// 启动 acemcp MCP server (使用打包的 sidecar)
    async fn start(app: &AppHandle) -> Result<Self> {
        info!("Starting acemcp sidecar...");

        // 获取 sidecar 可执行文件路径
        let sidecar_path = app.path().resolve("binaries/acemcp-sidecar",
            tauri::path::BaseDirectory::Resource)
            .map_err(|e| anyhow::anyhow!("Failed to resolve sidecar path: {}", e))?;

        info!("Sidecar path: {:?}", sidecar_path);

        // 使用 tokio Command 启动 sidecar（保持 stdio 通信）
        let child = Command::new(&sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
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

        self.send_request("initialize", Some(params)).await?;

        // 发送 initialized 通知
        self.send_request("notifications/initialized", None).await?;

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
