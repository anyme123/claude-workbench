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
    let cmd = build_codex_command(&options, false)?;

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

    // Build codex exec resume command
    let mut cmd_builder = build_codex_command(&options, true)?;
    cmd_builder.arg(&session_id);
    let cmd = cmd_builder;

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
    let mut cmd_builder = build_codex_command(&options, true)?;
    cmd_builder.arg("--last");
    let cmd = cmd_builder;

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

/// Lists all Codex sessions
#[tauri::command]
pub async fn list_codex_sessions() -> Result<Vec<CodexSession>, String> {
    log::info!("list_codex_sessions called");

    // TODO: Implement session listing by reading ~/.codex/sessions directory
    // For now, return empty list
    Ok(Vec::new())
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

    // TODO: Implement session deletion
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
) -> Result<Command, String> {
    let mut cmd = Command::new("codex");

    // Add npm global directory to PATH
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let npm_path = format!(r"{}\npm", appdata);
            if let Ok(current_path) = std::env::var("PATH") {
                let new_path = format!("{};{}", npm_path, current_path);
                cmd.env("PATH", new_path);
                log::info!("[Codex] Added npm path to PATH: {}", npm_path);
            }
        }
    }

    cmd.arg("exec");

    // Add resume if needed
    if is_resume {
        cmd.arg("resume");
    }

    // Enable JSON output mode (always for our use case)
    if options.json {
        cmd.arg("--json");
    }

    // Add execution mode
    match options.mode {
        CodexExecutionMode::FullAuto => {
            cmd.arg("--full-auto");
        }
        CodexExecutionMode::DangerFullAccess => {
            cmd.arg("--sandbox");
            cmd.arg("danger-full-access");
        }
        CodexExecutionMode::ReadOnly => {
            // Read-only is default, no flags needed
        }
    }

    // Add model if specified
    if let Some(ref model) = options.model {
        cmd.arg("--model");
        cmd.arg(model);
    }

    // Add output schema if specified
    if let Some(ref schema) = options.output_schema {
        cmd.arg("--output-schema");
        cmd.arg(schema);
    }

    // Add output file if specified
    if let Some(ref file) = options.output_file {
        cmd.arg("-o");
        cmd.arg(file);
    }

    // Skip git repo check if requested
    if options.skip_git_repo_check {
        cmd.arg("--skip-git-repo-check");
    }

    // Set working directory
    cmd.current_dir(&options.project_path);

    // Set API key environment variable if provided
    if let Some(ref api_key) = options.api_key {
        cmd.env("CODEX_API_KEY", api_key);
    }

    // Add prompt (if not resuming)
    if !is_resume {
        cmd.arg(&options.prompt);
    }

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

    // Spawn task to read stderr (errors/warnings)
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if !line.trim().is_empty() {
                log::warn!("Codex stderr: {}", line);
                if let Err(e) = app_handle_stderr.emit("codex-error", line) {
                    log::error!("Failed to emit codex-error: {}", e);
                }
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
