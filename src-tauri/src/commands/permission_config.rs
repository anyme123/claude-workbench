use serde::{Deserialize, Serialize};

/// Claude权限管理配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudePermissionConfig {
    pub allowed_tools: Vec<String>,
    pub disallowed_tools: Vec<String>, 
    pub permission_mode: PermissionMode,
    pub auto_approve_edits: bool,
    pub enable_dangerous_skip: bool, // 向后兼容选项
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PermissionMode {
    Interactive,
    AcceptEdits,
    ReadOnly,
}

impl Default for ClaudePermissionConfig {
    fn default() -> Self {
        Self {
            allowed_tools: vec![
                "Read".to_string(),
                "Write".to_string(),
                "Edit".to_string(),
                "Bash".to_string(),
            ],
            disallowed_tools: vec![],
            permission_mode: PermissionMode::Interactive,
            auto_approve_edits: false,
            enable_dangerous_skip: true, // 默认保持现有行为
        }
    }
}

impl std::fmt::Display for PermissionMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PermissionMode::Interactive => write!(f, "interactive"),
            PermissionMode::AcceptEdits => write!(f, "acceptEdits"),
            PermissionMode::ReadOnly => write!(f, "readOnly"),
        }
    }
}

/// 预定义工具权限组常量
pub const DEVELOPMENT_TOOLS: &[&str] = &["Bash", "Read", "Write", "Edit"];
pub const SAFE_TOOLS: &[&str] = &["Read", "Search"];
pub const ALL_TOOLS: &[&str] = &["Bash", "Read", "Write", "Edit", "WebFetch", "Task", "TodoWrite"];

/// Plan Mode 允许的只读工具（用于安全的研究和规划阶段）
pub const PLAN_MODE_TOOLS: &[&str] = &[
    "Read",       // 读取文件
    "LS",         // 列出目录
    "Glob",       // 文件模式搜索
    "Grep",       // 内容搜索
    "Task",       // 研究子代理
    "TodoRead",   // 读取任务
    "TodoWrite",  // 写入任务（用于规划）
    "WebFetch",   // Web内容获取
    "WebSearch",  // Web搜索
];

/// Claude执行配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeExecutionConfig {
    pub output_format: OutputFormat,
    pub timeout_seconds: Option<u32>,
    pub max_tokens: Option<u32>,
    pub verbose: bool,
    pub permissions: ClaudePermissionConfig,
    /// Plan Mode - 只读研究和规划阶段
    pub plan_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OutputFormat {
    StreamJson,
    Json,
    Text,
}

impl Default for ClaudeExecutionConfig {
    fn default() -> Self {
        Self {
            output_format: OutputFormat::StreamJson,
            timeout_seconds: None,
            max_tokens: None,
            verbose: true,
            permissions: ClaudePermissionConfig::default(),
            plan_mode: false,
        }
    }
}

impl std::fmt::Display for OutputFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OutputFormat::StreamJson => write!(f, "stream-json"),
            OutputFormat::Json => write!(f, "json"),
            OutputFormat::Text => write!(f, "text"),
        }
    }
}

/// 权限构建辅助函数
pub fn build_permission_args(config: &ClaudePermissionConfig) -> Vec<String> {
    let mut args = Vec::new();
    
    // 如果启用了危险跳过模式（向后兼容）
    if config.enable_dangerous_skip {
        args.push("--dangerously-skip-permissions".to_string());
        return args;
    }
    
    // 添加允许的工具
    if !config.allowed_tools.is_empty() {
        args.push("--allowedTools".to_string());
        args.push(config.allowed_tools.join(","));
    }
    
    // 添加禁止的工具  
    if !config.disallowed_tools.is_empty() {
        args.push("--disallowedTools".to_string());
        args.push(config.disallowed_tools.join(","));
    }
    
    // 添加权限模式
    args.push("--permission-mode".to_string());
    args.push(config.permission_mode.to_string());
    
    args
}

/// 执行参数构建函数
pub fn build_execution_args(
    config: &ClaudeExecutionConfig, 
    prompt: &str, 
    model: &str,
    escape_prompt_fn: impl Fn(&str) -> String,
) -> Vec<String> {
    let mut args = Vec::new();
    
    // 转义提示文本
    let escaped_prompt = escape_prompt_fn(prompt);
    
    // 添加基础参数
    // 所有提示（包括斜杠命令）都作为位置参数传递
    args.push(escaped_prompt);
    
    // 添加模型参数
    args.push("--model".to_string());
    args.push(model.to_string());
    
    // 添加输出格式
    args.push("--output-format".to_string());
    args.push(config.output_format.to_string());
    
    // 添加详细输出
    if config.verbose {
        args.push("--verbose".to_string());
    }
    
    // 添加超时参数
    if let Some(timeout) = config.timeout_seconds {
        args.push("--timeout".to_string());
        args.push(timeout.to_string());
    }
    
    // 添加token限制
    if let Some(max_tokens) = config.max_tokens {
        args.push("--max-tokens".to_string());
        args.push(max_tokens.to_string());
    }
    
    // Plan Mode 支持 - 如果启用，自动切换到只读权限配置
    let permissions = if config.plan_mode {
        ClaudePermissionConfig::plan_mode()
    } else {
        config.permissions.clone()
    };
    
    // 添加权限参数
    args.extend(build_permission_args(&permissions));
    
    args
}

/// 预设权限配置
impl ClaudePermissionConfig {
    /// 开发模式 - 允许所有常用开发工具
    pub fn development_mode() -> Self {
        Self {
            allowed_tools: DEVELOPMENT_TOOLS.iter().map(|s| s.to_string()).collect(),
            disallowed_tools: vec![],
            permission_mode: PermissionMode::AcceptEdits,
            auto_approve_edits: true,
            enable_dangerous_skip: false,
        }
    }
    
    /// 安全模式 - 只允许读取操作
    pub fn safe_mode() -> Self {
        Self {
            allowed_tools: SAFE_TOOLS.iter().map(|s| s.to_string()).collect(),
            disallowed_tools: vec!["Bash".to_string(), "WebFetch".to_string()],
            permission_mode: PermissionMode::ReadOnly,
            auto_approve_edits: false,
            enable_dangerous_skip: false,
        }
    }
    
    /// 交互模式 - 平衡的权限设置
    pub fn interactive_mode() -> Self {
        Self {
            allowed_tools: vec![
                "Read".to_string(),
                "Write".to_string(),
                "Edit".to_string(),
            ],
            disallowed_tools: vec![],
            permission_mode: PermissionMode::Interactive,
            auto_approve_edits: false,
            enable_dangerous_skip: false,
        }
    }
    
    /// 向后兼容模式 - 保持原有的危险跳过行为
    pub fn legacy_mode() -> Self {
        Self {
            allowed_tools: vec![],
            disallowed_tools: vec![],
            permission_mode: PermissionMode::Interactive,
            auto_approve_edits: false,
            enable_dangerous_skip: true,
        }
    }
    
    /// Plan Mode - 只读研究和规划模式
    pub fn plan_mode() -> Self {
        Self {
            allowed_tools: PLAN_MODE_TOOLS.iter().map(|s| s.to_string()).collect(),
            disallowed_tools: vec![
                "Edit".to_string(),
                "MultiEdit".to_string(),
                "Write".to_string(),
                "Bash".to_string(),
                "NotebookEdit".to_string(),
            ],
            permission_mode: PermissionMode::ReadOnly,
            auto_approve_edits: false,
            enable_dangerous_skip: false,
        }
    }
}