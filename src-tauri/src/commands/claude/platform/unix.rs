//! Unix/macOS-specific platform implementations

use std::process::Command;

/// Resolve a .cmd wrapper file to its actual Node.js script path
///
/// On Unix-like systems, .cmd files are not used, so this always returns None.
#[allow(dead_code)]
pub fn resolve_cmd_wrapper(_cmd_path: &str) -> Option<(String, String)> {
    None
}

/// Kill a process tree on Unix using kill signal
///
/// Sends SIGKILL to the specified process. On Unix systems, this will
/// terminate the process but may not automatically kill child processes
/// depending on how they were spawned.
///
/// # Arguments
/// * `pid` - Process ID to kill
///
/// # Returns
/// * `Ok(())` if the process was successfully killed
/// * `Err(String)` with error description if the operation failed
pub fn kill_process_tree_impl(pid: u32) -> Result<(), String> {
    log::info!("Attempting to kill process {} on Unix", pid);

    let mut cmd = Command::new("kill");
    cmd.args(["-KILL", &pid.to_string()]);

    match cmd.output() {
        Ok(output) if output.status.success() => {
            log::info!("Successfully killed process {}", pid);
            Ok(())
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let error_msg = format!("Failed to kill process: {}", stderr);
            log::error!("{}", error_msg);
            Err(error_msg)
        }
        Err(e) => {
            let error_msg = format!("Failed to execute kill command: {}", e);
            log::error!("{}", error_msg);
            Err(error_msg)
        }
    }
}

/// Setup Unix-specific environment variables for a command
///
/// On Unix, this adds NVM paths if detected.
#[allow(dead_code)]
pub fn setup_command_environment(cmd: &mut Command, program_path: &str) {
    use std::path::Path;

    // Add NVM support if the program is in an NVM directory
    if program_path.contains("/.nvm/versions/node/") {
        if let Some(node_bin_dir) = Path::new(program_path).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(node_bin_str.as_ref()) {
                let new_path = format!("{}:{}", node_bin_str, current_path);
                cmd.env("PATH", new_path);
            }
        }
    }
}

/// Setup Unix-specific environment variables for a tokio command
///
/// Async version for use with tokio::process::Command
#[allow(dead_code)]
pub fn setup_command_environment_async(cmd: &mut tokio::process::Command, program_path: &str) {
    use std::path::Path;

    // Add NVM support if the program is in an NVM directory
    if program_path.contains("/.nvm/versions/node/") {
        if let Some(node_bin_dir) = Path::new(program_path).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(node_bin_str.as_ref()) {
                let new_path = format!("{}:{}", node_bin_str, current_path);
                cmd.env("PATH", new_path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_cmd_wrapper_returns_none() {
        let result = resolve_cmd_wrapper("/usr/local/bin/claude");
        assert!(result.is_none());
    }
}
