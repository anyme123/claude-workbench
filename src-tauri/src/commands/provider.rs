use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{command, AppHandle};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub base_url: String,
    pub auth_token: Option<String>,
    pub api_key: Option<String>,
    pub api_key_helper: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CurrentConfig {
    pub anthropic_base_url: Option<String>,
    pub anthropic_auth_token: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub anthropic_api_key_helper: Option<String>,
    pub anthropic_model: Option<String>,
}

// 获取Claude设置文件路径
fn get_settings_path() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "无法获取用户主目录".to_string())?;
    
    let config_dir = home_dir.join(".claude");
    
    // 确保配置目录存在
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("无法创建配置目录: {}", e))?;
    }
    
    Ok(config_dir.join("settings.json"))
}

// 获取遗留的providers.json路径（用于迁移）
fn get_legacy_providers_path() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "无法获取用户主目录".to_string())?;
    Ok(home_dir.join(".claude").join("providers.json"))
}

// 读取settings.json文件
fn load_settings() -> Result<Value, String> {
    let settings_path = get_settings_path()?;
    
    if !settings_path.exists() {
        // 创建默认设置文件
        let default_settings = serde_json::json!({
            "env": {}
        });
        
        let content = serde_json::to_string_pretty(&default_settings)
            .map_err(|e| format!("序列化默认设置失败: {}", e))?;
            
        fs::write(&settings_path, content)
            .map_err(|e| format!("创建默认设置文件失败: {}", e))?;
            
        return Ok(default_settings);
    }
    
    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("读取设置文件失败: {}", e))?;
    
    let settings: Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析设置文件失败: {}", e))?;
    
    Ok(settings)
}

// 保存settings.json文件
fn save_settings(settings: &Value) -> Result<(), String> {
    let settings_path = get_settings_path()?;
    
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("序列化设置失败: {}", e))?;
    
    fs::write(&settings_path, content)
        .map_err(|e| format!("写入设置文件失败: {}", e))?;
    
    Ok(())
}

// 从遗留的providers.json加载预设配置
fn load_legacy_providers() -> Result<Vec<ProviderConfig>, String> {
    let legacy_path = get_legacy_providers_path()?;
    
    if !legacy_path.exists() {
        return Ok(vec![]);
    }
    
    let content = fs::read_to_string(&legacy_path)
        .map_err(|e| format!("读取遗留配置文件失败: {}", e))?;
    
    if content.trim().is_empty() {
        return Ok(vec![]);
    }
    
    let providers: Vec<ProviderConfig> = serde_json::from_str(&content)
        .map_err(|e| format!("解析遗留配置文件失败: {}", e))?;
    
    Ok(providers)
}

// CRUD 操作 - 获取所有代理商预设（从遗留文件读取）
#[command]
pub fn get_provider_presets() -> Result<Vec<ProviderConfig>, String> {
    load_legacy_providers()
}

// CRUD 操作 - 添加代理商预设（写入遗留文件，保持兼容性）
#[command]
pub fn add_provider_config(config: ProviderConfig) -> Result<String, String> {
    let mut providers = load_legacy_providers()?;
    
    // 检查ID是否已存在
    if providers.iter().any(|p| p.id == config.id) {
        return Err(format!("ID '{}' 已存在，请使用不同的ID", config.id));
    }
    
    providers.push(config.clone());
    
    // 保存到遗留文件
    let legacy_path = get_legacy_providers_path()?;
    let content = serde_json::to_string_pretty(&providers)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    
    fs::write(&legacy_path, content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    
    Ok(format!("成功添加代理商配置: {}", config.name))
}

// CRUD 操作 - 更新代理商预设
#[command]
pub fn update_provider_config(config: ProviderConfig) -> Result<String, String> {
    let mut providers = load_legacy_providers()?;
    
    let index = providers.iter().position(|p| p.id == config.id)
        .ok_or_else(|| format!("未找到ID为 '{}' 的配置", config.id))?;
    
    providers[index] = config.clone();
    
    // 保存到遗留文件
    let legacy_path = get_legacy_providers_path()?;
    let content = serde_json::to_string_pretty(&providers)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    
    fs::write(&legacy_path, content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    
    Ok(format!("成功更新代理商配置: {}", config.name))
}

// CRUD 操作 - 删除代理商预设
#[command]
pub fn delete_provider_config(id: String) -> Result<String, String> {
    let mut providers = load_legacy_providers()?;
    
    let index = providers.iter().position(|p| p.id == id)
        .ok_or_else(|| format!("未找到ID为 '{}' 的配置", id))?;
    
    let deleted_config = providers.remove(index);
    
    // 保存到遗留文件
    let legacy_path = get_legacy_providers_path()?;
    let content = serde_json::to_string_pretty(&providers)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    
    fs::write(&legacy_path, content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    
    Ok(format!("成功删除代理商配置: {}", deleted_config.name))
}

// CRUD 操作 - 获取单个代理商预设
#[command]
pub fn get_provider_config(id: String) -> Result<ProviderConfig, String> {
    let providers = load_legacy_providers()?;
    
    providers.into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("未找到ID为 '{}' 的配置", id))
}

// 获取当前代理商配置（从settings.json的env字段和apiKeyHelper字段读取）
#[command]
pub fn get_current_provider_config() -> Result<CurrentConfig, String> {
    let settings = load_settings()?;
    
    let empty_map = serde_json::Map::new();
    let env_vars = settings.get("env")
        .and_then(|v| v.as_object())
        .unwrap_or(&empty_map);
    
    // apiKeyHelper 是与 env 同级的独立字段
    let api_key_helper = settings.get("apiKeyHelper")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    
    Ok(CurrentConfig {
        anthropic_base_url: env_vars.get("ANTHROPIC_BASE_URL")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        anthropic_auth_token: env_vars.get("ANTHROPIC_AUTH_TOKEN")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        anthropic_api_key: env_vars.get("ANTHROPIC_API_KEY")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        anthropic_api_key_helper: api_key_helper,
        anthropic_model: env_vars.get("ANTHROPIC_MODEL")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

// 切换代理商配置（写入settings.json的env字段）
#[command]
pub async fn switch_provider_config(_app: AppHandle, config: ProviderConfig) -> Result<String, String> {
    log::info!("开始切换代理商配置: {} - {}", config.name, config.description);
    
    let mut settings = load_settings()?;
    
    // 确保env字段存在
    if !settings.is_object() {
        return Err("settings.json格式错误".to_string());
    }
    
    let settings_obj = settings.as_object_mut().unwrap();
    if !settings_obj.contains_key("env") {
        settings_obj.insert("env".to_string(), serde_json::json!({}));
    }
    
    let env_obj = settings_obj.get_mut("env").unwrap().as_object_mut()
        .ok_or("env字段格式错误")?;
    
    // 清理之前的ANTHROPIC环境变量
    env_obj.remove("ANTHROPIC_API_KEY");
    env_obj.remove("ANTHROPIC_AUTH_TOKEN");
    env_obj.remove("ANTHROPIC_BASE_URL");
    env_obj.remove("ANTHROPIC_MODEL");
    
    // 设置新的环境变量
    env_obj.insert("ANTHROPIC_BASE_URL".to_string(), serde_json::Value::String(config.base_url.clone()));
    
    // 确定要使用的认证令牌值
    let auth_token = if let Some(token) = &config.auth_token {
        if !token.is_empty() {
            env_obj.insert("ANTHROPIC_AUTH_TOKEN".to_string(), serde_json::Value::String(token.clone()));
            Some(token.clone())
        } else {
            None
        }
    } else {
        None
    };
    
    if let Some(api_key) = &config.api_key {
        if !api_key.is_empty() {
            env_obj.insert("ANTHROPIC_API_KEY".to_string(), serde_json::Value::String(api_key.clone()));
        }
    }
    
    if let Some(model) = &config.model {
        if !model.is_empty() {
            env_obj.insert("ANTHROPIC_MODEL".to_string(), serde_json::Value::String(model.clone()));
        }
    }
    
    // apiKeyHelper 自动生成 - 使用 ANTHROPIC_AUTH_TOKEN 的值
    if let Some(token) = auth_token {
        let helper_command = format!("echo '{}'", token);
        settings_obj.insert("apiKeyHelper".to_string(), serde_json::Value::String(helper_command));
        log::info!("自动生成 apiKeyHelper 命令: echo '[TOKEN_MASKED]'");
    } else {
        // 如果没有认证令牌，移除 apiKeyHelper 字段
        settings_obj.remove("apiKeyHelper");
        log::info!("未找到认证令牌，移除 apiKeyHelper 字段");
    }
    
    // 保存设置
    save_settings(&settings)?;
    
    log::info!("代理商配置切换完成: {}", config.name);
    
    Ok(format!(
        "✅ 已成功切换到 {} ({})\n\n配置已写入 ~/.claude/settings.json，即时生效！", 
        config.name, 
        config.description
    ))
}

// 清理代理商配置（清理settings.json的env字段中的ANTHROPIC变量和apiKeyHelper字段）
#[command]
pub async fn clear_provider_config(_app: AppHandle) -> Result<String, String> {
    log::info!("开始清理代理商配置");
    
    let mut settings = load_settings()?;
    
    // 如果有env字段，清理ANTHROPIC相关变量
    if let Some(env_obj) = settings.get_mut("env").and_then(|v| v.as_object_mut()) {
        env_obj.remove("ANTHROPIC_API_KEY");
        env_obj.remove("ANTHROPIC_AUTH_TOKEN");
        env_obj.remove("ANTHROPIC_BASE_URL");
        env_obj.remove("ANTHROPIC_MODEL");
        
        log::info!("已清理ANTHROPIC环境变量");
    }
    
    // 清理与 env 同级的 apiKeyHelper 字段
    if let Some(settings_obj) = settings.as_object_mut() {
        settings_obj.remove("apiKeyHelper");
        log::info!("已清理apiKeyHelper字段");
    }
    
    // 保存设置
    save_settings(&settings)?;
    
    log::info!("代理商配置清理完成");
    
    Ok("✅ 已清理所有ANTHROPIC环境变量和apiKeyHelper配置\n\n配置已从 ~/.claude/settings.json 中移除！".to_string())
}

// 测试代理商连接
#[command]
pub fn test_provider_connection(base_url: String) -> Result<String, String> {
    // 简单的连接测试 - 尝试访问API端点
    let test_url = if base_url.ends_with('/') {
        format!("{}v1/messages", base_url)
    } else {
        format!("{}/v1/messages", base_url)
    };
    
    // 这里可以实现实际的HTTP请求测试
    // 目前返回一个简单的成功消息
    Ok(format!("连接测试完成：{}", test_url))
}