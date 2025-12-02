//! Gemini CLI Integration Module
//!
//! This module provides integration with Google's Gemini CLI,
//! enabling AI-powered code assistance using Gemini models.
//!
//! ## Features
//!
//! - **Session Management**: Execute, cancel, and track Gemini sessions
//! - **Streaming Output**: Real-time JSONL event streaming via stream-json format
//! - **Unified Messages**: Converts Gemini events to ClaudeStreamMessage format
//! - **Multi-Auth Support**: Google OAuth, API Key, and Vertex AI authentication

pub mod config;
pub mod git_ops;
pub mod parser;
pub mod provider;
pub mod session;
pub mod types;

// Re-export process state for main.rs
pub use types::GeminiProcessState;

// Re-export Tauri commands
pub use config::{
    get_gemini_config,
    get_gemini_models,
    update_gemini_config,
    // Session history commands
    get_gemini_session_logs,
    list_gemini_sessions,
    get_gemini_session_detail,
    delete_gemini_session,
};
pub use session::{cancel_gemini, check_gemini_installed, execute_gemini};

// Re-export Gemini Rewind commands
pub use git_ops::{
    get_gemini_prompt_list,
    check_gemini_rewind_capabilities,
    record_gemini_prompt_sent,
    record_gemini_prompt_completed,
    revert_gemini_to_prompt,
};

// Re-export Gemini Provider commands
pub use provider::{
    get_gemini_provider_presets,
    get_current_gemini_provider_config,
    switch_gemini_provider,
    add_gemini_provider_config,
    update_gemini_provider_config,
    delete_gemini_provider_config,
    clear_gemini_provider_config,
    test_gemini_provider_connection,
};
