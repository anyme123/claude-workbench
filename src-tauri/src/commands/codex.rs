/*!
 * OpenAI Codex Integration - Backend Commands
 *
 * This module provides Tauri commands for executing Codex tasks,
 * managing sessions, and handling configuration.
 */
use chrono::Utc;
use dirs;
use rusqlite;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// Import platform-specific utilities for window hiding
use crate::claude_binary::detect_binary_for_tool;
use crate::commands::claude::apply_no_window_async;
// Import simple_git for rewind operations
use super::simple_git;
// Import rewind helpers/types shared with Claude
use super::prompt_tracker::{
    load_execution_config, PromptRecord as ClaudePromptRecord, RewindCapabilities, RewindMode,
};
// Import WSL utilities for Windows + WSL Codex support
use super::wsl_utils;

// Align Codex prompt record type with Claude prompt tracker representation
type PromptRecord = ClaudePromptRecord;

// ============================================================================
// Type Definitions
// ============================================================================

/// Codex execution mode
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CodexExecutionMode {
    /// Read-only mode (default, safe)
    ReadOnly,
    /// Allow file edits
    FullAuto,
    /// Full access including network
    DangerFullAccess,
}

impl Default for CodexExecutionMode {
    fn default() -> Self {
        Self::ReadOnly
    }
}

/// Codex execution options
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexExecutionOptions {
    /// Project path
    pub project_path: String,

    /// User prompt
    pub prompt: String,

    /// Execution mode
    #[serde(default)]
    pub mode: CodexExecutionMode,

    /// Model to use (e.g., "gpt-5.1-codex-max")
    pub model: Option<String>,

    /// Enable JSON output mode
    #[serde(default = "default_json_mode")]
    pub json: bool,

    /// Output schema for structured output (JSON Schema)
    pub output_schema: Option<String>,

    /// Output file path
    pub output_file: Option<String>,

    /// Skip Git repository check
    #[serde(default)]
    pub skip_git_repo_check: bool,

    /// API key (overrides default)
    pub api_key: Option<String>,

    /// Session ID for resuming
    pub session_id: Option<String>,

    /// Resume last session
    #[serde(default)]
    pub resume_last: bool,
}

fn default_json_mode() -> bool {
    true
}

fn expand_user_path(input: &str) -> Result<PathBuf, String> {
    if input.trim().is_empty() {
        return Err("Path is empty".to_string());
    }

    let path = if input == "~" || input.starts_with("~/") {
        let home = dirs::home_dir().ok_or("Cannot find home directory".to_string())?;
        if input == "~" {
            home
        } else {
            home.join(input.trim_start_matches("~/"))
        }
    } else {
        PathBuf::from(input)
    };

    let path = if path.is_relative() {
        std::env::current_dir()
            .map_err(|e| format!("Failed to get current dir: {}", e))?
            .join(path)
    } else {
        path
    };

    Ok(path)
}

fn update_binary_override(tool: &str, override_path: &str) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory".to_string())?;
    let config_path = home.join(".claude").join("binaries.json");

    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let mut json: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read binaries.json: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let section = json
        .as_object_mut()
        .ok_or("Invalid binaries.json format (not an object)".to_string())?;

    let entry = section
        .entry(tool.to_string())
        .or_insert_with(|| serde_json::json!({}));

    if let Some(obj) = entry.as_object_mut() {
        obj.insert(
            "override_path".to_string(),
            serde_json::Value::String(override_path.to_string()),
        );
    }

    let serialized = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Failed to serialize binaries.json: {}", e))?;
    std::fs::write(&config_path, serialized)
        .map_err(|e| format!("Failed to write binaries.json: {}", e))?;

    Ok(())
}

fn clear_binary_override(tool: &str) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory".to_string())?;
    let config_path = home.join(".claude").join("binaries.json");
    if !config_path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read binaries.json: {}", e))?;
    let mut json: serde_json::Value =
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}));

    if let Some(section) = json.as_object_mut() {
        if let Some(entry) = section.get_mut(tool) {
            if let Some(obj) = entry.as_object_mut() {
                obj.remove("override_path");
            }
        }
    }

    let serialized = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Failed to serialize binaries.json: {}", e))?;
    std::fs::write(&config_path, serialized)
        .map_err(|e| format!("Failed to write binaries.json: {}", e))?;
    Ok(())
}

fn get_binary_override(tool: &str) -> Option<String> {
    let home = dirs::home_dir()?;
    let config_path = home.join(".claude").join("binaries.json");
    if !config_path.exists() {
        return None;
    }

    let content = std::fs::read_to_string(&config_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    json.get(tool)?
        .get("override_path")?
        .as_str()
        .map(|s| s.to_string())
}

/// Codex session metadata
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSession {
    /// Session/thread ID
    pub id: String,

    /// Project path
    pub project_path: String,

    /// Creation timestamp
    pub created_at: u64,

    /// Last updated timestamp
    pub updated_at: u64,

    /// Execution mode used
    pub mode: CodexExecutionMode,

    /// Model used
    pub model: Option<String>,

    /// Session status
    pub status: String,

    /// 🆕 First user message
    pub first_message: Option<String>,

    /// 🆕 Last message timestamp (ISO string)
    pub last_message_timestamp: Option<String>,
}

/// Codex availability status
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CodexAvailability {
    pub available: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

/// Global state to track Codex processes
pub struct CodexProcessState {
    pub processes: Arc<Mutex<HashMap<String, Child>>>,
    pub last_session_id: Arc<Mutex<Option<String>>>,
}

impl Default for CodexProcessState {
    fn default() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            last_session_id: Arc::new(Mutex::new(None)),
        }
    }
}

// ============================================================================
// Codex Rewind Types (Git Record Tracking)
// ============================================================================

/// Codex prompt record for rewind tracking
/// Note: Reserved for future use (e.g., prompt history display)
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPromptRecord {
    pub index: usize,
    pub timestamp: String,
    pub text: String,
}

/// Codex Git state record for each prompt
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPromptGitRecord {
    pub prompt_index: usize,
    pub commit_before: String,
    pub commit_after: Option<String>,
    pub timestamp: String,
}

/// Collection of Git records for a Codex session
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexGitRecords {
    pub session_id: String,
    pub project_path: String,
    pub records: Vec<CodexPromptGitRecord>,
}

// ============================================================================
// Core Execution Methods
// ============================================================================

/// Executes a Codex task in non-interactive mode with streaming output
#[tauri::command]
pub async fn execute_codex(
    options: CodexExecutionOptions,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("execute_codex called with options: {:?}", options);

    // Build codex exec command
    let (cmd, prompt) = build_codex_command(&options, false, None)?;

    // Execute and stream output
    execute_codex_process(cmd, prompt, options.project_path.clone(), app_handle).await
}

/// Resumes a previous Codex session
#[tauri::command]
pub async fn resume_codex(
    session_id: String,
    options: CodexExecutionOptions,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("resume_codex called for session: {}", session_id);

    // Build codex exec resume command (session_id added inside build function)
    let (cmd, prompt) = build_codex_command(&options, true, Some(&session_id))?;

    // Execute and stream output
    execute_codex_process(cmd, prompt, options.project_path.clone(), app_handle).await
}

/// Resumes the last Codex session
#[tauri::command]
pub async fn resume_last_codex(
    options: CodexExecutionOptions,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("resume_last_codex called");

    // Build codex exec resume --last command
    let (cmd, prompt) = build_codex_command(&options, true, Some("--last"))?;

    // Execute and stream output
    execute_codex_process(cmd, prompt, options.project_path.clone(), app_handle).await
}

/// Cancels a running Codex execution
#[tauri::command]
pub async fn cancel_codex(session_id: Option<String>, app_handle: AppHandle) -> Result<(), String> {
    log::info!("cancel_codex called for session: {:?}", session_id);

    let state: tauri::State<'_, CodexProcessState> = app_handle.state();
    let mut processes = state.processes.lock().await;

    if let Some(sid) = session_id {
        // Cancel specific session
        if let Some(mut child) = processes.remove(&sid) {
            child
                .kill()
                .await
                .map_err(|e| format!("Failed to kill process: {}", e))?;
            log::info!("Killed Codex process for session: {}", sid);
        } else {
            log::warn!("No running process found for session: {}", sid);
        }
    } else {
        // Cancel all processes
        for (sid, mut child) in processes.drain() {
            if let Err(e) = child.kill().await {
                log::error!("Failed to kill process for session {}: {}", sid, e);
            } else {
                log::info!("Killed Codex process for session: {}", sid);
            }
        }
    }

    Ok(())
}

// ============================================================================
// Session Management
// ============================================================================

/// Lists all Codex sessions by reading ~/.codex/sessions directory
/// On Windows with WSL mode, reads from WSL filesystem via UNC path
#[tauri::command]
pub async fn list_codex_sessions() -> Result<Vec<CodexSession>, String> {
    log::info!("list_codex_sessions called");

    // Use unified sessions directory function (supports WSL)
    let sessions_dir = get_codex_sessions_dir()?;
    log::info!("Looking for Codex sessions in: {:?}", sessions_dir);

    if !sessions_dir.exists() {
        log::warn!(
            "Codex sessions directory does not exist: {:?}",
            sessions_dir
        );
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();

    // Walk through date-organized directories (2025/11/23/rollout-xxx.jsonl)
    if let Ok(entries) = std::fs::read_dir(&sessions_dir) {
        for year_entry in entries.flatten() {
            if let Ok(month_entries) = std::fs::read_dir(year_entry.path()) {
                for month_entry in month_entries.flatten() {
                    if let Ok(day_entries) = std::fs::read_dir(month_entry.path()) {
                        for day_entry in day_entries.flatten() {
                            // day_entry is a day directory (e.g., "23"), go into it
                            if day_entry.path().is_dir() {
                                if let Ok(file_entries) = std::fs::read_dir(day_entry.path()) {
                                    for file_entry in file_entries.flatten() {
                                        let path = file_entry.path();
                                        if path.extension().and_then(|s| s.to_str())
                                            == Some("jsonl")
                                        {
                                            match parse_codex_session_file(&path) {
                                                Some(session) => {
                                                    log::info!(
                                                        "✅ Found session: {} ({})",
                                                        session.id,
                                                        session.project_path
                                                    );
                                                    sessions.push(session);
                                                }
                                                None => {
                                                    log::debug!("Failed to parse: {:?}", path);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by creation time (newest first)
    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    log::info!("Found {} Codex sessions", sessions.len());
    Ok(sessions)
}

/// Parses a Codex session JSONL file to extract metadata
fn parse_codex_session_file(path: &std::path::Path) -> Option<CodexSession> {
    use std::io::{BufRead, BufReader};

    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // Read first line (session_meta)
    let first_line = lines.next()?.ok()?;
    let meta: serde_json::Value = serde_json::from_str(&first_line).ok()?;

    if meta["type"].as_str()? != "session_meta" {
        return None;
    }

    let payload = &meta["payload"];
    let session_id = payload["id"].as_str()?.to_string();
    let timestamp_str = payload["timestamp"].as_str()?;
    let created_at = chrono::DateTime::parse_from_rfc3339(timestamp_str)
        .ok()?
        .timestamp() as u64;

    // Get cwd and convert from WSL path format if needed
    let cwd_raw = payload["cwd"].as_str().unwrap_or("");
    #[cfg(target_os = "windows")]
    let cwd = {
        // Convert WSL path (/mnt/c/...) to Windows path (C:\...)
        // This ensures the UI displays Windows-friendly paths
        if cwd_raw.starts_with("/mnt/") {
            wsl_utils::wsl_to_windows_path(cwd_raw)
        } else {
            cwd_raw.to_string()
        }
    };
    #[cfg(not(target_os = "windows"))]
    let cwd = cwd_raw.to_string();

    // Extract first user message and other metadata from subsequent lines
    let mut first_message: Option<String> = None;
    let mut last_timestamp: Option<String> = None;
    let mut model: Option<String> = None;

    // Parse remaining lines to find first user message
    for line in lines.map_while(Result::ok) {
        if let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) {
            // Update last timestamp
            if let Some(ts) = event["timestamp"].as_str() {
                last_timestamp = Some(ts.to_string());
            }

            // Extract model from session_meta or other events
            if event["type"].as_str() == Some("session_meta") {
                if let Some(m) = event["payload"]["model"].as_str() {
                    model = Some(m.to_string());
                }
            }

            // Find first user message
            if first_message.is_none() && event["type"].as_str() == Some("response_item") {
                if let Some(payload_obj) = event["payload"].as_object() {
                    if payload_obj.get("role").and_then(|r| r.as_str()) == Some("user") {
                        if let Some(content) = payload_obj.get("content").and_then(|c| c.as_array())
                        {
                            // Extract text from content array
                            for item in content {
                                // Check if this is a text content block (input_text type)
                                if item["type"].as_str() == Some("input_text") {
                                    if let Some(text) = item["text"].as_str() {
                                        // Skip system messages (environment_context and AGENTS.md)
                                        if !text.contains("<environment_context>")
                                            && !text.contains("# AGENTS.md instructions")
                                            && !text.is_empty()
                                            && !text.trim().is_empty()
                                        {
                                            first_message = Some(text.to_string());
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Early exit if we have all info
            if first_message.is_some() && model.is_some() {
                break;
            }
        }
    }

    let updated_at = last_timestamp
        .as_ref()
        .and_then(|ts| chrono::DateTime::parse_from_rfc3339(ts).ok())
        .map(|dt| dt.timestamp() as u64)
        .unwrap_or(created_at);

    Some(CodexSession {
        id: session_id,
        project_path: cwd,
        created_at,
        updated_at,
        mode: CodexExecutionMode::ReadOnly,
        model,
        status: "completed".to_string(),
        first_message,
        last_message_timestamp: last_timestamp,
    })
}

/// Loads Codex session history from JSONL file
/// On Windows with WSL mode, reads from WSL filesystem via UNC path
#[tauri::command]
pub async fn load_codex_session_history(
    session_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    log::info!("load_codex_session_history called for: {}", session_id);

    // Use unified sessions directory function (supports WSL)
    let sessions_dir = get_codex_sessions_dir()?;

    // Search for file containing this session_id
    let session_file = find_session_file(&sessions_dir, &session_id)
        .ok_or_else(|| format!("Session file not found for ID: {}", session_id))?;

    // Read and parse JSONL file
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(&session_file)
        .map_err(|e| format!("Failed to open session file: {}", e))?;

    let reader = BufReader::new(file);
    let mut events = Vec::new();
    let mut line_count = 0;
    let mut parse_errors = 0;

    for line_result in reader.lines() {
        line_count += 1;
        match line_result {
            Ok(line) => {
                if line.trim().is_empty() {
                    continue; // Skip empty lines
                }
                match serde_json::from_str::<serde_json::Value>(&line) {
                    Ok(event) => {
                        events.push(event);
                    }
                    Err(e) => {
                        parse_errors += 1;
                        log::warn!(
                            "Failed to parse line {} in session {}: {}",
                            line_count,
                            session_id,
                            e
                        );
                        log::debug!("Problematic line content: {}", line);
                    }
                }
            }
            Err(e) => {
                log::error!(
                    "Failed to read line {} in session {}: {}",
                    line_count,
                    session_id,
                    e
                );
            }
        }
    }

    log::info!(
        "Loaded {} events from Codex session {} (total lines: {}, parse errors: {})",
        events.len(),
        session_id,
        line_count,
        parse_errors
    );
    Ok(events)
}

/// Finds the JSONL file for a given session ID
fn find_session_file(
    sessions_dir: &std::path::Path,
    session_id: &str,
) -> Option<std::path::PathBuf> {
    use std::io::{BufRead, BufReader};
    use walkdir::WalkDir;

    for entry in WalkDir::new(sessions_dir).into_iter().flatten() {
        if entry.path().extension().and_then(|s| s.to_str()) == Some("jsonl") {
            // Read the first line to check session_id
            if let Ok(file) = std::fs::File::open(entry.path()) {
                let reader = BufReader::new(file);
                if let Some(Ok(first_line)) = reader.lines().next() {
                    if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&first_line) {
                        // Check if this is a session_meta event with matching ID
                        if meta["type"].as_str() == Some("session_meta") {
                            if let Some(id) = meta["payload"]["id"].as_str() {
                                if id == session_id {
                                    log::info!(
                                        "Found session file: {:?} for session_id: {}",
                                        entry.path(),
                                        session_id
                                    );
                                    return Some(entry.path().to_path_buf());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    log::warn!("Session file not found for session_id: {}", session_id);
    None
}

/// Deletes a Codex session
/// On Windows with WSL mode, deletes from WSL filesystem via UNC path
#[tauri::command]
pub async fn delete_codex_session(session_id: String) -> Result<String, String> {
    log::info!("delete_codex_session called for: {}", session_id);

    // Use unified sessions directory function (supports WSL)
    let sessions_dir = get_codex_sessions_dir()?;

    // Find the session file
    let session_file = find_session_file(&sessions_dir, &session_id)
        .ok_or_else(|| format!("Session file not found for ID: {}", session_id))?;

    // Delete the file
    std::fs::remove_file(&session_file)
        .map_err(|e| format!("Failed to delete session file: {}", e))?;

    log::info!(
        "Successfully deleted Codex session file: {:?}",
        session_file
    );
    Ok(format!("Session {} deleted", session_id))
}

// ============================================================================
// Configuration & Utilities
// ============================================================================

/// Checks if Codex is available and properly configured
#[tauri::command]
pub async fn check_codex_availability() -> Result<CodexAvailability, String> {
    log::info!("[Codex] Checking availability...");

    // 1) Windows 下优先检查 WSL 模式
    #[cfg(target_os = "windows")]
    {
        let wsl_config = wsl_utils::get_wsl_config();
        if wsl_config.enabled {
            if let Some(ref codex_path) = wsl_config.codex_path_in_wsl {
                let version = wsl_utils::get_wsl_codex_version(wsl_config.distro.as_deref())
                    .unwrap_or_else(|| "Unknown version".to_string());

                log::info!(
                    "[Codex] ✅ Available in WSL ({:?}) - path: {}, version: {}",
                    wsl_config.distro,
                    codex_path,
                    version
                );

                return Ok(CodexAvailability {
                    available: true,
                    version: Some(format!("WSL: {}", version)),
                    error: None,
                });
            }
        }
        log::info!("[Codex] WSL mode not available, trying native paths...");
    }

    // 2) 运行时检测（环境变量 / PATH / 注册表 / 常见目录 / 用户配置）
    let (_env_info, detected) = detect_binary_for_tool("codex", "CODEX_PATH", "codex");
    if let Some(inst) = detected {
        let mut cmd = Command::new(&inst.path);
        cmd.arg("--version");
        apply_no_window_async(&mut cmd);

        match cmd.output().await {
            Ok(output) => {
                let stdout_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr_str = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let version = if !stdout_str.is_empty() {
                    stdout_str.clone()
                } else if !stderr_str.is_empty() {
                    stderr_str.clone()
                } else {
                    inst.version
                        .clone()
                        .unwrap_or_else(|| "Unknown version".to_string())
                };

                if output.status.success() {
                    log::info!(
                        "[Codex] ✅ Available - path: {}, source: {}, version: {}",
                        inst.path,
                        inst.source,
                        version
                    );
                    return Ok(CodexAvailability {
                        available: true,
                        version: Some(version),
                        error: None,
                    });
                } else {
                    log::warn!(
                        "[Codex] Version probe failed for {} (status {:?}), stderr: {}",
                        inst.path,
                        output.status.code(),
                        stderr_str
                    );
                }
            }
            Err(e) => {
                log::warn!(
                    "[Codex] Failed to run version check for {}: {}",
                    inst.path,
                    e
                );
            }
        }
    }

    // 3) 兜底：使用旧的候选列表避免极端路径遗漏
    let codex_commands = get_codex_command_candidates();
    for cmd_path in codex_commands {
        log::info!("[Codex] Fallback trying: {}", cmd_path);

        let mut cmd = Command::new(&cmd_path);
        cmd.arg("--version");
        apply_no_window_async(&mut cmd);

        match cmd.output().await {
            Ok(output) => {
                let stdout_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr_str = String::from_utf8_lossy(&output.stderr).trim().to_string();

                if output.status.success() {
                    let version = if !stdout_str.is_empty() {
                        stdout_str
                    } else if !stderr_str.is_empty() {
                        stderr_str
                    } else {
                        "Unknown version".to_string()
                    };

                    log::info!("[Codex] ✅ Available via fallback - version: {}", version);
                    return Ok(CodexAvailability {
                        available: true,
                        version: Some(version),
                        error: None,
                    });
                }
            }
            Err(e) => {
                log::warn!("[Codex] Fallback command '{}' failed: {}", cmd_path, e);
            }
        }
    }

    // 4) 完全失败
    log::error!("[Codex] ❌ Codex CLI not found via runtime detection or fallback list");
    Ok(CodexAvailability {
        available: false,
        version: None,
        error: Some("Codex CLI not found. 请设置 CODEX_PATH 或安装 codex CLI".to_string()),
    })
}

/// 设置自定义 Codex CLI 路径，支持 ~ 展开与相对路径
#[tauri::command]
pub async fn set_custom_codex_path(app: AppHandle, custom_path: String) -> Result<(), String> {
    log::info!("[Codex] Setting custom path: {}", custom_path);

    let expanded_path = expand_user_path(&custom_path)?;
    if !expanded_path.exists() {
        return Err("File does not exist".to_string());
    }
    if !expanded_path.is_file() {
        return Err("Path is not a file".to_string());
    }

    let path_str = expanded_path
        .to_str()
        .ok_or_else(|| "Invalid path encoding".to_string())?
        .to_string();

    let mut cmd = Command::new(&path_str);
    cmd.arg("--version");
    apply_no_window_async(&mut cmd);

    match cmd.output().await {
        Ok(output) => {
            if !output.status.success() {
                return Err("File is not a valid Codex CLI executable".to_string());
            }
        }
        Err(e) => return Err(format!("Failed to test Codex CLI: {}", e)),
    }

    // 写入 binaries.json 供统一检测使用
    if let Err(e) = update_binary_override("codex", &path_str) {
        log::warn!("[Codex] Failed to update binaries.json: {}", e);
    }

    // 兼容地存一份到 app_settings
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let db_path = app_data_dir.join("agents.db");
        if let Ok(conn) = rusqlite::Connection::open(&db_path) {
            let _ = conn.execute(
                "CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )",
                [],
            );
            let _ = conn.execute(
                "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
                rusqlite::params!["codex_binary_path", path_str],
            );
        }
    }

    Ok(())
}

fn read_custom_codex_path_from_db(app: &AppHandle) -> Option<String> {
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let db_path = app_data_dir.join("agents.db");
        if db_path.exists() {
            if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                if let Ok(val) = conn.query_row(
                    "SELECT value FROM app_settings WHERE key = 'codex_binary_path'",
                    [],
                    |row| row.get::<_, String>(0),
                ) {
                    return Some(val);
                }
            }
        }
    }
    None
}

/// 获取当前 Codex 路径（自定义优先，其次运行时检测）
#[tauri::command]
pub async fn get_codex_path(app: AppHandle) -> Result<String, String> {
    if let Some(override_path) = get_binary_override("codex") {
        return Ok(override_path);
    }
    if let Some(db_path) = read_custom_codex_path_from_db(&app) {
        return Ok(db_path);
    }

    let (_env, detected) = detect_binary_for_tool("codex", "CODEX_PATH", "codex");
    if let Some(inst) = detected {
        return Ok(inst.path);
    }

    Err("Codex CLI not found. 请设置 CODEX_PATH 或安装 codex CLI".to_string())
}

/// 清除自定义 Codex 路径，恢复自动检测
#[tauri::command]
pub async fn clear_custom_codex_path(app: AppHandle) -> Result<(), String> {
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let db_path = app_data_dir.join("agents.db");
        if db_path.exists() {
            if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                let _ = conn.execute(
                    "DELETE FROM app_settings WHERE key = 'codex_binary_path'",
                    [],
                );
            }
        }
    }

    if let Err(e) = clear_binary_override("codex") {
        log::warn!("[Codex] Failed to clear binaries.json override: {}", e);
    }

    Ok(())
}

/// Get the shell's PATH on macOS
/// GUI applications on macOS don't inherit the PATH from shell configuration files
/// This function runs the user's default shell to get the actual PATH
#[cfg(target_os = "macos")]
fn get_shell_path_codex() -> Option<String> {
    use std::process::Command as StdCommand;

    // Get the user's default shell
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    log::debug!("[Codex] User's default shell: {}", shell);

    // Run shell in login mode to source all profile scripts and get PATH
    let mut cmd = StdCommand::new(&shell);
    cmd.args(["-l", "-c", "echo $PATH"]);

    match cmd.output() {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                log::info!("[Codex] Got shell PATH: {}", path);
                return Some(path);
            }
        }
        Ok(output) => {
            log::debug!(
                "[Codex] Shell command failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        Err(e) => {
            log::debug!("[Codex] Failed to execute shell: {}", e);
        }
    }

    // Fallback: construct PATH from common locations
    if let Ok(home) = std::env::var("HOME") {
        let common_paths: Vec<String> = vec![
            "/opt/homebrew/bin".to_string(),
            "/usr/local/bin".to_string(),
            "/usr/bin".to_string(),
            "/bin".to_string(),
            format!("{}/.local/bin", home),
            format!("{}/.npm-global/bin", home),
            format!("{}/.volta/bin", home),
            format!("{}/.fnm", home),
        ];

        let existing_paths: Vec<&str> = common_paths
            .iter()
            .map(|s| s.as_ref())
            .filter(|p| std::path::Path::new(p).exists())
            .collect();

        if !existing_paths.is_empty() {
            let path = existing_paths.join(":");
            log::info!("[Codex] Constructed fallback PATH: {}", path);
            return Some(path);
        }
    }

    None
}

/// Get npm global prefix directory
#[cfg(target_os = "macos")]
fn get_npm_prefix_codex() -> Option<String> {
    use std::process::Command as StdCommand;

    // Try to run `npm config get prefix`
    let mut cmd = StdCommand::new("npm");
    cmd.args(["config", "get", "prefix"]);

    // Also try with common paths in PATH
    if let Some(shell_path) = get_shell_path_codex() {
        cmd.env("PATH", &shell_path);
    }

    match cmd.output() {
        Ok(output) if output.status.success() => {
            let prefix = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !prefix.is_empty() && prefix != "undefined" {
                log::debug!("[Codex] npm prefix: {}", prefix);
                return Some(prefix);
            }
        }
        _ => {}
    }

    // Fallback to common npm prefix locations
    if let Ok(home) = std::env::var("HOME") {
        let common_prefixes = vec![
            format!("{}/.npm-global", home),
            "/usr/local".to_string(),
            "/opt/homebrew".to_string(),
        ];

        for prefix in common_prefixes {
            if std::path::Path::new(&prefix).exists() {
                log::debug!("[Codex] Using fallback npm prefix: {}", prefix);
                return Some(prefix);
            }
        }
    }

    None
}

/// Returns a list of possible Codex command paths to try
fn get_codex_command_candidates() -> Vec<String> {
    let mut candidates = vec!["codex".to_string()];

    // Windows: npm global install paths (与 wsl_utils::get_native_codex_paths 保持同步)
    #[cfg(target_os = "windows")]
    {
        // npm 全局安装路径 (APPDATA - 标准位置)
        if let Ok(appdata) = std::env::var("APPDATA") {
            candidates.push(format!(r"{}\npm\codex.cmd", appdata));
            candidates.push(format!(r"{}\npm\codex", appdata));
            // nvm-windows 安装的 Node.js 版本
            let nvm_dir = format!(r"{}\nvm", appdata);
            if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let codex_path = entry.path().join("codex.cmd");
                        if codex_path.exists() {
                            candidates.push(codex_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        // npm 全局安装路径 (LOCALAPPDATA)
        if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
            candidates.push(format!(r"{}\npm\codex.cmd", localappdata));
            candidates.push(format!(r"{}\npm\codex", localappdata));
            // pnpm 全局安装路径
            candidates.push(format!(r"{}\pnpm\codex.cmd", localappdata));
            candidates.push(format!(r"{}\pnpm\codex", localappdata));
            // Yarn 全局安装路径
            candidates.push(format!(r"{}\Yarn\bin\codex.cmd", localappdata));
            candidates.push(format!(r"{}\Yarn\bin\codex", localappdata));
        }

        // 用户目录下的安装路径
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            // 自定义 npm 全局目录
            candidates.push(format!(r"{}\.npm-global\bin\codex.cmd", userprofile));
            candidates.push(format!(r"{}\.npm-global\bin\codex", userprofile));
            // Volta 安装路径
            candidates.push(format!(r"{}\.volta\bin\codex.cmd", userprofile));
            candidates.push(format!(r"{}\.volta\bin\codex", userprofile));
            // fnm 安装路径
            candidates.push(format!(r"{}\.fnm\aliases\default\codex.cmd", userprofile));
            // Scoop 安装路径
            candidates.push(format!(r"{}\scoop\shims\codex.cmd", userprofile));
            candidates.push(format!(
                r"{}\scoop\apps\nodejs\current\codex.cmd",
                userprofile
            ));
            // 本地 bin 目录
            candidates.push(format!(r"{}\.local\bin\codex.cmd", userprofile));
            candidates.push(format!(r"{}\.local\bin\codex", userprofile));
        }

        // Node.js 安装路径
        if let Ok(programfiles) = std::env::var("ProgramFiles") {
            candidates.push(format!(r"{}\nodejs\codex.cmd", programfiles));
            candidates.push(format!(r"{}\nodejs\codex", programfiles));
        }

        // Chocolatey 安装路径
        if let Ok(programdata) = std::env::var("ProgramData") {
            candidates.push(format!(r"{}\chocolatey\bin\codex.cmd", programdata));
            candidates.push(format!(r"{}\chocolatey\bin\codex", programdata));
        }
    }

    // macOS-specific paths - 🔥 Enhanced with more locations
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            // npm global install paths
            candidates.push(format!("{}/.npm-global/bin/codex", home));
            candidates.push(format!("{}/.npm/bin/codex", home));
            candidates.push(format!("{}/npm/bin/codex", home));

            // pnpm global paths
            candidates.push(format!("{}/Library/pnpm/codex", home));
            candidates.push(format!("{}/.local/share/pnpm/codex", home));
            candidates.push(format!("{}/.pnpm-global/bin/codex", home));

            // Node version managers
            candidates.push(format!("{}/.volta/bin/codex", home));
            candidates.push(format!("{}/.n/bin/codex", home));
            candidates.push(format!("{}/.asdf/shims/codex", home));
            candidates.push(format!("{}/.local/bin/codex", home));

            // fnm (Fast Node Manager) paths
            candidates.push(format!("{}/.fnm/aliases/default/bin/codex", home));
            candidates.push(format!(
                "{}/.local/share/fnm/aliases/default/bin/codex",
                home
            ));
            candidates.push(format!(
                "{}/Library/Application Support/fnm/aliases/default/bin/codex",
                home
            ));

            // nvm current symlink
            candidates.push(format!("{}/.nvm/current/bin/codex", home));

            // 🔥 Dynamically add npm prefix path
            if let Some(npm_prefix) = get_npm_prefix_codex() {
                let npm_bin_path = format!("{}/bin/codex", npm_prefix);
                if !candidates.contains(&npm_bin_path) {
                    log::debug!("[Codex] Adding npm prefix path: {}", npm_bin_path);
                    candidates.push(npm_bin_path);
                }
            }

            // 🔥 Scan nvm node version directories
            let nvm_versions_dir = format!("{}/.nvm/versions/node", home);
            if let Ok(entries) = std::fs::read_dir(&nvm_versions_dir) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let codex_path = entry.path().join("bin").join("codex");
                        if codex_path.exists() {
                            candidates.push(codex_path.to_string_lossy().to_string());
                        }
                    }
                }
            }

            // 🔥 Scan fnm node version directories
            for fnm_base in &[
                format!("{}/.fnm/node-versions", home),
                format!("{}/.local/share/fnm/node-versions", home),
                format!("{}/Library/Application Support/fnm/node-versions", home),
            ] {
                if let Ok(entries) = std::fs::read_dir(fnm_base) {
                    for entry in entries.flatten() {
                        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                            let codex_path =
                                entry.path().join("installation").join("bin").join("codex");
                            if codex_path.exists() {
                                candidates.push(codex_path.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }

        // Homebrew paths (Apple Silicon and Intel)
        candidates.push("/opt/homebrew/bin/codex".to_string()); // Apple Silicon (M1/M2/M3)
        candidates.push("/usr/local/bin/codex".to_string()); // Intel Mac / Homebrew legacy

        // NPM global lib paths
        candidates.push("/opt/homebrew/lib/node_modules/@openai/codex/bin/codex".to_string());
        candidates.push("/usr/local/lib/node_modules/@openai/codex/bin/codex".to_string());

        // MacPorts
        candidates.push("/opt/local/bin/codex".to_string());
    }

    // Linux: npm global paths
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            candidates.push(format!("{}/.npm-global/bin/codex", home));
            candidates.push(format!("{}/.local/bin/codex", home));
            candidates.push(format!("{}/.volta/bin/codex", home));
            candidates.push(format!("{}/.asdf/shims/codex", home));
            candidates.push(format!("{}/.nvm/current/bin/codex", home));
        }
        candidates.push("/usr/local/bin/codex".to_string());
        candidates.push("/usr/bin/codex".to_string());
    }

    candidates
}

// ============================================================================
// Codex Mode Configuration API
// ============================================================================

/// Codex 模式配置信息（用于前端显示）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModeInfo {
    /// 当前配置的模式
    pub mode: String,
    /// WSL 发行版（如果配置了）
    pub wsl_distro: Option<String>,
    /// 实际使用的模式（检测结果）
    pub actual_mode: String,
    /// Windows 原生 Codex 是否可用
    pub native_available: bool,
    /// WSL Codex 是否可用
    pub wsl_available: bool,
    /// 可用的 WSL 发行版列表
    pub available_distros: Vec<String>,
}

/// 获取 Codex 模式配置
#[tauri::command]
pub async fn get_codex_mode_config() -> Result<CodexModeInfo, String> {
    log::info!("[Codex] Getting mode configuration...");

    let config = wsl_utils::get_codex_config();
    let wsl_config = wsl_utils::get_wsl_config();

    // 检测可用性
    #[cfg(target_os = "windows")]
    let (native_available, wsl_available, available_distros) = {
        let native = wsl_utils::is_native_codex_available();
        let distros = wsl_utils::get_wsl_distros();
        let wsl = !distros.is_empty() && wsl_utils::check_wsl_codex(None).is_some();
        (native, wsl, distros)
    };

    #[cfg(not(target_os = "windows"))]
    let (native_available, wsl_available, available_distros) = (true, false, vec![]);

    let mode_str = match config.mode {
        wsl_utils::CodexMode::Auto => "auto",
        wsl_utils::CodexMode::Native => "native",
        wsl_utils::CodexMode::Wsl => "wsl",
    };

    let actual_mode = if wsl_config.enabled { "wsl" } else { "native" };

    Ok(CodexModeInfo {
        mode: mode_str.to_string(),
        wsl_distro: config.wsl_distro.clone(),
        actual_mode: actual_mode.to_string(),
        native_available,
        wsl_available,
        available_distros,
    })
}

/// 设置 Codex 模式配置
#[tauri::command]
pub async fn set_codex_mode_config(
    mode: String,
    wsl_distro: Option<String>,
) -> Result<String, String> {
    log::info!(
        "[Codex] Setting mode configuration: mode={}, wsl_distro={:?}",
        mode,
        wsl_distro
    );

    let codex_mode = match mode.to_lowercase().as_str() {
        "auto" => wsl_utils::CodexMode::Auto,
        "native" => wsl_utils::CodexMode::Native,
        "wsl" => wsl_utils::CodexMode::Wsl,
        _ => {
            return Err(format!(
                "Invalid mode: {}. Use 'auto', 'native', or 'wsl'",
                mode
            ))
        }
    };

    let config = wsl_utils::CodexConfig {
        mode: codex_mode,
        wsl_distro,
    };

    wsl_utils::save_codex_config(&config)?;

    Ok("配置已保存。是否立即重启应用以使更改生效？".to_string())
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Builds a Codex command with the given options
/// Returns (Command, Option<String>) where the String is the prompt to be passed via stdin
/// Supports both native execution and WSL mode on Windows
fn build_codex_command(
    options: &CodexExecutionOptions,
    is_resume: bool,
    session_id: Option<&str>,
) -> Result<(Command, Option<String>), String> {
    // 🆕 Check if we should use WSL mode on Windows
    #[cfg(target_os = "windows")]
    {
        let wsl_config = wsl_utils::get_wsl_config();
        if wsl_config.enabled {
            log::info!("[Codex] Using WSL mode (distro: {:?})", wsl_config.distro);
            return build_wsl_codex_command(options, is_resume, session_id, &wsl_config);
        }
    }

    // Native mode: Use system-installed Codex
    let (_env_info, detected) = detect_binary_for_tool("codex", "CODEX_PATH", "codex");
    let codex_cmd = if let Some(inst) = detected {
        log::info!(
            "[Codex] Using detected binary: {} (source: {}, version: {:?})",
            inst.path,
            inst.source,
            inst.version
        );
        inst.path
    } else {
        log::warn!("[Codex] No detected binary, fallback to 'codex' in PATH");
        "codex".to_string()
    };

    let mut cmd = Command::new(&codex_cmd);
    cmd.arg("exec");

    // ⚠️ CRITICAL: --json MUST come before 'resume' (if used)
    // Correct order: codex exec --json resume <SESSION_ID> <PROMPT>
    // This enables JSON output for both new and resume sessions

    // Add --json flag first (works for both new and resume)
    if options.json {
        cmd.arg("--json");
    }

    if is_resume {
        // Add 'resume' after --json
        cmd.arg("resume");

        // Add session_id
        if let Some(sid) = session_id {
            cmd.arg(sid);
        }

        // Resume mode: other options are NOT supported
        // The session retains its original mode/model configuration
    } else {
        // For new sessions: add other options
        // (--json already added above)

        match options.mode {
            CodexExecutionMode::FullAuto => {
                cmd.arg("--full-auto");
            }
            CodexExecutionMode::DangerFullAccess => {
                cmd.arg("--sandbox");
                cmd.arg("danger-full-access");
            }
            CodexExecutionMode::ReadOnly => {
                // Read-only is default
            }
        }

        if let Some(ref model) = options.model {
            cmd.arg("--model");
            cmd.arg(model);
        }

        if let Some(ref schema) = options.output_schema {
            cmd.arg("--output-schema");
            cmd.arg(schema);
        }

        if let Some(ref file) = options.output_file {
            cmd.arg("-o");
            cmd.arg(file);
        }

        if options.skip_git_repo_check {
            cmd.arg("--skip-git-repo-check");
        }
    }

    // Set working directory
    cmd.current_dir(&options.project_path);

    // Set API key environment variable if provided
    if let Some(ref api_key) = options.api_key {
        cmd.env("CODEX_API_KEY", api_key);
    }

    // 🔧 FIX: Pass prompt via stdin instead of command line argument
    // This fixes issues with:
    // 1. Command line length limits (Windows: ~8191 chars)
    // 2. Special characters (newlines, quotes, etc.)
    // 3. Formatted text (markdown, code blocks)

    // Add "-" to indicate reading from stdin (common CLI convention)
    cmd.arg("-");

    let prompt_for_stdin = if is_resume {
        // For resume mode, prompt is still needed but passed via stdin
        Some(options.prompt.clone())
    } else {
        // For new sessions, pass prompt via stdin
        Some(options.prompt.clone())
    };

    Ok((cmd, prompt_for_stdin))
}

/// 🆕 Builds a Codex command for WSL mode
/// This is used when Codex is installed in WSL and we're running on Windows
#[cfg(target_os = "windows")]
fn build_wsl_codex_command(
    options: &CodexExecutionOptions,
    is_resume: bool,
    session_id: Option<&str>,
    wsl_config: &wsl_utils::WslConfig,
) -> Result<(Command, Option<String>), String> {
    // Build arguments for codex command
    let mut args: Vec<String> = vec!["exec".to_string()];

    // Add --json flag first (must come before 'resume')
    if options.json {
        args.push("--json".to_string());
    }

    if is_resume {
        args.push("resume".to_string());
        if let Some(sid) = session_id {
            args.push(sid.to_string());
        }
    } else {
        match options.mode {
            CodexExecutionMode::FullAuto => {
                args.push("--full-auto".to_string());
            }
            CodexExecutionMode::DangerFullAccess => {
                args.push("--sandbox".to_string());
                args.push("danger-full-access".to_string());
            }
            CodexExecutionMode::ReadOnly => {}
        }

        if let Some(ref model) = options.model {
            args.push("--model".to_string());
            args.push(model.clone());
        }

        if let Some(ref schema) = options.output_schema {
            args.push("--output-schema".to_string());
            args.push(schema.clone());
        }

        if let Some(ref file) = options.output_file {
            args.push("-o".to_string());
            // Convert output file path to WSL format
            args.push(wsl_utils::windows_to_wsl_path(file));
        }

        if options.skip_git_repo_check {
            args.push("--skip-git-repo-check".to_string());
        }
    }

    // Add stdin indicator
    args.push("-".to_string());

    // Build WSL command with path conversion
    // project_path is Windows format (C:\...), will be converted to WSL format (/mnt/c/...)
    let mut cmd = wsl_utils::build_wsl_command_async(
        "codex",
        &args,
        Some(&options.project_path),
        wsl_config.distro.as_deref(),
    );

    // Set API key environment variable if provided
    // Note: This will be passed to WSL environment
    if let Some(ref api_key) = options.api_key {
        cmd.env("CODEX_API_KEY", api_key);
    }

    log::info!(
        "[Codex WSL] Command built: wsl -d {:?} --cd {} -- codex {:?}",
        wsl_config.distro,
        wsl_utils::windows_to_wsl_path(&options.project_path),
        args
    );

    Ok((cmd, Some(options.prompt.clone())))
}

/// Executes a Codex process and streams output to frontend
async fn execute_codex_process(
    mut cmd: Command,
    prompt: Option<String>,
    _project_path: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    // Setup stdio
    cmd.stdin(Stdio::piped()); // 🔧 Enable stdin to pass prompt
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // 🔥 Fix: Apply platform-specific no-window configuration to hide console
    // This prevents the terminal window from flashing when starting Codex sessions
    apply_no_window_async(&mut cmd);

    // Spawn process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn codex: {}", e))?;

    // 🔧 FIX: Write prompt to stdin if provided
    // This avoids command line length limits and special character issues
    if let Some(prompt_text) = prompt {
        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;

            log::debug!("Writing prompt to stdin ({} bytes)", prompt_text.len());

            if let Err(e) = stdin.write_all(prompt_text.as_bytes()).await {
                log::error!("Failed to write prompt to stdin: {}", e);
                return Err(format!("Failed to write prompt to stdin: {}", e));
            }

            // Close stdin to signal end of input
            drop(stdin);
            log::debug!("Stdin closed successfully");
        } else {
            log::error!("Failed to get stdin handle");
            return Err("Failed to get stdin handle".to_string());
        }
    }

    // Extract stdout and stderr
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Generate session ID for tracking
    let session_id = format!("codex-{}", uuid::Uuid::new_v4());

    // Store process in state
    let state: tauri::State<'_, CodexProcessState> = app_handle.state();
    {
        let mut processes = state.processes.lock().await;
        processes.insert(session_id.clone(), child);

        let mut last_session = state.last_session_id.lock().await;
        *last_session = Some(session_id.clone());
    }

    // Clone handles for async tasks
    let app_handle_stdout = app_handle.clone();
    let _app_handle_stderr = app_handle.clone(); // Reserved for future stderr event emission
    let app_handle_complete = app_handle.clone();
    let session_id_complete = session_id.clone();

    // Spawn task to read stdout (JSONL events)
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if !line.trim().is_empty() {
                log::debug!("Codex output: {}", line);
                if let Err(e) = app_handle_stdout.emit("codex-output", line) {
                    log::error!("Failed to emit codex-output: {}", e);
                }
            }
        }
    });

    // Spawn task to read stderr (log errors, suppress debug output)
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            // Log error messages for debugging
            if !line.trim().is_empty() {
                log::warn!("Codex stderr: {}", line);
            }
        }
    });

    // Spawn task to wait for process completion
    tokio::spawn(async move {
        let state: tauri::State<'_, CodexProcessState> = app_handle_complete.state();

        // Wait for process to complete
        {
            let mut processes = state.processes.lock().await;
            if let Some(mut child) = processes.remove(&session_id_complete) {
                match child.wait().await {
                    Ok(status) => {
                        log::info!("Codex process exited with status: {}", status);
                    }
                    Err(e) => {
                        log::error!("Error waiting for process: {}", e);
                    }
                }
            }
        }

        // Emit completion event
        if let Err(e) = app_handle_complete.emit("codex-complete", true) {
            log::error!("Failed to emit codex-complete: {}", e);
        }
    });

    Ok(())
}

// ============================================================================
// Codex Rewind Implementation
// ============================================================================

/// Get the Codex git records directory
fn get_codex_git_records_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir().ok_or_else(|| "Failed to get home directory".to_string())?;

    let records_dir = home_dir.join(".codex").join("git-records");

    // Create directory if it doesn't exist
    if !records_dir.exists() {
        fs::create_dir_all(&records_dir)
            .map_err(|e| format!("Failed to create git records directory: {}", e))?;
    }

    Ok(records_dir)
}

/// Get the Codex sessions directory
/// On Windows with WSL mode enabled, returns the WSL UNC path
fn get_codex_sessions_dir() -> Result<PathBuf, String> {
    // Check for WSL mode on Windows
    #[cfg(target_os = "windows")]
    {
        let wsl_config = wsl_utils::get_wsl_config();
        if wsl_config.enabled {
            if let Some(sessions_dir) = wsl_utils::get_wsl_codex_sessions_dir() {
                log::debug!("[Codex] Using WSL sessions directory: {:?}", sessions_dir);
                return Ok(sessions_dir);
            }
        }
    }

    // Native mode: use local home directory
    let home_dir = dirs::home_dir().ok_or_else(|| "Failed to get home directory".to_string())?;

    Ok(home_dir.join(".codex").join("sessions"))
}

/// Load Git records for a Codex session
fn load_codex_git_records(session_id: &str) -> Result<CodexGitRecords, String> {
    let records_dir = get_codex_git_records_dir()?;
    let records_file = records_dir.join(format!("{}.json", session_id));

    if !records_file.exists() {
        return Ok(CodexGitRecords {
            session_id: session_id.to_string(),
            project_path: String::new(),
            records: Vec::new(),
        });
    }

    let content = fs::read_to_string(&records_file)
        .map_err(|e| format!("Failed to read git records: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse git records: {}", e))
}

/// Save Git records for a Codex session
fn save_codex_git_records(session_id: &str, records: &CodexGitRecords) -> Result<(), String> {
    let records_dir = get_codex_git_records_dir()?;
    let records_file = records_dir.join(format!("{}.json", session_id));

    let content = serde_json::to_string_pretty(records)
        .map_err(|e| format!("Failed to serialize git records: {}", e))?;

    fs::write(&records_file, content).map_err(|e| format!("Failed to write git records: {}", e))?;

    log::debug!("Saved Codex git records for session: {}", session_id);
    Ok(())
}

/// Truncate Git records after a specific prompt index
fn truncate_codex_git_records(session_id: &str, prompt_index: usize) -> Result<(), String> {
    let mut git_records = load_codex_git_records(session_id)?;

    // Keep only records up to and including prompt_index
    git_records
        .records
        .retain(|r| r.prompt_index <= prompt_index);

    save_codex_git_records(session_id, &git_records)?;
    log::info!(
        "[Codex Rewind] Truncated git records after prompt #{}",
        prompt_index
    );

    Ok(())
}

/// Extract all user prompts from a Codex session JSONL
/// This mirrors Claude prompt extraction so indices stay consistent
fn extract_codex_prompts(session_id: &str) -> Result<Vec<PromptRecord>, String> {
    let sessions_dir = get_codex_sessions_dir()?;
    let session_file = find_session_file(&sessions_dir, session_id)
        .ok_or_else(|| format!("Session file not found for: {}", session_id))?;

    let content = fs::read_to_string(&session_file)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let mut prompts: Vec<PromptRecord> = Vec::new();
    let mut prompt_index = 0;

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(event) = serde_json::from_str::<serde_json::Value>(line) {
            if event["type"].as_str() == Some("response_item")
                && event["payload"]["role"].as_str() == Some("user")
            {
                // Extract the actual user text (skip system/context injections)
                let mut prompt_text: Option<String> = None;
                if let Some(content) = event["payload"]["content"].as_array() {
                    for item in content {
                        if item["type"].as_str() == Some("input_text") {
                            if let Some(text) = item["text"].as_str() {
                                if !text.contains("<environment_context>")
                                    && !text.contains("# AGENTS.md instructions")
                                    && !text.trim().is_empty()
                                {
                                    prompt_text = Some(text.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }

                if let Some(text) = prompt_text {
                    let timestamp = event["timestamp"]
                        .as_str()
                        .and_then(|ts| chrono::DateTime::parse_from_rfc3339(ts).ok())
                        .map(|dt| dt.timestamp())
                        .unwrap_or_else(|| chrono::Utc::now().timestamp());

                    prompts.push(PromptRecord {
                        index: prompt_index,
                        text,
                        git_commit_before: String::new(),
                        git_commit_after: None,
                        timestamp,
                        source: "cli".to_string(), // default to CLI; update below if git record exists
                    });
                    prompt_index += 1;
                }
            }
        }
    }

    // Enrich with git records (if present)
    let git_records = load_codex_git_records(session_id)?;
    for prompt in prompts.iter_mut() {
        if let Some(record) = git_records
            .records
            .iter()
            .find(|r| r.prompt_index == prompt.index)
        {
            prompt.git_commit_before = record.commit_before.clone();
            prompt.git_commit_after = record.commit_after.clone();
            prompt.source = "project".to_string();

            if prompt.timestamp == 0 {
                if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(&record.timestamp) {
                    prompt.timestamp = ts.timestamp();
                }
            }
        }
    }

    Ok(prompts)
}

/// Get prompt list for Codex sessions (for revert picker)
#[tauri::command]
pub async fn get_codex_prompt_list(session_id: String) -> Result<Vec<PromptRecord>, String> {
    extract_codex_prompts(&session_id)
}

/// Check rewind capabilities for Codex prompt (conversation/code/both)
#[tauri::command]
pub async fn check_codex_rewind_capabilities(
    session_id: String,
    prompt_index: usize,
) -> Result<RewindCapabilities, String> {
    log::info!(
        "[Codex Rewind] Checking capabilities for session {} prompt #{}",
        session_id,
        prompt_index
    );

    // Respect global execution config for git operations
    let execution_config =
        load_execution_config().map_err(|e| format!("Failed to load execution config: {}", e))?;
    let git_operations_disabled = execution_config.disable_rewind_git_operations;

    // Extract prompts to validate index and source
    let prompts = extract_codex_prompts(&session_id)?;
    let prompt = prompts
        .get(prompt_index)
        .ok_or_else(|| format!("Prompt #{} not found", prompt_index))?;

    if git_operations_disabled {
        return Ok(RewindCapabilities {
            conversation: true,
            code: false,
            both: false,
            warning: Some(
                "Git 操作已在配置中禁用。只能撤回对话历史，无法回滚代码变更。".to_string(),
            ),
            source: prompt.source.clone(),
        });
    }

    // Look up git record for this prompt index
    let git_records = load_codex_git_records(&session_id)?;
    let git_record = git_records
        .records
        .iter()
        .find(|r| r.prompt_index == prompt_index);

    if let Some(record) = git_record {
        let has_valid_commit = !record.commit_before.is_empty();
        Ok(RewindCapabilities {
            conversation: true,
            code: has_valid_commit,
            both: has_valid_commit,
            warning: if has_valid_commit {
                None
            } else {
                Some("此提示词没有关联的 Git 记录，只能删除对话历史。".to_string())
            },
            source: "project".to_string(),
        })
    } else {
        Ok(RewindCapabilities {
            conversation: true,
            code: false,
            both: false,
            warning: Some(
                "此提示词没有关联的 Git 记录（可能来自 CLI），只能删除对话历史。".to_string(),
            ),
            source: prompt.source.clone(),
        })
    }
}

/// Get prompt text from Codex session file
#[allow(dead_code)]
fn get_codex_prompt_text(session_id: &str, prompt_index: usize) -> Result<String, String> {
    let sessions_dir = get_codex_sessions_dir()?;
    let session_file = find_session_file(&sessions_dir, session_id)
        .ok_or_else(|| format!("Session file not found for: {}", session_id))?;

    use std::io::{BufRead, BufReader};
    let file =
        fs::File::open(&session_file).map_err(|e| format!("Failed to open session file: {}", e))?;

    let reader = BufReader::new(file);
    let mut user_message_count = 0;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) {
            if event["type"].as_str() == Some("response_item")
                && event["payload"]["role"].as_str() == Some("user")
            {
                if user_message_count == prompt_index {
                    // Extract text from content array
                    if let Some(content) = event["payload"]["content"].as_array() {
                        for item in content {
                            if item["type"].as_str() == Some("input_text") {
                                if let Some(text) = item["text"].as_str() {
                                    // Skip system messages
                                    if !text.contains("<environment_context>")
                                        && !text.contains("# AGENTS.md instructions")
                                        && !text.is_empty()
                                    {
                                        return Ok(text.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
                user_message_count += 1;
            }
        }
    }

    Err(format!("Prompt #{} not found in session", prompt_index))
}

/// Truncate Codex session file to before a specific prompt
fn truncate_codex_session_to_prompt(session_id: &str, prompt_index: usize) -> Result<(), String> {
    let sessions_dir = get_codex_sessions_dir()?;
    let session_file = find_session_file(&sessions_dir, session_id)
        .ok_or_else(|| format!("Session file not found for: {}", session_id))?;

    let content = fs::read_to_string(&session_file)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    // Find the line index to truncate at
    let mut user_message_count = 0;
    let mut truncate_at_line = 0;
    let mut found_target = false;

    for (idx, line) in lines.iter().enumerate() {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(event) = serde_json::from_str::<serde_json::Value>(line) {
            if event["type"].as_str() == Some("response_item")
                && event["payload"]["role"].as_str() == Some("user")
            {
                // Extract user text and skip system injections
                let mut prompt_text: Option<String> = None;
                if let Some(content) = event["payload"]["content"].as_array() {
                    for item in content {
                        if item["type"].as_str() == Some("input_text") {
                            if let Some(text) = item["text"].as_str() {
                                if !text.contains("<environment_context>")
                                    && !text.contains("# AGENTS.md instructions")
                                    && !text.trim().is_empty()
                                {
                                    prompt_text = Some(text.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }

                // Skip non-user prompts (e.g., AGENTS/system context)
                if prompt_text.is_none() {
                    continue;
                }

                if user_message_count == prompt_index {
                    truncate_at_line = idx;
                    found_target = true;
                    break;
                }
                user_message_count += 1;
            }
        }
    }

    if !found_target {
        return Err(format!("Prompt #{} not found in session", prompt_index));
    }

    log::info!(
        "[Codex Rewind] Total lines: {}, truncating at line {} (prompt #{})",
        total_lines,
        truncate_at_line,
        prompt_index
    );

    // Truncate to the line before this prompt
    let truncated_lines: Vec<&str> = lines.into_iter().take(truncate_at_line).collect();

    let new_content = if truncated_lines.is_empty() {
        String::new()
    } else {
        truncated_lines.join("\n") + "\n"
    };

    fs::write(&session_file, new_content)
        .map_err(|e| format!("Failed to write truncated session: {}", e))?;

    log::info!(
        "[Codex Rewind] Truncated session: kept {} lines, deleted {} lines",
        truncate_at_line,
        total_lines - truncate_at_line
    );

    Ok(())
}

/// Record a Codex prompt being sent (called before execution)
#[tauri::command]
pub async fn record_codex_prompt_sent(
    session_id: String,
    project_path: String,
    _prompt_text: String,
) -> Result<usize, String> {
    log::info!(
        "[Codex Record] Recording prompt sent for session: {}",
        session_id
    );

    // Ensure Git repository is initialized
    simple_git::ensure_git_repo(&project_path)
        .map_err(|e| format!("Failed to ensure Git repo: {}", e))?;

    // Get current commit (state before prompt execution)
    let commit_before = simple_git::git_current_commit(&project_path)
        .map_err(|e| format!("Failed to get current commit: {}", e))?;

    // Load existing records
    let mut git_records = load_codex_git_records(&session_id)?;

    // Update project path if needed
    if git_records.project_path.is_empty() {
        git_records.project_path = project_path.clone();
    }

    // Calculate prompt index
    let prompt_index = git_records.records.len();

    // Create new record
    let record = CodexPromptGitRecord {
        prompt_index,
        commit_before: commit_before.clone(),
        commit_after: None,
        timestamp: Utc::now().to_rfc3339(),
    };

    git_records.records.push(record);
    save_codex_git_records(&session_id, &git_records)?;

    log::info!(
        "[Codex Record] Recorded prompt #{} with commit_before: {}",
        prompt_index,
        &commit_before[..8.min(commit_before.len())]
    );

    Ok(prompt_index)
}

/// Record a Codex prompt completion (called after AI response)
#[tauri::command]
pub async fn record_codex_prompt_completed(
    session_id: String,
    project_path: String,
    prompt_index: usize,
) -> Result<(), String> {
    log::info!(
        "[Codex Record] Recording prompt #{} completed for session: {}",
        prompt_index,
        session_id
    );

    // Auto-commit any changes made by AI
    let commit_message = format!("[Codex] After prompt #{}", prompt_index);
    match simple_git::git_commit_changes(&project_path, &commit_message) {
        Ok(true) => {
            log::info!(
                "[Codex Record] Auto-committed changes after prompt #{}",
                prompt_index
            );
        }
        Ok(false) => {
            log::debug!(
                "[Codex Record] No changes to commit after prompt #{}",
                prompt_index
            );
        }
        Err(e) => {
            log::warn!("[Codex Record] Failed to auto-commit: {}", e);
            // Continue anyway
        }
    }

    // Get current commit (state after AI completion)
    let commit_after = simple_git::git_current_commit(&project_path)
        .map_err(|e| format!("Failed to get current commit: {}", e))?;

    // Update the record
    let mut git_records = load_codex_git_records(&session_id)?;

    if let Some(record) = git_records
        .records
        .iter_mut()
        .find(|r| r.prompt_index == prompt_index)
    {
        record.commit_after = Some(commit_after.clone());
        save_codex_git_records(&session_id, &git_records)?;

        log::info!(
            "[Codex Record] Updated prompt #{} with commit_after: {}",
            prompt_index,
            &commit_after[..8.min(commit_after.len())]
        );
    } else {
        log::warn!(
            "[Codex Record] Record not found for prompt #{}",
            prompt_index
        );
    }

    Ok(())
}

/// Revert Codex session to a specific prompt
#[tauri::command]
pub async fn revert_codex_to_prompt(
    session_id: String,
    project_path: String,
    prompt_index: usize,
    mode: RewindMode,
) -> Result<String, String> {
    log::info!(
        "[Codex Rewind] Reverting session {} to prompt #{} with mode: {:?}",
        session_id,
        prompt_index,
        mode
    );

    // Load execution config to check if Git operations are disabled
    let execution_config =
        load_execution_config().map_err(|e| format!("Failed to load execution config: {}", e))?;

    let git_operations_disabled = execution_config.disable_rewind_git_operations;

    if git_operations_disabled {
        log::warn!("[Codex Rewind] Git operations are disabled in config");
    }

    // Extract prompts to validate index and retrieve text
    let prompts = extract_codex_prompts(&session_id)?;
    let prompt = prompts
        .get(prompt_index)
        .ok_or_else(|| format!("Prompt #{} not found in session", prompt_index))?;

    // Load Git records
    let git_records = load_codex_git_records(&session_id)?;
    let git_record = git_records
        .records
        .iter()
        .find(|r| r.prompt_index == prompt_index);

    // Validate mode compatibility
    match mode {
        RewindMode::CodeOnly | RewindMode::Both => {
            if git_operations_disabled {
                return Err(
                    "无法回滚代码：Git 操作已在配置中禁用。只能撤回对话历史，无法回滚代码变更。"
                        .into(),
                );
            }
            if git_record.is_none() {
                return Err(format!(
                    "无法回滚代码：提示词 #{} 没有关联的 Git 记录",
                    prompt_index
                ));
            }
        }
        RewindMode::ConversationOnly => {}
    }

    // Execute revert based on mode
    match mode {
        RewindMode::ConversationOnly => {
            log::info!("[Codex Rewind] Reverting conversation only");

            // Truncate session messages
            truncate_codex_session_to_prompt(&session_id, prompt_index)?;

            // Truncate git records
            if !git_operations_disabled {
                truncate_codex_git_records(&session_id, prompt_index)?;
            }

            log::info!(
                "[Codex Rewind] Successfully reverted conversation to prompt #{}",
                prompt_index
            );
        }

        RewindMode::CodeOnly => {
            log::info!("[Codex Rewind] Reverting code only");

            let record = git_record.unwrap();

            // Stash uncommitted changes
            simple_git::git_stash_save(
                &project_path,
                &format!(
                    "Auto-stash before Codex code revert to prompt #{}",
                    prompt_index
                ),
            )
            .map_err(|e| format!("Failed to stash changes: {}", e))?;

            // Reset to commit before this prompt
            simple_git::git_reset_hard(&project_path, &record.commit_before)
                .map_err(|e| format!("Failed to reset code: {}", e))?;

            log::info!(
                "[Codex Rewind] Successfully reverted code to prompt #{}",
                prompt_index
            );
        }

        RewindMode::Both => {
            log::info!("[Codex Rewind] Reverting both conversation and code");

            let record = git_record.unwrap();

            // Stash uncommitted changes
            simple_git::git_stash_save(
                &project_path,
                &format!(
                    "Auto-stash before Codex full revert to prompt #{}",
                    prompt_index
                ),
            )
            .map_err(|e| format!("Failed to stash changes: {}", e))?;

            // Reset code
            simple_git::git_reset_hard(&project_path, &record.commit_before)
                .map_err(|e| format!("Failed to reset code: {}", e))?;

            // Truncate session
            truncate_codex_session_to_prompt(&session_id, prompt_index)?;

            // Truncate git records
            if !git_operations_disabled {
                truncate_codex_git_records(&session_id, prompt_index)?;
            }

            log::info!(
                "[Codex Rewind] Successfully reverted both to prompt #{}",
                prompt_index
            );
        }
    }

    // Return the prompt text for restoring to input
    Ok(prompt.text.clone())
}

// Helper trait for pipe syntax
#[allow(dead_code)]
trait Pipe: Sized {
    fn pipe<T, F: FnOnce(Self) -> T>(self, f: F) -> T {
        f(self)
    }
}
#[allow(dead_code)]
impl<T> Pipe for T {}

// ============================================================================
// Codex Provider Management
// ============================================================================

/// Codex provider configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexProviderConfig {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub website_url: Option<String>,
    pub category: Option<String>,
    pub auth: serde_json::Value, // JSON object for auth.json
    pub config: String,          // TOML string for config.toml
    pub is_official: Option<bool>,
    pub is_partner: Option<bool>,
    pub created_at: Option<i64>,
}

/// Current Codex configuration (from ~/.codex directory)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentCodexConfig {
    pub auth: serde_json::Value,
    pub config: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

/// Get Codex config directory path
fn get_codex_config_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir().ok_or_else(|| "Cannot get home directory".to_string())?;
    Ok(home_dir.join(".codex"))
}

/// Get Codex auth.json path
fn get_codex_auth_path() -> Result<PathBuf, String> {
    Ok(get_codex_config_dir()?.join("auth.json"))
}

/// Get Codex config.toml path
fn get_codex_config_path() -> Result<PathBuf, String> {
    Ok(get_codex_config_dir()?.join("config.toml"))
}

/// Get Codex providers.json path (for custom presets)
fn get_codex_providers_path() -> Result<PathBuf, String> {
    Ok(get_codex_config_dir()?.join("providers.json"))
}

/// Extract API key from auth JSON
fn extract_api_key_from_auth(auth: &serde_json::Value) -> Option<String> {
    auth.get("OPENAI_API_KEY")
        .or_else(|| auth.get("OPENAI_KEY"))
        .or_else(|| auth.get("API_KEY"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Extract base_url from config.toml text
fn extract_base_url_from_config(config: &str) -> Option<String> {
    let re = regex::Regex::new(r#"base_url\s*=\s*"([^"]+)""#).ok()?;
    re.captures(config)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

/// Extract model from config.toml text
fn extract_model_from_config(config: &str) -> Option<String> {
    let re = regex::Regex::new(r#"model\s*=\s*"([^"]+)""#).ok()?;
    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("model =") {
            return re
                .captures(trimmed)
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().to_string());
        }
    }
    None
}

/// Get Codex provider presets (custom user-defined presets)
#[tauri::command]
pub async fn get_codex_provider_presets() -> Result<Vec<CodexProviderConfig>, String> {
    log::info!("[Codex Provider] Getting provider presets");

    let providers_path = get_codex_providers_path()?;

    if !providers_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&providers_path)
        .map_err(|e| format!("Failed to read providers.json: {}", e))?;

    let providers: Vec<CodexProviderConfig> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse providers.json: {}", e))?;

    Ok(providers)
}

/// Get current Codex configuration
#[tauri::command]
pub async fn get_current_codex_config() -> Result<CurrentCodexConfig, String> {
    log::info!("[Codex Provider] Getting current config");

    let auth_path = get_codex_auth_path()?;
    let config_path = get_codex_config_path()?;

    // Read auth.json
    let auth: serde_json::Value = if auth_path.exists() {
        let content = fs::read_to_string(&auth_path)
            .map_err(|e| format!("Failed to read auth.json: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse auth.json: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Read config.toml
    let config: String = if config_path.exists() {
        fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config.toml: {}", e))?
    } else {
        String::new()
    };

    // Extract values
    let api_key = extract_api_key_from_auth(&auth);
    let base_url = extract_base_url_from_config(&config);
    let model = extract_model_from_config(&config);

    Ok(CurrentCodexConfig {
        auth,
        config,
        api_key,
        base_url,
        model,
    })
}

/// Switch to a Codex provider configuration
/// Preserves user's custom settings and OAuth tokens
#[tauri::command]
pub async fn switch_codex_provider(config: CodexProviderConfig) -> Result<String, String> {
    log::info!("[Codex Provider] Switching to provider: {}", config.name);

    let config_dir = get_codex_config_dir()?;
    let auth_path = get_codex_auth_path()?;
    let config_path = get_codex_config_path()?;

    // Ensure config directory exists
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create .codex directory: {}", e))?;
    }

    // Validate new TOML if not empty
    let new_config_table: Option<toml::Table> = if !config.config.trim().is_empty() {
        Some(
            toml::from_str(&config.config)
                .map_err(|e| format!("Invalid TOML configuration: {}", e))?,
        )
    } else {
        None
    };

    // Merge auth.json - preserve existing OAuth tokens and other credentials
    let final_auth = if auth_path.exists() {
        let existing_content = fs::read_to_string(&auth_path)
            .map_err(|e| format!("Failed to read existing auth.json: {}", e))?;

        if let Ok(mut existing_auth) =
            serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&existing_content)
        {
            // Merge new auth into existing - new values take precedence
            if let serde_json::Value::Object(new_auth_map) = serde_json::to_value(&config.auth)
                .map_err(|e| format!("Failed to convert auth: {}", e))?
            {
                for (key, value) in new_auth_map {
                    // Only update if the new value is not empty/null
                    if !value.is_null() && value != serde_json::Value::String(String::new()) {
                        existing_auth.insert(key, value);
                    }
                }
            }
            serde_json::Value::Object(existing_auth)
        } else {
            // Existing auth is invalid, use new auth directly
            serde_json::to_value(&config.auth)
                .map_err(|e| format!("Failed to convert auth: {}", e))?
        }
    } else {
        // No existing auth, use new auth directly
        serde_json::to_value(&config.auth).map_err(|e| format!("Failed to convert auth: {}", e))?
    };

    // Write merged auth.json
    let auth_content = serde_json::to_string_pretty(&final_auth)
        .map_err(|e| format!("Failed to serialize auth: {}", e))?;
    fs::write(&auth_path, auth_content).map_err(|e| format!("Failed to write auth.json: {}", e))?;

    // Merge config.toml - preserve user's custom settings
    let final_config = if config_path.exists() {
        let existing_content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read existing config.toml: {}", e))?;

        if let Ok(mut existing_table) = toml::from_str::<toml::Table>(&existing_content) {
            // Provider-specific keys that will be overwritten
            let provider_keys = ["model_provider", "model", "model_providers"];

            if let Some(new_table) = new_config_table {
                // Remove provider-specific keys from existing config
                for key in &provider_keys {
                    existing_table.remove(*key);
                }

                // Merge: new provider settings take precedence
                for (key, value) in new_table {
                    existing_table.insert(key, value);
                }

                // Serialize back to TOML string
                toml::to_string_pretty(&existing_table)
                    .map_err(|e| format!("Failed to serialize merged config: {}", e))?
            } else {
                // New config is empty (official OpenAI), just remove provider keys
                for key in &provider_keys {
                    existing_table.remove(*key);
                }
                toml::to_string_pretty(&existing_table)
                    .map_err(|e| format!("Failed to serialize config: {}", e))?
            }
        } else {
            // Existing config is invalid, use new config directly
            config.config.clone()
        }
    } else {
        // No existing config, use new config directly
        config.config.clone()
    };

    // Write merged config.toml
    fs::write(&config_path, &final_config)
        .map_err(|e| format!("Failed to write config.toml: {}", e))?;

    log::info!("[Codex Provider] Successfully switched to: {}", config.name);
    Ok(format!(
        "Successfully switched to Codex provider: {}",
        config.name
    ))
}

/// Add a new Codex provider configuration
#[tauri::command]
pub async fn add_codex_provider_config(config: CodexProviderConfig) -> Result<String, String> {
    log::info!("[Codex Provider] Adding provider: {}", config.name);

    let providers_path = get_codex_providers_path()?;

    // Ensure parent directory exists
    if let Some(parent) = providers_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    // Load existing providers
    let mut providers: Vec<CodexProviderConfig> = if providers_path.exists() {
        let content = fs::read_to_string(&providers_path)
            .map_err(|e| format!("Failed to read providers.json: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        vec![]
    };

    // Check for duplicate ID
    if providers.iter().any(|p| p.id == config.id) {
        return Err(format!("Provider with ID '{}' already exists", config.id));
    }

    providers.push(config.clone());

    // Save providers
    let content = serde_json::to_string_pretty(&providers)
        .map_err(|e| format!("Failed to serialize providers: {}", e))?;
    fs::write(&providers_path, content)
        .map_err(|e| format!("Failed to write providers.json: {}", e))?;

    log::info!(
        "[Codex Provider] Successfully added provider: {}",
        config.name
    );
    Ok(format!(
        "Successfully added Codex provider: {}",
        config.name
    ))
}

/// Update an existing Codex provider configuration
#[tauri::command]
pub async fn update_codex_provider_config(config: CodexProviderConfig) -> Result<String, String> {
    log::info!("[Codex Provider] Updating provider: {}", config.name);

    let providers_path = get_codex_providers_path()?;

    if !providers_path.exists() {
        return Err(format!("Provider with ID '{}' not found", config.id));
    }

    let content = fs::read_to_string(&providers_path)
        .map_err(|e| format!("Failed to read providers.json: {}", e))?;
    let mut providers: Vec<CodexProviderConfig> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse providers.json: {}", e))?;

    // Find and update the provider
    let index = providers
        .iter()
        .position(|p| p.id == config.id)
        .ok_or_else(|| format!("Provider with ID '{}' not found", config.id))?;

    providers[index] = config.clone();

    // Save providers
    let content = serde_json::to_string_pretty(&providers)
        .map_err(|e| format!("Failed to serialize providers: {}", e))?;
    fs::write(&providers_path, content)
        .map_err(|e| format!("Failed to write providers.json: {}", e))?;

    log::info!(
        "[Codex Provider] Successfully updated provider: {}",
        config.name
    );
    Ok(format!(
        "Successfully updated Codex provider: {}",
        config.name
    ))
}

/// Delete a Codex provider configuration
#[tauri::command]
pub async fn delete_codex_provider_config(id: String) -> Result<String, String> {
    log::info!("[Codex Provider] Deleting provider: {}", id);

    let providers_path = get_codex_providers_path()?;

    if !providers_path.exists() {
        return Err(format!("Provider with ID '{}' not found", id));
    }

    let content = fs::read_to_string(&providers_path)
        .map_err(|e| format!("Failed to read providers.json: {}", e))?;
    let mut providers: Vec<CodexProviderConfig> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse providers.json: {}", e))?;

    // Find and remove the provider
    let initial_len = providers.len();
    providers.retain(|p| p.id != id);

    if providers.len() == initial_len {
        return Err(format!("Provider with ID '{}' not found", id));
    }

    // Save providers
    let content = serde_json::to_string_pretty(&providers)
        .map_err(|e| format!("Failed to serialize providers: {}", e))?;
    fs::write(&providers_path, content)
        .map_err(|e| format!("Failed to write providers.json: {}", e))?;

    log::info!("[Codex Provider] Successfully deleted provider: {}", id);
    Ok(format!("Successfully deleted Codex provider: {}", id))
}

/// Clear Codex provider configuration (reset to official)
#[tauri::command]
pub async fn clear_codex_provider_config() -> Result<String, String> {
    log::info!("[Codex Provider] Clearing config");

    let auth_path = get_codex_auth_path()?;
    let config_path = get_codex_config_path()?;

    // Remove auth.json if exists
    if auth_path.exists() {
        fs::remove_file(&auth_path).map_err(|e| format!("Failed to remove auth.json: {}", e))?;
    }

    // Remove config.toml if exists
    if config_path.exists() {
        fs::remove_file(&config_path)
            .map_err(|e| format!("Failed to remove config.toml: {}", e))?;
    }

    log::info!("[Codex Provider] Successfully cleared config");
    Ok("Successfully cleared Codex configuration. Now using official OpenAI.".to_string())
}

/// Test Codex provider connection
#[tauri::command]
pub async fn test_codex_provider_connection(
    base_url: String,
    api_key: Option<String>,
) -> Result<String, String> {
    log::info!("[Codex Provider] Testing connection to: {}", base_url);

    // Simple connectivity test - just try to reach the endpoint
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let test_url = format!("{}/models", base_url.trim_end_matches('/'));

    let mut request = client.get(&test_url);

    if let Some(key) = api_key {
        request = request.header("Authorization", format!("Bearer {}", key));
    }

    match request.send().await {
        Ok(response) => {
            let status = response.status();
            if status.is_success() || status.as_u16() == 401 {
                // 401 means the endpoint exists but auth is required
                Ok(format!(
                    "Connection test successful: endpoint is reachable (status: {})",
                    status
                ))
            } else {
                Ok(format!("Connection test completed with status: {}", status))
            }
        }
        Err(e) => Err(format!("Connection test failed: {}", e)),
    }
}
