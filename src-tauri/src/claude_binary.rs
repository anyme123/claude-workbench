use anyhow::Result;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
/// Shared module for detecting Claude Code binary installations
/// Supports NVM installations, aliased paths, version-based selection, and bundled sidecars
/// Cross-platform support for Windows and macOS
use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

/// 运行时环境信息（替换单纯的 #[cfg] 检测，支持容器/WSL/架构）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeEnvironment {
    pub os: String,
    pub arch: String,
    pub is_wsl: bool,
    pub is_container: bool,
    pub distro: Option<String>,
}

/// 用户自定义二进制搜索配置 (~/.claude/binaries.json)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BinarySearchConfig {
    pub claude: Option<BinarySearchSection>,
    pub codex: Option<BinarySearchSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BinarySearchSection {
    /// 强制覆盖的可执行文件路径
    pub override_path: Option<String>,
    /// 额外搜索路径（目录或完整文件路径）
    #[serde(default)]
    pub search_paths: Vec<String>,
}

/// Get user home directory (cross-platform)
fn get_home_dir() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").map_err(|_| "Failed to get USERPROFILE".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").map_err(|_| "Failed to get HOME".to_string())
    }
}

/// 运行时检测环境（OS/架构/WSL/容器/发行版）
pub fn detect_runtime_environment() -> RuntimeEnvironment {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    let is_wsl = std::env::var("WSL_INTEROP").is_ok()
        || std::env::var("WSL_DISTRO_NAME").is_ok()
        || std::fs::read_to_string("/proc/version")
            .map(|v| v.to_lowercase().contains("microsoft"))
            .unwrap_or(false);

    let is_container = std::env::var("container").is_ok()
        || std::fs::metadata("/run/.containerenv").is_ok()
        || std::fs::read_to_string("/proc/1/cgroup")
            .map(|c| c.contains("docker") || c.contains("kubepods"))
            .unwrap_or(false);

    let distro = if os == "linux" {
        std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|content| {
                content
                    .lines()
                    .find(|line| line.starts_with("ID="))
                    .map(|line| line.trim_start_matches("ID=").trim_matches('"').to_string())
            })
    } else {
        None
    };

    info!(
        "Runtime environment: os={}, arch={}, wsl={}, container={}, distro={:?}",
        os, arch, is_wsl, is_container, distro
    );

    RuntimeEnvironment {
        os,
        arch,
        is_wsl,
        is_container,
        distro,
    }
}

/// 读取用户的二进制搜索配置 (~/.claude/binaries.json)
fn load_binary_search_config() -> BinarySearchConfig {
    if let Ok(home) = get_home_dir() {
        let path = PathBuf::from(home).join(".claude").join("binaries.json");
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(cfg) = serde_json::from_str::<BinarySearchConfig>(&content) {
                    info!(
                        "Loaded user binary search config from {}",
                        path.to_string_lossy()
                    );
                    return cfg;
                } else {
                    warn!(
                        "Failed to parse binary search config at {}, using defaults",
                        path.to_string_lossy()
                    );
                }
            }
        }
    }
    BinarySearchConfig::default()
}

fn pick_section(cfg: &BinarySearchConfig, key: &str) -> Option<BinarySearchSection> {
    match key {
        "claude" => cfg.claude.clone(),
        "codex" => cfg.codex.clone(),
        _ => None,
    }
}

/// Initialize shell environment for macOS GUI applications
/// This function should be called at application startup to ensure
/// CLI tools installed via homebrew, npm, nvm, etc. can be found
///
/// On macOS, GUI applications launched from Finder/Dock don't inherit
/// the user's shell environment (PATH, etc.). This function runs the
/// user's default shell to get the actual PATH and sets it in the
/// process environment.
///
/// Key fix: Always merge NVM paths regardless of shell command success,
/// because `zsh -l -c` (login + non-interactive) doesn't read .zshrc
/// where NVM initialization typically lives.
#[cfg(target_os = "macos")]
pub fn init_shell_environment() {
    info!("Initializing shell environment for macOS GUI application...");

    let current_path = std::env::var("PATH").unwrap_or_default();
    debug!("Current PATH before init: {}", current_path);

    let mut seen = std::collections::HashSet::new();
    let mut final_paths: Vec<String> = Vec::new();

    // 1. NVM paths first (highest priority) - ALWAYS scan regardless of shell success
    //    This fixes the bug where `zsh -l -c` doesn't read .zshrc
    if let Ok(home) = get_home_dir() {
        let nvm_paths = get_nvm_paths(&home);
        for p in nvm_paths {
            if seen.insert(p.clone()) {
                final_paths.push(p);
            }
        }
        if !final_paths.is_empty() {
            info!("Added {} NVM paths with highest priority", final_paths.len());
        }
    }

    // 2. Shell PATH (from interactive shell to read .zshrc)
    if let Some(shell_path) = get_shell_path() {
        for p in shell_path.split(':') {
            if !p.is_empty() && seen.insert(p.to_string()) {
                final_paths.push(p.to_string());
            }
        }
    }

    // 3. Fallback common paths (homebrew, volta, fnm, etc.)
    if let Ok(home) = get_home_dir() {
        let fallback_paths = get_fallback_paths(&home);
        for p in fallback_paths {
            if seen.insert(p.clone()) {
                final_paths.push(p);
            }
        }
    }

    // 4. Original system PATH
    for p in current_path.split(':') {
        if !p.is_empty() && seen.insert(p.to_string()) {
            final_paths.push(p.to_string());
        }
    }

    if !final_paths.is_empty() {
        let merged_path = final_paths.join(":");
        std::env::set_var("PATH", &merged_path);
        info!(
            "Shell environment initialized. PATH updated with {} entries",
            final_paths.len()
        );
        debug!("New PATH: {}", merged_path);
    } else {
        warn!("Failed to construct PATH, CLI tools may not be found");
    }
}

/// No-op for non-macOS platforms
#[cfg(not(target_os = "macos"))]
pub fn init_shell_environment() {
    debug!("Shell environment initialization not needed on this platform");
}

/// Get NVM paths - scans ~/.nvm/versions/node for all installed versions
/// Returns paths sorted by version (newest first) for highest priority
#[cfg(target_os = "macos")]
fn get_nvm_paths(home: &str) -> Vec<String> {
    let mut nvm_paths = Vec::new();
    let nvm_versions_dir = format!("{}/.nvm/versions/node", home);

    if let Ok(entries) = std::fs::read_dir(&nvm_versions_dir) {
        let mut node_versions: Vec<String> = entries
            .flatten()
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();

        // Sort by version descending (newest first = highest priority)
        node_versions.sort_by(|a, b| compare_node_versions(b, a));

        for version in node_versions {
            let bin_path = format!("{}/.nvm/versions/node/{}/bin", home, version);
            if std::path::Path::new(&bin_path).exists() {
                debug!("Found NVM node version: {}", bin_path);
                nvm_paths.push(bin_path);
            }
        }
    }

    // Also check for NVM default alias
    let default_bin = format!("{}/.nvm/alias/default", home);
    if std::path::Path::new(&default_bin).exists() {
        // Read the default alias and resolve it
        if let Ok(default_version) = std::fs::read_to_string(&default_bin) {
            let version = default_version.trim();
            let bin_path = format!("{}/.nvm/versions/node/{}/bin", home, version);
            if std::path::Path::new(&bin_path).exists() && !nvm_paths.contains(&bin_path) {
                nvm_paths.insert(0, bin_path); // Default gets highest priority
            }
        }
    }

    nvm_paths
}

/// Get fallback paths for common CLI tool locations
#[cfg(target_os = "macos")]
fn get_fallback_paths(home: &str) -> Vec<String> {
    let candidates = vec![
        // Homebrew paths (Apple Silicon first, then Intel)
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        // System paths
        "/usr/bin".to_string(),
        "/bin".to_string(),
        "/usr/sbin".to_string(),
        "/sbin".to_string(),
        // User local paths
        format!("{}/.local/bin", home),
        // NPM global paths
        format!("{}/.npm-global/bin", home),
        format!("{}/npm/bin", home),
        format!("{}/.npm/bin", home),
        // Volta
        format!("{}/.volta/bin", home),
        // fnm (Fast Node Manager)
        format!("{}/.fnm", home),
        format!("{}/.fnm/aliases/default/bin", home),
        format!("{}/.local/share/fnm/aliases/default/bin", home),
        // asdf
        format!("{}/.asdf/shims", home),
        // n (Node version manager)
        format!("{}/.n/bin", home),
        // pnpm
        format!("{}/Library/pnpm", home),
        format!("{}/.local/share/pnpm", home),
        format!("{}/.pnpm-global/bin", home),
        // yarn
        format!("{}/.yarn/bin", home),
        format!("{}/.config/yarn/global/node_modules/.bin", home),
        // bun
        format!("{}/.bun/bin", home),
    ];

    // Add npm prefix from .npmrc if exists
    let mut paths: Vec<String> = Vec::new();
    if let Some(npm_prefix) = read_npmrc_prefix(home) {
        let npm_bin = format!("{}/bin", npm_prefix);
        if std::path::Path::new(&npm_bin).exists() {
            paths.push(npm_bin);
        }
    }

    // Filter to only existing paths
    for p in candidates {
        if std::path::Path::new(&p).exists() {
            paths.push(p);
        }
    }

    paths
}

/// Get the shell's PATH on macOS
/// Uses interactive mode (-i) to ensure .zshrc is read
#[cfg(target_os = "macos")]
fn get_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    debug!("User's default shell: {}", shell);

    // Use -i -c (interactive mode) to ensure .zshrc is read
    // This is critical because NVM initialization is typically in .zshrc, not .zprofile
    // Note: -l -c (login + non-interactive) does NOT read .zshrc
    let mut cmd = Command::new(&shell);
    cmd.args(["-i", "-c", "echo $PATH"]);

    // Prevent interactive shell from waiting for input
    cmd.stdin(std::process::Stdio::null());

    match cmd.output() {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                info!("Got shell PATH ({} entries)", path.split(':').count());
                debug!("Shell PATH: {}", path);
                return Some(path);
            }
        }
        Ok(output) => {
            debug!(
                "Shell command failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        Err(e) => {
            debug!("Failed to execute shell: {}", e);
        }
    }

    None
}

/// 从 ~/.npmrc 文件读取用户配置的 prefix 路径
#[cfg(target_os = "macos")]
fn read_npmrc_prefix(home: &str) -> Option<String> {
    let npmrc_path = format!("{}/.npmrc", home);

    if let Ok(content) = std::fs::read_to_string(&npmrc_path) {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("prefix=") || line.starts_with("prefix =") {
                let prefix = line
                    .split('=')
                    .nth(1)
                    .map(|s| s.trim().trim_matches('"').trim_matches('\''))
                    .map(|s| {
                        // 展开 ~ 为 home 目录
                        if s.starts_with("~/") {
                            format!("{}{}", home, &s[1..])
                        } else if s == "~" {
                            home.to_string()
                        } else {
                            s.to_string()
                        }
                    });

                if let Some(p) = prefix {
                    debug!("Found npm prefix in .npmrc: {}", p);
                    return Some(p);
                }
            }
        }
    }

    None
}

/// 比较 Node 版本号（支持 v22.11.0 格式）
fn compare_node_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse_version = |s: &str| -> Vec<u32> {
        s.trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.parse().ok())
            .collect()
    };

    let a_parts = parse_version(a);
    let b_parts = parse_version(b);

    for i in 0..std::cmp::max(a_parts.len(), b_parts.len()) {
        let a_val = a_parts.get(i).unwrap_or(&0);
        let b_val = b_parts.get(i).unwrap_or(&0);
        match a_val.cmp(b_val) {
            std::cmp::Ordering::Equal => continue,
            other => return other,
        }
    }
    std::cmp::Ordering::Equal
}

/// Get npm global prefix directory
#[cfg(target_os = "macos")]
fn get_npm_prefix() -> Option<String> {
    // Try to run `npm config get prefix`
    let mut cmd = Command::new("npm");
    cmd.args(["config", "get", "prefix"]);

    // Also try with common paths in PATH
    if let Some(shell_path) = get_shell_path() {
        cmd.env("PATH", &shell_path);
    }

    match cmd.output() {
        Ok(output) if output.status.success() => {
            let prefix = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !prefix.is_empty() && prefix != "undefined" {
                debug!("npm prefix: {}", prefix);
                return Some(prefix);
            }
        }
        _ => {}
    }

    // Fallback to common npm prefix locations
    if let Ok(home) = get_home_dir() {
        let common_prefixes = vec![
            format!("{}/.npm-global", home),
            "/usr/local".to_string(),
            "/opt/homebrew".to_string(),
        ];

        for prefix in common_prefixes {
            if std::path::Path::new(&prefix).exists() {
                debug!("Using fallback npm prefix: {}", prefix);
                return Some(prefix);
            }
        }
    }

    None
}

/// Type of Claude installation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InstallationType {
    /// Bundled sidecar binary (preferred)
    Bundled,
    /// System-installed binary
    System,
    /// Custom path specified by user
    Custom,
}

/// Represents a Claude installation with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeInstallation {
    /// Full path to the Claude binary (or "claude-code" for sidecar)
    pub path: String,
    /// Version string if available
    pub version: Option<String>,
    /// Source of discovery (e.g., "nvm", "system", "homebrew", "where", "bundled")
    pub source: String,
    /// Type of installation
    pub installation_type: InstallationType,
}

/// 内部使用的优先级包装，确保环境变量/用户配置优先于 PATH/扫描
struct PrioritizedInstallation {
    priority: u8,
    installation: ClaudeInstallation,
}

/// Current app version - used to detect upgrades and clear stale caches
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// 将路径加入候选列表并去重/校验
fn push_candidate(
    list: &mut Vec<PrioritizedInstallation>,
    seen: &mut std::collections::HashSet<String>,
    path: String,
    source: &str,
    priority: u8,
) {
    let normalized = path.to_lowercase();
    if !seen.insert(normalized.clone()) {
        return;
    }

    let path_obj = PathBuf::from(&path);
    let looks_like_path = path.contains('\\') || path.contains('/');
    if looks_like_path && !path_obj.exists() {
        debug!("Skip non-existing candidate: {}", path);
        return;
    }

    // 执行一次版本探测，失败也允许继续，只是 version 为 None
    let version = get_binary_version_generic(&path);
    if !looks_like_path && version.is_none() {
        debug!("Skip candidate {} because version probe failed and no concrete path", path);
        return;
    }

    list.push(PrioritizedInstallation {
        priority,
        installation: ClaudeInstallation {
            path,
            version,
            source: source.to_string(),
            installation_type: InstallationType::System,
        },
    });
}

/// 组合多来源的候选路径，使用运行时环境信息
fn collect_runtime_candidates(
    tool: &str,
    env_var: &str,
    env: &RuntimeEnvironment,
    user_section: Option<BinarySearchSection>,
) -> Vec<PrioritizedInstallation> {
    let mut candidates: Vec<PrioritizedInstallation> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let aliases = get_tool_aliases(tool, env);

    // 1. 环境变量覆盖
    if let Ok(val) = std::env::var(env_var) {
        if !val.trim().is_empty() {
            info!("Using {} from env var {}", tool, env_var);
            push_candidate(&mut candidates, &mut seen, val, &format!("env:{}", env_var), 0);
        }
    }

    // 2. PATH 中的命令
    for alias in &aliases {
        if let Some(resolved) = resolve_command_in_path(alias, env) {
            push_candidate(&mut candidates, &mut seen, resolved, "PATH", 1);
        }
    }

    // 3. Windows 注册表（仅在 Windows 下有效）
    for alias in &aliases {
        for reg_path in query_registry_paths(alias) {
            push_candidate(&mut candidates, &mut seen, reg_path, "registry", 2);
        }
    }

    // 4. 常见安装目录扫描（按平台分支但使用运行时判断）
    match env.os.as_str() {
        "windows" => {
            let mut search_roots: Vec<String> = Vec::new();
            if let Ok(program_files) = std::env::var("ProgramFiles") {
                search_roots.push(format!(r"{}\{}", program_files, tool));
                search_roots.push(format!(r"{}\{}\bin", program_files, tool));
                search_roots.push(format!(r"{}\nodejs", program_files));
            }
            if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
                search_roots.push(format!(r"{}\{}", program_files_x86, tool));
                search_roots.push(format!(r"{}\nodejs", program_files_x86));
            }
            if let Ok(appdata) = std::env::var("APPDATA") {
                search_roots.push(format!(r"{}\npm", appdata));
                search_roots.push(format!(r"{}\{}", appdata, tool));
            }
            if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
                search_roots.push(format!(r"{}\Programs\{}", local_appdata, tool));
                search_roots.push(format!(r"{}\npm", local_appdata));
            }
            if let Ok(userprofile) = std::env::var("USERPROFILE") {
                search_roots.push(format!(r"{}\scoop\shims", userprofile));
                search_roots.push(format!(r"{}\scoop\apps\{}\current", userprofile, tool));
                search_roots.push(format!(r"{}\AppData\Roaming\npm", userprofile));
                search_roots.push(format!(r"{}\.npm-global\bin", userprofile));
                search_roots.push(format!(r"{}\.local\bin", userprofile));
                search_roots.push(format!(r"{}\.cargo\bin", userprofile));
                search_roots.push(format!(r"{}\Yarn\bin", userprofile));
            }
            if let Ok(programdata) = std::env::var("ProgramData") {
                search_roots.push(format!(r"{}\chocolatey\bin", programdata));
                search_roots.push(format!(r"{}\scoop\shims", programdata));
            }

            // 便携/自定义常见目录
            search_roots.extend(vec![
                r"C:\tools".to_string(),
                r"C:\opt".to_string(),
                r"D:\apps".to_string(),
                r"D:\tools".to_string(),
            ]);

            for root in search_roots {
                for alias in &aliases {
                    let candidate = format!(r"{}\{}", root, alias);
                    push_candidate(&mut candidates, &mut seen, candidate, "common-path", 3);
                }
            }
        }
        "macos" => {
            let mut search_roots: Vec<String> = vec![
                "/usr/local/bin".to_string(),
                "/usr/bin".to_string(),
                "/opt/homebrew/bin".to_string(),
                "/usr/local/sbin".to_string(),
                "/opt/local/bin".to_string(), // MacPorts
                "/Applications".to_string(),
            ];

            if let Ok(home) = std::env::var("HOME") {
                search_roots.extend(vec![
                    format!("{}/.npm-global/bin", home),
                    format!("{}/.local/bin", home),
                    format!("{}/.local/share/pnpm", home),
                    format!("{}/Library/pnpm", home),
                    format!("{}/.cargo/bin", home),
                    format!("{}/.volta/bin", home),
                    format!("{}/.asdf/shims", home),
                    format!("{}/.fnm/aliases/default/bin", home),
                    format!("{}/.local/share/fnm/aliases/default/bin", home),
                    format!("{}/Library/Application Support/fnm/aliases/default/bin", home),
                    format!("{}/.nvm/current/bin", home),
                    format!("{}/.pnpm-global/bin", home),
                    format!("{}/bin", home),
                ]);
            }

            for root in search_roots {
                for alias in &aliases {
                    let candidate = if root.contains(".app") {
                        format!("{}/Contents/MacOS/{}", root, alias)
                    } else if root.ends_with(".app") {
                        format!("{}/Contents/MacOS/{}", root, alias)
                    } else {
                        format!("{}/{}", root, alias)
                    };
                    push_candidate(&mut candidates, &mut seen, candidate, "common-path", 3);
                }
            }
        }
        _ => {
            // Linux / 其他类 Unix
            let mut search_roots: Vec<String> = vec![
                "/usr/local/bin".to_string(),
                "/usr/bin".to_string(),
                "/usr/sbin".to_string(),
                "/snap/bin".to_string(),
                "/var/lib/flatpak/exports/bin".to_string(),
            ];

            if let Ok(home) = std::env::var("HOME") {
                search_roots.extend(vec![
                    format!("{}/.local/bin", home),
                    format!("{}/.npm-global/bin", home),
                    format!("{}/.pnpm-global/bin", home),
                    format!("{}/.volta/bin", home),
                    format!("{}/.asdf/shims", home),
                    format!("{}/.cargo/bin", home),
                    format!("{}/.nvm/current/bin", home),
                    format!("{}/bin", home),
                    format!("{}/.local/share/pnpm", home),
                ]);
            }

            for root in search_roots {
                for alias in &aliases {
                    let candidate = format!("{}/{}", root, alias);
                    push_candidate(&mut candidates, &mut seen, candidate, "common-path", 3);
                }
            }
        }
    }

    // 5. 用户配置文件中的额外搜索路径（优先级最低但可覆盖奇异环境）
    if let Some(section) = user_section {
        if let Some(custom) = section.override_path {
            push_candidate(&mut candidates, &mut seen, custom, "user-config", 4);
        }
        for path in section.search_paths {
            push_candidate(&mut candidates, &mut seen, path, "user-config", 4);
        }
    }

    // WSL 环境：尝试挂载的 Windows 盘符
    if env.is_wsl {
        let windows_mounts = ["/mnt/c", "/mnt/d"];
        for mount in &windows_mounts {
            for alias in &aliases {
                let candidate = format!("{}/Program Files/{}/{}", mount, tool, alias);
                push_candidate(&mut candidates, &mut seen, candidate, "wsl-host", 3);
            }
        }
    }

    candidates
}

/// 按优先级 -> 版本降序选择最佳安装
fn select_best_with_priority(
    mut installations: Vec<PrioritizedInstallation>,
) -> Option<ClaudeInstallation> {
    installations.sort_by(|a, b| {
        a.priority
            .cmp(&b.priority)
            .then_with(|| match (&a.installation.version, &b.installation.version) {
                (Some(v1), Some(v2)) => compare_versions(v2, v1),
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                _ => Ordering::Equal,
            })
    });

    installations.into_iter().map(|p| p.installation).next()
}

/// 通用检测入口，可供 Codex/其他二进制共享
pub fn detect_binary_for_tool(
    tool: &str,
    env_var: &str,
    config_key: &str,
) -> (RuntimeEnvironment, Option<ClaudeInstallation>) {
    let runtime_env = detect_runtime_environment();
    let user_cfg = load_binary_search_config();
    let user_section = pick_section(&user_cfg, config_key);

    let prioritized = collect_runtime_candidates(tool, env_var, &runtime_env, user_section);
    let best = select_best_with_priority(prioritized);
    (runtime_env, best)
}

/// 获取当前平台下可执行名称的别名集合（含 .exe/.cmd）
fn get_tool_aliases(tool: &str, env: &RuntimeEnvironment) -> Vec<String> {
    if env.os == "windows" {
        vec![
            format!("{}.exe", tool),
            format!("{}.cmd", tool),
            tool.to_string(),
        ]
    } else {
        vec![tool.to_string()]
    }
}

/// 在 PATH 中解析命令实际路径
fn resolve_command_in_path(command: &str, env: &RuntimeEnvironment) -> Option<String> {
    let lookup_cmd = if env.os == "windows" { "where" } else { "which" };
    let mut cmd = Command::new(lookup_cmd);
    cmd.arg(command);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    cmd.output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let output = String::from_utf8_lossy(&o.stdout);
            output.lines().next().map(|l| l.trim().to_string())
        })
        .and_then(|path| {
            let path_buf = PathBuf::from(&path);
            if path_buf.exists() {
                Some(path)
            } else {
                None
            }
        })
}

/// Windows 注册表查询 App Paths，获取安装路径
#[cfg(target_os = "windows")]
fn query_registry_paths(tool: &str) -> Vec<String> {
    let mut results = Vec::new();
    let keys = [
        format!(r"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{}", tool),
        format!(r"HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{}", tool),
    ];

    for key in keys {
        let mut cmd = Command::new("reg");
        cmd.args(["query", &key, "/ve"]);
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);

        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 3 {
                        let candidate = parts[parts.len() - 1];
                        if PathBuf::from(candidate).exists() {
                            results.push(candidate.to_string());
                        }
                    }
                }
            }
        }
    }

    results
}

#[cfg(not(target_os = "windows"))]
fn query_registry_paths(_tool: &str) -> Vec<String> {
    Vec::new()
}

/// Main function to find the Claude binary - Cross-platform version
/// Supports Windows and macOS, only uses system-installed Claude CLI
/// 🔥 增强：添加详细日志，支持多 Node 版本场景
pub fn find_claude_binary(app_handle: &tauri::AppHandle) -> Result<String, String> {
    info!("========================================");
    info!("Starting Claude CLI binary search...");
    info!("========================================");

    // 打印平台信息
    #[cfg(target_os = "macos")]
    info!("Platform: macOS");
    #[cfg(target_os = "windows")]
    info!("Platform: Windows");

    // First check if we have a stored path in the database
    if let Ok(app_data_dir) = app_handle.path().app_data_dir() {
        let db_path = app_data_dir.join("agents.db");
        if db_path.exists() {
            if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                // Check if app version has changed - if so, clear CLI path cache
                let stored_version: Option<String> = conn
                    .query_row(
                        "SELECT value FROM app_settings WHERE key = 'app_version'",
                        [],
                        |row| row.get::<_, String>(0),
                    )
                    .ok();

                let version_changed = stored_version.as_deref() != Some(APP_VERSION);
                if version_changed {
                    info!(
                        "App version changed from {:?} to {}, clearing CLI path cache",
                        stored_version, APP_VERSION
                    );
                    // Clear cached CLI paths on version upgrade
                    let _ = conn.execute(
                        "DELETE FROM app_settings WHERE key = 'claude_binary_path'",
                        [],
                    );
                    // Update stored version
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('app_version', ?1)",
                        rusqlite::params![APP_VERSION],
                    );
                }

                // Only use cached path if version hasn't changed
                if !version_changed {
                    if let Ok(stored_path) = conn.query_row(
                        "SELECT value FROM app_settings WHERE key = 'claude_binary_path'",
                        [],
                        |row| row.get::<_, String>(0),
                    ) {
                        info!("Found cached claude path in database: {}", stored_path);

                        // Verify the stored path still exists and is accessible
                        let path_buf = PathBuf::from(&stored_path);
                        if path_buf.exists() && path_buf.is_file() {
                            // Test if the binary is actually executable
                            if test_claude_binary(&stored_path) {
                                info!("✅ Using cached Claude CLI path: {}", stored_path);
                                return Ok(stored_path);
                            } else {
                                warn!(
                                    "❌ Cached claude path exists but is not executable: {}",
                                    stored_path
                                );
                                // Remove invalid cached path
                                let _ = conn.execute(
                                    "DELETE FROM app_settings WHERE key = 'claude_binary_path'",
                                    [],
                                );
                            }
                        } else {
                            warn!("❌ Cached claude path no longer exists: {}", stored_path);
                            // Remove invalid cached path
                            let _ = conn.execute(
                                "DELETE FROM app_settings WHERE key = 'claude_binary_path'",
                                [],
                            );
                        }
                    }
                }
            }
        }
    }

    info!("No valid cached path found, starting fresh discovery...");

    // 运行时环境 & 用户配置
    let runtime_env = detect_runtime_environment();
    let user_cfg = load_binary_search_config();
    let user_section = pick_section(&user_cfg, "claude");

    // 新的运行时候选收集（支持 env/注册表/常见路径/用户路径）
    let mut prioritized = collect_runtime_candidates("claude", "CLAUDE_PATH", &runtime_env, user_section);

    // 兼容旧逻辑：补充 discover_system_installations 结果，优先级稍低
    let legacy = discover_system_installations()
        .into_iter()
        .map(|inst| PrioritizedInstallation {
            priority: 5,
            installation: inst,
        });
    prioritized.extend(legacy);

    if prioritized.is_empty() {
        error!("❌ Could not find Claude CLI in any location (runtime detection empty)");
        return Err("Claude CLI not found. 请安装 'npm install -g @anthropic-ai/claude-code' 或检查 CLAUDE_PATH 设置".to_string());
    }

    info!(
        "Found {} Claude installation candidate(s), selecting best version with priority...",
        prioritized.len()
    );

    if let Some(best) = select_best_with_priority(prioritized) {
        info!("========================================");
        info!(
            "✅ Selected Claude CLI: {}",
            best.path
        );
        info!(
            "   Version: {:?}",
            best.version.as_deref().unwrap_or("unknown")
        );
        info!("   Source: {}", best.source);
        info!("========================================");

        // Store the successful path in database for future use
        if let Err(e) = store_claude_path(app_handle, &best.path) {
            warn!("Failed to store claude path in database: {}", e);
        }

        Ok(best.path)
    } else {
        error!("❌ No working Claude CLI installation found");
        Err("No working Claude CLI installation found".to_string())
    }
}

/// Store Claude CLI path in database for future use
fn store_claude_path(app_handle: &tauri::AppHandle, path: &str) -> Result<(), String> {
    if let Ok(app_data_dir) = app_handle.path().app_data_dir() {
        if let Err(e) = std::fs::create_dir_all(&app_data_dir) {
            return Err(format!("Failed to create app data directory: {}", e));
        }

        let db_path = app_data_dir.join("agents.db");
        match rusqlite::Connection::open(&db_path) {
            Ok(conn) => {
                // Create table if it doesn't exist
                if let Err(e) = conn.execute(
                    "CREATE TABLE IF NOT EXISTS app_settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )",
                    [],
                ) {
                    return Err(format!("Failed to create settings table: {}", e));
                }

                // Store the path
                if let Err(e) = conn.execute(
                    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
                    rusqlite::params!["claude_binary_path", path],
                ) {
                    return Err(format!("Failed to store claude path: {}", e));
                }

                info!("Stored claude path in database: {}", path);
                Ok(())
            }
            Err(e) => Err(format!("Failed to open database: {}", e)),
        }
    } else {
        Err("Failed to get app data directory".to_string())
    }
}

/// Test if a Claude binary is actually functional (cross-platform)
fn test_claude_binary(path: &str) -> bool {
    debug!("Testing Claude binary at: {}", path);

    // Test with a simple --version command
    let mut cmd = Command::new(path);
    cmd.arg("--version");

    // Add CREATE_NO_WINDOW flag on Windows to prevent terminal window popup
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    match cmd.output() {
        Ok(output) => {
            let success = output.status.success();
            debug!("Claude binary test result: success={}", success);
            success
        }
        Err(e) => {
            debug!("Failed to test Claude binary: {}", e);
            false
        }
    }
}

/// Discovers all available Claude installations and returns them for selection
/// This allows UI to show a version selector - System installations only
#[allow(dead_code)]
pub fn discover_claude_installations() -> Vec<ClaudeInstallation> {
    info!("Discovering all system Claude installations...");

    let mut installations = Vec::new();

    // Only discover system installations - no bundled sidecar
    installations.extend(discover_system_installations());

    // Sort by installation type, then by version (highest first), then by source preference
    installations.sort_by(|a, b| {
        match (&a.version, &b.version) {
            (Some(v1), Some(v2)) => {
                // Compare versions in descending order (newest first)
                match compare_versions(v2, v1) {
                    Ordering::Equal => {
                        // If versions are equal, prefer by source
                        source_preference(a).cmp(&source_preference(b))
                    }
                    other => other,
                }
            }
            (Some(_), None) => Ordering::Less, // Version comes before no version
            (None, Some(_)) => Ordering::Greater,
            (None, None) => source_preference(a).cmp(&source_preference(b)),
        }
    });

    installations
}

/// Returns a preference score for installation sources (lower is better)
#[allow(dead_code)]
fn source_preference(installation: &ClaudeInstallation) -> u8 {
    match installation.source.as_str() {
        "where" => 1,
        "homebrew" => 2,
        "system" => 3,
        source if source.starts_with("nvm") => 4,
        "local-bin" => 5,
        "claude-local" => 6,
        "npm-global" => 7,
        "yarn" | "yarn-global" => 8,
        "bun" => 9,
        "node-modules" => 10,
        "home-bin" => 11,
        "PATH" => 12,
        _ => 13,
    }
}

/// Discovers all Claude system installations on the system (cross-platform)
fn discover_system_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    // 1. Try system path lookup command (where/which)
    if let Some(installation) = try_where_command() {
        installations.push(installation);
    }

    // 2. Try aliased which command
    if let Some(installation) = try_which_command() {
        installations.push(installation);
    }

    // 3. Check NVM paths (cross-platform)
    installations.extend(find_nvm_installations());

    // 4. Check standard paths (cross-platform)
    installations.extend(find_standard_installations());

    // 5. Check platform-specific paths
    installations.extend(find_windows_installations());
    installations.extend(find_macos_installations());

    // Remove duplicates by path
    let mut unique_paths = std::collections::HashSet::new();
    installations.retain(|install| unique_paths.insert(install.path.clone()));

    // Test each installation for actual functionality with timeout
    // 🔧 FIX: In debug/development mode, be more lenient with testing
    // Development builds may have stricter security restrictions that prevent spawning processes
    #[cfg(debug_assertions)]
    {
        // In dev mode, if binary exists on disk and is a file, consider it valid
        // This avoids issues with process spawning restrictions in Tauri dev mode
        installations.retain(|install| {
            // For PATH-based lookups (e.g., "claude" without full path), try to test
            if !install.path.contains('/') && !install.path.contains('\\') {
                let is_functional = test_claude_binary(&install.path);
                if !is_functional {
                    warn!(
                        "Claude installation at {} is not functional in dev mode, removing from list",
                        install.path
                    );
                }
                return is_functional;
            }

            // For full paths, just check if file exists (more lenient in dev mode)
            let path_buf = PathBuf::from(&install.path);
            let exists = path_buf.exists() && path_buf.is_file();
            if exists {
                info!(
                    "Dev mode: Found Claude at {} (skipping functionality test)",
                    install.path
                );
            } else {
                warn!(
                    "Dev mode: Claude path does not exist: {}",
                    install.path
                );
            }
            exists
        });
    }

    #[cfg(not(debug_assertions))]
    {
        // In production builds, perform full functionality tests
        installations.retain(|install| {
            let is_functional = test_claude_binary(&install.path);
            if !is_functional {
                warn!(
                    "Claude installation at {} is not functional, removing from list",
                    install.path
                );
            }
            is_functional
        });
    }

    installations
}

/// Try using the system path lookup command to find Claude (cross-platform)
fn try_where_command() -> Option<ClaudeInstallation> {
    #[cfg(target_os = "windows")]
    let (command, source) = ("where", "where");
    #[cfg(not(target_os = "windows"))]
    let (command, source) = ("which", "which");

    debug!("Trying '{}' to find claude binary...", command);

    let mut cmd = Command::new(command);
    cmd.arg("claude");

    // Add CREATE_NO_WINDOW flag on Windows to prevent terminal window popup
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    // On macOS, set the shell PATH so 'which' can find binaries installed via npm/nvm/etc.
    #[cfg(target_os = "macos")]
    {
        if let Some(shell_path) = get_shell_path() {
            debug!("Setting PATH for 'which' command: {}", shell_path);
            cmd.env("PATH", &shell_path);
        }
    }

    match cmd.output() {
        Ok(output) if output.status.success() => {
            let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();

            if output_str.is_empty() {
                return None;
            }

            // 'where' can return multiple paths, take the first one
            let path = output_str.lines().next()?.trim().to_string();

            debug!("'{}' found claude at: {}", command, path);

            // Verify the path exists
            if !PathBuf::from(&path).exists() {
                warn!("Path from '{}' does not exist: {}", command, path);
                return None;
            }

            // Get version
            let version = get_claude_version(&path).ok().flatten();

            Some(ClaudeInstallation {
                path,
                version,
                source: source.to_string(),
                installation_type: InstallationType::System,
            })
        }
        _ => None,
    }
}

/// Try parsing aliased which output (mostly for macOS/Linux)
fn try_which_command() -> Option<ClaudeInstallation> {
    #[cfg(target_os = "windows")]
    let command = "where";
    #[cfg(not(target_os = "windows"))]
    let command = "which";

    debug!("Trying '{}' with alias parsing...", command);

    let mut cmd = Command::new(command);
    cmd.arg("claude");

    // Add CREATE_NO_WINDOW flag on Windows to prevent terminal window popup
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    // On macOS, set the shell PATH so 'which' can find binaries installed via npm/nvm/etc.
    #[cfg(target_os = "macos")]
    {
        if let Some(shell_path) = get_shell_path() {
            debug!("Setting PATH for 'which' alias parsing: {}", shell_path);
            cmd.env("PATH", &shell_path);
        }
    }

    match cmd.output() {
        Ok(output) if output.status.success() => {
            let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();

            if output_str.is_empty() {
                return None;
            }

            // Parse aliased output: "claude: aliased to /path/to/claude"
            let path = if output_str.starts_with("claude:") && output_str.contains("aliased to") {
                output_str
                    .split("aliased to")
                    .nth(1)
                    .map(|s| s.trim().to_string())
            } else {
                Some(output_str.lines().next()?.trim().to_string())
            }?;

            debug!("'{}' found claude at: {}", command, path);

            // Verify the path exists
            if !PathBuf::from(&path).exists() {
                warn!("Path from '{}' does not exist: {}", command, path);
                return None;
            }

            // Get version
            let version = get_claude_version(&path).ok().flatten();

            Some(ClaudeInstallation {
                path,
                version,
                source: command.to_string(),
                installation_type: InstallationType::System,
            })
        }
        _ => None,
    }
}

/// Find Claude installations in NVM directories (cross-platform)
/// 🔥 增强：按 Node 版本号降序排列，确保最新版本的 claude cli 优先
fn find_nvm_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    // Get home directory based on platform
    let home = get_home_dir().ok();
    if home.is_none() {
        return installations;
    }
    let home = home.unwrap();

    let nvm_dir = PathBuf::from(&home)
        .join(".nvm")
        .join("versions")
        .join("node");

    debug!("Checking NVM directory: {:?}", nvm_dir);

    if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
        // 收集所有 Node 版本目录
        let mut node_dirs: Vec<_> = entries
            .flatten()
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .collect();

        // 🔥 按 Node 版本号降序排列（最新版本在前）
        node_dirs.sort_by(|a, b| {
            let a_ver = a.file_name().to_string_lossy().to_string();
            let b_ver = b.file_name().to_string_lossy().to_string();
            compare_node_versions(&b_ver, &a_ver)
        });

        info!(
            "Found {} NVM node versions, sorted by version (newest first)",
            node_dirs.len()
        );

        for entry in node_dirs {
            // Platform-specific binary names
            #[cfg(target_os = "windows")]
            let claude_names = vec!["claude.cmd", "claude"];
            #[cfg(not(target_os = "windows"))]
            let claude_names = vec!["claude"];

            for name in claude_names {
                let claude_path = entry.path().join("bin").join(name);
                if claude_path.exists() && claude_path.is_file() {
                    let path_str = claude_path.to_string_lossy().to_string();
                    let node_version = entry.file_name().to_string_lossy().to_string();

                    info!(
                        "Found Claude in NVM node {}: {}",
                        node_version, path_str
                    );

                    // Get Claude version
                    let version = get_claude_version(&path_str).ok().flatten();

                    installations.push(ClaudeInstallation {
                        path: path_str,
                        version: version.clone(),
                        source: format!("nvm ({})", node_version),
                        installation_type: InstallationType::System,
                    });

                    // 记录版本信息
                    if let Some(v) = &version {
                        info!(
                            "  -> Claude version: {} (Node {})",
                            v, node_version
                        );
                    }

                    break; // Only add one per node version
                }
            }
        }
    }

    // 🔥 日志：显示找到的所有 NVM 安装
    if !installations.is_empty() {
        info!(
            "Total NVM Claude installations found: {} (will prefer newest version)",
            installations.len()
        );
    }

    installations
}

/// Check standard installation paths (cross-platform)
fn find_standard_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();
    let mut paths_to_check: Vec<(String, String)> = vec![];

    // Get home directory based on platform
    if let Ok(home) = get_home_dir() {
        // Common paths for both platforms
        paths_to_check.extend(vec![
            (
                format!("{}/.claude/local/claude", home),
                "claude-local".to_string(),
            ),
            (
                format!("{}/.local/bin/claude", home),
                "local-bin".to_string(),
            ),
            (
                format!("{}/.npm-global/bin/claude", home),
                "npm-global".to_string(),
            ),
            (format!("{}/.yarn/bin/claude", home), "yarn".to_string()),
            (format!("{}/.bun/bin/claude", home), "bun".to_string()),
            (format!("{}/bin/claude", home), "home-bin".to_string()),
            (
                format!("{}/node_modules/.bin/claude", home),
                "node-modules".to_string(),
            ),
            (
                format!("{}/.config/yarn/global/node_modules/.bin/claude", home),
                "yarn-global".to_string(),
            ),
        ]);

        // Windows-specific paths
        #[cfg(target_os = "windows")]
        {
            paths_to_check.extend(vec![
                (
                    format!("{}/AppData/Roaming/npm/claude.cmd", home),
                    "npm-global-windows".to_string(),
                ),
                (
                    format!("{}/AppData/Roaming/npm/claude", home),
                    "npm-global-windows".to_string(),
                ),
            ]);
        }

        // macOS-specific paths
        #[cfg(target_os = "macos")]
        {
            paths_to_check.extend(vec![
                (
                    "/usr/local/bin/claude".to_string(),
                    "usr-local-bin".to_string(),
                ),
                (
                    "/opt/homebrew/bin/claude".to_string(),
                    "homebrew".to_string(),
                ),
            ]);
        }
    }

    // Check each path
    for (path, source) in paths_to_check {
        let path_buf = PathBuf::from(&path);
        if path_buf.exists() && path_buf.is_file() {
            debug!("Found claude at standard path: {} ({})", path, source);

            // Get version
            let version = get_claude_version(&path).ok().flatten();

            installations.push(ClaudeInstallation {
                path,
                version,
                source,
                installation_type: InstallationType::System,
            });
        }
    }

    // Check if claude is available in PATH (cross-platform)
    #[cfg(target_os = "windows")]
    let claude_commands = vec!["claude", "claude.cmd"];
    #[cfg(not(target_os = "windows"))]
    let claude_commands = vec!["claude"];

    for cmd in claude_commands {
        let mut command = Command::new(cmd);
        command.arg("--version");

        // Add CREATE_NO_WINDOW flag on Windows to prevent terminal window popup
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        if let Ok(output) = command.output() {
            if output.status.success() {
                debug!("{} is available in PATH", cmd);
                let version = extract_version_from_output(&output.stdout);

                installations.push(ClaudeInstallation {
                    path: cmd.to_string(),
                    version,
                    source: "PATH".to_string(),
                    installation_type: InstallationType::System,
                });
                break; // Only add one PATH entry
            }
        }
    }

    installations
}

/// Find Windows-specific Claude installations
fn find_windows_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    // Windows-specific paths
    let mut paths_to_check: Vec<(String, String)> = vec![];

    // Check Program Files locations
    if let Ok(program_files) = std::env::var("ProgramFiles") {
        paths_to_check.extend(vec![
            (
                format!("{}\\nodejs\\claude.cmd", program_files),
                "nodejs".to_string(),
            ),
            (
                format!("{}\\nodejs\\claude", program_files),
                "nodejs".to_string(),
            ),
        ]);
    }

    if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
        paths_to_check.extend(vec![
            (
                format!("{}\\nodejs\\claude.cmd", program_files_x86),
                "nodejs-x86".to_string(),
            ),
            (
                format!("{}\\nodejs\\claude", program_files_x86),
                "nodejs-x86".to_string(),
            ),
        ]);
    }

    // Check AppData locations
    if let Ok(appdata) = std::env::var("APPDATA") {
        paths_to_check.extend(vec![
            (
                format!("{}\\npm\\claude.cmd", appdata),
                "npm-appdata".to_string(),
            ),
            (
                format!("{}\\npm\\claude", appdata),
                "npm-appdata".to_string(),
            ),
        ]);
    }

    // Check each path
    for (path, source) in paths_to_check {
        let path_buf = PathBuf::from(&path);
        if path_buf.exists() && path_buf.is_file() {
            debug!("Found claude at Windows path: {} ({})", path, source);

            // Get version
            let version = get_claude_version(&path).ok().flatten();

            installations.push(ClaudeInstallation {
                path,
                version,
                source,
                installation_type: InstallationType::System,
            });
        }
    }

    installations
}

/// Find macOS-specific Claude installations
#[cfg(target_os = "macos")]
fn find_macos_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();
    let mut paths_to_check: Vec<(String, String)> = vec![];

    // ⚡ 增强：添加更多 macOS 新系统的路径

    // Homebrew paths (both Intel and Apple Silicon)
    paths_to_check.extend(vec![
        (
            "/usr/local/bin/claude".to_string(),
            "homebrew-intel".to_string(),
        ),
        (
            "/opt/homebrew/bin/claude".to_string(),
            "homebrew-arm".to_string(),
        ),
    ]);

    // MacPorts
    paths_to_check.push(("/opt/local/bin/claude".to_string(), "macports".to_string()));

    // NPM 全局安装路径（最新 macOS 常见）
    paths_to_check.extend(vec![
        (
            "/usr/local/share/npm/bin/claude".to_string(),
            "npm-system".to_string(),
        ),
        (
            "/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/bin/claude.js".to_string(),
            "homebrew-npm".to_string(),
        ),
        (
            "/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.js".to_string(),
            "npm-lib".to_string(),
        ),
    ]);

    // System-wide installations
    paths_to_check.push(("/usr/bin/claude".to_string(), "system".to_string()));

    // 检查用户目录下的 npm/pnpm 路径
    if let Ok(home) = get_home_dir() {
        paths_to_check.extend(vec![
            // npm prefix 自定义路径
            (format!("{}/npm/bin/claude", home), "npm-custom".to_string()),
            (
                format!("{}/.npm/bin/claude", home),
                "npm-hidden".to_string(),
            ),
            // pnpm 全局路径
            (
                format!("{}/Library/pnpm/claude", home),
                "pnpm-library".to_string(),
            ),
            (
                format!("{}/.local/share/pnpm/claude", home),
                "pnpm-local".to_string(),
            ),
            (
                format!("{}/.pnpm-global/bin/claude", home),
                "pnpm-global".to_string(),
            ),
            // Node 版本管理器路径 - n
            (format!("{}/.n/bin/claude", home), "n-version".to_string()),
            // asdf
            (format!("{}/.asdf/shims/claude", home), "asdf".to_string()),
            // Volta
            (format!("{}/.volta/bin/claude", home), "volta".to_string()),
            // fnm (Fast Node Manager) paths
            (
                format!("{}/.fnm/aliases/default/bin/claude", home),
                "fnm".to_string(),
            ),
            (
                format!("{}/.local/share/fnm/aliases/default/bin/claude", home),
                "fnm-local".to_string(),
            ),
            (
                format!("{}/Library/Application Support/fnm/aliases/default/bin/claude", home),
                "fnm-app-support".to_string(),
            ),
            // nvm current symlink (points to currently active node version)
            (
                format!("{}/.nvm/current/bin/claude", home),
                "nvm-current".to_string(),
            ),
            // Additional npm global paths that users commonly configure
            (
                format!("{}/node_modules/.bin/claude", home),
                "home-node-modules".to_string(),
            ),
        ]);

        // 🔥 动态获取 npm prefix 并添加路径
        if let Some(npm_prefix) = get_npm_prefix() {
            let npm_bin_path = format!("{}/bin/claude", npm_prefix);
            if !paths_to_check.iter().any(|(p, _)| p == &npm_bin_path) {
                debug!("Adding npm prefix path: {}", npm_bin_path);
                paths_to_check.push((npm_bin_path, "npm-prefix".to_string()));
            }
        }

        // 🔥 扫描 nvm 的 node 版本目录
        let nvm_versions_dir = format!("{}/.nvm/versions/node", home);
        if let Ok(entries) = std::fs::read_dir(&nvm_versions_dir) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let claude_path = entry.path().join("bin").join("claude");
                    if claude_path.exists() {
                        let node_version = entry.file_name().to_string_lossy().to_string();
                        paths_to_check.push((
                            claude_path.to_string_lossy().to_string(),
                            format!("nvm-{}", node_version),
                        ));
                    }
                }
            }
        }

        // 🔥 扫描 fnm 的 node 版本目录
        for fnm_base in &[
            format!("{}/.fnm/node-versions", home),
            format!("{}/.local/share/fnm/node-versions", home),
            format!("{}/Library/Application Support/fnm/node-versions", home),
        ] {
            if let Ok(entries) = std::fs::read_dir(fnm_base) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let claude_path = entry.path().join("installation").join("bin").join("claude");
                        if claude_path.exists() {
                            let node_version = entry.file_name().to_string_lossy().to_string();
                            paths_to_check.push((
                                claude_path.to_string_lossy().to_string(),
                                format!("fnm-{}", node_version),
                            ));
                        }
                    }
                }
            }
        }
    }

    // Check each path
    for (path, source) in paths_to_check {
        let path_buf = PathBuf::from(&path);
        if path_buf.exists() && path_buf.is_file() {
            debug!("Found claude at macOS path: {} ({})", path, source);

            // Get version
            let version = get_claude_version(&path).ok().flatten();

            installations.push(ClaudeInstallation {
                path,
                version,
                source,
                installation_type: InstallationType::System,
            });
        }
    }

    installations
}

#[cfg(not(target_os = "macos"))]
fn find_macos_installations() -> Vec<ClaudeInstallation> {
    vec![]
}

/// 通用的版本获取（用于 Claude/Codex 等 CLI）
fn get_binary_version_generic(path: &str) -> Option<String> {
    let mut cmd = Command::new(path);
    cmd.arg("--version");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    match cmd.output() {
        Ok(output) if output.status.success() => extract_version_from_output(&output.stdout),
        _ => None,
    }
}

/// Get Claude version by running --version command (cross-platform)
fn get_claude_version(path: &str) -> Result<Option<String>, String> {
    debug!("Getting version for Claude at: {}", path);

    let mut cmd = Command::new(path);
    cmd.arg("--version");

    // Add CREATE_NO_WINDOW flag on Windows to prevent terminal window popup
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                let version = extract_version_from_output(&output.stdout);
                debug!("Successfully got version: {:?}", version);
                Ok(version)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                debug!("Claude version command failed with stderr: {}", stderr);
                Ok(None)
            }
        }
        Err(e) => {
            debug!("Failed to execute version command for {}: {}", path, e);
            Ok(None)
        }
    }
}

/// Extract version string from command output
fn extract_version_from_output(stdout: &[u8]) -> Option<String> {
    let output_str = String::from_utf8_lossy(stdout);

    // Debug log the raw output
    debug!("Raw version output: {:?}", output_str);

    // Use regex to directly extract version pattern (e.g., "1.0.41")
    // This pattern matches:
    // - One or more digits, followed by
    // - A dot, followed by
    // - One or more digits, followed by
    // - A dot, followed by
    // - One or more digits
    // - Optionally followed by pre-release/build metadata
    let version_regex =
        regex::Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)").ok()?;

    if let Some(captures) = version_regex.captures(&output_str) {
        if let Some(version_match) = captures.get(1) {
            let version = version_match.as_str().to_string();
            debug!("Extracted version: {:?}", version);
            return Some(version);
        }
    }

    debug!("No version found in output");
    None
}

/// Select the best installation based on version
/// 🔥 增强：优先选择最新版本的 Claude CLI，并添加详细日志
fn select_best_installation(installations: Vec<ClaudeInstallation>) -> Option<ClaudeInstallation> {
    if installations.is_empty() {
        warn!("No Claude installations to select from");
        return None;
    }

    info!(
        "Selecting best Claude installation from {} candidates",
        installations.len()
    );

    // 打印所有候选安装
    for (i, install) in installations.iter().enumerate() {
        info!(
            "  Candidate {}: path={}, version={:?}, source={}",
            i + 1,
            install.path,
            install.version,
            install.source
        );
    }

    // In production builds, version information may not be retrievable because
    // spawning external processes can be restricted. We therefore no longer
    // discard installations that lack a detected version – the mere presence
    // of a readable binary on disk is enough to consider it valid. We still
    // prefer binaries with version information when it is available so that
    // in development builds we keep the previous behaviour of picking the
    // most recent version.
    let best = installations.into_iter().max_by(|a, b| {
        match (&a.version, &b.version) {
            // If both have versions, compare them semantically.
            (Some(v1), Some(v2)) => {
                let result = compare_versions(v1, v2);
                debug!(
                    "Comparing versions: {} vs {} -> {:?}",
                    v1, v2, result
                );
                result
            }
            // Prefer the entry that actually has version information.
            (Some(_), None) => {
                debug!(
                    "Preferring {} (has version) over {} (no version)",
                    a.path, b.path
                );
                Ordering::Greater
            }
            (None, Some(_)) => {
                debug!(
                    "Preferring {} (has version) over {} (no version)",
                    b.path, a.path
                );
                Ordering::Less
            }
            // Neither have version info: prefer by source priority
            (None, None) => {
                // 定义来源优先级（数字越小优先级越高）
                let get_source_priority = |source: &str| -> i32 {
                    match source {
                        // npm-global 和用户自定义路径优先级最高
                        s if s.contains("npm-global") || s.contains("npm-prefix") => 1,
                        // 用户主目录下的路径
                        s if s.contains("local-bin") => 2,
                        // Homebrew 安装
                        s if s.contains("homebrew") => 3,
                        // NVM 安装 - 按 Node 版本选择（已排序）
                        s if s.starts_with("nvm") => 4,
                        // which/where 命令找到的路径
                        "which" | "where" => 5,
                        // PATH 中找到的
                        "PATH" => 6,
                        // 其他
                        _ => 10,
                    }
                };

                let a_priority = get_source_priority(&a.source);
                let b_priority = get_source_priority(&b.source);

                if a_priority != b_priority {
                    debug!(
                        "Comparing by source priority: {} ({}) vs {} ({})",
                        a.source, a_priority, b.source, b_priority
                    );
                    return a_priority.cmp(&b_priority).reverse();
                }

                // 如果优先级相同，优先选择完整路径而非 "claude"
                if a.path == "claude" && b.path != "claude" {
                    Ordering::Less
                } else if a.path != "claude" && b.path == "claude" {
                    Ordering::Greater
                } else {
                    Ordering::Equal
                }
            }
        }
    });

    if let Some(ref selected) = best {
        info!(
            "🎯 Selected Claude installation: path={}, version={:?}, source={}",
            selected.path, selected.version, selected.source
        );
    }

    best
}

/// Windows-specific: Resolve .cmd wrapper to actual Node.js script path
/// Returns (node_path, script_path) if successful
#[cfg(target_os = "windows")]
fn resolve_cmd_wrapper(cmd_path: &str) -> Option<(String, String)> {
    use std::fs;

    debug!("Attempting to resolve .cmd wrapper: {}", cmd_path);

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
                    if let Some(parent) = std::path::Path::new(cmd_path).parent() {
                        let script_path = parent.join(script_relative).to_string_lossy().to_string();

                        // Verify the script exists
                        if PathBuf::from(&script_path).exists() {
                            debug!("Resolved .cmd wrapper to script: {}", script_path);
                            return Some(("node".to_string(), script_path));
                        }
                    }
                }
            }
        }
    }

    debug!("Failed to resolve .cmd wrapper");
    None
}

#[cfg(not(target_os = "windows"))]
fn resolve_cmd_wrapper(_cmd_path: &str) -> Option<(String, String)> {
    None
}

/// Compare two version strings
fn compare_versions(a: &str, b: &str) -> Ordering {
    // Simple semantic version comparison
    let a_parts: Vec<u32> = a
        .split('.')
        .filter_map(|s| {
            // Handle versions like "1.0.17-beta" by taking only numeric part
            s.chars()
                .take_while(|c| c.is_numeric())
                .collect::<String>()
                .parse()
                .ok()
        })
        .collect();

    let b_parts: Vec<u32> = b
        .split('.')
        .filter_map(|s| {
            s.chars()
                .take_while(|c| c.is_numeric())
                .collect::<String>()
                .parse()
                .ok()
        })
        .collect();

    // Compare each part
    for i in 0..std::cmp::max(a_parts.len(), b_parts.len()) {
        let a_val = a_parts.get(i).unwrap_or(&0);
        let b_val = b_parts.get(i).unwrap_or(&0);
        match a_val.cmp(b_val) {
            Ordering::Equal => continue,
            other => return other,
        }
    }

    Ordering::Equal
}

/// Helper function to create a Command with proper environment variables (cross-platform)
pub fn create_command_with_env(program: &str) -> Command {
    // On Windows, if the program is a .cmd file, try to resolve it to direct Node.js invocation
    // This prevents the cmd.exe window from appearing
    #[cfg(target_os = "windows")]
    let (final_program, extra_args) = {
        if program.ends_with(".cmd") {
            if let Some((node_path, script_path)) = resolve_cmd_wrapper(program) {
                info!("Resolved .cmd wrapper {} to Node.js script: {}", program, script_path);
                (node_path, vec![script_path])
            } else {
                (program.to_string(), vec![])
            }
        } else {
            (program.to_string(), vec![])
        }
    };

    #[cfg(not(target_os = "windows"))]
    let (final_program, extra_args) = (program.to_string(), Vec::<String>::new());

    let mut cmd = Command::new(&final_program);

    // Add any extra arguments (e.g., script path when using node directly)
    for arg in extra_args {
        cmd.arg(arg);
    }

    // Add CREATE_NO_WINDOW flag on Windows to prevent terminal window popup
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    // Inherit essential environment variables from parent process
    for (key, value) in std::env::vars() {
        // Pass through important environment variables
        let should_pass = key == "PATH"
            || key == "USER"
            || key == "HOME"
            || key == "NODE_PATH"
            || key == "NVM_DIR"
            || key == "NVM_BIN"
            // Windows-specific
            || key == "USERPROFILE"
            || key == "USERNAME"
            || key == "COMPUTERNAME"
            || key == "APPDATA"
            || key == "LOCALAPPDATA"
            || key == "TEMP"
            || key == "TMP";

        if should_pass {
            debug!("Inheriting env var: {}={}", key, value);
            cmd.env(&key, &value);
        }
    }

    // Add NVM support if the program is in an NVM directory (cross-platform)
    if program.contains("\\.nvm\\versions\\node\\") || program.contains("/.nvm/versions/node/") {
        if let Some(node_bin_dir) = std::path::Path::new(program).parent() {
            // Ensure the Node.js bin directory is in PATH
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                // Use platform-specific path separator
                #[cfg(target_os = "windows")]
                let separator = ";";
                #[cfg(not(target_os = "windows"))]
                let separator = ":";

                let new_path = format!("{}{}{}", node_bin_str, separator, current_path);
                debug!("Adding NVM bin directory to PATH: {}", node_bin_str);
                cmd.env("PATH", new_path);
            }
        }
    }

    // 🔥 新增：读取 ~/.claude/settings.json 中的自定义环境变量
    // 这些变量会覆盖系统环境变量，确保用户的自定义配置生效
    if let Some(home_dir) = dirs::home_dir() {
        let settings_path = home_dir.join(".claude").join("settings.json");
        if settings_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&settings_path) {
                if let Ok(settings) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(env_obj) = settings.get("env").and_then(|v| v.as_object()) {
                        info!("Loading {} custom environment variables from settings.json", env_obj.len());
                        for (key, value) in env_obj {
                            if let Some(value_str) = value.as_str() {
                                info!("Setting custom env var: {}={}", key, value_str);
                                cmd.env(key, value_str);
                            }
                        }
                    }
                }
            }
        }
    }

    cmd
}
