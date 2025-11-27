use anyhow::Result;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

use super::claude::get_claude_dir;

/// Represents a Plugin
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    /// Plugin name
    pub name: String,
    /// Plugin description
    pub description: Option<String>,
    /// Plugin version
    pub version: String,
    /// Author information
    pub author: Option<String>,
    /// Marketplace source
    pub marketplace: Option<String>,
    /// Plugin directory path
    pub path: String,
    /// Whether plugin is enabled
    pub enabled: bool,
    /// Components count
    pub components: PluginComponents,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginComponents {
    pub commands: usize,
    pub agents: usize,
    pub skills: usize,
    pub hooks: usize,
    pub mcp_servers: usize,
}

/// Represents a Subagent file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentFile {
    /// Agent name (file name without extension)
    pub name: String,
    /// Full file path
    pub path: String,
    /// Scope: "project" or "user"
    pub scope: String,
    /// Description from frontmatter or first line
    pub description: Option<String>,
    /// File content
    pub content: String,
}

/// Represents an Agent Skill file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkillFile {
    /// Skill name (file name without SKILL.md)
    pub name: String,
    /// Full file path
    pub path: String,
    /// Scope: "project" or "user"
    pub scope: String,
    /// Description from frontmatter or first line
    pub description: Option<String>,
    /// File content
    pub content: String,
}

/// Parse YAML frontmatter if present
fn parse_description_from_content(content: &str) -> Option<String> {
    let lines: Vec<&str> = content.lines().collect();

    // Check for YAML frontmatter
    if lines.len() > 2 && lines[0] == "---" {
        for line in lines.iter().skip(1) {
            if *line == "---" {
                // Found end of frontmatter
                break;
            }
            if line.starts_with("description:") {
                return Some(line.trim_start_matches("description:").trim().to_string());
            }
        }
    }

    // Fallback: use first non-empty line as description
    lines
        .iter()
        .find(|line| !line.trim().is_empty() && !line.starts_with('#'))
        .map(|line| line.trim().to_string())
}

/// List all subagents in project and user directories
#[tauri::command]
pub async fn list_subagents(project_path: Option<String>) -> Result<Vec<SubagentFile>, String> {
    info!("Listing subagents");
    let mut agents = Vec::new();

    // User-level agents (~/.claude/agents/)
    if let Ok(claude_dir) = get_claude_dir() {
        let user_agents_dir = claude_dir.join("agents");
        if user_agents_dir.exists() {
            agents.extend(scan_agents_directory(&user_agents_dir, "user")?);
        }
    }

    // Project-level agents (.claude/agents/)
    if let Some(proj_path) = project_path {
        let project_agents_dir = Path::new(&proj_path).join(".claude").join("agents");
        if project_agents_dir.exists() {
            agents.extend(scan_agents_directory(&project_agents_dir, "project")?);
        }
    }

    Ok(agents)
}

/// Scan agents directory for .md files
fn scan_agents_directory(dir: &Path, scope: &str) -> Result<Vec<SubagentFile>, String> {
    let mut agents = Vec::new();

    for entry in WalkDir::new(dir)
        .max_depth(2) // Limit depth
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        // Only process .md files
        if !path.is_file() || path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }

        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Read file content
        match fs::read_to_string(path) {
            Ok(content) => {
                let description = parse_description_from_content(&content);

                agents.push(SubagentFile {
                    name,
                    path: path.to_string_lossy().to_string(),
                    scope: scope.to_string(),
                    description,
                    content,
                });
            }
            Err(e) => {
                debug!("Failed to read agent file {:?}: {}", path, e);
            }
        }
    }

    Ok(agents)
}

/// List all Agent Skills in project and user directories
#[tauri::command]
pub async fn list_agent_skills(
    project_path: Option<String>,
) -> Result<Vec<AgentSkillFile>, String> {
    info!("Listing agent skills");
    let mut skills = Vec::new();

    // User-level skills (~/.claude/skills/)
    if let Ok(claude_dir) = get_claude_dir() {
        let user_skills_dir = claude_dir.join("skills");
        if user_skills_dir.exists() {
            skills.extend(scan_skills_directory(&user_skills_dir, "user")?);
        }
    }

    // Project-level skills (.claude/skills/)
    if let Some(proj_path) = project_path {
        let project_skills_dir = Path::new(&proj_path).join(".claude").join("skills");
        if project_skills_dir.exists() {
            skills.extend(scan_skills_directory(&project_skills_dir, "project")?);
        }
    }

    Ok(skills)
}

/// Scan skills directory for SKILL.md files
fn scan_skills_directory(dir: &Path, scope: &str) -> Result<Vec<AgentSkillFile>, String> {
    let mut skills = Vec::new();

    for entry in WalkDir::new(dir)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        // Only process files ending with SKILL.md
        if !path.is_file() {
            continue;
        }

        let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");

        if !file_name.ends_with("SKILL.md") {
            continue;
        }

        // Extract skill name from parent directory or file name
        // Skills can be:
        // 1. {name}/SKILL.md -> use directory name
        // 2. {name}.SKILL.md -> use file prefix
        let name = if file_name == "SKILL.md" {
            // Case 1: skill-name/SKILL.md -> use parent directory name
            path.parent()
                .and_then(|p| p.file_name())
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string()
        } else {
            // Case 2: skill-name.SKILL.md -> remove .SKILL.md suffix
            file_name.trim_end_matches(".SKILL.md").to_string()
        };

        // Read file content
        match fs::read_to_string(path) {
            Ok(content) => {
                let description = parse_description_from_content(&content);

                skills.push(AgentSkillFile {
                    name,
                    path: path.to_string_lossy().to_string(),
                    scope: scope.to_string(),
                    description,
                    content,
                });
            }
            Err(e) => {
                debug!("Failed to read skill file {:?}: {}", path, e);
            }
        }
    }

    Ok(skills)
}

/// Read a specific subagent file
#[tauri::command]
pub async fn read_subagent(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read subagent file: {}", e))
}

/// Read a specific skill file
#[tauri::command]
pub async fn read_skill(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read skill file: {}", e))
}

/// Open agents directory in file explorer
#[tauri::command]
pub async fn open_agents_directory(project_path: Option<String>) -> Result<String, String> {
    let agents_dir = if let Some(proj_path) = project_path {
        Path::new(&proj_path).join(".claude").join("agents")
    } else {
        get_claude_dir().map_err(|e| e.to_string())?.join("agents")
    };

    // Create directory if it doesn't exist
    fs::create_dir_all(&agents_dir)
        .map_err(|e| format!("Failed to create agents directory: {}", e))?;

    Ok(agents_dir.to_string_lossy().to_string())
}

/// Open skills directory in file explorer
#[tauri::command]
pub async fn open_skills_directory(project_path: Option<String>) -> Result<String, String> {
    let skills_dir = if let Some(proj_path) = project_path {
        Path::new(&proj_path).join(".claude").join("skills")
    } else {
        get_claude_dir().map_err(|e| e.to_string())?.join("skills")
    };

    // Create directory if it doesn't exist
    fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    Ok(skills_dir.to_string_lossy().to_string())
}

/// List all installed plugins
#[tauri::command]
pub async fn list_plugins(project_path: Option<String>) -> Result<Vec<PluginInfo>, String> {
    info!("Listing installed plugins");
    let mut plugins = Vec::new();

    // User-level plugins (~/.claude/plugins/)
    if let Ok(claude_dir) = get_claude_dir() {
        let user_plugins_dir = claude_dir.join("plugins");
        if user_plugins_dir.exists() {
            plugins.extend(scan_plugins_directory(&user_plugins_dir)?);
        }
    }

    // Project-level plugins (.claude/plugins/)
    if let Some(proj_path) = project_path {
        let project_plugins_dir = Path::new(&proj_path).join(".claude").join("plugins");
        if project_plugins_dir.exists() {
            plugins.extend(scan_plugins_directory(&project_plugins_dir)?);
        }
    }

    Ok(plugins)
}

/// Scan plugins directory
fn scan_plugins_directory(dir: &Path) -> Result<Vec<PluginInfo>, String> {
    let mut plugins = Vec::new();

    let entries =
        fs::read_dir(dir).map_err(|e| format!("Failed to read plugins directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        // Look for .claude-plugin/plugin.json
        let plugin_json_path = path.join(".claude-plugin").join("plugin.json");

        if plugin_json_path.exists() {
            if let Ok(content) = fs::read_to_string(&plugin_json_path) {
                if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                    let name = manifest
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let description = manifest
                        .get("description")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    let version = manifest
                        .get("version")
                        .and_then(|v| v.as_str())
                        .unwrap_or("0.0.0")
                        .to_string();

                    let author = manifest
                        .get("author")
                        .and_then(|v| v.get("name"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    // Count components
                    let components = count_plugin_components(&path);

                    plugins.push(PluginInfo {
                        name,
                        description,
                        version,
                        author,
                        marketplace: None,
                        path: path.to_string_lossy().to_string(),
                        enabled: true, // TODO: 从配置读取实际状态
                        components,
                    });
                }
            }
        }
    }

    Ok(plugins)
}

/// Count plugin components
fn count_plugin_components(plugin_dir: &Path) -> PluginComponents {
    let mut components = PluginComponents {
        commands: 0,
        agents: 0,
        skills: 0,
        hooks: 0,
        mcp_servers: 0,
    };

    // Count commands
    let commands_dir = plugin_dir.join("commands");
    if commands_dir.exists() {
        components.commands = WalkDir::new(&commands_dir)
            .max_depth(2)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("md"))
            .count();
    }

    // Count agents
    let agents_dir = plugin_dir.join("agents");
    if agents_dir.exists() {
        components.agents = WalkDir::new(&agents_dir)
            .max_depth(2)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("md"))
            .count();
    }

    // Count skills
    let skills_dir = plugin_dir.join("skills");
    if skills_dir.exists() {
        components.skills = WalkDir::new(&skills_dir)
            .max_depth(2)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .file_name()
                    .and_then(|s| s.to_str())
                    .map(|s| s.ends_with("SKILL.md"))
                    .unwrap_or(false)
            })
            .count();
    }

    // Check for hooks
    let hooks_file = plugin_dir.join("hooks").join("hooks.json");
    if hooks_file.exists() {
        components.hooks = 1;
    }

    // Check for MCP servers
    let mcp_file = plugin_dir.join(".mcp.json");
    if mcp_file.exists() {
        components.mcp_servers = 1;
    }

    components
}

/// Open plugins directory
#[tauri::command]
pub async fn open_plugins_directory(project_path: Option<String>) -> Result<String, String> {
    let plugins_dir = if let Some(proj_path) = project_path {
        Path::new(&proj_path).join(".claude").join("plugins")
    } else {
        get_claude_dir().map_err(|e| e.to_string())?.join("plugins")
    };

    // Create directory if it doesn't exist
    fs::create_dir_all(&plugins_dir)
        .map_err(|e| format!("Failed to create plugins directory: {}", e))?;

    Ok(plugins_dir.to_string_lossy().to_string())
}

/// Create a new subagent file
/// According to Claude Code docs, subagents are .md files in .claude/agents/
#[tauri::command]
pub async fn create_subagent(
    name: String,
    description: String,
    content: String,
    scope: String,
    project_path: Option<String>,
) -> Result<SubagentFile, String> {
    info!("Creating subagent: {} (scope: {})", name, scope);

    // Validate name (no special characters except hyphens and underscores)
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Agent name can only contain letters, numbers, hyphens, and underscores".into());
    }

    // Determine target directory based on scope
    let agents_dir = if scope == "project" {
        let proj_path = project_path.ok_or("Project path is required for project scope")?;
        Path::new(&proj_path).join(".claude").join("agents")
    } else {
        get_claude_dir()
            .map_err(|e| e.to_string())?
            .join("agents")
    };

    // Create directory if it doesn't exist
    fs::create_dir_all(&agents_dir)
        .map_err(|e| format!("Failed to create agents directory: {}", e))?;

    // Build the file path
    let file_path = agents_dir.join(format!("{}.md", name));

    // Check if file already exists
    if file_path.exists() {
        return Err(format!("Subagent '{}' already exists", name));
    }

    // Build file content with frontmatter
    let full_content = format!(
        r#"---
description: {}
---

{}"#,
        description, content
    );

    // Write file
    fs::write(&file_path, &full_content)
        .map_err(|e| format!("Failed to write subagent file: {}", e))?;

    info!("Created subagent at: {:?}", file_path);

    Ok(SubagentFile {
        name,
        path: file_path.to_string_lossy().to_string(),
        scope,
        description: Some(description),
        content: full_content,
    })
}

/// Create a new Agent Skill
/// According to Claude Code docs, skills are SKILL.md files in .claude/skills/<skill-name>/
#[tauri::command]
pub async fn create_skill(
    name: String,
    description: String,
    content: String,
    scope: String,
    project_path: Option<String>,
) -> Result<AgentSkillFile, String> {
    info!("Creating skill: {} (scope: {})", name, scope);

    // Validate name (no special characters except hyphens and underscores)
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Skill name can only contain letters, numbers, hyphens, and underscores".into());
    }

    // Determine target directory based on scope
    let skills_dir = if scope == "project" {
        let proj_path = project_path.ok_or("Project path is required for project scope")?;
        Path::new(&proj_path).join(".claude").join("skills")
    } else {
        get_claude_dir()
            .map_err(|e| e.to_string())?
            .join("skills")
    };

    // Create skill subdirectory: .claude/skills/<skill-name>/
    let skill_dir = skills_dir.join(&name);
    fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;

    // Build the file path: .claude/skills/<skill-name>/SKILL.md
    let file_path = skill_dir.join("SKILL.md");

    // Check if file already exists
    if file_path.exists() {
        return Err(format!("Skill '{}' already exists", name));
    }

    // Build file content with YAML frontmatter (per Claude Code docs)
    let full_content = format!(
        r#"---
name: {}
description: {}
---

# {}

## Instructions

{}

## Examples

<!-- Add examples of using this skill here -->
"#,
        name, description, name, content
    );

    // Write file
    fs::write(&file_path, &full_content)
        .map_err(|e| format!("Failed to write skill file: {}", e))?;

    info!("Created skill at: {:?}", file_path);

    Ok(AgentSkillFile {
        name,
        path: file_path.to_string_lossy().to_string(),
        scope,
        description: Some(description),
        content: full_content,
    })
}
