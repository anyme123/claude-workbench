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
