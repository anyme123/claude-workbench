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
pub mod parser;
pub mod session;
pub mod types;

// Re-export process state for main.rs
pub use types::GeminiProcessState;

// Re-export Tauri commands
pub use config::{get_gemini_config, get_gemini_models, update_gemini_config};
pub use session::{cancel_gemini, check_gemini_installed, execute_gemini};
