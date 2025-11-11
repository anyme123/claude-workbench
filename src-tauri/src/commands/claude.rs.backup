use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use super::permission_config::{
    ClaudePermissionConfig, ClaudeExecutionConfig, PermissionMode,
    build_execution_args, DEVELOPMENT_TOOLS, SAFE_TOOLS, ALL_TOOLS
};
// Agent functionality removed
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tauri_plugin_shell::ShellExt;
use regex;

// Windows-specific imports
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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
fn map_model_to_claude_alias(model: &str) -> String {
    match model {
        "sonnet1m" => "sonnet[1m]".to_string(),
        "sonnet" => "sonnet".to_string(),
        // Use 'opus' alias which automatically resolves to latest Opus (Claude 4.1)
        "opus" => "opus".to_string(),
        // Pass through any other model names unchanged (for future compatibility)
        _ => model.to_string(),
    }
}

/// Represents a project in the ~/.claude/projects directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    /// The project ID (derived from the directory name)
    pub id: String,
    /// The original project path (decoded from the directory name)
    pub path: String,
    /// List of session IDs (JSONL file names without extension)
    pub sessions: Vec<String>,
    /// Unix timestamp of the latest activity (session modification or project creation)
    pub created_at: u64,
}

/// Represents a session with its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    /// The session ID (UUID)
    pub id: String,
    /// The project ID this session belongs to
    pub project_id: String,
    /// The project path
    pub project_path: String,
    /// Optional todo data associated with this session
    pub todo_data: Option<serde_json::Value>,
    /// Unix timestamp when the session file was created
    pub created_at: u64,
    /// First user message content (if available)
    pub first_message: Option<String>,
    /// Timestamp of the first user message (if available)
    pub message_timestamp: Option<String>,
    /// Timestamp of the last message in the session (if available) - ISO string
    pub last_message_timestamp: Option<String>,
}

/// Represents a message entry in the JSONL file
#[derive(Debug, Deserialize)]
struct JsonlEntry {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    entry_type: Option<String>,
    message: Option<MessageContent>,
    timestamp: Option<String>,
}

/// Represents the message content
#[derive(Debug, Deserialize)]
struct MessageContent {
    role: Option<String>,
    content: Option<serde_json::Value>,  // 改为 Value 以支持字符串和数组
}

/// Represents the settings from ~/.claude/settings.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSettings {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

impl Default for ClaudeSettings {
    fn default() -> Self {
        Self {
            data: serde_json::json!({}),
        }
    }
}

/// Represents the Claude Code version status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeVersionStatus {
    /// Whether Claude Code is installed and working
    pub is_installed: bool,
    /// The version string if available
    pub version: Option<String>,
    /// The full output from the command
    pub output: String,
}

/// Represents a CLAUDE.md file found in the project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMdFile {
    /// Relative path from the project root
    pub relative_path: String,
    /// Absolute path to the file
    pub absolute_path: String,
    /// File size in bytes
    pub size: u64,
    /// Last modified timestamp
    pub modified: u64,
}

/// Represents a file or directory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    /// The name of the file or directory
    pub name: String,
    /// The full path
    pub path: String,
    /// Whether this is a directory
    pub is_directory: bool,
    /// File size in bytes (0 for directories)
    pub size: u64,
    /// File extension (if applicable)
    pub extension: Option<String>,
}

/// Finds the full path to the claude binary
/// This is necessary because Windows apps may have a limited PATH environment
fn find_claude_binary(app_handle: &AppHandle) -> Result<String, String> {
    crate::claude_binary::find_claude_binary(app_handle)
}

/// Gets the path to the ~/.claude directory
pub fn get_claude_dir() -> Result<PathBuf> {
    let claude_dir = dirs::home_dir()
        .context("Could not find home directory")?
        .join(".claude");
    
    // Ensure the directory exists
    fs::create_dir_all(&claude_dir)
        .context("Failed to create ~/.claude directory")?;
    
    // Return the path directly without canonicalization to avoid permission issues
    // The path is valid since we just created it successfully
    Ok(claude_dir)
}

/// Gets the actual project path by reading the cwd from the first JSONL entry
fn get_project_path_from_sessions(project_dir: &PathBuf) -> Result<String, String> {
    // Try to read any JSONL file in the directory
    let entries = fs::read_dir(project_dir)
        .map_err(|e| format!("Failed to read project directory: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                // Read the first line of the JSONL file
                if let Ok(file) = fs::File::open(&path) {
                    let reader = BufReader::new(file);
                    if let Some(Ok(first_line)) = reader.lines().next() {
                        // Parse the JSON and extract cwd
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&first_line) {
                            if let Some(cwd) = json.get("cwd").and_then(|v| v.as_str()) {
                                // ⚡ 修复：处理双反斜杠路径（JSON 转义）
                                // CC CLI 可能保存为 "C:\\Users\\..." 格式
                                let cleaned_cwd = cwd.replace("\\\\", "\\");
                                
                                // Apply consistent path normalization
                                let normalized_cwd = std::path::Path::new(&cleaned_cwd)
                                    .canonicalize()
                                    .map(|p| {
                                        let path_str = p.to_string_lossy().to_string();
                                        // Remove Windows long path prefix for cleaner display
                                        if path_str.starts_with("\\\\?\\") {
                                            path_str[4..].to_string()
                                        } else {
                                            path_str
                                        }
                                    })
                                    .unwrap_or_else(|_| cleaned_cwd.clone());
                                return Ok(normalized_cwd);
                            }
                        }
                    }
                }
            }
        }
    }

    Err("Could not determine project path from session files".to_string())
}

/// Encodes a project path to match Claude CLI's encoding scheme
/// Uses single hyphens to separate path components
fn encode_project_path(path: &str) -> String {
    path.replace("\\", "-")
        .replace("/", "-")
        .replace(":", "")
}

/// Decodes a project directory name back to its original path
/// The directory names in ~/.claude/projects are encoded paths
/// DEPRECATED: Use get_project_path_from_sessions instead when possible
fn decode_project_path(encoded: &str) -> String {
    // This is a fallback - the encoding isn't reversible when paths contain hyphens
    // For example: -Users-mufeedvh-dev-jsonl-viewer could be /Users/mufeedvh/dev/jsonl-viewer
    // or /Users/mufeedvh/dev/jsonl/viewer
    let decoded = encoded.replace('-', "/");
    
    // On Windows, ensure we use backslashes for consistency
    #[cfg(target_os = "windows")]
    {
        let mut windows_path = decoded.replace('/', "\\");
        // Remove Windows long path prefix if present
        if windows_path.starts_with("\\\\?\\") {
            windows_path = windows_path[4..].to_string();
        }
        windows_path
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        decoded
    }
}

/// Normalize a path for comparison to detect duplicates
/// This handles case sensitivity, path separators, and trailing slashes
fn normalize_path_for_comparison(path: &str) -> String {
    let mut normalized = path.to_lowercase();
    
    // ⚡ 修复：先处理双反斜杠（JSON 转义格式）
    // CC CLI 可能保存为 "C:\\Users\\..." 格式
    normalized = normalized.replace("\\\\", "\\");
    
    // Remove Windows long path prefix if present (\\?\ or \\?\UNC\)
    if normalized.starts_with("\\\\?\\") {
        normalized = normalized[4..].to_string();
    } else if normalized.starts_with("\\\\?\\unc\\") {
        normalized = format!("\\\\{}", &normalized[8..]);
    }
    
    // Normalize path separators - convert all to forward slashes for comparison
    normalized = normalized.replace('\\', "/");
    
    // Remove trailing slash if present
    if normalized.ends_with('/') && normalized.len() > 1 {
        normalized.pop();
    }
    
    // Remove leading slash for relative path comparison
    if normalized.starts_with('/') {
        normalized = normalized[1..].to_string();
    }
    
    // Handle Windows drive letters - convert C:/ to c
    if normalized.len() >= 2 && normalized.chars().nth(1) == Some(':') {
        if normalized.len() == 2 {
            normalized = normalized.chars().take(1).collect();
        } else if normalized.chars().nth(2) == Some('/') {
            let drive = normalized.chars().take(1).collect::<String>();
            let rest = &normalized[3..];
            normalized = if rest.is_empty() { 
                drive 
            } else { 
                format!("{}/{}", drive, rest)
            };
        }
    }
    
    normalized
}

/// Extracts the first valid user message from a JSONL file
fn extract_first_user_message(jsonl_path: &PathBuf) -> (Option<String>, Option<String>) {
    let file = match fs::File::open(jsonl_path) {
        Ok(file) => file,
        Err(_) => return (None, None),
    };

    let reader = BufReader::new(file);

    for line in reader.lines() {
        if let Ok(line) = line {
            if let Ok(entry) = serde_json::from_str::<JsonlEntry>(&line) {
                if let Some(message) = entry.message {
                    if message.role.as_deref() == Some("user") {
                        if let Some(content_value) = message.content {
                            // 提取文本内容（支持字符串和数组两种格式）
                            let mut extracted_text = String::new();
                            let mut has_text_content = false;
                            
                            if let Some(text) = content_value.as_str() {
                                // 字符串格式
                                extracted_text = text.to_string();
                                has_text_content = !text.trim().is_empty();
                            } else if let Some(arr) = content_value.as_array() {
                                // 数组格式（可能包含 text 和 tool_result）
                                for item in arr {
                                    if let Some(item_type) = item.get("type").and_then(|t| t.as_str()) {
                                        if item_type == "text" {
                                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                                extracted_text.push_str(text);
                                                has_text_content = true;
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // 必须有文本内容
                            if !has_text_content {
                                continue;
                            }
                            
                            // Skip if it contains the caveat message
                            if extracted_text.contains("Caveat: The messages below were generated by the user while running local commands") {
                                continue;
                            }

                            // Skip if it starts with command tags
                            if extracted_text.starts_with("<command-name>")
                                || extracted_text.starts_with("<local-command-stdout>")
                            {
                                continue;
                            }

                            // Skip Warmup messages (auto-sent on session start)
                            if extracted_text.contains("Warmup") {
                                continue;
                            }

                            // Found a valid user message
                            return (Some(extracted_text), entry.timestamp);
                        }
                    }
                }
            }
        }
    }

    (None, None)
}

/// Extracts the timestamp of the last message (user or assistant) from a JSONL file
fn extract_last_message_timestamp(jsonl_path: &PathBuf) -> Option<String> {
    let file = match fs::File::open(jsonl_path) {
        Ok(file) => file,
        Err(_) => return None,
    };

    let reader = BufReader::new(file);
    let mut last_timestamp: Option<String> = None;

    for line in reader.lines() {
        if let Ok(line) = line {
            if let Ok(entry) = serde_json::from_str::<JsonlEntry>(&line) {
                // Check if this entry has a message (user or assistant)
                if entry.message.is_some() {
                    // Update last_timestamp if this entry has a timestamp
                    if let Some(timestamp) = entry.timestamp {
                        last_timestamp = Some(timestamp);
                    }
                }
            }
        }
    }

    last_timestamp
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
            if let Some((node_path, script_path)) = resolve_cmd_wrapper_tokio(program) {
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

    tokio_cmd
}

/// Windows-specific: Resolve .cmd wrapper to actual Node.js script path (for tokio)
#[cfg(target_os = "windows")]
fn resolve_cmd_wrapper_tokio(cmd_path: &str) -> Option<(String, String)> {
    use std::fs;
    use std::path::PathBuf;

    log::debug!("Attempting to resolve .cmd wrapper: {}", cmd_path);

    // Read the .cmd file content
    let content = fs::read_to_string(cmd_path).ok()?;

    // Parse the .cmd file to find the actual Node.js script
    for line in content.lines() {
        if line.contains(".js") && (line.contains("node.exe") || line.contains("\"node\"")) {
            // Extract the script path - look for pattern like "%~dp0\path\to\script.js"
            if let Some(start) = line.find("\"%~dp0") {
                if let Some(end) = line[start..].find(".js\"") {
                    let script_relative = &line[start + 7..start + end + 3];

                    // Convert %~dp0 to absolute path
                    if let Some(parent) = std::path::Path::new(cmd_path).parent() {
                        let script_path = parent.join(script_relative).to_string_lossy().to_string();

                        // Verify the script exists
                        if PathBuf::from(&script_path).exists() {
                            log::debug!("Resolved .cmd wrapper to script: {}", script_path);
                            return Some(("node".to_string(), script_path));
                        }
                    }
                }
            }
        }
    }

    log::debug!("Failed to resolve .cmd wrapper");
    None
}

#[cfg(not(target_os = "windows"))]
fn resolve_cmd_wrapper_tokio(_cmd_path: &str) -> Option<(String, String)> {
    None
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

    // On Windows, ensure the command runs without creating a console window
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    // On Unix-like systems, create a new process group
    // This allows us to kill the entire process tree with a single signal
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0); // Create new process group, process becomes group leader
    }

    Ok(cmd)
}


#[tauri::command]
pub async fn list_projects() -> Result<Vec<Project>, String> {
    log::info!("Listing projects from ~/.claude/projects");

    let mut all_projects = Vec::new();

    // Get Windows projects
    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let projects_dir = claude_dir.join("projects");
    let hidden_projects_file = claude_dir.join("hidden_projects.json");

    // Read hidden projects list
    let hidden_projects: Vec<String> = if hidden_projects_file.exists() {
        let content = fs::read_to_string(&hidden_projects_file)
            .map_err(|e| format!("Failed to read hidden projects file: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| Vec::new())
    } else {
        Vec::new()
    };

    if projects_dir.exists() {
        // Read all directories in the Windows projects folder
        let entries = fs::read_dir(&projects_dir)
            .map_err(|e| format!("Failed to read projects directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                let dir_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .ok_or_else(|| "Invalid directory name".to_string())?;

                // Skip hidden projects
                if hidden_projects.contains(&dir_name.to_string()) {
                    log::debug!("Skipping hidden project: {}", dir_name);
                    continue;
                }

                // Get directory creation time
                let metadata = fs::metadata(&path)
                    .map_err(|e| format!("Failed to read directory metadata: {}", e))?;

                let created_at = metadata
                    .created()
                    .or_else(|_| metadata.modified())
                    .unwrap_or(SystemTime::UNIX_EPOCH)
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                // Get the actual project path from JSONL files
                let project_path = match get_project_path_from_sessions(&path) {
                    Ok(path) => path,
                    Err(e) => {
                        log::warn!("Failed to get project path from sessions for {}: {}, falling back to decode", dir_name, e);
                        decode_project_path(dir_name)
                    }
                };

                // List all JSONL files (sessions) in this project directory and find latest activity
                // 🔧 FIX: Only count sessions with valid first_message (non-empty user messages)
                let mut sessions = Vec::new();
                let mut latest_activity = created_at; // Default to project creation time

                if let Ok(session_entries) = fs::read_dir(&path) {
                    for session_entry in session_entries.flatten() {
                        let session_path = session_entry.path();
                        if session_path.is_file()
                            && session_path.extension().and_then(|s| s.to_str()) == Some("jsonl")
                        {
                            if let Some(session_id) = session_path.file_stem().and_then(|s| s.to_str())
                            {
                                // 🔧 CHECK: Only include sessions with valid first_message
                                let (first_message, _) = extract_first_user_message(&session_path);
                                if first_message.is_some() {
                                    sessions.push(session_id.to_string());

                                    // Check the modification time of this session file
                                    if let Ok(session_metadata) = fs::metadata(&session_path) {
                                        let session_modified = session_metadata
                                            .modified()
                                            .unwrap_or(SystemTime::UNIX_EPOCH)
                                            .duration_since(SystemTime::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs();

                                        // Update latest activity if this session is newer
                                        if session_modified > latest_activity {
                                            latest_activity = session_modified;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                all_projects.push(Project {
                    id: dir_name.to_string(),
                    path: project_path,
                    sessions,
                    created_at: latest_activity, // Use latest activity time instead of creation time
                });
            }
        }
    } else {
        log::warn!("Windows projects directory does not exist: {:?}", projects_dir);
    }


    // Remove duplicate projects based on normalized paths and merge sessions
    let mut unique_projects_map: std::collections::HashMap<String, Project> = std::collections::HashMap::new();
    let original_count = all_projects.len();
    
    for project in all_projects {
        // Normalize the path for comparison (convert to lowercase, normalize separators)
        let normalized_path = normalize_path_for_comparison(&project.path);
        
        match unique_projects_map.get_mut(&normalized_path) {
            Some(existing_project) => {
                // Merge sessions from duplicate project
                log::debug!("Merging duplicate project with path: {} (existing: {}, new: {})", 
                    project.path, existing_project.id, project.id);
                
                // Merge sessions - avoid duplicates
                let mut new_sessions = project.sessions;
                for session in new_sessions.drain(..) {
                    if !existing_project.sessions.contains(&session) {
                        existing_project.sessions.push(session);
                    }
                }
                
                // Update to the latest activity time
                if project.created_at > existing_project.created_at {
                    existing_project.created_at = project.created_at;
                }
                
                // Choose the better project ID: prefer shorter, more canonical directory names
                // This helps consolidate projects that were created with different path encodings
                let should_update_id = 
                    // Prefer shorter project IDs (usually more canonical)
                    project.id.len() < existing_project.id.len() ||
                    // Prefer IDs without consecutive dashes (better encoding)
                    (project.id.len() == existing_project.id.len() && 
                     !project.id.contains("--") && existing_project.id.contains("--")) ||
                    // Prefer mixed case over all lowercase (original casing)
                    (project.id.len() == existing_project.id.len() && 
                     project.id.chars().any(|c| c.is_uppercase()) && 
                     existing_project.id.chars().all(|c| !c.is_uppercase()));
                
                if should_update_id {
                    log::debug!("Updating project ID from '{}' to '{}'", existing_project.id, project.id);
                    existing_project.id = project.id;
                }
            }
            None => {
                // First time seeing this path
                unique_projects_map.insert(normalized_path, project);
            }
        }
    }
    
    // Convert map back to vector and remove duplicate sessions within each project
    let mut unique_projects: Vec<Project> = unique_projects_map.into_values()
        .map(|mut project| {
            // Remove duplicate sessions within the project
            let mut unique_sessions = std::collections::HashSet::new();
            project.sessions.retain(|session| unique_sessions.insert(session.clone()));
            project
        })
        .collect();

    // Sort projects by latest activity time (most recently active first)
    unique_projects.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    log::info!("Found {} unique projects (filtered {} hidden, {} duplicates)", 
        unique_projects.len(), 
        hidden_projects.len(),
        original_count - unique_projects.len()
    );
    Ok(unique_projects)
}

/// Gets sessions for a specific project
#[tauri::command]
pub async fn get_project_sessions(project_id: String) -> Result<Vec<Session>, String> {
    log::info!("Getting sessions for project: {}", project_id);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let project_dir = claude_dir.join("projects").join(&project_id);
    let todos_dir = claude_dir.join("todos");

    if !project_dir.exists() {
        return Err(format!("Project directory not found: {}", project_id));
    }

    // Get the actual project path from JSONL files
    let project_path = match get_project_path_from_sessions(&project_dir) {
        Ok(path) => path,
        Err(e) => {
            log::warn!(
                "Failed to get project path from sessions for {}: {}, falling back to decode",
                project_id,
                e
            );
            decode_project_path(&project_id)
        }
    };

    let mut sessions = Vec::new();

    // Read all JSONL files in the project directory
    let entries = fs::read_dir(&project_dir)
        .map_err(|e| format!("Failed to read project directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            if let Some(session_id) = path.file_stem().and_then(|s| s.to_str()) {
                // Get file creation time
                let metadata = fs::metadata(&path)
                    .map_err(|e| format!("Failed to read file metadata: {}", e))?;

                let created_at = metadata
                    .created()
                    .or_else(|_| metadata.modified())
                    .unwrap_or(SystemTime::UNIX_EPOCH)
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                // Extract first user message and timestamp
                let (first_message, message_timestamp) = extract_first_user_message(&path);

                // Extract last message timestamp (any message, user or assistant)
                let last_message_timestamp = extract_last_message_timestamp(&path);

                // Try to load associated todo data
                let todo_path = todos_dir.join(format!("{}.json", session_id));
                let todo_data = if todo_path.exists() {
                    fs::read_to_string(&todo_path)
                        .ok()
                        .and_then(|content| serde_json::from_str(&content).ok())
                } else {
                    None
                };

                sessions.push(Session {
                    id: session_id.to_string(),
                    project_id: project_id.clone(),
                    project_path: project_path.clone(),
                    todo_data,
                    created_at,
                    first_message,
                    message_timestamp,
                    last_message_timestamp,
                });
            }
        }
    }

    // Sort sessions by creation time (newest first)
    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    log::info!(
        "Found {} sessions for project {}",
        sessions.len(),
        project_id
    );
    Ok(sessions)
}

/// Deletes a session and all its associated data
#[tauri::command]
pub async fn delete_session(
    session_id: String,
    project_id: String,
) -> Result<String, String> {
    log::info!("Deleting session {} from project {}", session_id, project_id);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;

    // Delete the session JSONL file
    let session_file = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    if session_file.exists() {
        fs::remove_file(&session_file)
            .map_err(|e| format!("Failed to delete session file: {}", e))?;
        log::info!("Deleted session file: {:?}", session_file);
    } else {
        log::warn!("Session file not found: {:?}", session_file);
    }

    // Delete the associated TODO file if it exists
    let todo_file = claude_dir
        .join("todos")
        .join(format!("{}.json", session_id));

    if todo_file.exists() {
        fs::remove_file(&todo_file)
            .map_err(|e| format!("Failed to delete TODO file: {}", e))?;
        log::info!("Deleted TODO file: {:?}", todo_file);
    }

    // Delete the associated git records file if it exists
    let git_records_file = claude_dir
        .join("sessions")
        .join(&project_id)
        .join(format!("{}.git-records.json", session_id));

    if git_records_file.exists() {
        fs::remove_file(&git_records_file)
            .map_err(|e| format!("Failed to delete git records file: {}", e))?;
        log::info!("Deleted git records file: {:?}", git_records_file);
    }

    Ok(format!("Successfully deleted session: {}", session_id))
}

/// Deletes multiple sessions in batch
#[tauri::command]
pub async fn delete_sessions_batch(
    session_ids: Vec<String>,
    project_id: String,
) -> Result<String, String> {
    log::info!("Batch deleting {} sessions from project {}", session_ids.len(), project_id);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let mut deleted_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();

    for session_id in &session_ids {
        let mut session_deleted = false;

        // Delete the session JSONL file
        let session_file = claude_dir
            .join("projects")
            .join(&project_id)
            .join(format!("{}.jsonl", session_id));

        if session_file.exists() {
            match fs::remove_file(&session_file) {
                Ok(_) => {
                    log::info!("Deleted session file: {:?}", session_file);
                    session_deleted = true;
                }
                Err(e) => {
                    let error_msg = format!("Failed to delete session file {}: {}", session_id, e);
                    log::error!("{}", error_msg);
                    errors.push(error_msg);
                    failed_count += 1;
                    continue;
                }
            }
        }

        // Delete the associated TODO file if it exists
        let todo_file = claude_dir
            .join("todos")
            .join(format!("{}.json", session_id));

        if todo_file.exists() {
            if let Err(e) = fs::remove_file(&todo_file) {
                log::warn!("Failed to delete TODO file for {}: {}", session_id, e);
            } else {
                log::info!("Deleted TODO file: {:?}", todo_file);
            }
        }

        // Delete the associated git records file if it exists
        let git_records_file = claude_dir
            .join("sessions")
            .join(&project_id)
            .join(format!("{}.git-records.json", session_id));

        if git_records_file.exists() {
            if let Err(e) = fs::remove_file(&git_records_file) {
                log::warn!("Failed to delete git records file for {}: {}", session_id, e);
            } else {
                log::info!("Deleted git records file: {:?}", git_records_file);
            }
        }

        if session_deleted {
            deleted_count += 1;
        }
    }

    if failed_count > 0 {
        Err(format!(
            "Batch delete completed with errors: {} deleted, {} failed. Errors: {}",
            deleted_count,
            failed_count,
            errors.join("; ")
        ))
    } else {
        Ok(format!("Successfully deleted {} sessions", deleted_count))
    }
}

/// Removes a project from the project list (without deleting files)
#[tauri::command]
pub async fn delete_project(project_id: String) -> Result<String, String> {
    log::info!("Removing project from list: {}", project_id);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let hidden_projects_file = claude_dir.join("hidden_projects.json");
    
    // Read existing hidden projects or create empty list
    let mut hidden_projects: Vec<String> = if hidden_projects_file.exists() {
        let content = fs::read_to_string(&hidden_projects_file)
            .map_err(|e| format!("Failed to read hidden projects file: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| Vec::new())
    } else {
        Vec::new()
    };

    // Add project to hidden list if not already present
    if !hidden_projects.contains(&project_id) {
        hidden_projects.push(project_id.clone());
        
        // Save updated hidden projects list
        let content = serde_json::to_string_pretty(&hidden_projects)
            .map_err(|e| format!("Failed to serialize hidden projects: {}", e))?;
        fs::write(&hidden_projects_file, content)
            .map_err(|e| format!("Failed to write hidden projects file: {}", e))?;
    }

    let result_msg = format!("Project '{}' has been removed from the list (files are preserved)", project_id);
    log::info!("{}", result_msg);
    
    Ok(result_msg)
}

/// Restores a project to the project list
#[tauri::command]
pub async fn restore_project(project_id: String) -> Result<String, String> {
    log::info!("Restoring project to list: {}", project_id);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let hidden_projects_file = claude_dir.join("hidden_projects.json");
    
    // Read existing hidden projects
    let mut hidden_projects: Vec<String> = if hidden_projects_file.exists() {
        let content = fs::read_to_string(&hidden_projects_file)
            .map_err(|e| format!("Failed to read hidden projects file: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| Vec::new())
    } else {
        return Err("No hidden projects found".to_string());
    };

    // Remove project from hidden list
    if let Some(pos) = hidden_projects.iter().position(|x| x == &project_id) {
        hidden_projects.remove(pos);
        
        // Save updated hidden projects list
        let content = serde_json::to_string_pretty(&hidden_projects)
            .map_err(|e| format!("Failed to serialize hidden projects: {}", e))?;
        fs::write(&hidden_projects_file, content)
            .map_err(|e| format!("Failed to write hidden projects file: {}", e))?;

        let result_msg = format!("Project '{}' has been restored to the list", project_id);
        log::info!("{}", result_msg);
        Ok(result_msg)
    } else {
        Err(format!("Project '{}' is not in the hidden list", project_id))
    }
}

/// Permanently delete a project from the file system with intelligent directory detection
#[tauri::command]
pub async fn delete_project_permanently(project_id: String) -> Result<String, String> {
    log::info!("Permanently deleting project: {}", project_id);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let projects_dir = claude_dir.join("projects");
    let project_dir = projects_dir.join(&project_id);
    
    let mut actual_project_dir = None;
    let mut actual_project_id = project_id.clone();
    
    // Check if the project directory exists directly
    if project_dir.exists() {
        actual_project_dir = Some(project_dir);
    } else {
        // Try to find the actual directory with intelligent matching
        if let Ok(entries) = fs::read_dir(&projects_dir) {
            let target_normalized_path = normalize_path_for_comparison(&decode_project_path(&project_id));
            
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Some(dir_name) = entry.file_name().to_str() {
                        let candidate_path = match get_project_path_from_sessions(&entry.path()) {
                            Ok(path) => path,
                            Err(_) => decode_project_path(dir_name),
                        };
                        
                        if normalize_path_for_comparison(&candidate_path) == target_normalized_path {
                            actual_project_dir = Some(entry.path());
                            actual_project_id = dir_name.to_string();
                            log::info!("Found actual project directory: {} -> {}", project_id, actual_project_id);
                            break;
                        }
                    }
                }
            }
        }
    }
    
    // Check if we found a directory to delete
    let dir_to_delete = actual_project_dir.ok_or_else(|| {
        if project_id.contains("--") && !project_id.contains("---") {
            format!("项目目录不存在。可能已被手动删除，或使用了不同的编码格式。原始ID: {}", project_id)
        } else {
            format!("项目目录不存在: {:?}", projects_dir.join(&project_id))
        }
    })?;
    
    // Remove the project directory and all its contents
    fs::remove_dir_all(&dir_to_delete)
        .map_err(|e| format!("Failed to delete project directory: {}", e))?;
    
    // Remove all variants from hidden projects list (both original and actual IDs)
    let hidden_projects_file = claude_dir.join("hidden_projects.json");
    if hidden_projects_file.exists() {
        let mut hidden_projects: Vec<String> = {
            let content = fs::read_to_string(&hidden_projects_file)
                .map_err(|e| format!("Failed to read hidden projects file: {}", e))?;
            serde_json::from_str(&content).unwrap_or_else(|_| Vec::new())
        };
        
        // Remove both original and actual project IDs from hidden list
        let original_len = hidden_projects.len();
        hidden_projects.retain(|id| id != &project_id && id != &actual_project_id);
        
        if hidden_projects.len() != original_len {
            // Save updated list
            let content = serde_json::to_string_pretty(&hidden_projects)
                .map_err(|e| format!("Failed to serialize hidden projects: {}", e))?;
            fs::write(&hidden_projects_file, content)
                .map_err(|e| format!("Failed to write hidden projects file: {}", e))?;
            
            log::info!("Removed project from hidden list: {} (and variants)", project_id);
        }
    }
    
    let result_msg = if actual_project_id != project_id {
        format!("项目 '{}' (实际目录: '{}') 已永久删除", project_id, actual_project_id)
    } else {
        format!("项目 '{}' 已永久删除", project_id)
    };
    
    log::info!("{}", result_msg);
    
    Ok(result_msg)
}

/// Lists all hidden projects with intelligent directory existence check
#[tauri::command]
pub async fn list_hidden_projects() -> Result<Vec<String>, String> {
    log::info!("Listing hidden projects with directory validation");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let hidden_projects_file = claude_dir.join("hidden_projects.json");
    let projects_dir = claude_dir.join("projects");
    
    let mut hidden_projects: Vec<String> = if hidden_projects_file.exists() {
        let content = fs::read_to_string(&hidden_projects_file)
            .map_err(|e| format!("Failed to read hidden projects file: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| Vec::new())
    } else {
        Vec::new()
    };

    // Filter out hidden projects whose directories no longer exist
    // and find actual existing project directories for each hidden project
    let mut validated_hidden_projects = Vec::new();
    let mut projects_to_remove = Vec::new();
    
    for hidden_project_id in &hidden_projects {
        let project_dir = projects_dir.join(hidden_project_id);
        
        if project_dir.exists() {
            // Direct match found
            validated_hidden_projects.push(hidden_project_id.clone());
            log::debug!("Hidden project directory exists: {}", hidden_project_id);
        } else {
            // Try to find alternative formats (e.g., single vs double dash)
            let mut found_alternative = false;
            
            if let Ok(entries) = fs::read_dir(&projects_dir) {
                let normalized_path = if let Ok(path) = get_project_path_from_sessions(&project_dir) {
                    normalize_path_for_comparison(&path)
                } else {
                    normalize_path_for_comparison(&decode_project_path(hidden_project_id))
                };
                
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        if let Some(dir_name) = entry.file_name().to_str() {
                            let candidate_path = match get_project_path_from_sessions(&entry.path()) {
                                Ok(path) => path,
                                Err(_) => decode_project_path(dir_name),
                            };
                            
                            if normalize_path_for_comparison(&candidate_path) == normalized_path {
                                // Found matching project with different encoding
                                validated_hidden_projects.push(dir_name.to_string());
                                found_alternative = true;
                                log::debug!("Found alternative format for hidden project: {} -> {}", hidden_project_id, dir_name);
                                break;
                            }
                        }
                    }
                }
            }
            
            if !found_alternative {
                // No matching directory found - mark for removal from hidden list
                projects_to_remove.push(hidden_project_id.clone());
                log::debug!("Hidden project directory not found, will remove: {}", hidden_project_id);
            }
        }
    }
    
    // Clean up hidden_projects.json if any projects were manually deleted
    if !projects_to_remove.is_empty() {
        hidden_projects.retain(|id| !projects_to_remove.contains(id));
        
        let content = serde_json::to_string_pretty(&hidden_projects)
            .map_err(|e| format!("Failed to serialize hidden projects: {}", e))?;
        fs::write(&hidden_projects_file, content)
            .map_err(|e| format!("Failed to write updated hidden projects file: {}", e))?;
            
        log::info!("Cleaned up {} non-existent hidden projects from list", projects_to_remove.len());
    }

    log::info!("Found {} valid hidden projects", validated_hidden_projects.len());
    
    Ok(validated_hidden_projects)
}

/// Reads the Claude settings file
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
                let version_regex = regex::Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)").ok();
                
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
            let version_regex = regex::Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)").ok();
            
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

/// Loads the JSONL history for a specific session
#[tauri::command]
pub async fn load_session_history(
    session_id: String,
    project_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    log::info!(
        "Loading session history for session: {} in project: {}",
        session_id,
        project_id
    );

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    if !session_path.exists() {
        return Err(format!("Session file not found: {}", session_id));
    }

    // Get file modification time as base timestamp
    let file_metadata = fs::metadata(&session_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let base_time = file_metadata.modified()
        .unwrap_or_else(|_| std::time::SystemTime::now());

    let file =
        fs::File::open(&session_path).map_err(|e| format!("Failed to open session file: {}", e))?;

    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for line in reader.lines() {
        if let Ok(line) = line {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                messages.push(json);
            }
        }
    }

    // Add timestamps to historical messages that don't have them
    let messages_count = messages.len();
    for (i, message) in messages.iter_mut().enumerate() {
        let message_type = message.get("type").and_then(|t| t.as_str()).unwrap_or("");

        // Calculate timestamp for this message (5 second intervals, older messages get earlier timestamps)
        let time_offset = (messages_count - i - 1) as u64 * 5; // 5 seconds between messages
        let message_time = base_time - std::time::Duration::from_secs(time_offset);
        let timestamp_iso = chrono::DateTime::<chrono::Utc>::from(message_time).to_rfc3339();

        // Set appropriate timestamp fields based on message type, only if they don't exist
        match message_type {
            "user" => {
                if !message.get("sentAt").is_some() {
                    message["sentAt"] = serde_json::Value::String(timestamp_iso);
                }
            }
            "assistant" | "system" | "result" => {
                if !message.get("receivedAt").is_some() {
                    message["receivedAt"] = serde_json::Value::String(timestamp_iso);
                }
            }
            _ => {
                // For unknown types, add receivedAt
                if !message.get("receivedAt").is_some() {
                    message["receivedAt"] = serde_json::Value::String(timestamp_iso);
                }
            }
        }
    }

    Ok(messages)
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

    let claude_path = find_claude_binary(&app)?;
    
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

    let claude_path = find_claude_binary(&app)?;
    
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

    let claude_path = find_claude_binary(&app)?;
    
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

/// Lists files and directories in a given path
#[tauri::command]
pub async fn list_directory_contents(directory_path: String) -> Result<Vec<FileEntry>, String> {
    log::info!("Listing directory contents: '{}'", directory_path);

    // Check if path is empty
    if directory_path.trim().is_empty() {
        log::error!("Directory path is empty or whitespace");
        return Err("Directory path cannot be empty".to_string());
    }

    let path = PathBuf::from(&directory_path);
    log::debug!("Resolved path: {:?}", path);

    if !path.exists() {
        log::error!("Path does not exist: {:?}", path);
        return Err(format!("Path does not exist: {}", directory_path));
    }

    if !path.is_dir() {
        log::error!("Path is not a directory: {:?}", path);
        return Err(format!("Path is not a directory: {}", directory_path));
    }

    let mut entries = Vec::new();

    let dir_entries =
        fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in dir_entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        // Skip hidden files/directories unless they are .claude directories
        if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') && name != ".claude" {
                continue;
            }
        }

        let name = entry_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let extension = if metadata.is_file() {
            entry_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_string())
        } else {
            None
        };

        entries.push(FileEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            size: metadata.len(),
            extension,
        });
    }

    // Sort: directories first, then files, alphabetically within each group
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Search for files and directories matching a pattern
#[tauri::command]
pub async fn search_files(base_path: String, query: String) -> Result<Vec<FileEntry>, String> {
    log::info!("Searching files in '{}' for: '{}'", base_path, query);

    // Check if path is empty
    if base_path.trim().is_empty() {
        log::error!("Base path is empty or whitespace");
        return Err("Base path cannot be empty".to_string());
    }

    // Check if query is empty
    if query.trim().is_empty() {
        log::warn!("Search query is empty, returning empty results");
        return Ok(Vec::new());
    }

    let path = PathBuf::from(&base_path);
    log::debug!("Resolved search base path: {:?}", path);

    if !path.exists() {
        log::error!("Base path does not exist: {:?}", path);
        return Err(format!("Path does not exist: {}", base_path));
    }

    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    search_files_recursive(&path, &path, &query_lower, &mut results, 0)?;

    // Sort by relevance: exact matches first, then by name
    results.sort_by(|a, b| {
        let a_exact = a.name.to_lowercase() == query_lower;
        let b_exact = b.name.to_lowercase() == query_lower;

        match (a_exact, b_exact) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    // Limit results to prevent overwhelming the UI
    results.truncate(50);

    Ok(results)
}

fn search_files_recursive(
    current_path: &PathBuf,
    base_path: &PathBuf,
    query: &str,
    results: &mut Vec<FileEntry>,
    depth: usize,
) -> Result<(), String> {
    // Limit recursion depth to prevent excessive searching
    if depth > 5 || results.len() >= 50 {
        return Ok(());
    }

    let entries = fs::read_dir(current_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", current_path, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();

        // Skip hidden files/directories
        if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }

            // Check if name matches query
            if name.to_lowercase().contains(query) {
                let metadata = entry
                    .metadata()
                    .map_err(|e| format!("Failed to read metadata: {}", e))?;

                let extension = if metadata.is_file() {
                    entry_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_string())
                } else {
                    None
                };

                results.push(FileEntry {
                    name: name.to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: metadata.is_dir(),
                    size: metadata.len(),
                    extension,
                });
            }
        }

        // Recurse into directories
        if entry_path.is_dir() {
            // Skip common directories that shouldn't be searched
            if let Some(dir_name) = entry_path.file_name().and_then(|n| n.to_str()) {
                if matches!(
                    dir_name,
                    "node_modules" | "target" | ".git" | "dist" | "build" | ".next" | "__pycache__"
                ) {
                    continue;
                }
            }

            search_files_recursive(&entry_path, base_path, query, results, depth + 1)?;
        }
    }

    Ok(())
}

/// Gets hooks configuration from settings at specified scope
#[tauri::command]
pub async fn get_hooks_config(scope: String, project_path: Option<String>) -> Result<serde_json::Value, String> {
    log::info!("Getting hooks config for scope: {}, project: {:?}", scope, project_path);

    let settings_path = match scope.as_str() {
        "user" => {
            get_claude_dir()
                .map_err(|e| e.to_string())?
                .join("settings.json")
        },
        "project" => {
            let path = project_path.ok_or("Project path required for project scope")?;
            PathBuf::from(path).join(".claude").join("settings.json")
        },
        "local" => {
            let path = project_path.ok_or("Project path required for local scope")?;
            PathBuf::from(path).join(".claude").join("settings.local.json")
        },
        _ => return Err("Invalid scope".to_string())
    };

    if !settings_path.exists() {
        log::info!("Settings file does not exist at {:?}, returning empty hooks", settings_path);
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    
    let settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;
    
    Ok(settings.get("hooks").cloned().unwrap_or(serde_json::json!({})))
}

/// Updates hooks configuration in settings at specified scope
#[tauri::command]
pub async fn update_hooks_config(
    scope: String, 
    hooks: serde_json::Value,
    project_path: Option<String>
) -> Result<String, String> {
    log::info!("Updating hooks config for scope: {}, project: {:?}", scope, project_path);

    let settings_path = match scope.as_str() {
        "user" => {
            get_claude_dir()
                .map_err(|e| e.to_string())?
                .join("settings.json")
        },
        "project" => {
            let path = project_path.ok_or("Project path required for project scope")?;
            let claude_dir = PathBuf::from(path).join(".claude");
            fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            claude_dir.join("settings.json")
        },
        "local" => {
            let path = project_path.ok_or("Project path required for local scope")?;
            let claude_dir = PathBuf::from(path).join(".claude");
            fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            claude_dir.join("settings.local.json")
        },
        _ => return Err("Invalid scope".to_string())
    };

    // Read existing settings or create new
    let mut settings = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Update hooks section
    settings["hooks"] = hooks;

    // Write back with pretty formatting
    let json_string = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    fs::write(&settings_path, json_string)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok("Hooks configuration updated successfully".to_string())
}

/// Validates a hook command by dry-running it
#[tauri::command]
pub async fn validate_hook_command(command: String) -> Result<serde_json::Value, String> {
    log::info!("Validating hook command syntax");

    // Validate syntax without executing
    let mut cmd = std::process::Command::new("bash");
    cmd.arg("-n") // Syntax check only
       .arg("-c")
       .arg(&command);
    
    // Add CREATE_NO_WINDOW flag on Windows to prevent terminal window popup
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                Ok(serde_json::json!({
                    "valid": true,
                    "message": "Command syntax is valid"
                }))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Ok(serde_json::json!({
                    "valid": false,
                    "message": format!("Syntax error: {}", stderr)
                }))
            }
        }
        Err(e) => Err(format!("Failed to validate command: {}", e))
    }
}

/// Set custom Claude CLI path
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


/// Enhance a prompt using local Claude Code CLI
#[tauri::command]
pub async fn enhance_prompt(
    prompt: String, 
    model: String, 
    context: Option<Vec<String>>, 
    _app: AppHandle
) -> Result<String, String> {
    log::info!("Enhancing prompt using local Claude Code CLI with context");
    
    if prompt.trim().is_empty() {
        return Ok("请输入需要增强的提示词".to_string());
    }

    // 构建会话上下文信息
    let context_section = if let Some(recent_messages) = context {
        if !recent_messages.is_empty() {
            log::info!("Using {} context messages for enhancement", recent_messages.len());
            let context_str = recent_messages.join("\n---\n");
            format!("\n\nRecent conversation context:\n{}\n", context_str)
        } else {
            log::info!("Context provided but empty");
            String::new()
        }
    } else {
        log::info!("No context provided for enhancement");
        String::new()
    };

    // 创建提示词增强的请求
    let enhancement_request = format!(
        "You are a professional prompt optimization assistant, specializing in optimizing user prompts for Claude Code programming assistant.\n\
        \n\
        【Optimization Goals】\n\
        1. Maintain the user's original intent and core requirements\n\
        2. Make the prompt clearer, more specific, and more structured\n\
        3. Add necessary technical details based on conversation context\n\
        4. Use accurate technical terminology and avoid ambiguity\n\
        \n\
        【Optimization Principles】\n\
        - ✅ Keep it technical and practical\n\
        - ✅ Only optimize expression, don't change core requirements\n\
        - ✅ If the user's intent is already clear, minimal adjustment is needed\n\
        - ❌ Don't add role-playing (like \"act as...\")\n\
        - ❌ Don't add excessive politeness or formalities\n\
        - ❌ Don't change the question type (e.g., turn technical questions into analysis reports)\n\
        - ❌ Don't add extra tasks that users didn't request\n\
        {}\
        \n\
        【Output Requirements】\n\
        Return only the optimized prompt in Chinese, without any explanations, comments, or meta-information.\n\
        \n\
        Original prompt:\n{}\n",
        context_section,
        prompt.trim()
    );

    log::info!("Calling Claude Code CLI with stdin input");

    // 尝试找到Claude Code CLI的完整路径
    let claude_path = find_claude_executable().await?;
    
    // 调用 Claude Code CLI，使用stdin输入
    let mut command = tokio::process::Command::new(&claude_path);
    command.args(&[
        "--print",
        "--model", &map_model_to_claude_alias(&model)
    ]);

    // 设置stdin
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    // 在Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
    }

    // 设置工作目录（如果需要）
    if let Some(home_dir) = dirs::home_dir() {
        command.current_dir(home_dir);
    }

    // 确保环境变量正确设置，包括用户环境
    if let Ok(path) = std::env::var("PATH") {
        command.env("PATH", path);
    }
    
    // 添加常见的npm路径到PATH
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let npm_path = std::path::Path::new(&appdata).join("npm");
        if let Some(npm_str) = npm_path.to_str() {
            if let Ok(current_path) = std::env::var("PATH") {
                let new_path = format!("{};{}", current_path, npm_str);
                command.env("PATH", new_path);
            }
        }
    }

    // 启动进程
    let mut child = command
        .spawn()
        .map_err(|e| format!("无法启动Claude Code命令: {}. 请确保Claude Code已正确安装并登录。", e))?;

    // 写入增强请求到stdin
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(enhancement_request.as_bytes()).await
            .map_err(|e| format!("无法写入输入到Claude Code: {}", e))?;
        stdin.shutdown().await
            .map_err(|e| format!("无法关闭stdin: {}", e))?;
    }

    // 等待命令完成并获取输出
    let output = child.wait_with_output().await
        .map_err(|e| format!("等待Claude Code命令完成失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("Claude Code command failed: {}", stderr);
        return Err(format!("Claude Code执行失败: {}", stderr));
    }

    let enhanced_prompt = String::from_utf8_lossy(&output.stdout).trim().to_string();
    
    if enhanced_prompt.is_empty() {
        return Err("Claude Code返回了空的响应".to_string());
    }

    log::info!("Successfully enhanced prompt: {} -> {} chars", prompt.len(), enhanced_prompt.len());
    Ok(enhanced_prompt)
}

/// Enhance a prompt using Gemini CLI with gemini-2.5-pro model
#[tauri::command]
pub async fn enhance_prompt_with_gemini(
    prompt: String, 
    context: Option<Vec<String>>, 
    _app: AppHandle
) -> Result<String, String> {
    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI FUNCTION CALLED ===");
    log::info!("Enhancing prompt using Gemini CLI with gemini-2.5-pro model");
    log::info!("Prompt length: {}", prompt.len());
    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Function called with prompt: {} chars", prompt.len());
    
    if prompt.trim().is_empty() {
        return Ok("请输入需要增强的提示词".to_string());
    }

    // 构建会话上下文信息（与Claude Code版本保持一致）
    let context_section = if let Some(recent_messages) = context {
        if !recent_messages.is_empty() {
            log::info!("Using {} context messages for Gemini enhancement", recent_messages.len());
            let context_str = recent_messages.join("\n---\n");
            format!("\n\nRecent conversation context:\n{}\n", context_str)
        } else {
            log::info!("Context provided but empty");
            String::new()
        }
    } else {
        log::info!("No context provided for Gemini enhancement");
        String::new()
    };

    // 创建与Claude Code版本保持一致的提示词增强请求
    let enhancement_request = format!(
        "You are a professional prompt optimization assistant, specializing in optimizing user prompts for Claude Code programming assistant.\n\
        \n\
        【Optimization Goals】\n\
        1. Maintain the user's original intent and core requirements\n\
        2. Make the prompt clearer, more specific, and more structured\n\
        3. Add necessary technical details based on conversation context\n\
        4. Use accurate technical terminology and avoid ambiguity\n\
        \n\
        【Optimization Principles】\n\
        - ✅ Keep it technical and practical\n\
        - ✅ Only optimize expression, don't change core requirements\n\
        - ✅ If the user's intent is already clear, minimal adjustment is needed\n\
        - ❌ Don't add role-playing (like \"act as...\")\n\
        - ❌ Don't add excessive politeness or formalities\n\
        - ❌ Don't change the question type (e.g., turn technical questions into analysis reports)\n\
        - ❌ Don't add extra tasks that users didn't request\n\
        {}\
        \n\
        【Output Requirements】\n\
        Return only the optimized prompt in Chinese, without any explanations, comments, or meta-information.\n\
        \n\
        Original prompt:\n{}\n",
        context_section,
        prompt.trim()
    );

    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Calling Gemini CLI with non-interactive mode");

    // 尝试找到Gemini CLI的完整路径
    let gemini_path = find_gemini_executable().await?;
    
    // 调用 Gemini CLI，使用stdin输入和非交互模式
    let mut command = tokio::process::Command::new(&gemini_path);
    command.args(&[
        "-m", "gemini-2.5-pro"
    ]);

    // 设置stdin
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    // 在Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
    }

    // 设置工作目录（如果需要）
    if let Some(home_dir) = dirs::home_dir() {
        command.current_dir(home_dir);
    }

    // 确保环境变量正确设置
    if let Ok(path) = std::env::var("PATH") {
        command.env("PATH", path);
    }
    
    // 添加常见的npm路径到PATH（Gemini CLI通常通过npm安装）
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let npm_path = std::path::Path::new(&appdata).join("npm");
        if let Some(npm_str) = npm_path.to_str() {
            if let Ok(current_path) = std::env::var("PATH") {
                let new_path = format!("{};{}", current_path, npm_str);
                command.env("PATH", new_path);
            }
        }
    }

    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Attempting to spawn Gemini CLI process...");

    // 启动进程
    let mut child = command
        .spawn()
        .map_err(|e| format!("无法启动Gemini CLI命令: {}. 请确保Gemini CLI已正确安装并配置。可以运行 'npm install -g @google/gemini-cli' 进行安装。", e))?;

    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Gemini CLI process spawned successfully");

    // 写入增强请求到stdin
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(enhancement_request.as_bytes()).await
            .map_err(|e| format!("无法写入输入到Gemini CLI: {}", e))?;
        stdin.shutdown().await
            .map_err(|e| format!("无法关闭stdin: {}", e))?;
    }

    // 等待命令完成并获取输出
    let output = child.wait_with_output().await
        .map_err(|e| format!("等待Gemini CLI命令完成失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("Gemini CLI command failed: {}", stderr);
        return Err(format!("Gemini CLI执行失败: {}. 请检查您的Google AI API配置。", stderr));
    }

    let enhanced_prompt = String::from_utf8_lossy(&output.stdout).trim().to_string();
    
    if enhanced_prompt.is_empty() {
        return Err("Gemini CLI返回了空的响应".to_string());
    }

    // 清理输出（移除无用的话语和状态信息）
    let mut final_enhanced_prompt = enhanced_prompt.clone();
    
    // 移除常见的无用前缀和后缀
    let unwanted_phrases = [
        "这是优化后的提示词：",
        "优化后的提示词：",
        "这是优化后的提示词",
        "优化后的提示词",
        "以下是优化后的提示词：",
        "以下是优化后的提示词",
        "Loaded cached credentials",
        "Here's the enhanced prompt:",
        "Enhanced prompt:",
        "Optimized prompt:",
    ];
    
    for phrase in &unwanted_phrases {
        final_enhanced_prompt = final_enhanced_prompt.replace(phrase, "");
    }
    
    // 清理空行和多余的空白
    let lines: Vec<&str> = final_enhanced_prompt.lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty() && !line.starts_with("Loaded cached credentials"))
        .collect();
    
    final_enhanced_prompt = lines.join("\n").trim().to_string();
    
    // 移除开头和结尾的引号（如果存在）
    if final_enhanced_prompt.starts_with('"') && final_enhanced_prompt.ends_with('"') {
        final_enhanced_prompt = final_enhanced_prompt[1..final_enhanced_prompt.len()-1].to_string();
    }
    
    // 移除开头和结尾的其他标记
    final_enhanced_prompt = final_enhanced_prompt
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string();
    
    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Successfully enhanced prompt: {} -> {} chars", prompt.len(), final_enhanced_prompt.len());
    log::info!("Enhanced prompt preview: {}...", 
        if final_enhanced_prompt.len() > 100 { 
            &final_enhanced_prompt[..100] 
        } else { 
            &final_enhanced_prompt 
        }
    );

    Ok(final_enhanced_prompt)
}

/// Find Gemini CLI executable in various locations
async fn find_gemini_executable() -> Result<String, String> {
    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Finding Gemini CLI executable...");
    
    // Common locations for Gemini CLI
    let possible_paths = vec![
        "gemini".to_string(),
        "gemini.cmd".to_string(),
        "gemini.exe".to_string(),
    ];

    // Try to find in PATH first
    for path in &possible_paths {
        let mut cmd = tokio::process::Command::new(path);
        cmd.arg("--version");
        
        // 在Windows上隐藏控制台窗口
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
        }
        
        if let Ok(output) = cmd.output().await {
            if output.status.success() {
                log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Found Gemini CLI at: {}", path);
                return Ok(path.clone());
            }
        }
    }

    // Try common Windows npm global locations
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let npm_path = std::path::Path::new(&appdata).join("npm");
        let possible_npm_paths = vec![
            npm_path.join("gemini.cmd"),
            npm_path.join("gemini"),
            npm_path.join("gemini.exe"),
        ];

        for path in possible_npm_paths {
            if path.exists() {
                if let Some(path_str) = path.to_str() {
                    // Test if it works
                    let mut cmd = tokio::process::Command::new(path_str);
                    cmd.arg("--version");
                    
                    // 在Windows上隐藏控制台窗口
                    #[cfg(target_os = "windows")]
                    {
                        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
                    }
                    
                    if let Ok(output) = cmd.output().await {
                        if output.status.success() {
                            log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Found Gemini CLI at: {}", path_str);
                            return Ok(path_str.to_string());
                        }
                    }
                }
            }
        }
    }

    // Try global npm prefix location
    let mut npm_cmd = tokio::process::Command::new("npm");
    npm_cmd.args(&["config", "get", "prefix"]);
    
    // 在Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        npm_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
    }
    
    if let Ok(output) = npm_cmd.output().await {
        if output.status.success() {
            let prefix_string = String::from_utf8_lossy(&output.stdout);
            let prefix = prefix_string.trim();
            let gemini_path = std::path::Path::new(prefix).join("gemini.cmd");
            if gemini_path.exists() {
                if let Some(path_str) = gemini_path.to_str() {
                    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Found Gemini CLI at npm prefix: {}", path_str);
                    return Ok(path_str.to_string());
                }
            }
        }
    }

    Err("无法找到Gemini CLI可执行文件。请确保Gemini CLI已正确安装。您可以运行 'npm install -g @google/gemini-cli' 来安装。".to_string())
}

/// Find Claude Code executable in various locations
async fn find_claude_executable() -> Result<String, String> {
    // Common locations for Claude Code
    let possible_paths = vec![
        "claude".to_string(),
        "claude.cmd".to_string(),
        "claude.exe".to_string(),
    ];

    // Try to find in PATH first
    for path in &possible_paths {
        let mut cmd = tokio::process::Command::new(path);
        cmd.arg("--version");
        
        // 在Windows上隐藏控制台窗口
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
        }
        
        if let Ok(output) = cmd.output().await {
            if output.status.success() {
                log::info!("Found Claude Code at: {}", path);
                return Ok(path.clone());
            }
        }
    }

    // Try common Windows npm global locations
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let npm_path = std::path::Path::new(&appdata).join("npm");
        let possible_npm_paths = vec![
            npm_path.join("claude.cmd"),
            npm_path.join("claude"),
            npm_path.join("claude.exe"),
        ];

        for path in possible_npm_paths {
            if path.exists() {
                if let Some(path_str) = path.to_str() {
                    // Test if it works
                    let mut cmd = tokio::process::Command::new(path_str);
                    cmd.arg("--version");
                    
                    // 在Windows上隐藏控制台窗口
                    #[cfg(target_os = "windows")]
                    {
                        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
                    }
                    
                    if let Ok(output) = cmd.output().await {
                        if output.status.success() {
                            log::info!("Found Claude Code at: {}", path_str);
                            return Ok(path_str.to_string());
                        }
                    }
                }
            }
        }
    }

    // Try global npm prefix location
    let mut npm_cmd = tokio::process::Command::new("npm");
    npm_cmd.args(&["config", "get", "prefix"]);
    
    // 在Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        npm_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
    }
    
    if let Ok(output) = npm_cmd.output().await
    {
        if output.status.success() {
            let prefix_string = String::from_utf8_lossy(&output.stdout);
            let prefix = prefix_string.trim();
            let claude_path = std::path::Path::new(prefix).join("claude.cmd");
            if claude_path.exists() {
                if let Some(path_str) = claude_path.to_str() {
                    log::info!("Found Claude Code at npm prefix: {}", path_str);
                    return Ok(path_str.to_string());
                }
            }
        }
    }

    Err("无法找到Claude Code可执行文件。请确保Claude Code已正确安装。您可以运行 'npm install -g @anthropic-ai/claude-code' 来安装。".to_string())
}

// ==================== 权限管理相关命令 ====================

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

