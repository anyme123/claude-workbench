use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use regex::Regex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::find_claude_binary;
use super::paths::get_claude_dir;
use crate::commands::permission_config::{
    ClaudeExecutionConfig, ClaudePermissionConfig, PermissionMode,
    DEVELOPMENT_TOOLS, SAFE_TOOLS, ALL_TOOLS
};
use super::{ClaudeMdFile, ClaudeSettings, ClaudeVersionStatus};

#[tauri::command]
pub async fn get_claude_settings() -> Result<ClaudeSettings, String> {
    log::info!("Reading Claude settings");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.json");

    if !settings_path.exists() {
        log::warn!("Settings file not found, returning empty settings");
        return Ok(ClaudeSettings {
            data: serde_json::json!({}),
        });
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings JSON: {}", e))?;

    Ok(ClaudeSettings { data })
}

/// Opens a new Claude Code session by executing the claude command
#[tauri::command]
pub async fn open_new_session(app: AppHandle, path: Option<String>) -> Result<String, String> {
    log::info!("Opening new Claude Code session at path: {:?}", path);

    #[cfg(not(debug_assertions))]
    let _claude_path = find_claude_binary(&app)?;

    #[cfg(debug_assertions)]
    let claude_path = find_claude_binary(&app)?;

    // In production, we can't use std::process::Command directly
    // The user should launch Claude Code through other means or use the execute_claude_code command
    #[cfg(not(debug_assertions))]
    {
        log::error!("Cannot spawn processes directly in production builds");
        return Err("Direct process spawning is not available in production builds. Please use Claude Code directly or use the integrated execution commands.".to_string());
    }

    #[cfg(debug_assertions)]
    {
        let mut cmd = std::process::Command::new(claude_path);

        // If a path is provided, use it; otherwise use current directory
        if let Some(project_path) = path {
            cmd.current_dir(&project_path);
        }

        // Execute the command
        match cmd.spawn() {
            Ok(_) => {
                log::info!("Successfully launched Claude Code");
                Ok("Claude Code session started".to_string())
            }
            Err(e) => {
                log::error!("Failed to launch Claude Code: {}", e);
                Err(format!("Failed to launch Claude Code: {}", e))
            }
        }
    }
}

/// Reads the CLAUDE.md system prompt file
#[tauri::command]
pub async fn get_system_prompt() -> Result<String, String> {
    log::info!("Reading CLAUDE.md system prompt");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let claude_md_path = claude_dir.join("CLAUDE.md");

    if !claude_md_path.exists() {
        log::warn!("CLAUDE.md not found");
        return Ok(String::new());
    }

    fs::read_to_string(&claude_md_path).map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

/// Checks if Claude Code is installed and gets its version
#[tauri::command]
pub async fn check_claude_version(app: AppHandle) -> Result<ClaudeVersionStatus, String> {
    log::info!("Checking Claude Code version");

    let claude_path = match find_claude_binary(&app) {
        Ok(path) => path,
        Err(e) => {
            return Ok(ClaudeVersionStatus {
                is_installed: false,
                version: None,
                output: e,
            });
        }
    };

    // If the selected path is the special sidecar identifier, execute it to get version
    if claude_path == "claude-code" {
        use tauri_plugin_shell::process::CommandEvent;
        
        // Create a temporary directory for the sidecar to run in
        let temp_dir = std::env::temp_dir();
        
        // Create sidecar command with --version flag
        let sidecar_cmd = match app
            .shell()
            .sidecar("claude-code") {
            Ok(cmd) => cmd.args(["--version"]).current_dir(&temp_dir),
            Err(e) => {
                log::error!("Failed to create sidecar command: {}", e);
                return Ok(ClaudeVersionStatus {
                    is_installed: true, // We know it exists, just couldn't create command
                    version: None,
                    output: format!("Using bundled Claude Code sidecar (command creation failed: {})", e),
                });
            }
        };
        
        // Spawn the sidecar and collect output
        match sidecar_cmd.spawn() {
            Ok((mut rx, _child)) => {
                let mut stdout_output = String::new();
                let mut stderr_output = String::new();
                let mut exit_success = false;
                
                // Collect output from the sidecar
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(data) => {
                            let line = String::from_utf8_lossy(&data);
                            stdout_output.push_str(&line);
                        }
                        CommandEvent::Stderr(data) => {
                            let line = String::from_utf8_lossy(&data);
                            stderr_output.push_str(&line);
                        }
                        CommandEvent::Terminated(payload) => {
                            exit_success = payload.code.unwrap_or(-1) == 0;
                            break;
                        }
                        _ => {}
                    }
                }
                
                // Use regex to directly extract version pattern (e.g., "1.0.41")
                let version_regex = Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)").ok();
                
                let version = if let Some(regex) = version_regex {
                    regex.captures(&stdout_output)
                        .and_then(|captures| captures.get(1))
                        .map(|m| m.as_str().to_string())
                } else {
                    None
                };
                
                let full_output = if stderr_output.is_empty() {
                    stdout_output.clone()
                } else {
                    format!("{}\n{}", stdout_output, stderr_output)
                };

                // Check if the output matches the expected format
                let is_valid = stdout_output.contains("(Claude Code)") || stdout_output.contains("Claude Code") || version.is_some();

                return Ok(ClaudeVersionStatus {
                    is_installed: is_valid && exit_success,
                    version,
                    output: full_output.trim().to_string(),
                });
            }
            Err(e) => {
                log::error!("Failed to execute sidecar: {}", e);
                return Ok(ClaudeVersionStatus {
                    is_installed: true, // We know it exists, just couldn't get version
                    version: None,
                    output: format!("Using bundled Claude Code sidecar (version check failed: {})", e),
                });
            }
        }
    }

    use log::debug;
    debug!("Claude path: {}", claude_path);

    // For system installations, try to check version
    let mut cmd = std::process::Command::new(&claude_path);
    cmd.arg("--version");
    
    // On Windows, ensure the command runs without creating a console window
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    let output = cmd.output();

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            
            // Use regex to directly extract version pattern (e.g., "1.0.41")
            let version_regex = Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)").ok();
            
            let version = if let Some(regex) = version_regex {
                regex.captures(&stdout)
                    .and_then(|captures| captures.get(1))
                    .map(|m| m.as_str().to_string())
            } else {
                None
            };
            let full_output = if stderr.is_empty() {
                stdout.clone()
            } else {
                format!("{}\n{}", stdout, stderr)
            };

            // Check if the output matches the expected format
            // Expected format: "1.0.17 (Claude Code)" or similar
            let is_valid = stdout.contains("(Claude Code)") || stdout.contains("Claude Code");

            Ok(ClaudeVersionStatus {
                is_installed: is_valid && output.status.success(),
                version,
                output: full_output.trim().to_string(),
            })
        }
        Err(e) => {
            log::error!("Failed to run claude command: {}", e);
            Ok(ClaudeVersionStatus {
                is_installed: false,
                version: None,
                output: format!("Command not found: {}", e),
            })
        }
    }
}

/// Saves the CLAUDE.md system prompt file
#[tauri::command]
pub async fn save_system_prompt(content: String) -> Result<String, String> {
    log::info!("Saving CLAUDE.md system prompt");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let claude_md_path = claude_dir.join("CLAUDE.md");

    fs::write(&claude_md_path, content).map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    Ok("System prompt saved successfully".to_string())
}

/// Saves the Claude settings file
#[tauri::command]
pub async fn save_claude_settings(settings: serde_json::Value) -> Result<String, String> {
    log::info!("Saving Claude settings - received data: {}", settings.to_string());

    let claude_dir = get_claude_dir().map_err(|e| {
        let error_msg = format!("Failed to get claude dir: {}", e);
        log::error!("{}", error_msg);
        error_msg
    })?;
    log::info!("Claude directory: {:?}", claude_dir);

    let settings_path = claude_dir.join("settings.json");
    log::info!("Settings path: {:?}", settings_path);

    // Read existing settings to preserve unknown fields
    let mut existing_settings = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path).ok();
        if let Some(content) = content {
            serde_json::from_str::<serde_json::Value>(&content).ok()
        } else {
            None
        }
    } else {
        None
    }.unwrap_or(serde_json::json!({}));

    log::info!("Existing settings: {}", existing_settings);

    // Use settings directly - no wrapper expected from frontend
    let actual_settings = &settings;
    log::info!("Using settings directly: {}", actual_settings);

    // Merge the new settings with existing settings
    // This preserves unknown fields that the app doesn't manage
    if let (Some(existing_obj), Some(new_obj)) = (existing_settings.as_object_mut(), actual_settings.as_object()) {
        for (key, value) in new_obj {
            existing_obj.insert(key.clone(), value.clone());
        }
        log::info!("Merged settings: {}", existing_settings);
    } else {
        // If either is not an object, just use the new settings
        existing_settings = actual_settings.clone();
    }

    // Pretty print the JSON with 2-space indentation
    let json_string = serde_json::to_string_pretty(&existing_settings)
        .map_err(|e| {
            let error_msg = format!("Failed to serialize settings: {}", e);
            log::error!("{}", error_msg);
            error_msg
        })?;

    log::info!("Serialized JSON length: {} characters", json_string.len());

    fs::write(&settings_path, &json_string)
        .map_err(|e| {
            let error_msg = format!("Failed to write settings file: {}", e);
            log::error!("{}", error_msg);
            error_msg
        })?;

    log::info!("Settings saved successfully to: {:?}", settings_path);
    Ok("Settings saved successfully".to_string())
}

/// Updates the thinking mode in settings.json by modifying the MAX_THINKING_TOKENS env variable
#[tauri::command]
pub async fn update_thinking_mode(enabled: bool, tokens: Option<u32>) -> Result<String, String> {
    log::info!("Updating thinking mode: enabled={}, tokens={:?}", enabled, tokens);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.json");

    // Read existing settings
    let mut settings = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Ensure env object exists
    if !settings.is_object() {
        settings = serde_json::json!({});
    }

    let settings_obj = settings.as_object_mut().unwrap();
    if !settings_obj.contains_key("env") {
        settings_obj.insert("env".to_string(), serde_json::json!({}));
    }

    let env_obj = settings_obj.get_mut("env").unwrap().as_object_mut()
        .ok_or("env is not an object")?;

    // Update MAX_THINKING_TOKENS
    if enabled {
        let token_value = tokens.unwrap_or(10000);
        env_obj.insert("MAX_THINKING_TOKENS".to_string(), serde_json::json!(token_value.to_string()));
        log::info!("Set MAX_THINKING_TOKENS to {}", token_value);
    } else {
        env_obj.remove("MAX_THINKING_TOKENS");
        log::info!("Removed MAX_THINKING_TOKENS from env");
    }

    // Also remove the old alwaysThinkingEnabled field if it exists
    // This field conflicts with the standard MAX_THINKING_TOKENS approach
    if settings_obj.contains_key("alwaysThinkingEnabled") {
        settings_obj.remove("alwaysThinkingEnabled");
        log::info!("Removed deprecated alwaysThinkingEnabled field");
    }

    // Write back to file
    let json_string = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, &json_string)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    log::info!("Thinking mode updated successfully");
    Ok(format!("Thinking mode {} successfully", if enabled { "enabled" } else { "disabled" }))
}

/// Recursively finds all CLAUDE.md files in a project directory
#[tauri::command]
pub async fn find_claude_md_files(project_path: String) -> Result<Vec<ClaudeMdFile>, String> {
    log::info!("Finding CLAUDE.md files in project: {}", project_path);

    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err(format!("Project path does not exist: {}", project_path));
    }

    let mut claude_files = Vec::new();
    find_claude_md_recursive(&path, &path, &mut claude_files)?;

    // Sort by relative path
    claude_files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    log::info!("Found {} CLAUDE.md files", claude_files.len());
    Ok(claude_files)
}

/// Helper function to recursively find CLAUDE.md files
fn find_claude_md_recursive(
    current_path: &PathBuf,
    project_root: &PathBuf,
    claude_files: &mut Vec<ClaudeMdFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(current_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", current_path, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip hidden files/directories
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        if path.is_dir() {
            // Skip common directories that shouldn't be searched
            if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                if matches!(
                    dir_name,
                    "node_modules" | "target" | ".git" | "dist" | "build" | ".next" | "__pycache__"
                ) {
                    continue;
                }
            }

            find_claude_md_recursive(&path, project_root, claude_files)?;
        } else if path.is_file() {
            // Check if it's a CLAUDE.md file (case insensitive)
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.eq_ignore_ascii_case("CLAUDE.md") {
                    let metadata = fs::metadata(&path)
                        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

                    let relative_path = path
                        .strip_prefix(project_root)
                        .map_err(|e| format!("Failed to get relative path: {}", e))?
                        .to_string_lossy()
                        .to_string();

                    let modified = metadata
                        .modified()
                        .unwrap_or(SystemTime::UNIX_EPOCH)
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    claude_files.push(ClaudeMdFile {
                        relative_path,
                        absolute_path: path.to_string_lossy().to_string(),
                        size: metadata.len(),
                        modified,
                    });
                }
            }
        }
    }

    Ok(())
}

/// Reads a specific CLAUDE.md file by its absolute path
#[tauri::command]
pub async fn read_claude_md_file(file_path: String) -> Result<String, String> {
    log::info!("Reading CLAUDE.md file: {}", file_path);

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Saves a specific CLAUDE.md file by its absolute path
#[tauri::command]
pub async fn save_claude_md_file(file_path: String, content: String) -> Result<String, String> {
    log::info!("Saving CLAUDE.md file: {}", file_path);

    let path = PathBuf::from(&file_path);

    // Ensure the parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok("File saved successfully".to_string())
}
#[tauri::command]
pub async fn set_custom_claude_path(app: AppHandle, custom_path: String) -> Result<(), String> {
    log::info!("Setting custom Claude CLI path: {}", custom_path);
    
    // Validate the path exists and is executable
    let path_buf = PathBuf::from(&custom_path);
    if !path_buf.exists() {
        return Err("File does not exist".to_string());
    }
    
    if !path_buf.is_file() {
        return Err("Path is not a file".to_string());
    }
    
    // Test if it's actually Claude CLI by running --version
    let mut cmd = std::process::Command::new(&custom_path);
    cmd.arg("--version");
    
    // Add CREATE_NO_WINDOW flag on Windows to prevent terminal window popup
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    match cmd.output() {
        Ok(output) => {
            if !output.status.success() {
                return Err("File is not a valid Claude CLI executable".to_string());
            }
        }
        Err(e) => {
            return Err(format!("Failed to test Claude CLI: {}", e));
        }
    }
    
    // Store the custom path in database
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        if let Err(e) = std::fs::create_dir_all(&app_data_dir) {
            return Err(format!("Failed to create app data directory: {}", e));
        }
        
        let db_path = app_data_dir.join("agents.db");
        match rusqlite::Connection::open(&db_path) {
            Ok(conn) => {
                // Create table if it doesn't exist
                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS app_settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )",
                    [],
                ) {
                    return Err(format!("Failed to create settings table: {}", e));
                }
                
                // Store the custom path
                if let Err(e) = conn.execute(
                    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
                    rusqlite::params!["claude_binary_path", custom_path],
                ) {
                    return Err(format!("Failed to store custom Claude path: {}", e));
                }
                
                log::info!("Successfully stored custom Claude CLI path: {}", custom_path);
                Ok(())
            }
            Err(e) => Err(format!("Failed to open database: {}", e)),
        }
    } else {
        Err("Failed to get app data directory".to_string())
    }
}

/// Get current Claude CLI path (custom or auto-detected)
#[tauri::command]
pub async fn get_claude_path(app: AppHandle) -> Result<String, String> {
    log::info!("Getting current Claude CLI path");
    
    // Try to get from database first
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let db_path = app_data_dir.join("agents.db");
        if db_path.exists() {
            if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                if let Ok(stored_path) = conn.query_row(
                    "SELECT value FROM app_settings WHERE key = 'claude_binary_path'",
                    [],
                    |row| row.get::<_, String>(0),
                ) {
                    log::info!("Found stored Claude path: {}", stored_path);
                    return Ok(stored_path);
                }
            }
        }
    }
    
    // Fall back to auto-detection
    match find_claude_binary(&app) {
        Ok(path) => {
            log::info!("Auto-detected Claude path: {}", path);
            Ok(path)
        }
        Err(e) => Err(e),
    }
}

/// Clear custom Claude CLI path and revert to auto-detection
#[tauri::command]
pub async fn clear_custom_claude_path(app: AppHandle) -> Result<(), String> {
    log::info!("Clearing custom Claude CLI path");
    
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let db_path = app_data_dir.join("agents.db");
        if db_path.exists() {
            match rusqlite::Connection::open(&db_path) {
                Ok(conn) => {
                    if let Err(e) = conn.execute(
                        "DELETE FROM app_settings WHERE key = 'claude_binary_path'",
                        [],
                    ) {
                        return Err(format!("Failed to clear custom Claude path: {}", e));
                    }
                    
                    log::info!("Successfully cleared custom Claude CLI path");
                    Ok(())
                }
                Err(e) => Err(format!("Failed to open database: {}", e)),
            }
        } else {
            // Database doesn't exist, nothing to clear
            Ok(())
        }
    } else {
        Err("Failed to get app data directory".to_string())
    }
}
/// 获取当前Claude执行配置
#[tauri::command]
pub async fn get_claude_execution_config(_app: AppHandle) -> Result<ClaudeExecutionConfig, String> {
    let claude_dir = get_claude_dir()
        .map_err(|e| format!("Failed to get Claude directory: {}", e))?;
    let config_file = claude_dir.join("execution_config.json");
    
    if config_file.exists() {
        match fs::read_to_string(&config_file) {
            Ok(content) => {
                match serde_json::from_str::<ClaudeExecutionConfig>(&content) {
                    Ok(config) => {
                        log::info!("Loaded Claude execution config");
                        Ok(config)
                    }
                    Err(e) => {
                        log::warn!("Failed to parse execution config: {}, using default", e);
                        Ok(ClaudeExecutionConfig::default())
                    }
                }
            }
            Err(e) => {
                log::warn!("Failed to read execution config: {}, using default", e);
                Ok(ClaudeExecutionConfig::default())
            }
        }
    } else {
        log::info!("No execution config file found, using default");
        Ok(ClaudeExecutionConfig::default())
    }
}

/// 更新Claude执行配置
#[tauri::command]
pub async fn update_claude_execution_config(
    _app: AppHandle,
    config: ClaudeExecutionConfig,
) -> Result<(), String> {
    let claude_dir = get_claude_dir()
        .map_err(|e| format!("Failed to get Claude directory: {}", e))?;
    let config_file = claude_dir.join("execution_config.json");
    
    let json_string = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
        
    fs::write(&config_file, json_string)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
        
    log::info!("Updated Claude execution config");
    Ok(())
}

/// 重置Claude执行配置为默认值
#[tauri::command]
pub async fn reset_claude_execution_config(app: AppHandle) -> Result<(), String> {
    let config = ClaudeExecutionConfig::default();
    update_claude_execution_config(app, config).await
}

/// 获取当前权限配置
#[tauri::command]
pub async fn get_claude_permission_config(app: AppHandle) -> Result<ClaudePermissionConfig, String> {
    let execution_config = get_claude_execution_config(app).await?;
    Ok(execution_config.permissions)
}

/// 更新权限配置
#[tauri::command]
pub async fn update_claude_permission_config(
    app: AppHandle,
    permission_config: ClaudePermissionConfig,
) -> Result<(), String> {
    let mut execution_config = get_claude_execution_config(app.clone()).await?;
    execution_config.permissions = permission_config;
    update_claude_execution_config(app, execution_config).await
}

/// 获取预设权限配置选项
#[tauri::command]
pub async fn get_permission_presets() -> Result<serde_json::Value, String> {
    let presets = serde_json::json!({
        "development": {
            "name": "开发模式",
            "description": "允许所有开发工具，自动接受编辑",
            "config": ClaudePermissionConfig::development_mode()
        },
        "safe": {
            "name": "安全模式", 
            "description": "只允许读取操作，禁用危险工具",
            "config": ClaudePermissionConfig::safe_mode()
        },
        "interactive": {
            "name": "交互模式",
            "description": "平衡的权限设置，需要确认编辑",
            "config": ClaudePermissionConfig::interactive_mode()
        },
        "legacy": {
            "name": "向后兼容",
            "description": "保持原有的权限跳过行为",
            "config": ClaudePermissionConfig::legacy_mode()
        }
    });
    
    Ok(presets)
}

/// 获取可用工具列表
#[tauri::command]
pub async fn get_available_tools() -> Result<serde_json::Value, String> {
    let tools = serde_json::json!({
        "development_tools": DEVELOPMENT_TOOLS,
        "safe_tools": SAFE_TOOLS,
        "all_tools": ALL_TOOLS
    });
    
    Ok(tools)
}

/// 验证权限配置
#[tauri::command]
pub async fn validate_permission_config(
    config: ClaudePermissionConfig,
) -> Result<serde_json::Value, String> {
    let mut validation_result = serde_json::json!({
        "valid": true,
        "warnings": [],
        "errors": []
    });
    
    // 检查工具列表冲突
    let allowed_set: std::collections::HashSet<_> = config.allowed_tools.iter().collect();
    let disallowed_set: std::collections::HashSet<_> = config.disallowed_tools.iter().collect();
    
    let conflicts: Vec<_> = allowed_set.intersection(&disallowed_set).collect();
    if !conflicts.is_empty() {
        validation_result["valid"] = serde_json::Value::Bool(false);
        validation_result["errors"].as_array_mut().unwrap().push(
            serde_json::json!(format!("工具冲突: {} 同时在允许和禁止列表中", conflicts.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")))
        );
    }
    
    // 检查是否启用了危险跳过模式
    if config.enable_dangerous_skip {
        validation_result["warnings"].as_array_mut().unwrap().push(
            serde_json::json!("已启用危险权限跳过模式，这会绕过所有安全检查")
        );
    }
    
    // 检查读写权限组合
    if config.permission_mode == PermissionMode::ReadOnly && 
       (config.allowed_tools.contains(&"Write".to_string()) || 
        config.allowed_tools.contains(&"Edit".to_string())) {
        validation_result["warnings"].as_array_mut().unwrap().push(
            serde_json::json!("只读模式下允许写入工具可能导致冲突")
        );
    }
    
    Ok(validation_result)
}

