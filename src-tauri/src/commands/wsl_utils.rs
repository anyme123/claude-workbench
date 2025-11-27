#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

//! WSL (Windows Subsystem for Linux) 兼容性工具
//!
//! 提供 Windows 主机与 WSL 环境之间的路径转换和命令执行支持
//! 主要用于 Windows + WSL Codex 场景

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;

#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
use log::{debug, info, warn};

// Windows CREATE_NO_WINDOW 标志
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ============================================================================
// Codex 模式配置
// ============================================================================

/// Codex 执行模式偏好
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum CodexMode {
    /// 自动检测（默认）：原生优先，WSL 作为后备
    #[default]
    Auto,
    /// 强制使用 Windows 原生 Codex
    Native,
    /// 强制使用 WSL Codex
    Wsl,
}

/// Codex 配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexConfig {
    /// Codex 执行模式偏好
    #[serde(default)]
    pub mode: CodexMode,
    /// WSL 发行版名称（可选，留空则使用默认）
    pub wsl_distro: Option<String>,
}

impl Default for CodexConfig {
    fn default() -> Self {
        Self {
            mode: CodexMode::Auto,
            wsl_distro: None,
        }
    }
}

/// 全局 Codex 配置缓存
static CODEX_CONFIG: OnceLock<CodexConfig> = OnceLock::new();

/// 获取 Codex 配置（带缓存）
pub fn get_codex_config() -> &'static CodexConfig {
    CODEX_CONFIG.get_or_init(|| load_codex_config().unwrap_or_default())
}

/// 从配置文件加载 Codex 配置
fn load_codex_config() -> Option<CodexConfig> {
    let home_dir = dirs::home_dir()?;
    let config_file = home_dir.join(".codex").join("workbench_config.json");

    if !config_file.exists() {
        log::debug!("[Codex Config] Config file not found: {:?}", config_file);
        return None;
    }

    match std::fs::read_to_string(&config_file) {
        Ok(content) => match serde_json::from_str::<CodexConfig>(&content) {
            Ok(config) => {
                log::info!(
                    "[Codex Config] Loaded config: mode={:?}, wsl_distro={:?}",
                    config.mode,
                    config.wsl_distro
                );
                Some(config)
            }
            Err(e) => {
                log::warn!("[Codex Config] Failed to parse config: {}", e);
                None
            }
        },
        Err(e) => {
            log::warn!("[Codex Config] Failed to read config file: {}", e);
            None
        }
    }
}

/// 保存 Codex 配置到文件
pub fn save_codex_config(config: &CodexConfig) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or_else(|| "Failed to get home directory".to_string())?;

    let codex_dir = home_dir.join(".codex");
    if !codex_dir.exists() {
        std::fs::create_dir_all(&codex_dir)
            .map_err(|e| format!("Failed to create .codex directory: {}", e))?;
    }

    let config_file = codex_dir.join("workbench_config.json");
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&config_file, content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    log::info!("[Codex Config] Saved config to {:?}", config_file);
    Ok(())
}

// ============================================================================
// WSL 配置结构
// ============================================================================

/// WSL 配置结构
#[derive(Debug, Clone, Default)]
pub struct WslConfig {
    /// 是否启用 WSL 模式
    pub enabled: bool,
    /// WSL 发行版名称（如 "Debian", "Ubuntu"）
    pub distro: Option<String>,
    /// .codex 目录的 Windows UNC 路径
    pub codex_dir_unc: Option<PathBuf>,
    /// WSL 内 Codex 的路径（如 "/usr/local/bin/codex"）
    pub codex_path_in_wsl: Option<String>,
}

/// 全局 WSL 配置缓存
static WSL_CONFIG: OnceLock<WslConfig> = OnceLock::new();

impl WslConfig {
    /// 自动检测并创建 WSL 配置
    ///
    /// 检测策略（根据用户配置）：
    /// - Auto（默认）：原生优先，WSL 作为后备
    /// - Native：强制使用原生，不启用 WSL
    /// - Wsl：强制使用 WSL（如果可用）
    #[cfg(target_os = "windows")]
    pub fn detect() -> Self {
        let codex_config = get_codex_config();
        info!(
            "[WSL] Detecting Codex configuration (mode: {:?})...",
            codex_config.mode
        );

        match codex_config.mode {
            CodexMode::Native => {
                // 强制原生模式，不启用 WSL
                info!("[WSL] Mode set to Native, WSL disabled");
                return Self::default();
            }
            CodexMode::Wsl => {
                // 强制 WSL 模式
                info!("[WSL] Mode set to WSL, attempting to use WSL Codex...");
                return Self::detect_wsl_config(codex_config.wsl_distro.as_deref());
            }
            CodexMode::Auto => {
                // 自动模式：原生优先
                if is_native_codex_available() {
                    info!("[WSL] Native Windows Codex is available, WSL mode disabled");
                    return Self::default();
                }
                info!("[WSL] Native Codex not found, checking WSL as fallback...");
                return Self::detect_wsl_config(codex_config.wsl_distro.as_deref());
            }
        }
    }

    /// 检测 WSL 配置（内部方法）
    #[cfg(target_os = "windows")]
    fn detect_wsl_config(preferred_distro: Option<&str>) -> Self {
        if !is_wsl_available() {
            info!("[WSL] WSL is not available");
            return Self::default();
        }

        // 使用用户指定的发行版或默认发行版
        let distro = if let Some(d) = preferred_distro {
            // 验证用户指定的发行版是否存在
            let distros = get_wsl_distros();
            if distros.iter().any(|name| name == d) {
                info!("[WSL] Using user-specified distro: {}", d);
                Some(d.to_string())
            } else {
                warn!(
                    "[WSL] User-specified distro '{}' not found, using default",
                    d
                );
                get_default_wsl_distro()
            }
        } else {
            get_default_wsl_distro()
        };

        if distro.is_none() {
            info!("[WSL] No WSL distro found");
            return Self::default();
        }

        let distro_name = distro.as_ref().unwrap();
        info!("[WSL] Found WSL distro: {}", distro_name);

        let wsl_home = get_wsl_home_dir(Some(distro_name));
        info!("[WSL] WSL home directory: {:?}", wsl_home);

        let codex_path_in_wsl = check_wsl_codex(Some(distro_name));
        info!("[WSL] Codex path in WSL: {:?}", codex_path_in_wsl);

        let codex_dir_unc = if let Some(ref home) = wsl_home {
            let wsl_codex_path = format!("{}/.codex", home);
            let unc_path = build_wsl_unc_path(&wsl_codex_path, distro_name);
            if unc_path.exists() {
                info!("[WSL] Found .codex directory at: {:?}", unc_path);
                Some(unc_path)
            } else {
                warn!("[WSL] .codex directory not found at: {:?}", unc_path);
                None
            }
        } else {
            None
        };

        // 只有当能访问 .codex 目录且 Codex 已安装时才启用 WSL 模式
        let enabled = codex_dir_unc.is_some() && codex_path_in_wsl.is_some();

        info!(
            "[WSL] Configuration complete: enabled={}, distro={:?}",
            enabled, distro
        );

        Self {
            enabled,
            distro,
            codex_dir_unc,
            codex_path_in_wsl,
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn detect() -> Self {
        Self::default()
    }
}

/// 获取 WSL 配置（带缓存）
pub fn get_wsl_config() -> &'static WslConfig {
    WSL_CONFIG.get_or_init(|| {
        let config = WslConfig::detect();
        log::info!(
            "[WSL] Config initialized: enabled={}, distro={:?}, codex_path={:?}",
            config.enabled,
            config.distro,
            config.codex_path_in_wsl
        );
        config
    })
}

/// 重置 WSL 配置缓存（用于测试或重新检测）
#[allow(dead_code)]
pub fn reset_wsl_config() {
    // OnceLock 不支持 reset，需要重启应用
    log::warn!("[WSL] Config reset requires application restart");
}

// ============================================================================
// Windows 原生 Codex 检测
// ============================================================================

/// 检测 Windows 原生 Codex 是否可用
#[cfg(target_os = "windows")]
pub fn is_native_codex_available() -> bool {
    // 检查常见的 Codex 安装路径
    let paths_to_try = get_native_codex_paths();

    for path in &paths_to_try {
        if std::path::Path::new(path).exists() {
            debug!("[WSL] Found native Codex at: {}", path);
            return true;
        }
    }

    // 尝试运行 codex --version 看是否在 PATH 中
    let mut cmd = Command::new("codex");
    cmd.arg("--version");
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(output) if output.status.success() => {
            debug!("[WSL] Native Codex found in PATH");
            true
        }
        _ => {
            debug!("[WSL] Native Codex not found");
            false
        }
    }
}

/// 获取 Windows 原生 Codex 可能的安装路径
#[cfg(target_os = "windows")]
fn get_native_codex_paths() -> Vec<String> {
    let mut paths = Vec::new();

    // npm 全局安装路径 (APPDATA - 标准位置)
    if let Ok(appdata) = std::env::var("APPDATA") {
        paths.push(format!(r"{}\npm\codex.cmd", appdata));
        paths.push(format!(r"{}\npm\codex", appdata));
        // nvm-windows 安装的 Node.js 版本
        let nvm_dir = format!(r"{}\nvm", appdata);
        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let codex_path = entry.path().join("codex.cmd");
                    if codex_path.exists() {
                        paths.push(codex_path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    // npm 全局安装路径 (LOCALAPPDATA - 某些配置下的位置)
    if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
        paths.push(format!(r"{}\npm\codex.cmd", localappdata));
        paths.push(format!(r"{}\npm\codex", localappdata));
        // pnpm 全局安装路径
        paths.push(format!(r"{}\pnpm\codex.cmd", localappdata));
        paths.push(format!(r"{}\pnpm\codex", localappdata));
        // Yarn 全局安装路径
        paths.push(format!(r"{}\Yarn\bin\codex.cmd", localappdata));
        paths.push(format!(r"{}\Yarn\bin\codex", localappdata));
    }

    // 用户目录下的安装路径
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        // 自定义 npm 全局目录
        paths.push(format!(r"{}\.npm-global\bin\codex.cmd", userprofile));
        paths.push(format!(r"{}\.npm-global\bin\codex", userprofile));
        paths.push(format!(r"{}\.npm-global\codex.cmd", userprofile));
        // Volta 安装路径
        paths.push(format!(r"{}\.volta\bin\codex.cmd", userprofile));
        paths.push(format!(r"{}\.volta\bin\codex", userprofile));
        // fnm (Fast Node Manager) 安装路径
        paths.push(format!(r"{}\.fnm\aliases\default\codex.cmd", userprofile));
        paths.push(format!(
            r"{}\.fnm\node-versions\v*\installation\bin\codex.cmd",
            userprofile
        ));
        // Scoop 安装路径
        paths.push(format!(r"{}\scoop\shims\codex.cmd", userprofile));
        paths.push(format!(
            r"{}\scoop\apps\nodejs\current\codex.cmd",
            userprofile
        ));
        // 本地 bin 目录
        paths.push(format!(r"{}\.local\bin\codex.cmd", userprofile));
        paths.push(format!(r"{}\.local\bin\codex", userprofile));
    }

    // Node.js 安装路径
    if let Ok(programfiles) = std::env::var("ProgramFiles") {
        paths.push(format!(r"{}\nodejs\codex.cmd", programfiles));
        paths.push(format!(r"{}\nodejs\codex", programfiles));
    }

    // Chocolatey 安装路径
    if let Ok(programdata) = std::env::var("ProgramData") {
        paths.push(format!(r"{}\chocolatey\bin\codex.cmd", programdata));
        paths.push(format!(r"{}\chocolatey\bin\codex", programdata));
    }

    paths
}

#[cfg(not(target_os = "windows"))]
pub fn is_native_codex_available() -> bool {
    // 非 Windows 平台总是返回 true（不需要 WSL）
    true
}

// ============================================================================
// WSL 检测函数
// ============================================================================

/// 检测 WSL 是否可用
#[cfg(target_os = "windows")]
pub fn is_wsl_available() -> bool {
    let mut cmd = Command::new("wsl");
    cmd.arg("--status");
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(output) => {
            let available = output.status.success();
            debug!("[WSL] WSL available: {}", available);
            available
        }
        Err(e) => {
            debug!("[WSL] WSL check failed: {}", e);
            false
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn is_wsl_available() -> bool {
    false
}

/// 获取可用的 WSL 发行版列表
#[cfg(target_os = "windows")]
pub fn get_wsl_distros() -> Vec<String> {
    let mut cmd = Command::new("wsl");
    cmd.args(["--list", "--quiet"]);
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(output) if output.status.success() => {
            // WSL 输出是 UTF-16 LE 编码
            let raw = output.stdout;
            let decoded = String::from_utf16_lossy(
                &raw.chunks(2)
                    .filter_map(|c| {
                        if c.len() == 2 {
                            Some(u16::from_le_bytes([c[0], c[1]]))
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<u16>>(),
            );

            let distros: Vec<String> = decoded
                .lines()
                .map(|s| s.trim().trim_matches('\0').to_string())
                .filter(|s| !s.is_empty())
                .collect();

            debug!("[WSL] Found distros: {:?}", distros);
            distros
        }
        _ => vec![],
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_wsl_distros() -> Vec<String> {
    vec![]
}

/// 获取默认 WSL 发行版名称
pub fn get_default_wsl_distro() -> Option<String> {
    get_wsl_distros().into_iter().next()
}

/// 获取 WSL 用户的 home 目录（在 WSL 内的路径）
/// 返回如 "/root" 或 "/home/username"
#[cfg(target_os = "windows")]
pub fn get_wsl_home_dir(distro: Option<&str>) -> Option<String> {
    let mut cmd = Command::new("wsl");

    if let Some(d) = distro {
        cmd.arg("-d").arg(d);
    }

    cmd.args(["--", "echo", "$HOME"]);
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(output) if output.status.success() => {
            let home = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !home.is_empty() && home.starts_with('/') {
                debug!("[WSL] Home directory: {}", home);
                Some(home)
            } else {
                None
            }
        }
        _ => None,
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_wsl_home_dir(_distro: Option<&str>) -> Option<String> {
    None
}

/// 检测 WSL 内是否安装了 Codex，返回安装路径
#[cfg(target_os = "windows")]
pub fn check_wsl_codex(distro: Option<&str>) -> Option<String> {
    // 首先尝试使用 which 命令（依赖 PATH）
    let mut cmd = Command::new("wsl");

    if let Some(d) = distro {
        cmd.arg("-d").arg(d);
    }

    cmd.args(["--", "which", "codex"]);
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && path.starts_with('/') {
                info!("[WSL] Found codex via 'which' at: {}", path);
                return Some(path);
            }
        }
        _ => {}
    }

    // which 失败时，直接探测常见安装路径
    debug!("[WSL] 'which codex' failed, trying common paths...");

    // 获取 WSL 用户的 home 目录
    let wsl_home = get_wsl_home_dir(distro).unwrap_or_else(|| "/root".to_string());

    // 常见 Codex 安装路径（按优先级排序）
    let common_paths = vec![
        "/usr/local/bin/codex".to_string(),
        "/usr/bin/codex".to_string(),
        format!("{}/.local/bin/codex", wsl_home),
        format!("{}/.npm-global/bin/codex", wsl_home),
        format!("{}/.volta/bin/codex", wsl_home),
        format!("{}/.asdf/shims/codex", wsl_home),
        format!("{}/.nvm/current/bin/codex", wsl_home),
        format!("{}/.cargo/bin/codex", wsl_home),
        format!("{}/.bun/bin/codex", wsl_home),
        "/home/linuxbrew/.linuxbrew/bin/codex".to_string(),
        "/snap/bin/codex".to_string(),
    ];

    for path in &common_paths {
        // 使用 test -x 检查文件是否存在且可执行
        let mut test_cmd = Command::new("wsl");
        if let Some(d) = distro {
            test_cmd.arg("-d").arg(d);
        }
        test_cmd.args(["--", "test", "-x", path]);
        test_cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(output) = test_cmd.output() {
            if output.status.success() {
                info!("[WSL] Found codex via direct path check at: {}", path);
                return Some(path.clone());
            }
        }
    }

    // 尝试扫描 nvm 安装的 Node.js 版本
    let nvm_versions_dir = format!("{}/.nvm/versions/node", wsl_home);
    let mut ls_cmd = Command::new("wsl");
    if let Some(d) = distro {
        ls_cmd.arg("-d").arg(d);
    }
    ls_cmd.args(["--", "ls", "-1", &nvm_versions_dir]);
    ls_cmd.creation_flags(CREATE_NO_WINDOW);

    if let Ok(output) = ls_cmd.output() {
        if output.status.success() {
            let versions = String::from_utf8_lossy(&output.stdout);
            for version in versions.lines() {
                let version = version.trim();
                if !version.is_empty() {
                    let codex_path = format!("{}/{}/bin/codex", nvm_versions_dir, version);
                    let mut test_cmd = Command::new("wsl");
                    if let Some(d) = distro {
                        test_cmd.arg("-d").arg(d);
                    }
                    test_cmd.args(["--", "test", "-x", &codex_path]);
                    test_cmd.creation_flags(CREATE_NO_WINDOW);

                    if let Ok(test_output) = test_cmd.output() {
                        if test_output.status.success() {
                            info!(
                                "[WSL] Found codex in nvm version {} at: {}",
                                version, codex_path
                            );
                            return Some(codex_path);
                        }
                    }
                }
            }
        }
    }

    debug!("[WSL] Codex not found in any common paths");
    None
}

#[cfg(not(target_os = "windows"))]
pub fn check_wsl_codex(_distro: Option<&str>) -> Option<String> {
    None
}

/// 获取 WSL 内 Codex 的版本
#[cfg(target_os = "windows")]
pub fn get_wsl_codex_version(distro: Option<&str>) -> Option<String> {
    let mut cmd = Command::new("wsl");

    if let Some(d) = distro {
        cmd.arg("-d").arg(d);
    }

    cmd.args(["--", "codex", "--version"]);
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !version.is_empty() {
                Some(version)
            } else {
                None
            }
        }
        _ => None,
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_wsl_codex_version(_distro: Option<&str>) -> Option<String> {
    None
}

// ============================================================================
// 路径转换函数
// ============================================================================

/// 将 Windows 路径转换为 WSL 路径
///
/// # Examples
/// ```
/// assert_eq!(windows_to_wsl_path("C:\\Users\\test"), "/mnt/c/Users/test");
/// assert_eq!(windows_to_wsl_path("D:\\Projects"), "/mnt/d/Projects");
/// ```
pub fn windows_to_wsl_path(windows_path: &str) -> String {
    // 处理 UNC 路径（不支持）
    if windows_path.starts_with("\\\\") {
        log::warn!("[WSL] UNC paths are not supported: {}", windows_path);
        return windows_path.to_string();
    }

    // 检查是否为标准 Windows 路径 (C:\...)
    if windows_path.len() >= 2 && windows_path.chars().nth(1) == Some(':') {
        let drive = windows_path
            .chars()
            .next()
            .unwrap()
            .to_lowercase()
            .next()
            .unwrap();
        let rest = &windows_path[2..].replace('\\', "/");
        let wsl_path = format!("/mnt/{}{}", drive, rest);
        log::debug!("[WSL] Path converted: {} -> {}", windows_path, wsl_path);
        return wsl_path;
    }

    // 如果已经是 WSL 路径或相对路径，统一分隔符后返回
    windows_path.replace('\\', "/")
}

/// 将 WSL 路径转换为 Windows 路径
///
/// # Examples
/// ```
/// assert_eq!(wsl_to_windows_path("/mnt/c/Users/test"), "C:\\Users\\test");
/// assert_eq!(wsl_to_windows_path("/home/user"), "/home/user"); // 无法转换
/// ```
pub fn wsl_to_windows_path(wsl_path: &str) -> String {
    if wsl_path.starts_with("/mnt/") && wsl_path.len() >= 6 {
        let drive = wsl_path
            .chars()
            .nth(5)
            .unwrap()
            .to_uppercase()
            .next()
            .unwrap();
        let rest = &wsl_path[6..].replace('/', "\\");
        let windows_path = format!("{}:{}", drive, rest);
        log::debug!("[WSL] Path converted: {} -> {}", wsl_path, windows_path);
        return windows_path;
    }

    // 无法转换的路径（如 /home/user）原样返回
    wsl_path.to_string()
}

/// 构建从 Windows 访问 WSL 文件系统的 UNC 路径
///
/// # Arguments
/// * `wsl_path` - WSL 内的路径，如 "/root/.codex/sessions"
/// * `distro` - WSL 发行版名称，如 "Debian"、"Ubuntu"
///
/// # Returns
/// Windows UNC 路径，如 "\\\\wsl.localhost\\Debian\\root\\.codex\\sessions"
pub fn build_wsl_unc_path(wsl_path: &str, distro: &str) -> PathBuf {
    // 尝试 wsl.localhost（Windows 10 2004+）
    let unc_path = format!(r"\\wsl.localhost\{}{}", distro, wsl_path.replace('/', "\\"));
    let path = PathBuf::from(&unc_path);

    // 检查路径是否可访问
    if path.exists() {
        return path;
    }

    // 尝试旧版路径格式 wsl$
    let legacy_path = format!(r"\\wsl$\{}{}", distro, wsl_path.replace('/', "\\"));
    let legacy = PathBuf::from(&legacy_path);

    if legacy.exists() {
        return legacy;
    }

    // 返回新版路径（即使不存在）
    path
}

// ============================================================================
// WSL 目录访问
// ============================================================================

/// 获取 WSL 中 .codex 目录的 Windows 访问路径
pub fn get_wsl_codex_dir() -> Option<PathBuf> {
    let config = get_wsl_config();
    config.codex_dir_unc.clone()
}

/// 获取 WSL 中 Codex 会话目录的 Windows 访问路径
pub fn get_wsl_codex_sessions_dir() -> Option<PathBuf> {
    get_wsl_codex_dir().map(|p| p.join("sessions"))
}

// ============================================================================
// WSL 命令构建
// ============================================================================

/// 构建通过 WSL 执行的异步命令 (tokio)
///
/// # Arguments
/// * `program` - 要执行的程序（如 "codex"）
/// * `args` - 程序参数
/// * `working_dir` - Windows 格式的工作目录（会自动转换为 WSL 路径）
/// * `distro` - 可选的 WSL 发行版名称
#[cfg(target_os = "windows")]
pub fn build_wsl_command_async(
    program: &str,
    args: &[String],
    working_dir: Option<&str>,
    distro: Option<&str>,
) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new("wsl");

    // 指定发行版（如果提供）
    if let Some(d) = distro {
        cmd.arg("-d").arg(d);
    }

    // 设置工作目录（转换为 WSL 路径）
    if let Some(dir) = working_dir {
        let wsl_dir = windows_to_wsl_path(dir);
        cmd.arg("--cd").arg(&wsl_dir);
    }

    // 添加分隔符和程序
    cmd.arg("--");
    cmd.arg(program);

    // 添加程序参数
    for arg in args {
        cmd.arg(arg);
    }

    // 隐藏控制台窗口
    cmd.creation_flags(CREATE_NO_WINDOW);

    log::debug!(
        "[WSL] Built async command: wsl -d {:?} --cd {:?} -- {} {:?}",
        distro,
        working_dir.map(windows_to_wsl_path),
        program,
        args
    );

    cmd
}

#[cfg(not(target_os = "windows"))]
pub fn build_wsl_command_async(
    program: &str,
    args: &[String],
    _working_dir: Option<&str>,
    _distro: Option<&str>,
) -> tokio::process::Command {
    // 非 Windows 平台直接执行命令
    let mut cmd = tokio::process::Command::new(program);
    for arg in args {
        cmd.arg(arg);
    }
    cmd
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_windows_to_wsl_path() {
        assert_eq!(windows_to_wsl_path("C:\\Users\\test"), "/mnt/c/Users/test");
        assert_eq!(
            windows_to_wsl_path("D:\\Projects\\app"),
            "/mnt/d/Projects/app"
        );
        assert_eq!(windows_to_wsl_path("c:\\lower"), "/mnt/c/lower");
        assert_eq!(windows_to_wsl_path("C:\\"), "/mnt/c/");
    }

    #[test]
    fn test_wsl_to_windows_path() {
        assert_eq!(wsl_to_windows_path("/mnt/c/Users/test"), "C:\\Users\\test");
        assert_eq!(wsl_to_windows_path("/mnt/d/Projects"), "D:\\Projects");
        assert_eq!(wsl_to_windows_path("/home/user"), "/home/user"); // 不转换
        assert_eq!(wsl_to_windows_path("/mnt/c"), "C:\\"); // 边界情况
    }

    #[test]
    fn test_build_wsl_unc_path() {
        let path = build_wsl_unc_path("/root/.codex/sessions", "Debian");
        let path_str = path.to_string_lossy();
        assert!(
            path_str.contains("wsl") && path_str.contains("Debian"),
            "Path should contain wsl and Debian: {}",
            path_str
        );
    }
}
