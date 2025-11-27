use std::fs;
use std::path::PathBuf;



use super::paths::get_claude_dir;
use super::platform;

#[tauri::command]
pub async fn get_hooks_config(scope: String, project_path: Option<String>) -> Result<serde_json::Value, String> {
    log::info!("Getting hooks config for scope: {}, project: {:?}", scope, project_path);

    let settings_path = match scope.as_str() {
        "user" => {
            get_claude_dir()
                .map_err(|e| e.to_string())?
                .join("settings.json")
        },
        "project" => {
            let path = project_path.ok_or("Project path required for project scope")?;
            PathBuf::from(path).join(".claude").join("settings.json")
        },
        "local" => {
            let path = project_path.ok_or("Project path required for local scope")?;
            PathBuf::from(path).join(".claude").join("settings.local.json")
        },
        _ => return Err("Invalid scope".to_string())
    };

    log::info!("Settings file path: {:?}", settings_path);

    if !settings_path.exists() {
        log::info!("Settings file does not exist at {:?}, returning empty hooks", settings_path);
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    log::debug!("Settings file content length: {} bytes", content.len());

    let settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;

    let hooks = settings.get("hooks").cloned().unwrap_or(serde_json::json!({}));
    log::info!("Returning hooks config: {}", serde_json::to_string_pretty(&hooks).unwrap_or_default());

    Ok(hooks)
}

/// Updates hooks configuration in settings at specified scope
#[tauri::command]
pub async fn update_hooks_config(
    scope: String, 
    hooks: serde_json::Value,
    project_path: Option<String>
) -> Result<String, String> {
    log::info!("Updating hooks config for scope: {}, project: {:?}", scope, project_path);

    let settings_path = match scope.as_str() {
        "user" => {
            get_claude_dir()
                .map_err(|e| e.to_string())?
                .join("settings.json")
        },
        "project" => {
            let path = project_path.ok_or("Project path required for project scope")?;
            let claude_dir = PathBuf::from(path).join(".claude");
            fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            claude_dir.join("settings.json")
        },
        "local" => {
            let path = project_path.ok_or("Project path required for local scope")?;
            let claude_dir = PathBuf::from(path).join(".claude");
            fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            claude_dir.join("settings.local.json")
        },
        _ => return Err("Invalid scope".to_string())
    };

    // Read existing settings or create new
    let mut settings = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Update hooks section
    settings["hooks"] = hooks;

    // Write back with pretty formatting
    let json_string = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    fs::write(&settings_path, json_string)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok("Hooks configuration updated successfully".to_string())
}

/// Validates a hook command by dry-running it
#[tauri::command]
pub async fn validate_hook_command(command: String) -> Result<serde_json::Value, String> {
    log::info!("Validating hook command syntax");

    // Validate syntax without executing
    let mut cmd = std::process::Command::new("bash");
    cmd.arg("-n") // Syntax check only
       .arg("-c")
       .arg(&command);
    
    // Apply platform-specific no-window configuration
    platform::apply_no_window(&mut cmd);
    
    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                Ok(serde_json::json!({
                    "valid": true,
                    "message": "Command syntax is valid"
                }))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Ok(serde_json::json!({
                    "valid": false,
                    "message": format!("Syntax error: {}", stderr)
                }))
            }
        }
        Err(e) => Err(format!("Failed to validate command: {}", e))
    }
}
