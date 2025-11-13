use tauri::AppHandle;

use super::cli_runner::map_model_to_claude_alias;

fn truncate_utf8_safe(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }

    let mut index = max_bytes;
    while index > 0 && !s.is_char_boundary(index) {
        index -= 1;
    }

    if index == 0 {
        s.char_indices()
            .next()
            .map(|(_, ch)| &s[..ch.len_utf8()])
            .unwrap_or("")
    } else {
        &s[..index]
    }
}

/// Enhance a prompt using local Claude  Code CLI
#[tauri::command]
pub async fn enhance_prompt(
    prompt: String,
    model: String,
    context: Option<Vec<String>>,
    _app: AppHandle
) -> Result<String, String> {
    log::info!("Enhancing prompt using local Claude  Code CLI with context");

    if prompt.trim().is_empty() {
        return Ok("请输入需要增强的提示词".to_string());
    }

    // ⚡ 添加长度限制配置
    const MAX_PROMPT_LENGTH: usize = 50_000; // 最大提示词长度（字符）
    const MAX_CONTEXT_LENGTH: usize = 30_000; // 最大上下文长度（字符）
    const MAX_TOTAL_LENGTH: usize = 100_000; // 总长度限制（字符），约等于 30k tokens

    // ⚡ 验证和截断用户输入的提示词
    let trimmed_prompt = prompt.trim();
    let (final_prompt, prompt_truncated) = if trimmed_prompt.len() > MAX_PROMPT_LENGTH {
        log::warn!("Prompt too long ({} chars), truncating to {} chars",
            trimmed_prompt.len(), MAX_PROMPT_LENGTH);
        let truncated = format!("{}...\n\n[提示词过长，已自动截断]",
            truncate_utf8_safe(trimmed_prompt, MAX_PROMPT_LENGTH));
        (truncated, true)
    } else {
        (trimmed_prompt.to_string(), false)
    };

    // ⚡ 构建会话上下文信息（智能截断）
    let (context_section, context_truncated) = if let Some(recent_messages) = context {
        if !recent_messages.is_empty() {
            log::info!("Processing {} context messages for enhancement", recent_messages.len());
            let context_str = recent_messages.join("\n---\n");

            // 如果上下文太长，智能截断
            if context_str.len() > MAX_CONTEXT_LENGTH {
                log::warn!("Context too long ({} chars), truncating to {} chars",
                    context_str.len(), MAX_CONTEXT_LENGTH);
                let truncated = format!("{}\n\n[上下文过长，已自动截断]",
                    truncate_utf8_safe(&context_str, MAX_CONTEXT_LENGTH));
                (format!("\n\nRecent conversation context:\n{}\n", truncated), true)
            } else {
                (format!("\n\nRecent conversation context:\n{}\n", context_str), false)
            }
        } else {
            log::info!("Context provided but empty");
            (String::new(), false)
        }
    } else {
        log::info!("No context provided for enhancement");
        (String::new(), false)
    };

    // 创建提示词增强的请求
    let enhancement_request = format!(
        "You are a professional prompt optimization assistant, specializing in optimizing user prompts for Claude  Code programming assistant.\n\
        \n\
        【Optimization Goals】\n\
        1. Maintain the user's original intent and core requirements\n\
        2. Make the prompt clearer, more specific, and more structured\n\
        3. Add necessary technical details based on conversation context\n\
        4. Use accurate technical terminology and avoid ambiguity\n\
        \n\
        【Optimization Principles】\n\
        - ✅ Keep it technical and practical\n\
        - ✅ Only optimize expression, don't change core requirements\n\
        - ✅ If the user's intent is already clear, minimal adjustment is needed\n\
        - ❌ Don't add role-playing (like \"act as...\")\n\
        - ❌ Don't add excessive politeness or formalities\n\
        - ❌ Don't change the question type (e.g., turn technical questions into analysis reports)\n\
        - ❌ Don't add extra tasks that users didn't request\n\
        {}\
        \n\
        【Output Requirements】\n\
        Return only the optimized prompt in Chinese, without any explanations, comments, or meta-information.\n\
        \n\
        Original prompt:\n{}\n",
        context_section,
        final_prompt
    );

    // ⚡ 最终长度检查
    if enhancement_request.len() > MAX_TOTAL_LENGTH {
        log::error!("Total request length ({} chars) exceeds maximum allowed ({})",
            enhancement_request.len(), MAX_TOTAL_LENGTH);
        return Err(format!(
            "输入内容过长（{} 字符），即使截断后仍超过限制（{} 字符）。\n\
            建议：\n\
            1. 减少提示词长度（当前：{} 字符）\n\
            2. 在设置中调低上下文提取数量\n\
            3. 使用更简洁的描述",
            enhancement_request.len(), MAX_TOTAL_LENGTH, trimmed_prompt.len()
        ));
    }

    log::info!("Enhancement request prepared: prompt={} chars, context={} chars, total={} chars",
        final_prompt.len(), context_section.len(), enhancement_request.len());

    // ⚡ 如果有截断，记录警告日志
    if prompt_truncated || context_truncated {
        log::warn!("Content was truncated: prompt={}, context={}",
            prompt_truncated, context_truncated);
    }

    log::info!("Calling Claude  Code CLI with stdin input");

    // 尝试找到Claude  Code CLI的完整路径
    let claude_path = find_claude_executable().await?;

    // 调用 Claude  Code CLI，使用stdin输入
    let mut command = tokio::process::Command::new(&claude_path);
    command.args(&[
        "--print",
        "--model", &map_model_to_claude_alias(&model)
    ]);

    // 设置stdin
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    // 在Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
    }

    // 设置工作目录（如果需要）
    if let Some(home_dir) = dirs::home_dir() {
        command.current_dir(home_dir);
    }

    // 确保环境变量正确设置，包括用户环境
    if let Ok(path) = std::env::var("PATH") {
        command.env("PATH", path);
    }

    // 添加常见的npm路径到PATH
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let npm_path = std::path::Path::new(&appdata).join("npm");
        if let Some(npm_str) = npm_path.to_str() {
            if let Ok(current_path) = std::env::var("PATH") {
                let new_path = format!("{};{}", current_path, npm_str);
                command.env("PATH", new_path);
            }
        }
    }

    // 启动进程
    let mut child = command
        .spawn()
        .map_err(|e| format!("无法启动Claude  Code命令: {}. 请确保Claude  Code已正确安装并登录。", e))?;

    // 写入增强请求到stdin
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(enhancement_request.as_bytes()).await
            .map_err(|e| format!("无法写入输入到Claude  Code: {}", e))?;
        stdin.shutdown().await
            .map_err(|e| format!("无法关闭stdin: {}", e))?;
    }

    // ⚡ 改进：等待命令完成并获取输出
    // 注意：由于 wait_with_output() 会消耗 child，我们无法在超时后 kill 进程
    // 但通常 Claude CLI 会自行完成或超时退出
    let output = child.wait_with_output().await
        .map_err(|e| format!("等待Claude  Code命令完成失败: {}。\n\
            可能原因：\n\
            1. 输入内容过长导致Claude CLI处理失败\n\
            2. 网络连接问题\n\
            3. Claude API 响应异常\n\
            \n\
            建议：缩短输入内容或稍后重试", e))?;

    // ⚡ 改进：详细解析错误信息
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stderr_lower = stderr.to_lowercase();

        log::error!("Claude  Code command failed: {}", stderr);

        // 检查是否是 context length 错误
        if stderr_lower.contains("context_length_exceeded") ||
           stderr_lower.contains("context length") ||
           stderr_lower.contains("too long") ||
           stderr_lower.contains("maximum context") {
            return Err(format!(
                "输入内容超过模型上下文窗口限制。\n\
                \n\
                当前输入：{} 字符（约 {} tokens）\n\
                \n\
                解决方案：\n\
                1. 减少提示词长度\n\
                2. 在设置中降低「最大消息数量」（当前可能过高）\n\
                3. 禁用「包含执行结果」选项\n\
                4. 关闭「项目上下文」开关\n\
                \n\
                技术细节：{}",
                enhancement_request.len(),
                enhancement_request.len() / 3, // 粗略估算 token 数
                stderr.trim()
            ));
        }

        // 检查是否是 API 错误
        if stderr_lower.contains("api") || stderr_lower.contains("authentication") ||
           stderr_lower.contains("unauthorized") || stderr_lower.contains("401") {
            return Err(format!(
                "Claude API 认证失败。\n\
                \n\
                请检查：\n\
                1. 是否已登录 Claude  Code CLI（运行 'claude auth login'）\n\
                2. API 密钥是否有效\n\
                3. 账户是否有足够的额度\n\
                \n\
                错误详情：{}",
                stderr.trim()
            ));
        }

        // 通用错误
        return Err(format!("Claude  Code执行失败: {}", stderr.trim()));
    }

    let enhanced_prompt = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if enhanced_prompt.is_empty() {
        return Err("Claude  Code返回了空的响应，请重试".to_string());
    }

    log::info!("Successfully enhanced prompt: {} -> {} chars", prompt.len(), enhanced_prompt.len());
    Ok(enhanced_prompt)
}



/// Enhance a prompt using Gemini CLI with gemini-2.5-pro model
#[tauri::command]
pub async fn enhance_prompt_with_gemini(
    prompt: String, 
    context: Option<Vec<String>>, 
    _app: AppHandle
) -> Result<String, String> {
    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI FUNCTION CALLED ===");
    log::info!("Enhancing prompt using Gemini CLI with gemini-2.5-pro model");
    log::info!("Prompt length: {}", prompt.len());
    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Function called with prompt: {} chars", prompt.len());
    
    if prompt.trim().is_empty() {
        return Ok("请输入需要增强的提示词".to_string());
    }

    // 构建会话上下文信息（与Claude Code版本保持一致）
    let context_section = if let Some(recent_messages) = context {
        if !recent_messages.is_empty() {
            log::info!("Using {} context messages for Gemini enhancement", recent_messages.len());
            let context_str = recent_messages.join("\n---\n");
            format!("\n\nRecent conversation context:\n{}\n", context_str)
        } else {
            log::info!("Context provided but empty");
            String::new()
        }
    } else {
        log::info!("No context provided for Gemini enhancement");
        String::new()
    };

    // 创建与Claude Code版本保持一致的提示词增强请求
    let enhancement_request = format!(
        "You are a professional prompt optimization assistant, specializing in optimizing user prompts for Claude Code programming assistant.\n\
        \n\
        【Optimization Goals】\n\
        1. Maintain the user's original intent and core requirements\n\
        2. Make the prompt clearer, more specific, and more structured\n\
        3. Add necessary technical details based on conversation context\n\
        4. Use accurate technical terminology and avoid ambiguity\n\
        \n\
        【Optimization Principles】\n\
        - ✅ Keep it technical and practical\n\
        - ✅ Only optimize expression, don't change core requirements\n\
        - ✅ If the user's intent is already clear, minimal adjustment is needed\n\
        - ❌ Don't add role-playing (like \"act as...\")\n\
        - ❌ Don't add excessive politeness or formalities\n\
        - ❌ Don't change the question type (e.g., turn technical questions into analysis reports)\n\
        - ❌ Don't add extra tasks that users didn't request\n\
        {}\
        \n\
        【Output Requirements】\n\
        Return only the optimized prompt in Chinese, without any explanations, comments, or meta-information.\n\
        \n\
        Original prompt:\n{}\n",
        context_section,
        prompt.trim()
    );

    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Calling Gemini CLI with non-interactive mode");

    // 尝试找到Gemini CLI的完整路径
    let gemini_path = find_gemini_executable().await?;
    
    // 调用 Gemini CLI，使用stdin输入和非交互模式
    let mut command = tokio::process::Command::new(&gemini_path);
    command.args(&[
        "-m", "gemini-2.5-pro"
    ]);

    // 设置stdin
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    // 在Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
    }

    // 设置工作目录（如果需要）
    if let Some(home_dir) = dirs::home_dir() {
        command.current_dir(home_dir);
    }

    // 确保环境变量正确设置
    if let Ok(path) = std::env::var("PATH") {
        command.env("PATH", path);
    }
    
    // 添加常见的npm路径到PATH（Gemini CLI通常通过npm安装）
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let npm_path = std::path::Path::new(&appdata).join("npm");
        if let Some(npm_str) = npm_path.to_str() {
            if let Ok(current_path) = std::env::var("PATH") {
                let new_path = format!("{};{}", current_path, npm_str);
                command.env("PATH", new_path);
            }
        }
    }

    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Attempting to spawn Gemini CLI process...");

    // 启动进程
    let mut child = command
        .spawn()
        .map_err(|e| format!("无法启动Gemini CLI命令: {}. 请确保Gemini CLI已正确安装并配置。可以运行 'npm install -g @google/gemini-cli' 进行安装。", e))?;

    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Gemini CLI process spawned successfully");

    // 写入增强请求到stdin
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(enhancement_request.as_bytes()).await
            .map_err(|e| format!("无法写入输入到Gemini CLI: {}", e))?;
        stdin.shutdown().await
            .map_err(|e| format!("无法关闭stdin: {}", e))?;
    }

    // 等待命令完成并获取输出
    let output = child.wait_with_output().await
        .map_err(|e| format!("等待Gemini CLI命令完成失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("Gemini CLI command failed: {}", stderr);
        return Err(format!("Gemini CLI执行失败: {}. 请检查您的Google AI API配置。", stderr));
    }

    let enhanced_prompt = String::from_utf8_lossy(&output.stdout).trim().to_string();
    
    if enhanced_prompt.is_empty() {
        return Err("Gemini CLI返回了空的响应".to_string());
    }

    // 清理输出（移除无用的话语和状态信息）
    let mut final_enhanced_prompt = enhanced_prompt.clone();
    
    // 移除常见的无用前缀和后缀
    let unwanted_phrases = [
        "这是优化后的提示词：",
        "优化后的提示词：",
        "这是优化后的提示词",
        "优化后的提示词",
        "以下是优化后的提示词：",
        "以下是优化后的提示词",
        "Loaded cached credentials",
        "Here's the enhanced prompt:",
        "Enhanced prompt:",
        "Optimized prompt:",
    ];
    
    for phrase in &unwanted_phrases {
        final_enhanced_prompt = final_enhanced_prompt.replace(phrase, "");
    }
    
    // 清理空行和多余的空白
    let lines: Vec<&str> = final_enhanced_prompt.lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty() && !line.starts_with("Loaded cached credentials"))
        .collect();
    
    final_enhanced_prompt = lines.join("\n").trim().to_string();
    
    // 移除开头和结尾的引号（如果存在）
    if final_enhanced_prompt.starts_with('"') && final_enhanced_prompt.ends_with('"') {
        final_enhanced_prompt = final_enhanced_prompt[1..final_enhanced_prompt.len()-1].to_string();
    }
    
    // 移除开头和结尾的其他标记
    final_enhanced_prompt = final_enhanced_prompt
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string();
    
    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Successfully enhanced prompt: {} -> {} chars", prompt.len(), final_enhanced_prompt.len());
    log::info!("Enhanced prompt preview: {}...", 
        if final_enhanced_prompt.len() > 100 { 
            &final_enhanced_prompt[..100] 
        } else { 
            &final_enhanced_prompt 
        }
    );

    Ok(final_enhanced_prompt)
}

/// Find Gemini CLI executable in various locations
async fn find_gemini_executable() -> Result<String, String> {
    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Finding Gemini CLI executable...");
    
    // Common locations for Gemini CLI
    let possible_paths = vec![
        "gemini".to_string(),
        "gemini.cmd".to_string(),
        "gemini.exe".to_string(),
    ];

    // Try to find in PATH first
    for path in &possible_paths {
        let mut cmd = tokio::process::Command::new(path);
        cmd.arg("--version");
        
        // 在Windows上隐藏控制台窗口
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
        }
        
        if let Ok(output) = cmd.output().await {
            if output.status.success() {
                log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Found Gemini CLI at: {}", path);
                return Ok(path.clone());
            }
        }
    }

    // Try common Windows npm global locations
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let npm_path = std::path::Path::new(&appdata).join("npm");
        let possible_npm_paths = vec![
            npm_path.join("gemini.cmd"),
            npm_path.join("gemini"),
            npm_path.join("gemini.exe"),
        ];

        for path in possible_npm_paths {
            if path.exists() {
                if let Some(path_str) = path.to_str() {
                    // Test if it works
                    let mut cmd = tokio::process::Command::new(path_str);
                    cmd.arg("--version");
                    
                    // 在Windows上隐藏控制台窗口
                    #[cfg(target_os = "windows")]
                    {
                        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
                    }
                    
                    if let Ok(output) = cmd.output().await {
                        if output.status.success() {
                            log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Found Gemini CLI at: {}", path_str);
                            return Ok(path_str.to_string());
                        }
                    }
                }
            }
        }
    }

    // Try global npm prefix location
    let mut npm_cmd = tokio::process::Command::new("npm");
    npm_cmd.args(&["config", "get", "prefix"]);
    
    // 在Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        npm_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
    }
    
    if let Ok(output) = npm_cmd.output().await {
        if output.status.success() {
            let prefix_string = String::from_utf8_lossy(&output.stdout);
            let prefix = prefix_string.trim();
            let gemini_path = std::path::Path::new(prefix).join("gemini.cmd");
            if gemini_path.exists() {
                if let Some(path_str) = gemini_path.to_str() {
                    log::info!("=== ENHANCE_PROMPT_WITH_GEMINI DEBUG: Found Gemini CLI at npm prefix: {}", path_str);
                    return Ok(path_str.to_string());
                }
            }
        }
    }

    Err("无法找到Gemini CLI可执行文件。请确保Gemini CLI已正确安装。您可以运行 'npm install -g @google/gemini-cli' 来安装。".to_string())
}

/// Find Claude Code executable in various locations
async fn find_claude_executable() -> Result<String, String> {
    // Common locations for Claude Code
    let possible_paths = vec![
        "claude".to_string(),
        "claude.cmd".to_string(),
        "claude.exe".to_string(),
    ];

    // Try to find in PATH first
    for path in &possible_paths {
        let mut cmd = tokio::process::Command::new(path);
        cmd.arg("--version");
        
        // 在Windows上隐藏控制台窗口
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
        }
        
        if let Ok(output) = cmd.output().await {
            if output.status.success() {
                log::info!("Found Claude Code at: {}", path);
                return Ok(path.clone());
            }
        }
    }

    // Try common Windows npm global locations
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let npm_path = std::path::Path::new(&appdata).join("npm");
        let possible_npm_paths = vec![
            npm_path.join("claude.cmd"),
            npm_path.join("claude"),
            npm_path.join("claude.exe"),
        ];

        for path in possible_npm_paths {
            if path.exists() {
                if let Some(path_str) = path.to_str() {
                    // Test if it works
                    let mut cmd = tokio::process::Command::new(path_str);
                    cmd.arg("--version");
                    
                    // 在Windows上隐藏控制台窗口
                    #[cfg(target_os = "windows")]
                    {
                        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
                    }
                    
                    if let Ok(output) = cmd.output().await {
                        if output.status.success() {
                            log::info!("Found Claude Code at: {}", path_str);
                            return Ok(path_str.to_string());
                        }
                    }
                }
            }
        }
    }

    // Try global npm prefix location
    let mut npm_cmd = tokio::process::Command::new("npm");
    npm_cmd.args(&["config", "get", "prefix"]);
    
    // 在Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        npm_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag
    }
    
    if let Ok(output) = npm_cmd.output().await
    {
        if output.status.success() {
            let prefix_string = String::from_utf8_lossy(&output.stdout);
            let prefix = prefix_string.trim();
            let claude_path = std::path::Path::new(prefix).join("claude.cmd");
            if claude_path.exists() {
                if let Some(path_str) = claude_path.to_str() {
                    log::info!("Found Claude Code at npm prefix: {}", path_str);
                    return Ok(path_str.to_string());
                }
            }
        }
    }

    Err("无法找到Claude Code可执行文件。请确保Claude Code已正确安装。您可以运行 'npm install -g @anthropic-ai/claude-code' 来安装。".to_string())
}
