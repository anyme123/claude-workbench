/**
 * OpenAI Codex Integration - Backend Commands
 *
 * This module provides Tauri commands for executing Codex tasks,
 * managing sessions, and handling configuration.
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

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
    let cmd = build_codex_command(&options, false, None)?;

    // Execute and stream output
    execute_codex_process(cmd, options.project_path.clone(), app_handle).await
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
    let cmd = build_codex_command(&options, true, Some(&session_id))?;

    // Execute and stream output
    execute_codex_process(cmd, options.project_path.clone(), app_handle).await
}

/// Resumes the last Codex session
#[tauri::command]
pub async fn resume_last_codex(
    options: CodexExecutionOptions,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("resume_last_codex called");

    // Build codex exec resume --last command
    let cmd = build_codex_command(&options, true, Some("--last"))?;

    // Execute and stream output
    execute_codex_process(cmd, options.project_path.clone(), app_handle).await
}

/// Cancels a running Codex execution
#[tauri::command]
pub async fn cancel_codex(
    session_id: Option<String>,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("cancel_codex called for session: {:?}", session_id);

    let state: tauri::State<'_, CodexProcessState> = app_handle.state();
    let mut processes = state.processes.lock().await;

    if let Some(sid) = session_id {
        // Cancel specific session
        if let Some(mut child) = processes.remove(&sid) {
            child.kill().await.map_err(|e| format!("Failed to kill process: {}", e))?;
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
#[tauri::command]
pub async fn list_codex_sessions() -> Result<Vec<CodexSession>, String> {
    log::info!("list_codex_sessions called");

    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?;

    let sessions_dir = home_dir.join(".codex").join("sessions");
    log::info!("Looking for Codex sessions in: {:?}", sessions_dir);

    if !sessions_dir.exists() {
        log::warn!("Codex sessions directory does not exist: {:?}", sessions_dir);
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
                                        if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                                            match parse_codex_session_file(&path) {
                                                Some(session) => {
                                                    log::info!("✅ Found session: {} ({})",
                                                        session.id, session.project_path);
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

    let cwd = payload["cwd"].as_str().unwrap_or("").to_string();

    // Extract first user message and other metadata from subsequent lines
    let mut first_message: Option<String> = None;
    let mut last_timestamp: Option<String> = None;
    let mut model: Option<String> = None;

    // Parse remaining lines to find first user message
    for line_result in lines {
        if let Ok(line) = line_result {
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
                            if let Some(content) = payload_obj.get("content").and_then(|c| c.as_array()) {
                                // Extract text from content array
                                for item in content {
                                    // Check if this is a text content block (input_text type)
                                    if item["type"].as_str() == Some("input_text") {
                                        if let Some(text) = item["text"].as_str() {
                                            // Skip system messages (environment_context and AGENTS.md)
                                            if !text.contains("<environment_context>")
                                                && !text.contains("# AGENTS.md instructions")
                                                && !text.is_empty()
                                                && text.trim().len() > 0 {
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
#[tauri::command]
pub async fn load_codex_session_history(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    log::info!("load_codex_session_history called for: {}", session_id);

    // Find the session file by ID
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?;

    let sessions_dir = home_dir.join(".codex").join("sessions");

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
                        log::warn!("Failed to parse line {} in session {}: {}", line_count, session_id, e);
                        log::debug!("Problematic line content: {}", line);
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to read line {} in session {}: {}", line_count, session_id, e);
            }
        }
    }

    log::info!("Loaded {} events from Codex session {} (total lines: {}, parse errors: {})",
        events.len(), session_id, line_count, parse_errors);
    Ok(events)
}

/// Finds the JSONL file for a given session ID
fn find_session_file(sessions_dir: &std::path::Path, session_id: &str) -> Option<std::path::PathBuf> {
    use walkdir::WalkDir;
    use std::io::{BufRead, BufReader};

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
                                    log::info!("Found session file: {:?} for session_id: {}", entry.path(), session_id);
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

/// Gets details of a specific Codex session
#[tauri::command]
pub async fn get_codex_session(session_id: String) -> Result<Option<CodexSession>, String> {
    log::info!("get_codex_session called for: {}", session_id);

    // TODO: Implement session detail retrieval
    Ok(None)
}

/// Deletes a Codex session
#[tauri::command]
pub async fn delete_codex_session(session_id: String) -> Result<String, String> {
    log::info!("delete_codex_session called for: {}", session_id);

    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?;

    let sessions_dir = home_dir.join(".codex").join("sessions");

    // Find the session file
    let session_file = find_session_file(&sessions_dir, &session_id)
        .ok_or_else(|| format!("Session file not found for ID: {}", session_id))?;

    // Delete the file
    std::fs::remove_file(&session_file)
        .map_err(|e| format!("Failed to delete session file: {}", e))?;

    log::info!("Successfully deleted Codex session file: {:?}", session_file);
    Ok(format!("Session {} deleted", session_id))
}

// ============================================================================
// Configuration & Utilities
// ============================================================================

/// Checks if Codex is available and properly configured
#[tauri::command]
pub async fn check_codex_availability() -> Result<CodexAvailability, String> {
    log::info!("[Codex] Checking availability...");

    // Try multiple possible Codex command locations
    let codex_commands = get_codex_command_candidates();

    for cmd_path in codex_commands {
        log::info!("[Codex] Trying: {}", cmd_path);

        let mut cmd = Command::new(&cmd_path);
        cmd.arg("--version");

        // Add npm path to environment for Windows
        #[cfg(target_os = "windows")]
        {
            if let Ok(appdata) = std::env::var("APPDATA") {
                let npm_path = format!(r"{}\npm", appdata);
                if let Ok(current_path) = std::env::var("PATH") {
                    let new_path = format!("{};{}", npm_path, current_path);
                    cmd.env("PATH", new_path);
                }
            }
        }

        match cmd.output().await {
        Ok(output) => {
            let stdout_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr_str = String::from_utf8_lossy(&output.stderr).trim().to_string();

            log::info!("[Codex] Command executed - status: {}, stdout: '{}', stderr: '{}'",
                output.status, stdout_str, stderr_str);

            if output.status.success() {
                // Codex version might be in stdout or stderr
                let version = if !stdout_str.is_empty() {
                    stdout_str
                } else if !stderr_str.is_empty() {
                    stderr_str
                } else {
                    "Unknown version".to_string()
                };

                log::info!("[Codex] ✅ Available - version: {}", version);
                return Ok(CodexAvailability {
                    available: true,
                    version: Some(version),
                    error: None,
                });
            } else {
                log::warn!("[Codex] Command '{}' returned non-zero status, trying next...", cmd_path);
                continue;
            }
        }
        Err(e) => {
            log::warn!("[Codex] Command '{}' failed: {}", cmd_path, e);
            continue; // Try next candidate
        }
        }
    }

    // All attempts failed
    log::error!("[Codex] ❌ All command candidates failed");
    Ok(CodexAvailability {
        available: false,
        version: None,
        error: Some("Codex CLI not found. Tried: codex, npm global paths".to_string()),
    })
}

/// Returns a list of possible Codex command paths to try
fn get_codex_command_candidates() -> Vec<String> {
    let mut candidates = vec!["codex".to_string()];

    // Windows: npm global install paths
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            candidates.push(format!(r"{}\npm\codex.cmd", appdata));
            candidates.push(format!(r"{}\npm\codex", appdata));
        }
        // Also try common npm prefix paths
        if let Ok(programfiles) = std::env::var("ProgramFiles") {
            candidates.push(format!(r"{}\nodejs\codex.cmd", programfiles));
        }
    }

    // macOS/Linux: npm global paths
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            candidates.push(format!("{}/.npm-global/bin/codex", home));
            candidates.push("/usr/local/bin/codex".to_string());
            candidates.push("/usr/bin/codex".to_string());
        }
    }

    candidates
}

/// Finds the first working Codex command path (synchronously)
fn get_working_codex_command() -> Option<String> {
    let candidates = get_codex_command_candidates();

    for cmd_path in &candidates {
        // Check if file exists for absolute paths
        if cmd_path.contains("\\") || cmd_path.contains("/") {
            if std::path::Path::new(&cmd_path).exists() {
                log::info!("[Codex] ✅ Found working command: {}", cmd_path);
                return Some(cmd_path.clone());
            } else {
                log::debug!("[Codex] Path does not exist: {}", cmd_path);
            }
        }
    }

    // Fallback: try "codex" in PATH as last resort
    log::warn!("[Codex] No absolute path found, trying 'codex' in PATH as fallback");
    Some("codex".to_string())
}

/// Sets the Codex API key
#[tauri::command]
pub async fn set_codex_api_key(_api_key: String) -> Result<String, String> {
    log::info!("set_codex_api_key called");

    // TODO: Store API key securely in settings
    Ok("API key saved".to_string())
}

/// Gets the current Codex API key (masked)
#[tauri::command]
pub async fn get_codex_api_key() -> Result<Option<String>, String> {
    log::info!("get_codex_api_key called");

    // TODO: Retrieve and mask API key from settings
    Ok(None)
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Builds a Codex command with the given options
fn build_codex_command(
    options: &CodexExecutionOptions,
    is_resume: bool,
    session_id: Option<&str>,
) -> Result<Command, String> {
    // Use full path on Windows
    #[cfg(target_os = "windows")]
    let codex_cmd = {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let full_path = format!(r"{}\npm\codex.cmd", appdata);
            if std::path::Path::new(&full_path).exists() {
                log::info!("[Codex] Using full path: {}", full_path);
                full_path
            } else {
                log::warn!("[Codex] Full path not found, using 'codex'");
                "codex".to_string()
            }
        } else {
            "codex".to_string()
        }
    };

    #[cfg(not(target_os = "windows"))]
    let codex_cmd = "codex".to_string();

    let mut cmd = Command::new(&codex_cmd);
    cmd.arg("exec");

    // For resume commands: OPTIONS must come AFTER 'resume'
    // Correct order: codex exec resume [OPTIONS] <SESSION_ID> <PROMPT>
    // Wrong order: codex exec [OPTIONS] resume <SESSION_ID> <PROMPT>

    if is_resume {
        // Add 'resume' first
        cmd.arg("resume");

        // Then add all options after 'resume'
        if options.json {
            cmd.arg("--json");
        }

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

        // Add session_id after options, before prompt
        if let Some(sid) = session_id {
            cmd.arg(sid);
        }
    } else {
        // For new sessions: OPTIONS come before prompt
        if options.json {
            cmd.arg("--json");
        }

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

    // Add prompt
    // For resume: codex exec resume <SESSION_ID> <new_prompt>
    // For new: codex exec <prompt>
    cmd.arg(&options.prompt);

    Ok(cmd)
}

/// Executes a Codex process and streams output to frontend
async fn execute_codex_process(
    mut cmd: Command,
    _project_path: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    // Setup stdio
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Spawn process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn codex: {}", e))?;

    // Extract stdout and stderr
    let stdout = child.stdout.take()
        .ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take()
        .ok_or("Failed to capture stderr")?;

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
    let app_handle_stderr = app_handle.clone();
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
