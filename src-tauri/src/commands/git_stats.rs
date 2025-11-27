use serde::{Deserialize, Serialize};
use std::process::Command as StdCommand;

/// Git 代码变更统计
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffStats {
    /// 新增的行数
    pub lines_added: usize,
    /// 删除的行数
    pub lines_removed: usize,
    /// 修改的文件数
    pub files_changed: usize,
}

/// 获取两个 commit 之间的代码变更统计
#[tauri::command]
pub async fn get_git_diff_stats(
    project_path: String,
    from_commit: String,
    to_commit: Option<String>,
) -> Result<GitDiffStats, String> {
    let to_ref = to_commit.unwrap_or_else(|| "HEAD".to_string());

    // 使用 git diff --numstat 获取统计
    let mut cmd = StdCommand::new("git");
    cmd.current_dir(&project_path);
    cmd.args(["diff", "--numstat", &from_commit, &to_ref]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git diff: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Git diff failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // 解析 git diff --numstat 输出
    // 格式：<added>\t<removed>\t<filename>
    let mut lines_added = 0;
    let mut lines_removed = 0;
    let mut files_changed = 0;

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            files_changed += 1;

            // 解析新增行数
            if let Ok(added) = parts[0].parse::<usize>() {
                lines_added += added;
            }

            // 解析删除行数
            if let Ok(removed) = parts[1].parse::<usize>() {
                lines_removed += removed;
            }
        }
    }

    Ok(GitDiffStats {
        lines_added,
        lines_removed,
        files_changed,
    })
}

/// 获取当前会话的代码变更统计（从会话开始到现在）
#[tauri::command]
pub async fn get_session_code_changes(
    project_path: String,
    session_start_commit: String,
) -> Result<GitDiffStats, String> {
    get_git_diff_stats(project_path, session_start_commit, None).await
}
