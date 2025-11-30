/**
 * Codex Session Management Module
 *
 * Handles session lifecycle operations including:
 * - Session execution (execute, resume, cancel)
 * - Session listing and history
 * - Session deletion
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// Import platform-specific utilities for window hiding
use crate::commands::claude::apply_no_window_async;
use crate::claude_binary::detect_binary_for_tool;
// Import WSL utilities for Windows + WSL Codex support
use super::super::wsl_utils;
// Import config module for sessions directory
use super::config::get_codex_sessions_dir;

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

    /// First user message
    pub first_message: Option<String>,

    /// Last message timestamp (ISO string)
    pub last_message_timestamp: Option<String>,
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
/// On Windows with WSL mode, reads from WSL filesystem via UNC path
#[tauri::command]
pub async fn list_codex_sessions() -> Result<Vec<CodexSession>, String> {
    log::info!("list_codex_sessions called");

    // Use unified sessions directory function (supports WSL)
    let sessions_dir = get_codex_sessions_dir()?;
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
                                                    log::info!("Found session: {} ({})",
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
pub fn parse_codex_session_file(path: &std::path::Path) -> Option<CodexSession> {
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
/// On Windows with WSL mode, reads from WSL filesystem via UNC path
#[tauri::command]
pub async fn load_codex_session_history(session_id: String) -> Result<Vec<serde_json::Value>, String> {
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
pub fn find_session_file(sessions_dir: &std::path::Path, session_id: &str) -> Option<std::path::PathBuf> {
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

    log::info!("Successfully deleted Codex session file: {:?}", session_file);
    Ok(format!("Session {} deleted", session_id))
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
    // Check if we should use WSL mode on Windows
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

    // CRITICAL: --json MUST come before 'resume' (if used)
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

    // FIX: Pass prompt via stdin instead of command line argument
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

/// Builds a Codex command for WSL mode
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
    cmd.stdin(Stdio::piped());   // Enable stdin to pass prompt
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Fix: Apply platform-specific no-window configuration to hide console
    // This prevents the terminal window from flashing when starting Codex sessions
    apply_no_window_async(&mut cmd);

    // Spawn process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn codex: {}", e))?;

    // FIX: Write prompt to stdin if provided
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
    let session_id_stdout = session_id.clone();  // Clone for stdout task
    let session_id_complete = session_id.clone();

    // FIX: Emit session init event immediately so frontend can subscribe to the correct channel
    // This event is sent on the global channel, frontend will use this to switch to session-specific listeners
    let init_payload = serde_json::json!({
        "type": "session_init",
        "session_id": session_id
    });
    if let Err(e) = app_handle.emit("codex-session-init", init_payload) {
        log::error!("Failed to emit codex-session-init: {}", e);
    }
    log::info!("Codex session initialized with ID: {}", session_id);

    // Spawn task to read stdout (JSONL events)
    // FIX: Emit to both session-specific and global channels for proper multi-tab isolation
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if !line.trim().is_empty() {
                log::debug!("Codex output: {}", line);
                // Emit to session-specific channel first (for multi-tab isolation)
                if let Err(e) = app_handle_stdout.emit(&format!("codex-output:{}", session_id_stdout), &line) {
                    log::error!("Failed to emit codex-output (session-specific): {}", e);
                }
                // Also emit to global channel for backward compatibility
                if let Err(e) = app_handle_stdout.emit("codex-output", &line) {
                    log::error!("Failed to emit codex-output (global): {}", e);
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
    // FIX: Use polling with try_wait() instead of removing process before wait()
    // This ensures the process stays in the HashMap while running, allowing cancel_codex to find and kill it
    tokio::spawn(async move {
        let state: tauri::State<'_, CodexProcessState> = app_handle_complete.state();

        // Poll for process completion without removing it from the HashMap
        // This allows cancel_codex to find and kill the process at any time
        let exit_status: Option<std::process::ExitStatus> = loop {
            let mut processes = state.processes.lock().await;

            if let Some(child) = processes.get_mut(&session_id_complete) {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        // Process has completed, now remove it from HashMap
                        processes.remove(&session_id_complete);
                        break Some(status);
                    }
                    Ok(None) => {
                        // Process still running, release lock and wait before polling again
                        drop(processes);
                        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                    }
                    Err(e) => {
                        log::error!("Error checking process status: {}", e);
                        processes.remove(&session_id_complete);
                        break None;
                    }
                }
            } else {
                // Process was removed by cancel_codex, stop polling
                log::info!("Process {} was cancelled, stopping wait task", session_id_complete);
                break None;
            }
        };

        if let Some(status) = exit_status {
            log::info!("Codex process exited with status: {}", status);
        }

        // Emit completion event
        // FIX: Emit to both session-specific and global channels for proper multi-tab isolation
        if let Err(e) = app_handle_complete.emit(&format!("codex-complete:{}", session_id_complete), true) {
            log::error!("Failed to emit codex-complete (session-specific): {}", e);
        }
        // Also emit to global channel for backward compatibility
        if let Err(e) = app_handle_complete.emit("codex-complete", true) {
            log::error!("Failed to emit codex-complete (global): {}", e);
        }
    });

    Ok(())
}
