// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod claude_binary;
mod commands;
mod process;

use std::sync::{Arc, Mutex};

use commands::acemcp::{
    enhance_prompt_with_context, test_acemcp_availability,
    save_acemcp_config, load_acemcp_config, preindex_project,
    export_acemcp_sidecar, get_extracted_sidecar_path
};
use commands::claude::{
    cancel_claude_execution, check_claude_version, clear_custom_claude_path, continue_claude_code,
    delete_project, delete_project_permanently, delete_session, delete_sessions_batch,
    execute_claude_code, find_claude_md_files,
    get_available_tools, get_claude_execution_config, get_claude_path, get_claude_permission_config,
    get_claude_session_output, get_claude_settings, get_hooks_config, get_permission_presets,
    get_project_sessions, get_system_prompt, list_directory_contents, list_hidden_projects,
    list_projects, list_running_claude_sessions, load_session_history, open_new_session,
    read_claude_md_file, reset_claude_execution_config, restore_project, resume_claude_code,
    save_claude_md_file, save_claude_settings, save_system_prompt, search_files,
    set_custom_claude_path, update_claude_execution_config, update_claude_permission_config,
    update_hooks_config, update_thinking_mode, validate_hook_command, validate_permission_config,
    ClaudeProcessState,
};
use commands::mcp::{
    mcp_add, mcp_add_from_claude_desktop, mcp_add_json, mcp_export_config, mcp_get,
    mcp_get_server_status, mcp_list, mcp_read_project_config, mcp_remove,
    mcp_reset_project_choices, mcp_save_project_config, mcp_serve, mcp_test_connection,
};
use commands::storage::{init_database, AgentDb};

use commands::clipboard::{read_from_clipboard, save_clipboard_image, write_to_clipboard};
use commands::prompt_tracker::{
    check_rewind_capabilities, get_prompt_list, get_unified_prompt_list, mark_prompt_completed,
    record_prompt_sent, revert_to_prompt,
};
use commands::provider::{
    add_provider_config, clear_provider_config, delete_provider_config,
    get_current_provider_config, get_provider_config, get_provider_presets, switch_provider_config,
    test_provider_connection, update_provider_config,
};
use commands::simple_git::check_and_init_git;
use commands::storage::{
    storage_analyze_query, storage_delete_row, storage_execute_sql,
    storage_get_performance_stats, storage_insert_row, storage_list_tables,
    storage_read_table, storage_reset_database, storage_update_row,
};
use commands::translator::{
    clear_translation_cache, detect_text_language, get_translation_cache_stats,
    get_translation_config, init_translation_service_command, translate, translate_batch,
    update_translation_config,
};
use commands::usage::{get_session_stats, get_usage_by_date_range, get_usage_stats};

use commands::enhanced_hooks::{
    execute_pre_commit_review, test_hook_condition, trigger_hook_event,
};
use commands::extensions::{
    list_agent_skills, list_plugins, list_subagents, open_agents_directory, open_plugins_directory,
    open_skills_directory, read_skill, read_subagent,
};
use commands::file_operations::{open_directory_in_explorer, open_file_with_default_app};
use commands::git_stats::{get_git_diff_stats, get_session_code_changes};
use process::ProcessRegistryState;
use tauri::Manager;
use tauri_plugin_window_state::Builder as WindowStatePlugin;

fn main() {
    // Initialize logger
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_http::init()
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            WindowStatePlugin::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all())
                .build(),
        )
        .setup(|app| {
            // Initialize database for storage operations
            let conn = init_database(&app.handle()).expect("Failed to initialize database");
            app.manage(AgentDb(Mutex::new(conn)));

            // Initialize process registry
            app.manage(ProcessRegistryState::default());

            // Initialize Claude process state
            app.manage(ClaudeProcessState::default());

            // Initialize auto-compact manager for context management
            let auto_compact_manager =
                Arc::new(commands::context_manager::AutoCompactManager::new());
            let app_handle_for_monitor = app.handle().clone();
            let manager_for_monitor = auto_compact_manager.clone();

            // Start monitoring in background
            tauri::async_runtime::spawn(async move {
                if let Err(e) = manager_for_monitor
                    .start_monitoring(app_handle_for_monitor)
                    .await
                {
                    log::error!("Failed to start auto-compact monitoring: {}", e);
                }
            });

            app.manage(commands::context_manager::AutoCompactState(
                auto_compact_manager,
            ));

            // Initialize translation service with saved configuration
            tauri::async_runtime::spawn(async move {
                commands::translator::init_translation_service_with_saved_config().await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Claude & Project Management
            list_projects,
            get_project_sessions,
            delete_session,
            delete_sessions_batch,
            delete_project,
            restore_project,
            list_hidden_projects,
            delete_project_permanently,
            get_claude_settings,
            open_new_session,
            get_system_prompt,
            check_claude_version,
            save_system_prompt,
            save_claude_settings,
            update_thinking_mode,
            find_claude_md_files,
            read_claude_md_file,
            save_claude_md_file,
            load_session_history,
            execute_claude_code,
            continue_claude_code,
            resume_claude_code,
            cancel_claude_execution,
            list_running_claude_sessions,
            get_claude_session_output,
            list_directory_contents,
            search_files,
            get_hooks_config,
            update_hooks_config,
            validate_hook_command,
            // 权限管理命令
            get_claude_execution_config,
            update_claude_execution_config,
            reset_claude_execution_config,
            get_claude_permission_config,
            update_claude_permission_config,
            get_permission_presets,
            get_available_tools,
            validate_permission_config,
            set_custom_claude_path,
            get_claude_path,
            clear_custom_claude_path,
            // Acemcp Integration
            enhance_prompt_with_context,
            test_acemcp_availability,
            save_acemcp_config,
            load_acemcp_config,
            preindex_project,
            export_acemcp_sidecar,
            get_extracted_sidecar_path,
            // Enhanced Hooks Automation
            trigger_hook_event,
            test_hook_condition,
            execute_pre_commit_review,
            // Usage & Analytics (Simplified from opcode)
            get_usage_stats,
            get_usage_by_date_range,
            get_session_stats,
            // MCP (Model Context Protocol)
            mcp_add,
            mcp_list,
            mcp_get,
            mcp_remove,
            mcp_add_json,
            mcp_add_from_claude_desktop,
            mcp_serve,
            mcp_test_connection,
            mcp_reset_project_choices,
            mcp_get_server_status,
            mcp_export_config,
            mcp_read_project_config,
            mcp_save_project_config,
            // Storage Management
            storage_list_tables,
            storage_read_table,
            storage_update_row,
            storage_delete_row,
            storage_insert_row,
            storage_execute_sql,
            storage_reset_database,
            storage_get_performance_stats,
            storage_analyze_query,
            // Slash Commands
            commands::slash_commands::slash_commands_list,
            commands::slash_commands::slash_command_get,
            commands::slash_commands::slash_command_save,
            commands::slash_commands::slash_command_delete,
            // Clipboard
            save_clipboard_image,
            write_to_clipboard,
            read_from_clipboard,
            // Provider Management
            get_provider_presets,
            get_current_provider_config,
            switch_provider_config,
            clear_provider_config,
            test_provider_connection,
            add_provider_config,
            update_provider_config,
            delete_provider_config,
            get_provider_config,
            // Translation
            translate,
            translate_batch,
            get_translation_config,
            update_translation_config,
            clear_translation_cache,
            get_translation_cache_stats,
            detect_text_language,
            init_translation_service_command,
            // Auto-Compact Context Management
            commands::context_commands::init_auto_compact_manager,
            commands::context_commands::register_auto_compact_session,
            commands::context_commands::update_session_context,
            commands::context_commands::trigger_manual_compaction,
            commands::context_commands::get_auto_compact_config,
            commands::context_commands::update_auto_compact_config,
            commands::context_commands::get_session_context_stats,
            commands::context_commands::get_all_monitored_sessions,
            commands::context_commands::unregister_auto_compact_session,
            commands::context_commands::stop_auto_compact_monitoring,
            commands::context_commands::start_auto_compact_monitoring,
            commands::context_commands::get_auto_compact_status,
            // Prompt Revert System
            check_and_init_git,
            record_prompt_sent,
            mark_prompt_completed,
            revert_to_prompt,
            get_prompt_list,
            get_unified_prompt_list,
            check_rewind_capabilities,
            // Claude Extensions (Plugins, Subagents & Skills)
            list_plugins,
            list_subagents,
            list_agent_skills,
            read_subagent,
            read_skill,
            open_plugins_directory,
            open_agents_directory,
            open_skills_directory,
            // File Operations
            open_directory_in_explorer,
            open_file_with_default_app,
            // Git Statistics
            get_git_diff_stats,
            get_session_code_changes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
