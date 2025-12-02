//! Gemini CLI Configuration Management
//!
//! Handles Gemini CLI configuration including authentication methods,
//! model selection, and user preferences.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ============================================================================
// Configuration Types
// ============================================================================

/// Gemini authentication method
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum GeminiAuthMethod {
    /// Google OAuth login (recommended, free tier)
    GoogleOauth,
    /// Gemini API Key
    ApiKey,
    /// Google Cloud Vertex AI
    VertexAi,
}

impl Default for GeminiAuthMethod {
    fn default() -> Self {
        Self::GoogleOauth
    }
}

/// Gemini CLI configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiConfig {
    /// Authentication method
    #[serde(default)]
    pub auth_method: GeminiAuthMethod,

    /// Default model to use
    #[serde(default = "default_model")]
    pub default_model: String,

    /// Default approval mode
    #[serde(default = "default_approval_mode")]
    pub approval_mode: String,

    /// API key (for ApiKey auth method)
    pub api_key: Option<String>,

    /// Google Cloud Project ID (for Vertex AI)
    pub google_cloud_project: Option<String>,

    /// Custom environment variables
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
}

fn default_model() -> String {
    "gemini-2.5-pro".to_string()
}

fn default_approval_mode() -> String {
    "auto_edit".to_string()
}

impl Default for GeminiConfig {
    fn default() -> Self {
        Self {
            auth_method: GeminiAuthMethod::default(),
            default_model: default_model(),
            approval_mode: default_approval_mode(),
            api_key: None,
            google_cloud_project: None,
            env: std::collections::HashMap::new(),
        }
    }
}

// ============================================================================
// Configuration File Operations
// ============================================================================

/// Get the Gemini configuration directory (~/.gemini)
pub fn get_gemini_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Failed to get home directory")?;
    Ok(home.join(".gemini"))
}

/// Get the Any Code Gemini configuration path
fn get_anycode_gemini_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Failed to get home directory")?;
    Ok(home.join(".anycode").join("gemini.json"))
}

/// Load Gemini configuration from file
pub fn load_gemini_config() -> Result<GeminiConfig, String> {
    let config_path = get_anycode_gemini_config_path()?;

    if !config_path.exists() {
        return Ok(GeminiConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read Gemini config: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse Gemini config: {}", e))
}

/// Save Gemini configuration to file
pub fn save_gemini_config(config: &GeminiConfig) -> Result<(), String> {
    let config_path = get_anycode_gemini_config_path()?;

    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize Gemini config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write Gemini config: {}", e))
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Get Gemini configuration
#[tauri::command]
pub async fn get_gemini_config() -> Result<GeminiConfig, String> {
    load_gemini_config()
}

/// Update Gemini configuration
#[tauri::command]
pub async fn update_gemini_config(config: GeminiConfig) -> Result<(), String> {
    save_gemini_config(&config)
}

/// Get available Gemini models
#[tauri::command]
pub async fn get_gemini_models() -> Result<Vec<GeminiModelInfo>, String> {
    Ok(vec![
        GeminiModelInfo {
            id: "gemini-2.5-pro".to_string(),
            name: "Gemini 2.5 Pro".to_string(),
            description: "Most capable model with 1M token context".to_string(),
            context_window: 1_000_000,
            is_default: true,
        },
        GeminiModelInfo {
            id: "gemini-2.5-flash".to_string(),
            name: "Gemini 2.5 Flash".to_string(),
            description: "Fast and efficient for simpler tasks".to_string(),
            context_window: 1_000_000,
            is_default: false,
        },
        GeminiModelInfo {
            id: "gemini-2.0-flash-exp".to_string(),
            name: "Gemini 2.0 Flash (Experimental)".to_string(),
            description: "Experimental flash model".to_string(),
            context_window: 1_000_000,
            is_default: false,
        },
    ])
}

/// Gemini model information
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub context_window: u64,
    pub is_default: bool,
}

// ============================================================================
// Environment Variable Helpers
// ============================================================================

/// Build environment variables for Gemini CLI execution
pub fn build_gemini_env(config: &GeminiConfig) -> std::collections::HashMap<String, String> {
    let mut env = config.env.clone();

    // Set authentication environment variables based on auth method
    match config.auth_method {
        GeminiAuthMethod::ApiKey => {
            if let Some(api_key) = &config.api_key {
                env.insert("GEMINI_API_KEY".to_string(), api_key.clone());
            }
        }
        GeminiAuthMethod::VertexAi => {
            if let Some(api_key) = &config.api_key {
                env.insert("GOOGLE_API_KEY".to_string(), api_key.clone());
            }
            if let Some(project) = &config.google_cloud_project {
                env.insert("GOOGLE_CLOUD_PROJECT".to_string(), project.clone());
            }
            env.insert("GOOGLE_GENAI_USE_VERTEXAI".to_string(), "true".to_string());
        }
        GeminiAuthMethod::GoogleOauth => {
            // No additional env vars needed for OAuth
        }
    }

    env
}

// ============================================================================
// Session History Functions
// ============================================================================

use sha2::{Sha256, Digest};
use crate::commands::gemini::types::{GeminiSessionLog, GeminiSessionDetail, GeminiSessionInfo};

/// Generate SHA256 hash for project path (matching Gemini CLI behavior)
pub fn hash_project_path(project_path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(project_path.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Get Gemini session directory for a project
pub fn get_project_session_dir(project_path: &str) -> Result<PathBuf, String> {
    let gemini_dir = get_gemini_dir()?;
    let project_hash = hash_project_path(project_path);
    Ok(gemini_dir.join("tmp").join(project_hash))
}

/// Read logs.json for a project (session index)
pub fn read_session_logs(project_path: &str) -> Result<Vec<GeminiSessionLog>, String> {
    let session_dir = get_project_session_dir(project_path)?;
    let logs_path = session_dir.join("logs.json");

    if !logs_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&logs_path)
        .map_err(|e| format!("Failed to read logs.json: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse logs.json: {}", e))
}

/// List all session files in chats/ directory
pub fn list_session_files(project_path: &str) -> Result<Vec<GeminiSessionInfo>, String> {
    let session_dir = get_project_session_dir(project_path)?;
    let chats_dir = session_dir.join("chats");

    if !chats_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&chats_dir)
        .map_err(|e| format!("Failed to read chats directory: {}", e))?;

    let mut sessions = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let file_name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            // Try to read basic info from file
            if let Ok(detail) = read_session_detail_from_path(&path) {
                let first_message = detail.messages.first()
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                    .map(|s| s.to_string());

                sessions.push(GeminiSessionInfo {
                    session_id: detail.session_id,
                    file_name,
                    start_time: detail.start_time,
                    first_message,
                });
            }
        }
    }

    // Sort by start_time descending (most recent first)
    sessions.sort_by(|a, b| b.start_time.cmp(&a.start_time));

    Ok(sessions)
}

/// Read a complete session detail from chats/session-*.json
pub fn read_session_detail(project_path: &str, session_id: &str) -> Result<GeminiSessionDetail, String> {
    let session_dir = get_project_session_dir(project_path)?;
    let chats_dir = session_dir.join("chats");

    if !chats_dir.exists() {
        return Err("No chats directory found".to_string());
    }

    // Find session file by session_id
    let entries = fs::read_dir(&chats_dir)
        .map_err(|e| format!("Failed to read chats directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Ok(detail) = read_session_detail_from_path(&path) {
                if detail.session_id == session_id {
                    return Ok(detail);
                }
            }
        }
    }

    Err(format!("Session {} not found", session_id))
}

/// Helper function to read session detail from a specific file path
fn read_session_detail_from_path(path: &PathBuf) -> Result<GeminiSessionDetail, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session file: {}", e))
}

// ============================================================================
// Tauri Commands for Session History
// ============================================================================

/// Get session logs for a project
#[tauri::command]
pub async fn get_gemini_session_logs(project_path: String) -> Result<Vec<GeminiSessionLog>, String> {
    read_session_logs(&project_path)
}

/// List all sessions for a project
#[tauri::command]
pub async fn list_gemini_sessions(project_path: String) -> Result<Vec<GeminiSessionInfo>, String> {
    list_session_files(&project_path)
}

/// Get detailed session information
#[tauri::command]
pub async fn get_gemini_session_detail(
    project_path: String,
    session_id: String,
) -> Result<GeminiSessionDetail, String> {
    read_session_detail(&project_path, &session_id)
}
