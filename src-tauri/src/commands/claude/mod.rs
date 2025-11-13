mod cli_runner;
mod config;
mod hooks;
mod models;
mod paths;
mod project_store;
mod prompt_enhancer;
mod session_history;

pub use models::*;
pub use paths::*;
pub use self::cli_runner::{
    cancel_claude_execution,
    continue_claude_code,
    execute_claude_code,
    get_claude_session_output,
    list_running_claude_sessions,
    resume_claude_code,
    ClaudeProcessState,
};
pub use self::config::{
    check_claude_version,
    clear_custom_claude_path,
    find_claude_md_files,
    get_available_tools,
    get_claude_execution_config,
    get_claude_path,
    get_claude_permission_config,
    get_claude_settings,
    get_permission_presets,
    get_system_prompt,
    open_new_session,
    read_claude_md_file,
    reset_claude_execution_config,
    save_claude_md_file,
    save_claude_settings,
    save_system_prompt,
    set_custom_claude_path,
    update_claude_execution_config,
    update_claude_permission_config,
    update_thinking_mode,
    validate_permission_config,
};
pub use self::hooks::{
    get_hooks_config,
    update_hooks_config,
    validate_hook_command,
};
pub use self::prompt_enhancer::{
    enhance_prompt,
    enhance_prompt_with_gemini,
};
use self::project_store::ProjectStore;
// Agent functionality removed
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

/// Finds the full path to the claude binary
/// This is necessary because Windows apps may have a limited PATH environment
fn find_claude_binary(app_handle: &AppHandle) -> Result<String, String> {
    crate::claude_binary::find_claude_binary(app_handle)
}
 


#[tauri::command]
pub async fn list_projects() -> Result<Vec<Project>, String> {
    let store = ProjectStore::new()?;
    store.list_projects()
}

/// Gets sessions for a specific project
#[tauri::command]
pub async fn get_project_sessions(project_id: String) -> Result<Vec<Session>, String> {
    let store = ProjectStore::new()?;
    store.get_project_sessions(&project_id)
}

/// Deletes a session and all its associated data
#[tauri::command]
pub async fn delete_session(
    session_id: String,
    project_id: String,
) -> Result<String, String> {
    let store = ProjectStore::new()?;
    let session_deleted = store.delete_session(&project_id, &session_id)?;

    if session_deleted {
        Ok(format!("Successfully deleted session: {}", session_id))
    } else {
        Ok(format!(
            "Session {} was already missing; associated metadata cleaned up",
            session_id
        ))
    }
}

/// Deletes multiple sessions in batch
#[tauri::command]
pub async fn delete_sessions_batch(
    session_ids: Vec<String>,
    project_id: String,
) -> Result<String, String> {
    let store = ProjectStore::new()?;
    let outcome = store.delete_sessions_batch(&project_id, &session_ids);

    if outcome.failed_count > 0 {
        Err(format!(
            "Batch delete completed with errors: {} deleted, {} failed. Errors: {}",
            outcome.deleted_count,
            outcome.failed_count,
            outcome.errors.join("; ")
        ))
    } else {
        Ok(format!(
            "Successfully deleted {} sessions",
            outcome.deleted_count
        ))
    }
}

/// Removes a project from the project list (without deleting files)
#[tauri::command]
pub async fn delete_project(project_id: String) -> Result<String, String> {
    let store = ProjectStore::new()?;
    let newly_hidden = store.hide_project(&project_id)?;

    let result_msg = if newly_hidden {
        format!(
            "Project '{}' has been removed from the list (files are preserved)",
            project_id
        )
    } else {
        format!(
            "Project '{}' was already hidden (files are preserved)",
            project_id
        )
    };

    log::info!("{}", result_msg);
    Ok(result_msg)
}

/// Restores a project to the project list
#[tauri::command]
pub async fn restore_project(project_id: String) -> Result<String, String> {
    let store = ProjectStore::new()?;
    store.restore_project(&project_id)?;

    let result_msg = format!("Project '{}' has been restored to the list", project_id);
    log::info!("{}", result_msg);
    Ok(result_msg)
}

/// Permanently delete a project from the file system with intelligent directory detection
#[tauri::command]
pub async fn delete_project_permanently(project_id: String) -> Result<String, String> {
    let store = ProjectStore::new()?;
    let actual_project_id = store.delete_project_permanently(&project_id)?;

    let result_msg = if actual_project_id != project_id {
        format!(
            "项目 '{}' (实际目录: '{}') 已永久删除",
            project_id, actual_project_id
        )
    } else {
        format!("项目 '{}' 已永久删除", project_id)
    };

    log::info!("{}", result_msg);
    Ok(result_msg)
}

/// Lists all hidden projects with intelligent directory existence check
#[tauri::command]
pub async fn list_hidden_projects() -> Result<Vec<String>, String> {
    let store = ProjectStore::new()?;
    store.list_hidden_projects()
}

/// Reads the Claude settings file


/// Loads the JSONL history for a specific session
#[tauri::command]
pub async fn load_session_history(
    session_id: String,
    project_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    session_history::load_session_history(&session_id, &project_id)
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
