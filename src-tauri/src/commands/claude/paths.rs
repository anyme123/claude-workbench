use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

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

/// Gets the path to the ~/.codex directory
/// Note: This function does not create the directory - it expects Codex CLI to be installed
pub fn get_codex_dir() -> Result<PathBuf> {
    let codex_dir = dirs::home_dir()
        .context("Could not find home directory")?
        .join(".codex");

    // Verify the directory exists (should be created by Codex CLI installation)
    if !codex_dir.exists() {
        anyhow::bail!(
            "Codex directory not found at {}. Please ensure Codex CLI is installed.",
            codex_dir.display()
        );
    }

    // Return the path directly without canonicalization to avoid permission issues
    Ok(codex_dir)
}

/// Encodes a project path to match Claude CLI's encoding scheme
/// Uses single hyphens to separate path components
pub fn encode_project_path(path: &str) -> String {
    path.replace('\\', "-")
        .replace('/', "-")
        .replace(':', "")
}

/// Decodes a project directory name back to its original path
/// The directory names in ~/.claude/projects are encoded paths
/// DEPRECATED: Use get_project_path_from_sessions instead when possible
pub fn decode_project_path(encoded: &str) -> String {
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
pub fn normalize_path_for_comparison(path: &str) -> String {
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
