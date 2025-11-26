use log::{error, info};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
/// Auto-compact context management system for Claude Code SDK integration
///
/// This module provides intelligent context window management with automatic compaction
/// based on Claude Code SDK best practices and the official documentation.
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tokio::time::sleep;

/// Configuration for auto-compact behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoCompactConfig {
    /// Enable automatic compaction
    pub enabled: bool,
    /// Maximum context tokens before triggering compaction (default: 120000 for Claude 4)
    pub max_context_tokens: usize,
    /// Threshold percentage to trigger compaction (0.0-1.0, default: 0.85)
    pub compaction_threshold: f64,
    /// Minimum time between compactions in seconds (default: 300s = 5min)
    pub min_compaction_interval: u64,
    /// Strategy for compaction
    pub compaction_strategy: CompactionStrategy,
    /// Whether to preserve recent messages (default: true)
    pub preserve_recent_messages: bool,
    /// Number of recent messages to preserve (default: 10)
    pub preserve_message_count: usize,
    /// Custom compaction instructions
    pub custom_instructions: Option<String>,
}

/// Compaction strategies matching Claude Code SDK
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CompactionStrategy {
    /// Smart compaction focusing on key information
    Smart,
    /// Preserve only essential context
    Aggressive,
    /// Conservative compaction keeping more context
    Conservative,
    /// Custom strategy with user-defined instructions
    Custom(String),
}

/// Session context tracking information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionContext {
    pub session_id: String,
    pub project_path: String,
    pub current_tokens: usize,
    pub message_count: usize,
    #[serde(with = "systemtime_serde")]
    pub last_compaction: Option<SystemTime>,
    pub compaction_count: usize,
    pub model: String,
    pub status: SessionStatus,
}

mod systemtime_serde {
    use serde::{Deserialize, Deserializer, Serializer};
    use std::time::{SystemTime, UNIX_EPOCH};

    pub fn serialize<S>(time: &Option<SystemTime>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match time {
            Some(t) => {
                let duration = t
                    .duration_since(UNIX_EPOCH)
                    .map_err(serde::ser::Error::custom)?;
                serializer.serialize_u64(duration.as_secs())
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<SystemTime>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let secs: Option<u64> = Option::deserialize(deserializer)?;
        Ok(secs.map(|s| UNIX_EPOCH + std::time::Duration::from_secs(s)))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionStatus {
    Active,
    Idle,
    Compacting,
    CompactionFailed(String),
}

/// Auto-compact manager state
pub struct AutoCompactManager {
    pub sessions: Arc<Mutex<HashMap<String, SessionContext>>>,
    pub config: Arc<Mutex<AutoCompactConfig>>,
    pub is_monitoring: Arc<Mutex<bool>>,
}

impl Default for AutoCompactConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_context_tokens: 120000, // Claude 4 context window
            compaction_threshold: 0.85,
            min_compaction_interval: 300, // 5 minutes
            compaction_strategy: CompactionStrategy::Smart,
            preserve_recent_messages: true,
            preserve_message_count: 10,
            custom_instructions: None,
        }
    }
}

impl AutoCompactManager {
    /// Create a new AutoCompactManager instance
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            config: Arc::new(Mutex::new(AutoCompactConfig::default())),
            is_monitoring: Arc::new(Mutex::new(false)),
        }
    }

    /// Register a new session for monitoring
    pub fn register_session(
        &self,
        session_id: String,
        project_path: String,
        model: String,
    ) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;

        let context = SessionContext {
            session_id: session_id.clone(),
            project_path,
            current_tokens: 0,
            message_count: 0,
            last_compaction: None,
            compaction_count: 0,
            model,
            status: SessionStatus::Active,
        };

        sessions.insert(session_id.clone(), context);
        info!(
            "Registered session {} for auto-compact monitoring",
            session_id
        );
        Ok(())
    }

    /// Update session token count and trigger compaction if needed
    pub async fn update_session_tokens(
        &self,
        session_id: &str,
        token_count: usize,
    ) -> Result<bool, String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let config = self.config.lock().map_err(|e| e.to_string())?;

        if !config.enabled {
            return Ok(false);
        }

        if let Some(session) = sessions.get_mut(session_id) {
            session.current_tokens = token_count;
            session.message_count += 1;

            // Check if compaction is needed
            let threshold_tokens =
                (config.max_context_tokens as f64 * config.compaction_threshold) as usize;
            let needs_compaction = token_count >= threshold_tokens;

            // Check minimum interval
            let interval_ok = if let Some(last_compaction) = session.last_compaction {
                let elapsed = SystemTime::now()
                    .duration_since(last_compaction)
                    .unwrap_or(Duration::from_secs(0));
                elapsed.as_secs() >= config.min_compaction_interval
            } else {
                true // No previous compaction
            };

            if needs_compaction && interval_ok {
                info!(
                    "Auto-compaction triggered for session {}: {} tokens (threshold: {})",
                    session_id, token_count, threshold_tokens
                );
                session.status = SessionStatus::Compacting;
                return Ok(true);
            }
        }

        Ok(false)
    }

    /// Execute compaction for a session
    pub async fn execute_compaction(
        &self,
        app: tauri::AppHandle,
        session_id: &str,
    ) -> Result<(), String> {
        info!("Executing auto-compaction for session {}", session_id);

        let (project_path, custom_instructions) = {
            let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
            let config = self.config.lock().map_err(|e| e.to_string())?;

            let session = sessions
                .get(session_id)
                .ok_or_else(|| format!("Session {} not found", session_id))?;

            (
                session.project_path.clone(),
                config.custom_instructions.clone(),
            )
        };

        // Build compaction command based on strategy
        let compaction_cmd = self.build_compaction_command(&custom_instructions).await?;

        // Execute compaction using Claude CLI
        match self
            .execute_claude_compaction(&app, &project_path, &compaction_cmd)
            .await
        {
            Ok(_) => {
                // Update session state after successful compaction
                let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
                if let Some(session) = sessions.get_mut(session_id) {
                    session.last_compaction = Some(SystemTime::now());
                    session.compaction_count += 1;
                    session.status = SessionStatus::Active;
                    session.current_tokens = session.current_tokens / 3; // Estimated token reduction

                    info!(
                        "Auto-compaction completed for session {}: compaction #{}, estimated tokens: {}",
                        session_id, session.compaction_count, session.current_tokens
                    );
                }
                Ok(())
            }
            Err(e) => {
                // Update session state after failed compaction
                let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
                if let Some(session) = sessions.get_mut(session_id) {
                    session.status = SessionStatus::CompactionFailed(e.clone());
                }
                error!("Auto-compaction failed for session {}: {}", session_id, e);
                Err(e)
            }
        }
    }

    /// Build compaction command based on strategy
    async fn build_compaction_command(
        &self,
        custom_instructions: &Option<String>,
    ) -> Result<String, String> {
        let config = self.config.lock().map_err(|e| e.to_string())?;

        let base_instruction = match &config.compaction_strategy {
            CompactionStrategy::Smart => {
                "Focus on preserving key information, decisions made, and current context. \
                Remove redundant explanations and verbose descriptions while keeping \
                essential technical details and project state."
            }
            CompactionStrategy::Aggressive => {
                "Preserve only the most critical information: current task, key decisions, \
                and essential context. Remove all explanatory text and focus on actionable items."
            }
            CompactionStrategy::Conservative => {
                "Maintain comprehensive context while removing only obvious redundancies. \
                Preserve detailed explanations and keep full context of recent interactions."
            }
            CompactionStrategy::Custom(instructions) => instructions,
        };

        let final_instruction = if let Some(custom) = custom_instructions {
            format!(
                "{}\n\nAdditional instructions: {}",
                base_instruction, custom
            )
        } else {
            base_instruction.to_string()
        };

        Ok(final_instruction)
    }

    /// Execute Claude CLI compaction command
    async fn execute_claude_compaction(
        &self,
        app: &tauri::AppHandle,
        project_path: &str,
        instructions: &str,
    ) -> Result<(), String> {
        // Find Claude CLI binary
        let claude_path = crate::claude_binary::find_claude_binary(app)?;

        // Build compaction command
        let mut cmd = tokio::process::Command::new(&claude_path);
        cmd.args(&["/compact"])
            .current_dir(project_path)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        // 🔥 Fix: Apply platform-specific no-window configuration to hide console
        crate::commands::claude::apply_no_window_async(&mut cmd);

        // Execute compaction
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn compaction process: {}", e))?;

        // Send instructions to stdin
        if let Some(stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            let mut stdin = stdin;
            stdin
                .write_all(instructions.as_bytes())
                .await
                .map_err(|e| format!("Failed to write compaction instructions: {}", e))?;
            stdin
                .shutdown()
                .await
                .map_err(|e| format!("Failed to close stdin: {}", e))?;
        }

        // Wait for completion
        let output = child
            .wait_with_output()
            .await
            .map_err(|e| format!("Failed to wait for compaction: {}", e))?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Compaction failed: {}", error));
        }

        Ok(())
    }

    /// Start background monitoring
    pub async fn start_monitoring(&self, app: tauri::AppHandle) -> Result<(), String> {
        let mut is_monitoring = self.is_monitoring.lock().map_err(|e| e.to_string())?;

        if *is_monitoring {
            return Ok(()); // Already monitoring
        }

        *is_monitoring = true;
        drop(is_monitoring);

        let sessions = self.sessions.clone();
        let config = self.config.clone();
        let is_monitoring_flag = self.is_monitoring.clone();

        tokio::spawn(async move {
            info!("Starting auto-compact monitoring loop");

            while {
                let flag = is_monitoring_flag.lock().unwrap();
                *flag
            } {
                // Check all sessions for compaction needs
                let session_ids: Vec<String> = {
                    let sessions = sessions.lock().unwrap();
                    sessions.keys().cloned().collect()
                };

                for session_id in session_ids {
                    let needs_compaction = {
                        let sessions = sessions.lock().unwrap();
                        let config = config.lock().unwrap();

                        if !config.enabled {
                            continue;
                        }

                        if let Some(session) = sessions.get(&session_id) {
                            matches!(session.status, SessionStatus::Compacting)
                        } else {
                            false
                        }
                    };

                    if needs_compaction {
                        // Execute compaction in a separate task
                        let app_clone = app.clone();
                        let session_id_clone = session_id.clone();
                        let manager = AutoCompactManager {
                            sessions: sessions.clone(),
                            config: config.clone(),
                            is_monitoring: is_monitoring_flag.clone(),
                        };

                        tokio::spawn(async move {
                            if let Err(e) = manager
                                .execute_compaction(app_clone, &session_id_clone)
                                .await
                            {
                                error!(
                                    "Background compaction failed for session {}: {}",
                                    session_id_clone, e
                                );
                            }
                        });
                    }
                }

                // Sleep before next check
                sleep(Duration::from_secs(30)).await;
            }

            info!("Auto-compact monitoring stopped");
        });

        Ok(())
    }

    /// Stop background monitoring
    pub fn stop_monitoring(&self) -> Result<(), String> {
        let mut is_monitoring = self.is_monitoring.lock().map_err(|e| e.to_string())?;
        *is_monitoring = false;
        info!("Auto-compact monitoring stopped");
        Ok(())
    }

    /// Update configuration
    pub fn update_config(&self, new_config: AutoCompactConfig) -> Result<(), String> {
        let mut config = self.config.lock().map_err(|e| e.to_string())?;
        *config = new_config;
        info!("Auto-compact configuration updated");
        Ok(())
    }

    /// Get current configuration
    pub fn get_config(&self) -> Result<AutoCompactConfig, String> {
        let config = self.config.lock().map_err(|e| e.to_string())?;
        Ok(config.clone())
    }

    /// Get session statistics
    pub fn get_session_stats(&self, session_id: &str) -> Result<Option<SessionContext>, String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        Ok(sessions.get(session_id).cloned())
    }

    /// Remove session from monitoring
    pub fn unregister_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions.remove(session_id);
        info!(
            "Unregistered session {} from auto-compact monitoring",
            session_id
        );
        Ok(())
    }
}

/// State wrapper for AutoCompactManager
#[derive(Clone)]
pub struct AutoCompactState(pub Arc<AutoCompactManager>);
