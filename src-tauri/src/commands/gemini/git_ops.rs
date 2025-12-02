/**
 * Gemini Git Operations Module
 *
 * Handles Git-related operations for Gemini sessions including:
 * - Git record tracking for rewind functionality
 * - Prompt extraction and management
 * - Rewind capabilities checking
 * - Session truncation and revert operations
 */

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use chrono::Utc;

// Import simple_git for rewind operations
use super::super::simple_git;
// Import rewind helpers/types shared with Claude
use super::super::prompt_tracker::{RewindMode, RewindCapabilities, PromptRecord as ClaudePromptRecord, load_execution_config};
// Import Gemini config helpers
use super::config::get_gemini_dir;

// Align Gemini prompt record type with Claude prompt tracker representation
pub type PromptRecord = ClaudePromptRecord;

// ============================================================================
// Gemini Rewind Types (Git Record Tracking)
// ============================================================================

/// Gemini Git state record for each prompt
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiPromptGitRecord {
    pub prompt_index: usize,
    pub commit_before: String,
    pub commit_after: Option<String>,
    pub timestamp: String,
}

/// Collection of Git records for a Gemini session
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GeminiGitRecords {
    pub session_id: String,
    pub project_path: String,
    pub records: Vec<GeminiPromptGitRecord>,
}

// ============================================================================
// Git Records Directory Management
// ============================================================================

/// Get the Gemini git records directory
pub fn get_gemini_git_records_dir() -> Result<PathBuf, String> {
    let gemini_dir = get_gemini_dir()?;
    let records_dir = gemini_dir.join("git-records");

    // Create directory if it doesn't exist
    if !records_dir.exists() {
        fs::create_dir_all(&records_dir)
            .map_err(|e| format!("Failed to create git records directory: {}", e))?;
    }

    Ok(records_dir)
}

/// Get the Gemini sessions directory (for chats/*.json files)
pub fn get_gemini_sessions_dir(project_path: &str) -> Result<PathBuf, String> {
    let gemini_dir = get_gemini_dir()?;

    // Hash project path to get session directory
    use super::config::hash_project_path;
    let project_hash = hash_project_path(project_path);

    Ok(gemini_dir.join("tmp").join(project_hash).join("chats"))
}

/// Find Gemini session file by session ID
/// Gemini CLI stores session files with format: session-<date>-<session_id_prefix>.json
/// where session_id_prefix is the first 8 characters of the full UUID
/// This function searches by prefix and verifies by reading the internal sessionId field
fn find_gemini_session_file(sessions_dir: &PathBuf, session_id: &str) -> Result<PathBuf, String> {
    // Extract the first 8 characters of session_id for filename matching
    // Gemini CLI uses this prefix in the filename
    let session_prefix = if session_id.len() >= 8 {
        &session_id[..8]
    } else {
        session_id
    };

    log::debug!("[Gemini] Searching for session file with prefix: {} in {:?}", session_prefix, sessions_dir);

    let entries = fs::read_dir(sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    // First pass: find files that match the prefix in filename
    let mut candidates: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                // Check if filename contains the session_id prefix
                if filename.contains(session_prefix) {
                    candidates.push(path);
                }
            }
        }
    }

    log::debug!("[Gemini] Found {} candidate files for prefix {}", candidates.len(), session_prefix);

    // Second pass: verify by reading the sessionId field in the file
    for candidate in candidates {
        if let Ok(content) = fs::read_to_string(&candidate) {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(file_session_id) = data.get("sessionId").and_then(|v| v.as_str()) {
                    if file_session_id == session_id {
                        log::info!("[Gemini] Found matching session file: {:?}", candidate);
                        return Ok(candidate);
                    }
                }
            }
        }
    }

    Err(format!("Session file not found for: {} (searched for prefix: {})", session_id, session_prefix))
}

// ============================================================================
// Git Records Storage
// ============================================================================

/// Load Git records for a Gemini session
pub fn load_gemini_git_records(session_id: &str) -> Result<GeminiGitRecords, String> {
    let records_dir = get_gemini_git_records_dir()?;
    let records_file = records_dir.join(format!("{}.json", session_id));

    if !records_file.exists() {
        return Ok(GeminiGitRecords {
            session_id: session_id.to_string(),
            project_path: String::new(),
            records: Vec::new(),
        });
    }

    let content = fs::read_to_string(&records_file)
        .map_err(|e| format!("Failed to read git records: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse git records: {}", e))
}

/// Save Git records for a Gemini session
pub fn save_gemini_git_records(session_id: &str, records: &GeminiGitRecords) -> Result<(), String> {
    let records_dir = get_gemini_git_records_dir()?;
    let records_file = records_dir.join(format!("{}.json", session_id));

    let content = serde_json::to_string_pretty(records)
        .map_err(|e| format!("Failed to serialize git records: {}", e))?;

    fs::write(&records_file, content)
        .map_err(|e| format!("Failed to write git records: {}", e))?;

    log::debug!("Saved Gemini git records for session: {}", session_id);
    Ok(())
}

/// Truncate Git records (remove records after prompt_index)
pub fn truncate_gemini_git_records(session_id: &str, prompt_index: usize) -> Result<(), String> {
    let mut git_records = load_gemini_git_records(session_id)?;

    // Remove all records after prompt_index
    git_records.records.retain(|r| r.prompt_index <= prompt_index);

    save_gemini_git_records(session_id, &git_records)?;

    log::info!("[Gemini Rewind] Truncated git records after prompt #{}", prompt_index);
    Ok(())
}

// ============================================================================
// Prompt Extraction from Gemini Session Files
// ============================================================================

/// Extract prompts from Gemini session chat file
/// Gemini stores sessions in chats/session-*.json files with structured format
fn extract_gemini_prompts(session_id: &str, project_path: &str) -> Result<Vec<PromptRecord>, String> {
    let sessions_dir = get_gemini_sessions_dir(project_path)?;

    // Find session file using helper function (handles Gemini's 8-char prefix naming)
    let session_file = find_gemini_session_file(&sessions_dir, session_id)?;

    let content = fs::read_to_string(&session_file)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let session_data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session JSON: {}", e))?;

    // Extract messages array
    let messages = session_data
        .get("messages")
        .and_then(|m| m.as_array())
        .ok_or_else(|| "No messages array found in session".to_string())?;

    let mut prompts = Vec::new();
    let mut prompt_index = 0;

    for message in messages {
        // Only process user messages
        let role = message.get("role").and_then(|r| r.as_str());
        if role != Some("user") {
            continue;
        }

        // Extract text content from parts
        let mut extracted_text = String::new();
        if let Some(parts) = message.get("parts").and_then(|p| p.as_array()) {
            for part in parts {
                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                    extracted_text.push_str(text);
                }
            }
        }

        if extracted_text.trim().is_empty() {
            continue;
        }

        // Extract timestamp
        let timestamp = message
            .get("timestamp")
            .and_then(|t| t.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.timestamp())
            .unwrap_or_else(|| Utc::now().timestamp());

        // All Gemini prompts sent from project interface are marked as "project"
        prompts.push(PromptRecord {
            index: prompt_index,
            text: extracted_text,
            git_commit_before: "NONE".to_string(),
            git_commit_after: None,
            timestamp,
            source: "project".to_string(), // Gemini always from project interface
        });

        prompt_index += 1;
    }

    // Enrich with git records (if present)
    let git_records = load_gemini_git_records(session_id)?;
    for prompt in prompts.iter_mut() {
        if let Some(record) = git_records
            .records
            .iter()
            .find(|r| r.prompt_index == prompt.index)
        {
            prompt.git_commit_before = record.commit_before.clone();
            prompt.git_commit_after = record.commit_after.clone();

            if prompt.timestamp == 0 {
                if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(&record.timestamp) {
                    prompt.timestamp = ts.timestamp();
                }
            }
        }
    }

    Ok(prompts)
}

/// Get prompt list for Gemini sessions (for revert picker)
#[tauri::command]
pub async fn get_gemini_prompt_list(session_id: String, project_path: String) -> Result<Vec<PromptRecord>, String> {
    extract_gemini_prompts(&session_id, &project_path)
}

// ============================================================================
// Rewind Capabilities
// ============================================================================

/// Check rewind capabilities for Gemini prompt (conversation/code/both)
#[tauri::command]
pub async fn check_gemini_rewind_capabilities(
    session_id: String,
    project_path: String,
    prompt_index: usize,
) -> Result<RewindCapabilities, String> {
    log::info!(
        "[Gemini Rewind] Checking capabilities for session {} prompt #{}",
        session_id,
        prompt_index
    );

    // Respect global execution config for git operations
    let execution_config = load_execution_config()
        .map_err(|e| format!("Failed to load execution config: {}", e))?;
    let git_operations_disabled = execution_config.disable_rewind_git_operations;

    // Extract prompts to validate index
    let prompts = extract_gemini_prompts(&session_id, &project_path)?;
    let prompt = prompts
        .get(prompt_index)
        .ok_or_else(|| format!("Prompt #{} not found", prompt_index))?;

    if git_operations_disabled {
        return Ok(RewindCapabilities {
            conversation: true,
            code: false,
            both: false,
            warning: Some("Git 操作已在配置中禁用。只能撤回对话历史，无法回滚代码变更。".to_string()),
            source: prompt.source.clone(),
        });
    }

    // Look up git record for this prompt index
    let git_records = load_gemini_git_records(&session_id)?;
    let git_record = git_records
        .records
        .iter()
        .find(|r| r.prompt_index == prompt_index);

    if let Some(record) = git_record {
        let has_valid_commit = !record.commit_before.is_empty() && record.commit_before != "NONE";

        log::info!(
            "[Gemini Rewind] ✅ Prompt #{} with git record: has_valid_commit={}",
            prompt_index,
            has_valid_commit
        );

        Ok(RewindCapabilities {
            conversation: true,
            code: has_valid_commit,
            both: has_valid_commit,
            warning: if !has_valid_commit {
                Some("此提示词没有关联的 Git 记录，只能删除消息，无法回滚代码".to_string())
            } else {
                None
            },
            source: "project".to_string(),
        })
    } else {
        log::warn!("[Gemini Rewind] ⚠️ No git record found for prompt #{}", prompt_index);
        Ok(RewindCapabilities {
            conversation: true,
            code: false,
            both: false,
            warning: Some("此提示词没有关联的 Git 记录，只能删除消息".to_string()),
            source: "project".to_string(),
        })
    }
}

// ============================================================================
// Prompt Recording
// ============================================================================

/// Record a Gemini prompt being sent (called before execution)
#[tauri::command]
pub async fn record_gemini_prompt_sent(
    session_id: String,
    project_path: String,
    _prompt_text: String,
) -> Result<usize, String> {
    log::info!("[Gemini Record] Recording prompt sent for session: {}", session_id);

    // Check if Git operations are disabled in config
    let execution_config = load_execution_config()
        .map_err(|e| format!("Failed to load execution config: {}", e))?;

    if execution_config.disable_rewind_git_operations {
        log::info!("[Gemini Record] Git operations disabled, skipping git record");
        // Still need to return a prompt_index for tracking purposes
        let git_records = load_gemini_git_records(&session_id)?;
        let prompt_index = git_records.records.len();
        log::info!("[Gemini Record] Returning prompt index #{} (no git record)", prompt_index);
        return Ok(prompt_index);
    }

    // Ensure Git repository is initialized
    simple_git::ensure_git_repo(&project_path)
        .map_err(|e| format!("Failed to ensure Git repo: {}", e))?;

    // Get current commit (state before prompt execution)
    let commit_before = simple_git::git_current_commit(&project_path)
        .map_err(|e| format!("Failed to get current commit: {}", e))?;

    // Load existing records
    let mut git_records = load_gemini_git_records(&session_id)?;

    // Update project path if needed
    if git_records.project_path.is_empty() {
        git_records.project_path = project_path.clone();
    }

    // Calculate prompt index
    let prompt_index = git_records.records.len();

    // Create new record
    let record = GeminiPromptGitRecord {
        prompt_index,
        commit_before: commit_before.clone(),
        commit_after: None,
        timestamp: Utc::now().to_rfc3339(),
    };

    git_records.records.push(record);
    save_gemini_git_records(&session_id, &git_records)?;

    log::info!("[Gemini Record] Recorded prompt #{} with commit_before: {}",
        prompt_index, &commit_before[..8.min(commit_before.len())]);

    Ok(prompt_index)
}

/// Record a Gemini prompt completion (called after AI response)
#[tauri::command]
pub async fn record_gemini_prompt_completed(
    session_id: String,
    project_path: String,
    prompt_index: usize,
) -> Result<(), String> {
    log::info!("[Gemini Record] Recording prompt #{} completed for session: {}",
        prompt_index, session_id);

    // Check if Git operations are disabled in config
    let execution_config = load_execution_config()
        .map_err(|e| format!("Failed to load execution config: {}", e))?;

    if execution_config.disable_rewind_git_operations {
        log::info!("[Gemini Record] Git operations disabled, skipping git commit and record update");
        return Ok(());
    }

    // Auto-commit any changes made by AI
    let commit_message = format!("[Gemini] After prompt #{}", prompt_index);
    match simple_git::git_commit_changes(&project_path, &commit_message) {
        Ok(true) => {
            log::info!("[Gemini Record] Auto-committed changes after prompt #{}", prompt_index);
        }
        Ok(false) => {
            log::debug!("[Gemini Record] No changes to commit after prompt #{}", prompt_index);
        }
        Err(e) => {
            log::warn!("[Gemini Record] Failed to auto-commit: {}", e);
            // Continue anyway
        }
    }

    // Get current commit (state after AI completion)
    let commit_after = simple_git::git_current_commit(&project_path)
        .map_err(|e| format!("Failed to get current commit: {}", e))?;

    // Update the record
    let mut git_records = load_gemini_git_records(&session_id)?;

    if let Some(record) = git_records.records.iter_mut().find(|r| r.prompt_index == prompt_index) {
        record.commit_after = Some(commit_after.clone());
        save_gemini_git_records(&session_id, &git_records)?;

        log::info!("[Gemini Record] Updated prompt #{} with commit_after: {}",
            prompt_index, &commit_after[..8.min(commit_after.len())]);
    } else {
        log::warn!("[Gemini Record] Record not found for prompt #{}", prompt_index);
    }

    Ok(())
}

// ============================================================================
// Session Truncation
// ============================================================================

/// Truncate Gemini session file to before a specific prompt
/// Note: Gemini stores sessions as structured JSON files, not JSONL
pub fn truncate_gemini_session_to_prompt(
    session_id: &str,
    project_path: &str,
    prompt_index: usize,
) -> Result<(), String> {
    let sessions_dir = get_gemini_sessions_dir(project_path)?;

    // Find session file using helper function (handles Gemini's 8-char prefix naming)
    let session_file = find_gemini_session_file(&sessions_dir, session_id)?;

    // Read session JSON
    let content = fs::read_to_string(&session_file)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let mut session_data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session JSON: {}", e))?;

    // Get messages array
    let messages = session_data
        .get_mut("messages")
        .and_then(|m| m.as_array_mut())
        .ok_or_else(|| "No messages array found in session".to_string())?;

    // Count user prompts to find truncation point
    let mut user_prompt_count = 0;
    let mut truncate_at_index = 0;

    for (idx, message) in messages.iter().enumerate() {
        let role = message.get("role").and_then(|r| r.as_str());
        if role == Some("user") {
            if user_prompt_count == prompt_index {
                truncate_at_index = idx;
                break;
            }
            user_prompt_count += 1;
        }
    }

    // Truncate messages array
    session_data["messages"] = serde_json::Value::Array(
        messages.iter().take(truncate_at_index).cloned().collect()
    );

    // Write back to file
    let new_content = serde_json::to_string_pretty(&session_data)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    fs::write(&session_file, new_content)
        .map_err(|e| format!("Failed to write session file: {}", e))?;

    log::info!("[Gemini Rewind] Truncated session to prompt #{}", prompt_index);
    Ok(())
}

// ============================================================================
// Revert Operations
// ============================================================================

/// Revert Gemini session to a specific prompt
#[tauri::command]
pub async fn revert_gemini_to_prompt(
    session_id: String,
    project_path: String,
    prompt_index: usize,
    mode: RewindMode,
) -> Result<String, String> {
    log::info!("[Gemini Rewind] Reverting session {} to prompt #{} with mode: {:?}",
        session_id, prompt_index, mode);

    // Load execution config to check if Git operations are disabled
    let execution_config = load_execution_config()
        .map_err(|e| format!("Failed to load execution config: {}", e))?;

    let git_operations_disabled = execution_config.disable_rewind_git_operations;

    if git_operations_disabled {
        log::warn!("[Gemini Rewind] Git operations are disabled in config");
    }

    // Extract prompts to validate index
    let prompts = extract_gemini_prompts(&session_id, &project_path)?;
    let _prompt = prompts
        .get(prompt_index)
        .ok_or_else(|| format!("Prompt #{} not found in session", prompt_index))?;

    // Load Git records
    let git_records = load_gemini_git_records(&session_id)?;
    let git_record = git_records.records.iter().find(|r| r.prompt_index == prompt_index);

    // Validate mode compatibility
    match mode {
        RewindMode::CodeOnly | RewindMode::Both => {
            if git_operations_disabled {
                return Err(
                    "无法回滚代码：Git 操作已在配置中禁用。只能撤回对话历史，无法回滚代码变更。".into()
                );
            }
            if git_record.is_none() {
                return Err(format!(
                    "无法回滚代码：提示词 #{} 没有关联的 Git 记录",
                    prompt_index
                ));
            }
        }
        RewindMode::ConversationOnly => {}
    }

    // Execute revert based on mode
    match mode {
        RewindMode::ConversationOnly => {
            log::info!("[Gemini Rewind] Reverting conversation only");

            // Truncate session messages
            truncate_gemini_session_to_prompt(&session_id, &project_path, prompt_index)?;

            // Truncate git records
            if !git_operations_disabled {
                truncate_gemini_git_records(&session_id, prompt_index)?;
            }

            log::info!("[Gemini Rewind] Successfully reverted conversation to prompt #{}", prompt_index);
        }

        RewindMode::CodeOnly => {
            log::info!("[Gemini Rewind] Reverting code only");

            let record = git_record.unwrap();

            // Stash uncommitted changes
            simple_git::git_stash_save(&project_path,
                &format!("Auto-stash before Gemini code revert to prompt #{}", prompt_index))
                .map_err(|e| format!("Failed to stash changes: {}", e))?;

            // Reset to commit before this prompt
            simple_git::git_reset_hard(&project_path, &record.commit_before)
                .map_err(|e| format!("Failed to reset code: {}", e))?;

            log::info!("[Gemini Rewind] Successfully reverted code to prompt #{}", prompt_index);
        }

        RewindMode::Both => {
            log::info!("[Gemini Rewind] Reverting both conversation and code");

            let record = git_record.unwrap();

            // Stash uncommitted changes
            simple_git::git_stash_save(&project_path,
                &format!("Auto-stash before Gemini full revert to prompt #{}", prompt_index))
                .map_err(|e| format!("Failed to stash changes: {}", e))?;

            // Reset code
            simple_git::git_reset_hard(&project_path, &record.commit_before)
                .map_err(|e| format!("Failed to reset code: {}", e))?;

            // Truncate session
            truncate_gemini_session_to_prompt(&session_id, &project_path, prompt_index)?;

            // Truncate git records
            if !git_operations_disabled {
                truncate_gemini_git_records(&session_id, prompt_index)?;
            }

            log::info!("[Gemini Rewind] Successfully reverted both to prompt #{}", prompt_index);
        }
    }

    Ok(format!(
        "Successfully reverted Gemini session to prompt #{} (mode: {:?})",
        prompt_index, mode
    ))
}
