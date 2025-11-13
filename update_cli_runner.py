#!/usr/bin/env python3
"""
Script to update cli_runner.rs to use the new platform module
"""

import re

# Read the file
with open('src-tauri/src/commands/claude/cli_runner.rs', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add platform import
content = content.replace(
    'use super::config::get_claude_execution_config;',
    'use super::config::get_claude_execution_config;\nuse super::platform;'
)

# 2. Replace resolve_cmd_wrapper_tokio calls
content = content.replace(
    'resolve_cmd_wrapper_tokio(program)',
    'platform::resolve_cmd_wrapper(program)'
)

# 3. Remove the resolve_cmd_wrapper_tokio function definitions
# Find and remove Windows version
pattern1 = r'#\[cfg\(target_os = "windows"\)\]\nfn resolve_cmd_wrapper_tokio\(cmd_path: &str\) -> Option<\(String, String\)> \{[^}]*\n\s+for line in content\.lines\(\) \{[^}]*\}\n\s+log::debug\("Failed to resolve \.cmd wrapper"\);\n\s+None\n\}'
content = re.sub(pattern1, '', content, flags=re.DOTALL)

# Find and remove Unix stub
pattern2 = r'#\[cfg\(not\(target_os = "windows"\)\)\]\nfn resolve_cmd_wrapper_tokio\(_cmd_path: &str\) -> Option<\(String, String\)> \{\n\s+None\n\}'
content = re.sub(pattern2, '', content)

# 4. Replace creation_flags calls with platform::apply_no_window_async
content = content.replace(
    '    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW',
    '    platform::apply_no_window_async(&mut cmd);'
)

# 5. Update kill process to use platform
# Find taskkill section in cancel_claude_execution
content = re.sub(
    r'let kill_result = if cfg!\(target_os = "windows"\) \{[^}]*\n\s+#\[cfg\(target_os = "windows"\)\][^}]*\}\n\s+#\[cfg\(not\(target_os = "windows"\)\)\][^}]*\}\n\s+\} else \{[^}]*\};',
    'let kill_result = platform::kill_process_tree(pid);',
    content,
    flags=re.DOTALL
)

# Write the updated content
with open('src-tauri/src/commands/claude/cli_runner.rs', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ cli_runner.rs updated successfully")
