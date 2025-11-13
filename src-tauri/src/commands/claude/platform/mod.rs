//! Platform-specific code abstraction layer
//!
//! This module provides a unified interface for platform-specific operations,
//! primarily focusing on Windows-specific behaviors while providing compatible
//! implementations for Unix-like systems.

#[cfg(target_os = "windows")]
mod windows;

#[cfg(not(target_os = "windows"))]
mod unix;

use std::process::Command;

// Re-export platform-specific implementations
#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(not(target_os = "windows"))]
pub use unix::*;

/// Platform-specific constants
#[cfg(target_os = "windows")]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Apply platform-specific command configuration to hide console windows
///
/// On Windows, this sets the CREATE_NO_WINDOW flag to prevent console window popups.
/// On Unix-like systems, this is a no-op.
#[cfg(target_os = "windows")]
pub fn apply_no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
pub fn apply_no_window(_cmd: &mut Command) {
    // No-op on non-Windows platforms
}

/// Apply platform-specific command configuration to hide console windows (async version)
///
/// For use with tokio::process::Command
#[cfg(target_os = "windows")]
pub fn apply_no_window_async(cmd: &mut tokio::process::Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
pub fn apply_no_window_async(_cmd: &mut tokio::process::Command) {
    // No-op on non-Windows platforms
}

/// Kill a process tree (parent and all children)
///
/// On Windows, uses taskkill with /T flag.
/// On Unix, sends SIGKILL to the process.
pub fn kill_process_tree(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows::kill_process_tree_impl(pid)
    }

    #[cfg(not(target_os = "windows"))]
    {
        unix::kill_process_tree_impl(pid)
    }
}
