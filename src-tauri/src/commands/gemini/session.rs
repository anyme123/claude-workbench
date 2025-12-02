//! Gemini CLI Session Management
//!
//! Handles Gemini CLI execution, streaming output, and process management.
//! Uses --output-format stream-json for real-time JSONL output.

use std::process::Stdio;

use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use super::config::{build_gemini_env, load_gemini_config};
use super::parser::{convert_to_unified_message, parse_gemini_line, parse_gemini_line_flexible, convert_raw_to_unified_message};
use super::types::{GeminiExecutionOptions, GeminiInstallStatus, GeminiProcessState};
use crate::commands::claude::apply_no_window_async;

// ============================================================================
// Binary Detection
// ============================================================================

/// Find Gemini CLI binary path
pub fn find_gemini_binary() -> Result<String, String> {
    // 1. Check environment variable
    if let Ok(path) = std::env::var("GEMINI_CLI_PATH") {
        if std::path::Path::new(&path).exists() {
            log::info!("Found Gemini CLI from GEMINI_CLI_PATH: {}", path);
            return Ok(path);
        }
    }

    // 2. Check common npm global paths
    #[cfg(target_os = "windows")]
    let npm_paths = vec![
        // npm global (Windows)
        dirs::data_dir()
            .map(|d| d.join("npm").join("gemini.cmd"))
            .unwrap_or_default(),
        dirs::data_dir()
            .map(|d| d.join("npm").join("gemini"))
            .unwrap_or_default(),
        // AppData/Roaming/npm
        std::env::var("APPDATA")
            .map(|d| std::path::PathBuf::from(d).join("npm").join("gemini.cmd"))
            .unwrap_or_default(),
    ];

    #[cfg(not(target_os = "windows"))]
    let npm_paths = vec![
        // npm global (Unix)
        std::path::PathBuf::from("/usr/local/bin/gemini"),
        std::path::PathBuf::from("/usr/bin/gemini"),
        dirs::home_dir()
            .map(|d| d.join(".npm-global").join("bin").join("gemini"))
            .unwrap_or_default(),
        dirs::home_dir()
            .map(|d| d.join(".local").join("bin").join("gemini"))
            .unwrap_or_default(),
        // Homebrew (macOS)
        std::path::PathBuf::from("/opt/homebrew/bin/gemini"),
    ];

    for path in npm_paths {
        if path.exists() {
            let path_str = path.to_string_lossy().to_string();
            log::info!("Found Gemini CLI at: {}", path_str);
            return Ok(path_str);
        }
    }

    // 3. Try using 'which' or 'where' command
    #[cfg(target_os = "windows")]
    let which_cmd = "where";
    #[cfg(not(target_os = "windows"))]
    let which_cmd = "which";

    if let Ok(output) = std::process::Command::new(which_cmd)
        .arg("gemini")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .trim()
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                log::info!("Found Gemini CLI via {}: {}", which_cmd, path);
                return Ok(path);
            }
        }
    }

    Err("Gemini CLI not found. Install with: npm install -g @google/gemini-cli".to_string())
}

/// Get Gemini CLI version
pub fn get_gemini_version(gemini_path: &str) -> Option<String> {
    let output = std::process::Command::new(gemini_path)
        .arg("--version")
        .output()
        .ok()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string();
        Some(version)
    } else {
        None
    }
}

// ============================================================================
// Tauri Commands - Installation Check
// ============================================================================

/// Check if Gemini CLI is installed
#[tauri::command]
pub async fn check_gemini_installed() -> Result<GeminiInstallStatus, String> {
    match find_gemini_binary() {
        Ok(path) => {
            let version = get_gemini_version(&path);
            Ok(GeminiInstallStatus {
                installed: true,
                path: Some(path),
                version,
                error: None,
            })
        }
        Err(e) => Ok(GeminiInstallStatus {
            installed: false,
            path: None,
            version: None,
            error: Some(e),
        }),
    }
}

// ============================================================================
// Tauri Commands - Session Execution
// ============================================================================

/// Execute Gemini CLI with streaming output
#[tauri::command]
pub async fn execute_gemini(
    options: GeminiExecutionOptions,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("execute_gemini called with options: {:?}", options);

    // Find Gemini binary
    let gemini_path = find_gemini_binary()?;

    // Load configuration
    let config = load_gemini_config().unwrap_or_default();

    // Build command arguments
    let mut args = vec![
        "--output-format".to_string(),
        "stream-json".to_string(),
    ];

    // Check if we're resuming a session
    // Note: Gemini CLI --resume accepts "latest" or index number (e.g. "5"), not UUID
    // For simplicity, we use "latest" when session_id is provided
    let is_resuming = options.session_id.is_some();
    if is_resuming {
        args.push("--resume".to_string());
        args.push("latest".to_string());
    }

    // Add model if specified (or use default from config)
    let model = options.model.as_ref().unwrap_or(&config.default_model);
    args.push("--model".to_string());
    args.push(model.clone());

    // Add approval mode
    let approval_mode = options.approval_mode.as_ref().unwrap_or(&config.approval_mode);
    if approval_mode == "yolo" {
        args.push("--yolo".to_string());
    } else if approval_mode != "default" {
        args.push("--approval-mode".to_string());
        args.push(approval_mode.clone());
    }

    // Add include directories if specified
    if let Some(dirs) = &options.include_directories {
        if !dirs.is_empty() {
            args.push("--include-directories".to_string());
            args.push(dirs.join(","));
        }
    }

    // Add debug flag if enabled
    if options.debug {
        args.push("--debug".to_string());
    }

    // Add prompt:
    // - When resuming: use -p flag (stdin doesn't work due to Gemini CLI bug)
    // - When starting new: use positional argument
    if is_resuming {
        // Note: -p is deprecated but stdin/positional don't work for resume
        args.push("-p".to_string());
        args.push(options.prompt.clone());
    } else {
        // Add prompt as positional argument (must be last for new sessions)
        args.push(options.prompt.clone());
    }

    log::info!("Gemini command: {} {:?}", gemini_path, args);

    // Build command
    let mut cmd = Command::new(&gemini_path);
    cmd.args(&args);
    cmd.current_dir(&options.project_path);

    // Set environment variables from config
    let env_vars = build_gemini_env(&config);
    for (key, value) in env_vars {
        cmd.env(&key, &value);
    }

    // Execute process
    execute_gemini_process(cmd, options.project_path, model.clone(), app_handle).await
}

/// Cancel a running Gemini execution
#[tauri::command]
pub async fn cancel_gemini(
    session_id: Option<String>,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("cancel_gemini called for session: {:?}", session_id);

    let state: tauri::State<'_, GeminiProcessState> = app_handle.state();
    let mut processes = state.processes.lock().await;

    if let Some(sid) = session_id {
        // Cancel specific session
        if let Some(mut child) = processes.remove(&sid) {
            child.kill().await.map_err(|e| format!("Failed to kill process: {}", e))?;
            log::info!("Killed Gemini process for session: {}", sid);

            // Emit cancellation event
            let _ = app_handle.emit(&format!("gemini-cancelled:{}", sid), true);
            let _ = app_handle.emit("gemini-cancelled", true);
        } else {
            log::warn!("No running process found for session: {}", sid);
        }
    } else {
        // Cancel all processes
        for (sid, mut child) in processes.drain() {
            if let Err(e) = child.kill().await {
                log::error!("Failed to kill process for session {}: {}", sid, e);
            } else {
                log::info!("Killed Gemini process for session: {}", sid);
            }
        }
        let _ = app_handle.emit("gemini-cancelled", true);
    }

    Ok(())
}

// ============================================================================
// Process Execution
// ============================================================================

/// Execute a Gemini process and stream output to frontend
async fn execute_gemini_process(
    mut cmd: Command,
    project_path: String,
    model: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    // Setup stdio
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Apply platform-specific no-window configuration
    apply_no_window_async(&mut cmd);

    // Spawn process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn gemini: {}", e))?;

    // Extract stdout and stderr
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Generate session ID
    let session_id = format!("gemini-{}", uuid::Uuid::new_v4());

    // Store process in state
    let state: tauri::State<'_, GeminiProcessState> = app_handle.state();
    {
        let mut processes = state.processes.lock().await;
        processes.insert(session_id.clone(), child);

        let mut last_session = state.last_session_id.lock().await;
        *last_session = Some(session_id.clone());
    }

    // Emit session init event
    let init_payload = serde_json::json!({
        "type": "system",
        "subtype": "init",
        "session_id": session_id,
        "model": model,
        "project_path": project_path,
        "geminiMetadata": {
            "provider": "gemini",
            "eventType": "session_init"
        }
    });

    if let Err(e) = app_handle.emit("gemini-session-init", &init_payload) {
        log::error!("Failed to emit gemini-session-init: {}", e);
    }

    // Also emit as gemini-output for unified handling
    let init_line = serde_json::to_string(&init_payload).unwrap_or_default();
    let _ = app_handle.emit(&format!("gemini-output:{}", session_id), &init_line);
    let _ = app_handle.emit("gemini-output", &init_line);

    log::info!("Gemini session initialized with ID: {}", session_id);

    // Clone handles for async tasks
    let app_handle_stdout = app_handle.clone();
    let app_handle_stderr = app_handle.clone();
    let app_handle_complete = app_handle.clone();
    let session_id_stdout = session_id.clone();
    let session_id_stderr = session_id.clone();
    let session_id_complete = session_id.clone();

    // Spawn task to read stdout (JSONL events)
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();

        while let Ok(Some(line)) = reader.next_line().await {
            if line.trim().is_empty() {
                continue;
            }

            log::debug!("Gemini output: {}", line);

            // Try to parse and convert to unified format
            let unified_message = if let Ok(event) = parse_gemini_line(&line) {
                convert_to_unified_message(&event)
            } else if let Ok(raw) = parse_gemini_line_flexible(&line) {
                convert_raw_to_unified_message(&raw)
            } else {
                // Fallback: emit raw line as system message
                serde_json::json!({
                    "type": "system",
                    "subtype": "raw",
                    "content": line,
                    "geminiMetadata": {
                        "provider": "gemini",
                        "eventType": "raw"
                    }
                })
            };

            let unified_line = serde_json::to_string(&unified_message).unwrap_or(line.clone());

            // Emit to session-specific channel
            if let Err(e) = app_handle_stdout.emit(
                &format!("gemini-output:{}", session_id_stdout),
                &unified_line,
            ) {
                log::error!("Failed to emit gemini-output (session): {}", e);
            }

            // Also emit to global channel
            if let Err(e) = app_handle_stdout.emit("gemini-output", &unified_line) {
                log::error!("Failed to emit gemini-output (global): {}", e);
            }
        }

        log::info!("Gemini stdout reader finished for session: {}", session_id_stdout);
    });

    // Spawn task to read stderr
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();

        while let Ok(Some(line)) = reader.next_line().await {
            if !line.trim().is_empty() {
                log::warn!("Gemini stderr: {}", line);

                // Emit stderr as error event
                let error_message = serde_json::json!({
                    "type": "system",
                    "subtype": "error",
                    "error": {
                        "message": line
                    },
                    "geminiMetadata": {
                        "provider": "gemini",
                        "eventType": "stderr"
                    }
                });

                let error_line = serde_json::to_string(&error_message).unwrap_or(line.clone());

                let _ = app_handle_stderr.emit(
                    &format!("gemini-error:{}", session_id_stderr),
                    &error_line,
                );
                let _ = app_handle_stderr.emit("gemini-error", &error_line);
            }
        }
    });

    // Spawn task to wait for process completion
    let state_complete = app_handle.state::<GeminiProcessState>();
    let processes_complete = state_complete.processes.clone();

    tokio::spawn(async move {
        // Wait a bit for stdout/stderr to be processed
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Get child from processes map
        let mut processes = processes_complete.lock().await;
        if let Some(mut child) = processes.remove(&session_id_complete) {
            match child.wait().await {
                Ok(status) => {
                    let success = status.success();
                    log::info!(
                        "Gemini process exited with status: {} (success: {})",
                        status,
                        success
                    );

                    // Emit completion event
                    let complete_payload = serde_json::json!({
                        "type": "result",
                        "status": if success { "success" } else { "error" },
                        "geminiMetadata": {
                            "provider": "gemini",
                            "eventType": "complete",
                            "exitCode": status.code()
                        }
                    });

                    let complete_line = serde_json::to_string(&complete_payload).unwrap_or_default();

                    let _ = app_handle_complete.emit(
                        &format!("gemini-output:{}", session_id_complete),
                        &complete_line,
                    );
                    let _ = app_handle_complete.emit("gemini-output", &complete_line);

                    let _ = app_handle_complete.emit(
                        &format!("gemini-complete:{}", session_id_complete),
                        success,
                    );
                    let _ = app_handle_complete.emit("gemini-complete", success);
                }
                Err(e) => {
                    log::error!("Failed to wait for Gemini process: {}", e);

                    let _ = app_handle_complete.emit(
                        &format!("gemini-complete:{}", session_id_complete),
                        false,
                    );
                    let _ = app_handle_complete.emit("gemini-complete", false);
                }
            }
        }
    });

    Ok(())
}
