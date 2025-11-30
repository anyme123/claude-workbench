/**
 * OpenAI Codex Integration - Backend Commands
 *
 * This module provides Tauri commands for executing Codex tasks,
 * managing sessions, and handling configuration.
 *
 * Module Structure:
 * - session.rs: Session lifecycle management (execute, resume, cancel, list, delete)
 * - git_ops.rs: Git operations for rewind functionality (records, truncate, revert)
 * - config.rs: Configuration management (availability, paths, mode, providers)
 */

pub mod config;
pub mod git_ops;
pub mod session;

// ============================================================================
// Re-export Types (allow unused for API compatibility)
// ============================================================================

// Session types
#[allow(unused_imports)]
pub use session::{
    CodexExecutionMode,
    CodexExecutionOptions,
    CodexSession,
    CodexProcessState,
};

// Git operations types
#[allow(unused_imports)]
pub use git_ops::{
    CodexPromptRecord,
    CodexPromptGitRecord,
    CodexGitRecords,
    PromptRecord,
};

// Config types
#[allow(unused_imports)]
pub use config::{
    CodexAvailability,
    CodexModeInfo,
    CodexProviderConfig,
    CurrentCodexConfig,
};

// ============================================================================
// Re-export Tauri Commands - Session Management
// ============================================================================

pub use session::{
    execute_codex,
    resume_codex,
    resume_last_codex,
    cancel_codex,
    list_codex_sessions,
    load_codex_session_history,
    delete_codex_session,
};

// ============================================================================
// Re-export Tauri Commands - Git Operations / Rewind
// ============================================================================

pub use git_ops::{
    get_codex_prompt_list,
    check_codex_rewind_capabilities,
    record_codex_prompt_sent,
    record_codex_prompt_completed,
    revert_codex_to_prompt,
};

// ============================================================================
// Re-export Tauri Commands - Configuration
// ============================================================================

pub use config::{
    check_codex_availability,
    set_custom_codex_path,
    get_codex_path,
    clear_custom_codex_path,
    get_codex_mode_config,
    set_codex_mode_config,
};

// ============================================================================
// Re-export Tauri Commands - Provider Management
// ============================================================================

pub use config::{
    get_codex_provider_presets,
    get_current_codex_config,
    switch_codex_provider,
    add_codex_provider_config,
    update_codex_provider_config,
    delete_codex_provider_config,
    clear_codex_provider_config,
    test_codex_provider_connection,
};

// ============================================================================
// Re-export Helper Functions (for internal use by submodules)
// ============================================================================

#[allow(unused_imports)]
pub use config::{
    get_codex_sessions_dir,
    get_codex_command_candidates,
};

#[allow(unused_imports)]
pub use session::{
    find_session_file,
    parse_codex_session_file,
};

#[allow(unused_imports)]
pub use git_ops::{
    get_codex_git_records_dir,
    load_codex_git_records,
    save_codex_git_records,
    truncate_codex_git_records,
    extract_codex_prompts,
    truncate_codex_session_to_prompt,
};
