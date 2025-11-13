//! Windows-specific platform implementations

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::os::windows::process::CommandExt;

/// Resolve a .cmd wrapper file to its actual Node.js script path
///
/// Windows npm installations often create .cmd wrapper files that execute Node.js scripts.
/// This function parses the .cmd file to extract the actual script path.
///
/// # Arguments
/// * `cmd_path` - Path to the .cmd wrapper file
///
/// # Returns
/// * `Some((node_executable, script_path))` if successfully resolved
/// * `None` if resolution failed
///
/// # Example
/// ```ignore
/// let result = resolve_cmd_wrapper("C:/Program Files/nodejs/claude.cmd");
/// // Returns: Some(("node", "C:/Program Files/nodejs/node_modules/@anthropic/claude/bin/claude.js"))
/// ```
pub fn resolve_cmd_wrapper(cmd_path: &str) -> Option<(String, String)> {
    log::debug!("Attempting to resolve .cmd wrapper: {}", cmd_path);

    // Read the .cmd file content
    let content = fs::read_to_string(cmd_path).ok()?;

    // Parse the .cmd file to find the actual Node.js script
    // Typical npm .cmd format:
    // @IF EXIST "%~dp0\node.exe" (
    //   "%~dp0\node.exe"  "%~dp0\node_modules\@anthropic\claude\bin\claude.js" %*
    // ) ELSE (
    //   node  "%~dp0\node_modules\@anthropic\claude\bin\claude.js" %*
    // )

    for line in content.lines() {
        if line.contains(".js") && (line.contains("node.exe") || line.contains("\"node\"")) {
            // Extract the script path - look for pattern like "%~dp0\path\to\script.js"
            if let Some(start) = line.find("\"%~dp0") {
                if let Some(end) = line[start..].find(".js\"") {
                    let script_relative = &line[start + 7..start + end + 3];

                    // Convert %~dp0 to absolute path
                    if let Some(parent) = Path::new(cmd_path).parent() {
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

/// Kill a process tree on Windows using taskkill
///
/// Uses the Windows taskkill command with /T flag to terminate
/// a process and all its child processes.
///
/// # Arguments
/// * `pid` - Process ID to kill
///
/// # Returns
/// * `Ok(())` if the process was successfully killed
/// * `Err(String)` with error description if the operation failed
pub fn kill_process_tree_impl(pid: u32) -> Result<(), String> {
    log::info!("Attempting to kill process tree for PID {} on Windows", pid);

    let mut cmd = Command::new("taskkill");
    cmd.args(["/F", "/T", "/PID", &pid.to_string()]);

    // Hide the console window
    cmd.creation_flags(super::CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(output) if output.status.success() => {
            log::info!("Successfully killed process tree for PID {}", pid);
            Ok(())
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let error_msg = format!("Failed to kill process tree: {}", stderr);
            log::error!("{}", error_msg);
            Err(error_msg)
        }
        Err(e) => {
            let error_msg = format!("Failed to execute taskkill: {}", e);
            log::error!("{}", error_msg);
            Err(error_msg)
        }
    }
}

/// Setup Windows-specific environment variables for a command
///
/// Configures PATH and other necessary environment variables to ensure
/// Node.js and npm packages can be found.
#[allow(dead_code)]
pub fn setup_command_environment(cmd: &mut Command, program_path: &str) {
    // Add NVM support if the program is in an NVM directory
    if program_path.contains("\\.nvm\\versions\\node\\") {
        if let Some(node_bin_dir) = Path::new(program_path).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                let new_path = format!("{};{}", node_bin_str, current_path);
                cmd.env("PATH", new_path);
            }
        }
    }

    // Add common npm paths to PATH
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let npm_path = Path::new(&appdata).join("npm");
        if let Some(npm_str) = npm_path.to_str() {
            if let Ok(current_path) = std::env::var("PATH") {
                if !current_path.contains(npm_str) {
                    let new_path = format!("{};{}", current_path, npm_str);
                    cmd.env("PATH", new_path);
                }
            }
        }
    }
}

/// Setup Windows-specific environment variables for a tokio command
///
#[allow(dead_code)]
/// Async version for use with tokio::process::Command
pub fn setup_command_environment_async(cmd: &mut tokio::process::Command, program_path: &str) {
    // Add NVM support if the program is in an NVM directory
    if program_path.contains("\\.nvm\\versions\\node\\") {
        if let Some(node_bin_dir) = Path::new(program_path).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                let new_path = format!("{};{}", node_bin_str, current_path);
                cmd.env("PATH", new_path);
            }
        }
    }

    // Add common npm paths to PATH
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let npm_path = Path::new(&appdata).join("npm");
        if let Some(npm_str) = npm_path.to_str() {
            if let Ok(current_path) = std::env::var("PATH") {
                if !current_path.contains(npm_str) {
                    let new_path = format!("{};{}", current_path, npm_str);
                    cmd.env("PATH", new_path);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_cmd_wrapper_invalid_path() {
        let result = resolve_cmd_wrapper("nonexistent.cmd");
        assert!(result.is_none());
    }
}
