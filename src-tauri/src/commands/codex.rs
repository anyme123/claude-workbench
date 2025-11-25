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
use std::path::PathBuf;
use std::fs;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use chrono::Utc;

// Import platform-specific utilities for window hiding
use crate::commands::claude::apply_no_window_async;
// Import simple_git for rewind operations
use super::simple_git;
// Import rewind helpers/types shared with Claude
use super::prompt_tracker::{RewindMode, RewindCapabilities, PromptRecord as ClaudePromptRecord, load_execution_config};

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

        // 🔥 CRITICAL FIX: Apply no-window configuration for availability check
        // This prevents terminal flash when checking Codex availability
        apply_no_window_async(&mut cmd);

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

// ============================================================================
// Helper Functions
// ============================================================================

/// Builds a Codex command with the given options
/// Returns (Command, Option<String>) where the String is the prompt to be passed via stdin
fn build_codex_command(
    options: &CodexExecutionOptions,
    is_resume: bool,
    session_id: Option<&str>,
) -> Result<(Command, Option<String>), String> {
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

/// Executes a Codex process and streams output to frontend
async fn execute_codex_process(
    mut cmd: Command,
    prompt: Option<String>,
    _project_path: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    // Setup stdio
    cmd.stdin(Stdio::piped());   // 🔧 Enable stdin to pass prompt
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
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?;

    let records_dir = home_dir.join(".codex").join("git-records");

    // Create directory if it doesn't exist
    if !records_dir.exists() {
        fs::create_dir_all(&records_dir)
            .map_err(|e| format!("Failed to create git records directory: {}", e))?;
    }

    Ok(records_dir)
}

/// Get the Codex sessions directory
fn get_codex_sessions_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?;

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

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse git records: {}", e))
}

/// Save Git records for a Codex session
fn save_codex_git_records(session_id: &str, records: &CodexGitRecords) -> Result<(), String> {
    let records_dir = get_codex_git_records_dir()?;
    let records_file = records_dir.join(format!("{}.json", session_id));

    let content = serde_json::to_string_pretty(records)
        .map_err(|e| format!("Failed to serialize git records: {}", e))?;

    fs::write(&records_file, content)
        .map_err(|e| format!("Failed to write git records: {}", e))?;

    log::debug!("Saved Codex git records for session: {}", session_id);
    Ok(())
}

/// Truncate Git records after a specific prompt index
fn truncate_codex_git_records(session_id: &str, prompt_index: usize) -> Result<(), String> {
    let mut git_records = load_codex_git_records(session_id)?;

    // Keep only records up to and including prompt_index
    git_records.records.retain(|r| r.prompt_index <= prompt_index);

    save_codex_git_records(session_id, &git_records)?;
    log::info!("[Codex Rewind] Truncated git records after prompt #{}", prompt_index);

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
    let execution_config = load_execution_config()
        .map_err(|e| format!("Failed to load execution config: {}", e))?;
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
            warning: Some("Git 操作已在配置中禁用。只能撤回对话历史，无法回滚代码变更。".to_string()),
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
    let file = fs::File::open(&session_file)
        .map_err(|e| format!("Failed to open session file: {}", e))?;

    let reader = BufReader::new(file);
    let mut user_message_count = 0;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) {
            if event["type"].as_str() == Some("response_item") {
                if event["payload"]["role"].as_str() == Some("user") {
                    if user_message_count == prompt_index {
                        // Extract text from content array
                        if let Some(content) = event["payload"]["content"].as_array() {
                            for item in content {
                                if item["type"].as_str() == Some("input_text") {
                                    if let Some(text) = item["text"].as_str() {
                                        // Skip system messages
                                        if !text.contains("<environment_context>")
                                            && !text.contains("# AGENTS.md instructions")
                                            && !text.is_empty() {
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
            if event["type"].as_str() == Some("response_item") {
                if event["payload"]["role"].as_str() == Some("user") {
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
    }

    if !found_target {
        return Err(format!("Prompt #{} not found in session", prompt_index));
    }

    log::info!("[Codex Rewind] Total lines: {}, truncating at line {} (prompt #{})",
        total_lines, truncate_at_line, prompt_index);

    // Truncate to the line before this prompt
    let truncated_lines: Vec<&str> = lines.into_iter().take(truncate_at_line).collect();

    let new_content = if truncated_lines.is_empty() {
        String::new()
    } else {
        truncated_lines.join("\n") + "\n"
    };

    fs::write(&session_file, new_content)
        .map_err(|e| format!("Failed to write truncated session: {}", e))?;

    log::info!("[Codex Rewind] Truncated session: kept {} lines, deleted {} lines",
        truncate_at_line, total_lines - truncate_at_line);

    Ok(())
}

/// Record a Codex prompt being sent (called before execution)
#[tauri::command]
pub async fn record_codex_prompt_sent(
    session_id: String,
    project_path: String,
    _prompt_text: String,
) -> Result<usize, String> {
    log::info!("[Codex Record] Recording prompt sent for session: {}", session_id);

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

    log::info!("[Codex Record] Recorded prompt #{} with commit_before: {}",
        prompt_index, &commit_before[..8.min(commit_before.len())]);

    Ok(prompt_index)
}

/// Record a Codex prompt completion (called after AI response)
#[tauri::command]
pub async fn record_codex_prompt_completed(
    session_id: String,
    project_path: String,
    prompt_index: usize,
) -> Result<(), String> {
    log::info!("[Codex Record] Recording prompt #{} completed for session: {}",
        prompt_index, session_id);

    // Auto-commit any changes made by AI
    let commit_message = format!("[Codex] After prompt #{}", prompt_index);
    match simple_git::git_commit_changes(&project_path, &commit_message) {
        Ok(true) => {
            log::info!("[Codex Record] Auto-committed changes after prompt #{}", prompt_index);
        }
        Ok(false) => {
            log::debug!("[Codex Record] No changes to commit after prompt #{}", prompt_index);
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

    if let Some(record) = git_records.records.iter_mut().find(|r| r.prompt_index == prompt_index) {
        record.commit_after = Some(commit_after.clone());
        save_codex_git_records(&session_id, &git_records)?;

        log::info!("[Codex Record] Updated prompt #{} with commit_after: {}",
            prompt_index, &commit_after[..8.min(commit_after.len())]);
    } else {
        log::warn!("[Codex Record] Record not found for prompt #{}", prompt_index);
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
    log::info!("[Codex Rewind] Reverting session {} to prompt #{} with mode: {:?}",
        session_id, prompt_index, mode);

    // Load execution config to check if Git operations are disabled
    let execution_config = load_execution_config()
        .map_err(|e| format!("Failed to load execution config: {}", e))?;

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
    let git_record = git_records.records.iter().find(|r| r.prompt_index == prompt_index);

    // Validate mode compatibility
    match mode {
        RewindMode::CodeOnly | RewindMode::Both => {
            if git_operations_disabled {
                return Err(
                    "无法回滚代码：Git 操作已在配置中禁用。只能撤回对话历史，无法回滚代码变更。".into()
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

            log::info!("[Codex Rewind] Successfully reverted conversation to prompt #{}", prompt_index);
        }

        RewindMode::CodeOnly => {
            log::info!("[Codex Rewind] Reverting code only");

            let record = git_record.unwrap();

            // Stash uncommitted changes
            simple_git::git_stash_save(&project_path,
                &format!("Auto-stash before Codex code revert to prompt #{}", prompt_index))
                .map_err(|e| format!("Failed to stash changes: {}", e))?;

            // Reset to commit before this prompt
            simple_git::git_reset_hard(&project_path, &record.commit_before)
                .map_err(|e| format!("Failed to reset code: {}", e))?;

            log::info!("[Codex Rewind] Successfully reverted code to prompt #{}", prompt_index);
        }

        RewindMode::Both => {
            log::info!("[Codex Rewind] Reverting both conversation and code");

            let record = git_record.unwrap();

            // Stash uncommitted changes
            simple_git::git_stash_save(&project_path,
                &format!("Auto-stash before Codex full revert to prompt #{}", prompt_index))
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

            log::info!("[Codex Rewind] Successfully reverted both to prompt #{}", prompt_index);
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
