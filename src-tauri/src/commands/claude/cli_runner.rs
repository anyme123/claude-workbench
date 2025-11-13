use std::fs;
use std::process::Stdio;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::commands::permission_config::{
    ClaudePermissionConfig, ClaudeExecutionConfig, build_execution_args,
};

use super::paths::{encode_project_path, get_claude_dir};
use super::config::get_claude_execution_config;
use super::platform;

/// Global state to track current Claude process
pub struct ClaudeProcessState {
    pub current_process: Arc<Mutex<Option<Child>>>,
}

impl Default for ClaudeProcessState {
    fn default() -> Self {
        Self {
            current_process: Arc::new(Mutex::new(None)),
        }
    }
}

impl Drop for ClaudeProcessState {
    fn drop(&mut self) {
        // When the application exits, clean up the current process
        log::info!("ClaudeProcessState dropping, cleaning up current process...");
        
        // Use a runtime to execute the async cleanup
        let process = self.current_process.clone();
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            // We're in a tokio runtime context
            handle.block_on(async move {
                let mut current_process = process.lock().await;
                if let Some(mut child) = current_process.take() {
                    log::info!("Cleanup on drop: Killing Claude process");
                    match child.kill().await {
                        Ok(_) => {
                            log::info!("Cleanup on drop: Successfully killed Claude process");
                        }
                        Err(e) => {
                            log::error!("Cleanup on drop: Failed to kill Claude process: {}", e);
                        }
                    }
                }
            });
        } else {
            // Create a temporary runtime for cleanup
            if let Ok(rt) = tokio::runtime::Runtime::new() {
                rt.block_on(async move {
                    let mut current_process = process.lock().await;
                    if let Some(mut child) = current_process.take() {
                        log::info!("Cleanup on drop: Killing Claude process");
                        match child.kill().await {
                            Ok(_) => {
                                log::info!("Cleanup on drop: Successfully killed Claude process");
                            }
                            Err(e) => {
                                log::error!("Cleanup on drop: Failed to kill Claude process: {}", e);
                            }
                        }
                    }
                });
            }
        }
    }
}

/// Maps frontend model IDs to Claude CLI model aliases
/// Converts frontend-friendly model names to official Claude Code model identifiers
/// Updated to use Claude 4.1 Opus (released August 2025) as the latest Opus model
pub(super) fn map_model_to_claude_alias(model: &str) -> String {
    match model {
        "sonnet1m" => "sonnet[1m]".to_string(),
        "sonnet" => "sonnet".to_string(),
        // Use 'opus' alias which automatically resolves to latest Opus (Claude 4.1)
        "opus" => "opus".to_string(),
        // Pass through any other model names unchanged (for future compatibility)
        _ => model.to_string(),
    }
}

/// Escapes prompt content for safe command line usage
/// Handles multiline content, special characters, and Windows-specific issues
fn escape_prompt_for_cli(prompt: &str) -> String {
    let trimmed = prompt.trim();
    let is_slash_command = trimmed.starts_with('/');
    
    // For Windows, we need to be extra careful with command line escaping
    #[cfg(target_os = "windows")]
    {
        if is_slash_command {
            // Slash commands should be passed directly to Claude CLI without quotes
            // Only clean up whitespace and remove null characters
            let cleaned = trimmed
                .replace('\r', " ")    // Replace carriage returns with spaces
                .replace('\n', " ")    // Replace line feeds with spaces
                .replace('\0', "")     // Remove null characters
                .trim()                // Remove leading/trailing whitespace
                .to_string();
            
            // Return slash command without quotes - Claude CLI expects raw slash commands
            cleaned
        } else {
            // Regular prompts get full escaping treatment
            let escaped = prompt
                .replace('\r', "\\r")  // Carriage return
                .replace('\n', "\\n")  // Line feed
                .replace('\"', "\\\"") // Double quotes
                .replace('\\', "\\\\") // Backslashes
                .replace('\t', "\\t")  // Tabs
                .replace('\0', "");    // Remove null characters
            
            // If the prompt contains spaces or special characters, wrap in quotes
            if escaped.contains(' ') || escaped.contains('&') || escaped.contains('|') 
                || escaped.contains('<') || escaped.contains('>') || escaped.contains('^') {
                format!("\"{}\"", escaped)
            } else {
                escaped
            }
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        if is_slash_command {
            // Slash commands should be passed directly to Claude CLI without quotes
            // Only clean up whitespace and remove null characters
            let cleaned = trimmed
                .replace('\r', " ")     // Replace carriage returns with spaces
                .replace('\n', " ")     // Replace line feeds with spaces
                .replace('\0', "")      // Remove null characters
                .trim()                 // Remove leading/trailing whitespace
                .to_string();
            
            // Return slash command without quotes - Claude CLI expects raw slash commands
            cleaned
        } else {
            // For Unix-like systems, escape shell metacharacters
            let escaped = prompt
                .replace('\\', "\\\\")  // Backslashes first
                .replace('\n', "\\n")   // Newlines
                .replace('\r', "\\r")   // Carriage returns
                .replace('\t', "\\t")   // Tabs
                .replace('\"', "\\\"")  // Double quotes
                .replace('\'', "\\'")   // Single quotes
                .replace('$', "\\$")    // Dollar signs
                .replace('`', "\\`")    // Backticks
                .replace('\0', "");     // Remove null characters
            
            // Wrap in single quotes for safety
            format!("'{}'", escaped.replace('\'', "'\"'\"'"))
        }
    }
}

/// Helper function to create a tokio Command with proper environment variables
/// This ensures commands like Claude can find Node.js and other dependencies
fn create_command_with_env(program: &str) -> Command {
    // On Windows, if the program is a .cmd file, try to resolve it to direct Node.js invocation
    // This prevents the cmd.exe window from appearing
    #[cfg(target_os = "windows")]
    let (final_program, extra_args) = {
        if program.ends_with(".cmd") {
            // Use the resolver from claude_binary module
            if let Some((node_path, script_path)) = platform::resolve_cmd_wrapper(program) {
                log::info!("Resolved .cmd wrapper {} to Node.js script: {}", program, script_path);
                (node_path, vec![script_path])
            } else {
                (program.to_string(), vec![])
            }
        } else {
            (program.to_string(), vec![])
        }
    };

    #[cfg(not(target_os = "windows"))]
    let (final_program, extra_args) = (program.to_string(), Vec::<String>::new());

    // Create a new tokio Command from the resolved program path
    let mut tokio_cmd = Command::new(&final_program);

    // Add any extra arguments (e.g., script path when using node directly)
    for arg in extra_args {
        tokio_cmd.arg(arg);
    }

    // Copy over all environment variables
    for (key, value) in std::env::vars() {
        if key == "PATH"
            || key == "HOME"
            || key == "USER"
            || key == "SHELL"
            || key == "LANG"
            || key == "LC_ALL"
            || key.starts_with("LC_")
            || key == "NODE_PATH"
            || key == "NVM_DIR"
            || key == "NVM_BIN"
            || key == "HOMEBREW_PREFIX"
            || key == "HOMEBREW_CELLAR"
            // Windows-specific
            || key == "USERPROFILE"
            || key == "USERNAME"
            || key == "COMPUTERNAME"
            || key == "APPDATA"
            || key == "LOCALAPPDATA"
            || key == "TEMP"
            || key == "TMP"
            // 🔥 修复：添加 ANTHROPIC 和 Claude Code 相关环境变量
            || key.starts_with("ANTHROPIC_")
            || key.starts_with("CLAUDE_CODE_")
            || key == "API_TIMEOUT_MS"
        {
            log::debug!("Inheriting env var: {}={}", key, value);
            tokio_cmd.env(&key, &value);
        }
    }

    // Add NVM support if the program is in an NVM directory (cross-platform)
    if program.contains("/.nvm/versions/node/") || program.contains("\\.nvm\\versions\\node\\") {
        if let Some(node_bin_dir) = std::path::Path::new(program).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                // Use platform-specific path separator
                #[cfg(target_os = "windows")]
                let separator = ";";
                #[cfg(not(target_os = "windows"))]
                let separator = ":";

                let new_path = format!("{}{}{}", node_bin_str, separator, current_path);
                tokio_cmd.env("PATH", new_path);
            }
        }
    }

    // 🔥 新增：读取 ~/.claude/settings.json 中的自定义环境变量
    // 这些变量会覆盖系统环境变量，确保用户的自定义配置生效
    if let Ok(claude_dir) = get_claude_dir() {
        let settings_path = claude_dir.join("settings.json");
        if settings_path.exists() {
            if let Ok(content) = fs::read_to_string(&settings_path) {
                if let Ok(settings) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(env_obj) = settings.get("env").and_then(|v| v.as_object()) {
                        log::info!("Loading {} custom environment variables from settings.json", env_obj.len());
                        for (key, value) in env_obj {
                            if let Some(value_str) = value.as_str() {
                                log::info!("Setting custom env var: {}={}", key, value_str);
                                tokio_cmd.env(key, value_str);
                            }
                        }
                    }
                }
            }
        }
    }

    tokio_cmd
}




/// Helper function to spawn Claude process and handle streaming
/// Enhanced for Windows compatibility with router support
fn create_system_command(
    claude_path: &str,
    args: Vec<String>,
    project_path: &str,
    model: Option<&str>,
    _max_thinking_tokens: Option<u32>, // Keep parameter for compatibility but don't use it
) -> Result<Command, String> {
    create_windows_command(claude_path, args, project_path, model)
}

/// Create a Windows command
fn create_windows_command(
    claude_path: &str,
    args: Vec<String>,
    project_path: &str,
    model: Option<&str>,
) -> Result<Command, String> {
    let mut cmd = create_command_with_env(claude_path);

    // 🔥 修复：设置ANTHROPIC_MODEL环境变量以确保模型选择生效
    if let Some(model_name) = model {
        log::info!("Setting ANTHROPIC_MODEL environment variable to: {}", model_name);
        cmd.env("ANTHROPIC_MODEL", model_name);
    }

    // Note: MAX_THINKING_TOKENS is now controlled via settings.json env field
    // See update_thinking_mode command for managing this setting

    // Add all arguments
    cmd.args(&args);

    // Set working directory
    cmd.current_dir(project_path);

    // Configure stdio for capturing output
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Apply platform-specific no-window configuration
    platform::apply_no_window_async(&mut cmd);

    // On Unix-like systems, create a new process group
    // This allows us to kill the entire process tree with a single signal
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0); // Create new process group, process becomes group leader
    }

    Ok(cmd)
}

/// Execute Claude Code session with project context resume and streaming output
/// Always tries to resume project context first for better continuity
/// Enhanced for Windows with better error handling
#[tauri::command]
pub async fn execute_claude_code(
    app: AppHandle,
    project_path: String,
    prompt: String,
    model: String,
    plan_mode: Option<bool>,
    max_thinking_tokens: Option<u32>,
) -> Result<(), String> {
    let plan_mode = plan_mode.unwrap_or(false);
    log::info!(
        "Starting Claude Code session with project context resume in: {} with model: {}, plan_mode: {}",
        project_path,
        model,
        plan_mode
    );

    let claude_path = crate::claude_binary::find_claude_binary(&app)?;
    
    // 获取当前执行配置
    let mut execution_config = get_claude_execution_config(app.clone()).await
        .unwrap_or_else(|e| {
            log::warn!("Failed to load execution config, using default: {}", e);
            ClaudeExecutionConfig::default()
        });
    
    // 设置 maxThinkingTokens（如果提供）
    if let Some(tokens) = max_thinking_tokens {
        execution_config.max_thinking_tokens = Some(tokens);
        log::info!("Setting maxThinkingTokens to {}", tokens);
    }

    // 如果启用 Plan Mode，使用 Claude CLI 原生的 plan 权限模式
    if plan_mode {
        execution_config.permissions = ClaudePermissionConfig::plan_mode();
    }

    log::info!("Using execution config: permissions_mode={:?}, dangerous_skip={}, plan_mode={}, max_thinking_tokens={:?}",
        execution_config.permissions.permission_mode,
        execution_config.permissions.enable_dangerous_skip,
        plan_mode,
        execution_config.max_thinking_tokens
    );
    
    // 使用新的参数构建函数（先映射模型名称）
    let mapped_model = map_model_to_claude_alias(&model);
    let args = build_execution_args(&execution_config, &prompt, &mapped_model, escape_prompt_for_cli);

    // Create command
    let cmd = create_system_command(&claude_path, args, &project_path, Some(&mapped_model), max_thinking_tokens)?;
    spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Continue an existing Claude Code conversation with streaming output
/// Enhanced for Windows with better error handling
#[tauri::command]
pub async fn continue_claude_code(
    app: AppHandle,
    project_path: String,
    prompt: String,
    model: String,
    plan_mode: Option<bool>,
    max_thinking_tokens: Option<u32>,
) -> Result<(), String> {
    let plan_mode = plan_mode.unwrap_or(false);
    log::info!(
        "Continuing Claude Code conversation in: {} with model: {}, plan_mode: {}",
        project_path,
        model,
        plan_mode
    );

    let claude_path = crate::claude_binary::find_claude_binary(&app)?;
    
    // 获取当前执行配置
    let mut execution_config = get_claude_execution_config(app.clone()).await
        .unwrap_or_else(|e| {
            log::warn!("Failed to load execution config, using default: {}", e);
            ClaudeExecutionConfig::default()
        });

    // 设置 maxThinkingTokens（如果提供）
    if let Some(tokens) = max_thinking_tokens {
        execution_config.max_thinking_tokens = Some(tokens);
        log::info!("Setting maxThinkingTokens to {}", tokens);
    }

    // 如果启用 Plan Mode，使用 Claude CLI 原生的 plan 权限模式
    if plan_mode {
        execution_config.permissions = ClaudePermissionConfig::plan_mode();
    }

    log::info!("Continuing with execution config: permissions_mode={:?}, dangerous_skip={}, plan_mode={}, max_thinking_tokens={:?}",
        execution_config.permissions.permission_mode,
        execution_config.permissions.enable_dangerous_skip,
        plan_mode,
        execution_config.max_thinking_tokens
    );
    
    // 使用新的参数构建函数，添加 -c 标志用于继续对话（先映射模型名称）
    let mapped_model = map_model_to_claude_alias(&model);
    let mut args = build_execution_args(&execution_config, &prompt, &mapped_model, escape_prompt_for_cli);

    // 在开头插入 -c 标志
    args.insert(0, "-c".to_string());

    // Create command
    let cmd = create_system_command(&claude_path, args, &project_path, Some(&mapped_model), max_thinking_tokens)?;
    spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Resume an existing Claude Code session by ID with streaming output
/// Enhanced for Windows with better error handling
#[tauri::command]
pub async fn resume_claude_code(
    app: AppHandle,
    project_path: String,
    session_id: String,
    prompt: String,
    model: String,
    plan_mode: Option<bool>,
    max_thinking_tokens: Option<u32>,
) -> Result<(), String> {
    let plan_mode = plan_mode.unwrap_or(false);
    log::info!(
        "Resuming Claude Code session: {} in: {} with model: {}, plan_mode: {}",
        session_id,
        project_path,
        model,
        plan_mode
    );
    
    // Log the session file path for debugging
    let session_dir = format!("{}/.claude/projects/{}", 
        std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| "~".to_string()), 
        encode_project_path(&project_path)
    );
    log::info!("Expected session file directory: {}", session_dir);
    log::info!("Session ID to resume: {}", session_id);

    let claude_path = crate::claude_binary::find_claude_binary(&app)?;
    
    // 获取当前执行配置
    let mut execution_config = get_claude_execution_config(app.clone()).await
        .unwrap_or_else(|e| {
            log::warn!("Failed to load execution config, using default: {}", e);
            ClaudeExecutionConfig::default()
        });

    // 设置 maxThinkingTokens（如果提供）
    if let Some(tokens) = max_thinking_tokens {
        execution_config.max_thinking_tokens = Some(tokens);
        log::info!("Setting maxThinkingTokens to {}", tokens);
    }

    // 如果启用 Plan Mode，使用 Claude CLI 原生的 plan 权限模式
    if plan_mode {
        execution_config.permissions = ClaudePermissionConfig::plan_mode();
    }

    log::info!("Resuming with execution config: permissions_mode={:?}, dangerous_skip={}, plan_mode={}, max_thinking_tokens={:?}",
        execution_config.permissions.permission_mode,
        execution_config.permissions.enable_dangerous_skip,
        plan_mode,
        execution_config.max_thinking_tokens
    );
    
    // 使用新的参数构建函数，添加 --resume 和 session_id（先映射模型名称）
    let mapped_model = map_model_to_claude_alias(&model);
    let mut args = build_execution_args(&execution_config, &prompt, &mapped_model, escape_prompt_for_cli);

    // 为resume模式重新组织参数：--resume session_id 应该在最前面
    args.insert(0, "--resume".to_string());
    args.insert(1, session_id.clone());

    log::info!("Resume command: claude {}", args.join(" "));

    // Create command
    let cmd = create_system_command(&claude_path, args, &project_path, Some(&mapped_model), max_thinking_tokens)?;
    
    // Try to spawn the process - if it fails, fall back to continue mode
    match spawn_claude_process(app.clone(), cmd, prompt.clone(), model.clone(), project_path.clone()).await {
        Ok(_) => Ok(()),
        Err(resume_error) => {
            log::warn!("Resume failed: {}, trying continue mode as fallback", resume_error);
            // Fallback to continue mode
            continue_claude_code(app, project_path, prompt, model, Some(plan_mode), max_thinking_tokens).await
        }
    }
}

/// Cancel the currently running Claude Code execution
#[tauri::command]
pub async fn cancel_claude_execution(
    app: AppHandle,
    session_id: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Cancelling Claude Code execution for session: {:?}",
        session_id
    );

    let mut killed = false;
    let mut attempted_methods = Vec::new();

    // Method 1: Try to find and kill via ProcessRegistry using session ID
    if let Some(sid) = &session_id {
        let registry = app.state::<crate::process::ProcessRegistryState>();
        match registry.0.get_claude_session_by_id(sid) {
            Ok(Some(process_info)) => {
                log::info!("Found process in registry for session {}: run_id={}, PID={}", 
                    sid, process_info.run_id, process_info.pid);
                match registry.0.kill_process(process_info.run_id).await {
                    Ok(success) => {
                        if success {
                            log::info!("Successfully killed process via registry");
                            killed = true;
                        } else {
                            log::warn!("Registry kill returned false");
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to kill via registry: {}", e);
                    }
                }
                attempted_methods.push("registry");
            }
            Ok(None) => {
                log::warn!("Session {} not found in ProcessRegistry", sid);
            }
            Err(e) => {
                log::error!("Error querying ProcessRegistry: {}", e);
            }
        }
    }

    // Method 2: Try the legacy approach via ClaudeProcessState
    if !killed {
        let claude_state = app.state::<ClaudeProcessState>();
        let mut current_process = claude_state.current_process.lock().await;

        if let Some(mut child) = current_process.take() {
            // Try to get the PID before killing
            let pid = child.id();
            log::info!("Attempting to kill Claude process via ClaudeProcessState with PID: {:?}", pid);

            // Kill the process
            match child.kill().await {
                Ok(_) => {
                    log::info!("Successfully killed Claude process via ClaudeProcessState");
                    killed = true;
                }
                Err(e) => {
                    log::error!("Failed to kill Claude process via ClaudeProcessState: {}", e);
                    
                    // Method 3: If we have a PID, try system kill as last resort
                    if let Some(pid) = pid {
                        log::info!("Attempting system kill as last resort for PID: {}", pid);
                        let kill_result = if cfg!(target_os = "windows") {
                            #[cfg(target_os = "windows")]
                            {
                                use std::os::windows::process::CommandExt;
                                std::process::Command::new("taskkill")
                                    .args(["/F", "/T", "/PID", &pid.to_string()]) // Added /T to kill process tree
                                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                                    .output()
                            }
                            #[cfg(not(target_os = "windows"))]
                            {
                                // This branch will never be reached due to the outer if condition
                                // but is needed for compilation on non-Windows platforms
                                std::process::Command::new("kill")
                                    .args(["-KILL", &pid.to_string()])
                                    .output()
                            }
                        } else {
                            std::process::Command::new("kill")
                                .args(["-KILL", &pid.to_string()])
                                .output()
                        };
                        
                        match kill_result {
                            Ok(output) if output.status.success() => {
                                log::info!("Successfully killed process via system command");
                                killed = true;
                            }
                            Ok(output) => {
                                let stderr = String::from_utf8_lossy(&output.stderr);
                                log::error!("System kill failed: {}", stderr);
                            }
                            Err(e) => {
                                log::error!("Failed to execute system kill command: {}", e);
                            }
                        }
                    }
                }
            }
            attempted_methods.push("claude_state");
        } else {
            log::warn!("No active Claude process in ClaudeProcessState");
        }
    }

    if !killed && attempted_methods.is_empty() {
        log::warn!("No active Claude process found to cancel");
    }

    // Always emit cancellation events for UI consistency
    if let Some(sid) = session_id {
        let _ = app.emit(&format!("claude-cancelled:{}", sid), true);
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let _ = app.emit(&format!("claude-complete:{}", sid), false);
    }
    
    // Also emit generic events for backward compatibility
    let _ = app.emit("claude-cancelled", true);
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    let _ = app.emit("claude-complete", false);
    
    if killed {
        log::info!("Claude process cancellation completed successfully");
    } else if !attempted_methods.is_empty() {
        log::warn!("Claude process cancellation attempted but process may have already exited. Attempted methods: {:?}", attempted_methods);
    }
    
    Ok(())
}

/// Get all running Claude sessions
#[tauri::command]
pub async fn list_running_claude_sessions(
    registry: tauri::State<'_, crate::process::ProcessRegistryState>,
) -> Result<Vec<crate::process::ProcessInfo>, String> {
    registry.0.get_running_claude_sessions()
}

/// Get live output from a Claude session
#[tauri::command]
pub async fn get_claude_session_output(
    registry: tauri::State<'_, crate::process::ProcessRegistryState>,
    session_id: String,
) -> Result<String, String> {
    // Find the process by session ID
    if let Some(process_info) = registry.0.get_claude_session_by_id(&session_id)? {
        registry.0.get_live_output(process_info.run_id)
    } else {
        Ok(String::new())
    }
}

/// Helper function to spawn Claude process and handle streaming
async fn spawn_claude_process(app: AppHandle, mut cmd: Command, prompt: String, model: String, project_path: String) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use std::sync::Mutex;

    // Spawn the process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;

    // Get stdout and stderr
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    // Get the child PID for logging
    let pid = child.id().unwrap_or(0);
    log::info!(
        "Spawned Claude process with PID: {:?}",
        pid
    );

    // Create readers first (before moving child)
    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);

    // We'll extract the session ID from Claude's init message
    let session_id_holder: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let run_id_holder: Arc<Mutex<Option<i64>>> = Arc::new(Mutex::new(None));

    // Store the child process in the global state (for backward compatibility)
    let claude_state = app.state::<ClaudeProcessState>();
    {
        let mut current_process = claude_state.current_process.lock().await;
        // If there's already a process running, kill it first
        if let Some(mut existing_child) = current_process.take() {
            log::warn!("Killing existing Claude process before starting new one");
            let _ = existing_child.kill().await;
        }
        *current_process = Some(child);
    }

    // Check if auto-compact state is available
    let auto_compact_available = app.try_state::<crate::commands::context_manager::AutoCompactState>().is_some();

    // Spawn tasks to read stdout and stderr
    let app_handle = app.clone();
    let session_id_holder_clone = session_id_holder.clone();
    let run_id_holder_clone = run_id_holder.clone();
    let registry = app.state::<crate::process::ProcessRegistryState>();
    let registry_clone = registry.0.clone();
    let project_path_clone = project_path.clone();
    let prompt_clone = prompt.clone();
    let model_clone = model.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::debug!("Claude stdout: {}", line);
            
            // Parse the line to check for init message with session ID
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
                if msg["type"] == "system" && msg["subtype"] == "init" {
                    if let Some(claude_session_id) = msg["session_id"].as_str() {
                        let mut session_id_guard = session_id_holder_clone.lock().unwrap();
                        if session_id_guard.is_none() {
                            *session_id_guard = Some(claude_session_id.to_string());
                            log::info!("Extracted Claude session ID: {}", claude_session_id);

                            // Register with auto-compact manager
                            if auto_compact_available {
                                if let Some(auto_compact_state) = app_handle.try_state::<crate::commands::context_manager::AutoCompactState>() {
                                    if let Err(e) = auto_compact_state.0.register_session(
                                    claude_session_id.to_string(),
                                    project_path_clone.clone(),
                                    model_clone.clone(),
                                ) {
                                    log::warn!("Failed to register session with auto-compact manager: {}", e);
                                }
                                }
                            }

                            // Now register with ProcessRegistry using Claude's session ID
                            match registry_clone.register_claude_session(
                                claude_session_id.to_string(),
                                pid,
                                project_path_clone.clone(),
                                prompt_clone.clone(),
                                model_clone.clone(),
                            ) {
                                Ok(run_id) => {
                                    log::info!("Registered Claude session with run_id: {}", run_id);
                                    let mut run_id_guard = run_id_holder_clone.lock().unwrap();
                                    *run_id_guard = Some(run_id);

                                    // ✨ Phase 2: Emit event for real-time session tracking
                                    let event_payload = serde_json::json!({
                                        "session_id": claude_session_id,
                                        "project_path": project_path_clone,
                                        "model": model_clone,
                                        "status": "started",
                                        "pid": pid,
                                        "run_id": run_id,
                                    });
                                    if let Err(e) = app_handle.emit("claude-session-state", &event_payload) {
                                        log::warn!("Failed to emit claude-session-state event: {}", e);
                                    } else {
                                        log::info!("Emitted claude-session-started event for session: {}", claude_session_id);
                                    }

                                    log::info!("Claude CLI will handle project creation for session: {}", claude_session_id);
                                }
                                Err(e) => {
                                    log::error!("Failed to register Claude session: {}", e);
                                }
                            }
                        }
                    }
                }

                // Check for usage information and update context tracking
                if let Some(usage) = msg.get("usage") {
                    if let (Some(input_tokens), Some(output_tokens)) =
                        (usage.get("input_tokens").and_then(|t| t.as_u64()),
                         usage.get("output_tokens").and_then(|t| t.as_u64())) {

                        let total_tokens = (input_tokens + output_tokens) as usize;

                        // Extract cache tokens if available
                        let _cache_creation_tokens = usage.get("cache_creation_input_tokens").and_then(|t| t.as_u64());
                        let _cache_read_tokens = usage.get("cache_read_input_tokens").and_then(|t| t.as_u64());

                        // Store usage data in database for real-time token statistics
                        let session_id_for_update = {
                            session_id_holder_clone.lock().unwrap().as_ref().cloned()
                        };

                        if let Some(session_id_str) = &session_id_for_update {
                            // Agent database functionality removed - usage tracking disabled
                            
                            // Update auto-compact manager with token count
                            if auto_compact_available {
                                if let Some(auto_compact_state) = app_handle.try_state::<crate::commands::context_manager::AutoCompactState>() {
                                    let auto_compact_state_clone = auto_compact_state.inner().clone();
                                    let session_id_for_compact = session_id_str.clone();

                                    // Spawn async task to avoid blocking main output loop
                                    tokio::spawn(async move {
                                        match auto_compact_state_clone.0.update_session_tokens(&session_id_for_compact, total_tokens).await {
                                            Ok(compaction_triggered) => {
                                                if compaction_triggered {
                                                    log::info!("Auto-compaction triggered for session {}", session_id_for_compact);
                                                    // The actual compaction will be handled by the background monitoring thread
                                                }
                                            }
                                            Err(e) => {
                                                log::warn!("Failed to update session tokens for auto-compact: {}", e);
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            }
            
            // Store live output in registry if we have a run_id
            if let Some(run_id) = *run_id_holder_clone.lock().unwrap() {
                let _ = registry_clone.append_live_output(run_id, &line);
            }
            
            // Emit the line to the frontend with session isolation if we have session ID
            if let Some(ref session_id) = *session_id_holder_clone.lock().unwrap() {
                let _ = app_handle.emit(&format!("claude-output:{}", session_id), &line);
            }
            // Also emit to the generic event for backward compatibility and early messages
            let _ = app_handle.emit("claude-output", &line);
        }
    });

    let app_handle_stderr = app.clone();
    let session_id_holder_clone2 = session_id_holder.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::error!("Claude stderr: {}", line);
            // Emit error lines to the frontend with session isolation if we have session ID
            if let Some(ref session_id) = *session_id_holder_clone2.lock().unwrap() {
                let _ = app_handle_stderr.emit(&format!("claude-error:{}", session_id), &line);
            }
            // Also emit to the generic event for backward compatibility
            let _ = app_handle_stderr.emit("claude-error", &line);
        }
    });

    // Wait for the process to complete
    let app_handle_wait = app.clone();
    let claude_state_wait = claude_state.current_process.clone();
    let session_id_holder_clone3 = session_id_holder.clone();
    let run_id_holder_clone2 = run_id_holder.clone();
    let registry_clone2 = registry.0.clone();
    tokio::spawn(async move {
        let _ = stdout_task.await;
        let _ = stderr_task.await;

        // Get the child from the state to wait on it
        let mut current_process = claude_state_wait.lock().await;
        if let Some(mut child) = current_process.take() {
            match child.wait().await {
                Ok(status) => {
                    log::info!("Claude process exited with status: {}", status);
                    // Add a small delay to ensure all messages are processed
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    if let Some(ref session_id) = *session_id_holder_clone3.lock().unwrap() {
                        // ✨ Phase 2: Emit state change event
                        let event_payload = serde_json::json!({
                            "session_id": session_id,
                            "status": "stopped",
                            "success": status.success(),
                        });
                        let _ = app_handle_wait.emit("claude-session-state", &event_payload);
                        
                        let _ = app_handle_wait.emit(
                            &format!("claude-complete:{}", session_id),
                            status.success(),
                        );
                    }
                    // Also emit to the generic event for backward compatibility
                    let _ = app_handle_wait.emit("claude-complete", status.success());
                }
                Err(e) => {
                    log::error!("Failed to wait for Claude process: {}", e);
                    // Add a small delay to ensure all messages are processed
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    if let Some(ref session_id) = *session_id_holder_clone3.lock().unwrap() {
                        // ✨ Phase 2: Emit state change event for error case
                        let event_payload = serde_json::json!({
                            "session_id": session_id,
                            "status": "stopped",
                            "success": false,
                            "error": e.to_string(),
                        });
                        let _ = app_handle_wait.emit("claude-session-state", &event_payload);
                        
                        let _ = app_handle_wait
                            .emit(&format!("claude-complete:{}", session_id), false);
                    }
                    // Also emit to the generic event for backward compatibility
                    let _ = app_handle_wait.emit("claude-complete", false);
                }
            }
        }

        // Unregister from ProcessRegistry if we have a run_id
        if let Some(run_id) = *run_id_holder_clone2.lock().unwrap() {
            let _ = registry_clone2.unregister_process(run_id);
        }

        // Clear the process from state
        *current_process = None;
    });

    Ok(())
}

