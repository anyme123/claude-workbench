#!/usr/bin/env python3
"""
完整的平台重构应用脚本
"""
import re
import os

BASE_DIR = 'src-tauri/src/commands/claude'

def update_cli_runner():
    """更新 cli_runner.rs"""
    filepath = os.path.join(BASE_DIR, 'cli_runner.rs')

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. 添加 platform 导入
    content = content.replace(
        'use super::config::get_claude_execution_config;',
        'use super::config::get_claude_execution_config;\nuse super::platform;'
    )

    # 2. 替换函数调用
    content = content.replace(
        'resolve_cmd_wrapper_tokio(program)',
        'platform::resolve_cmd_wrapper(program)'
    )

    # 3. 删除 resolve_cmd_wrapper_tokio 函数
    # Windows 版本
    pattern = r'/// Windows-specific: Resolve \.cmd wrapper.*?\n#\[cfg\(target_os = "windows"\)\]\nfn resolve_cmd_wrapper_tokio\(cmd_path: &str\) -> Option<\(String, String\)> \{[\s\S]*?    None\n\}\n\n#\[cfg\(not\(target_os = "windows"\)\)\]\nfn resolve_cmd_wrapper_tokio\(_cmd_path: &str\) -> Option<\(String, String\)> \{\n    None\n\}\n'
    content = re.sub(pattern, '', content)

    # 4. 替换 creation_flags
    content = re.sub(
        r'    // On Windows, ensure the command runs without creating a console window\n    #\[cfg\(target_os = "windows"\)\]\n    cmd\.creation_flags\(0x08000000\); // CREATE_NO_WINDOW',
        '    // Apply platform-specific no-window configuration\n    platform::apply_no_window_async(&mut cmd);',
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Updated cli_runner.rs")

def update_config():
    """更新 config.rs"""
    filepath = os.path.join(BASE_DIR, 'config.rs')

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 添加导入
    if 'use super::platform;' not in content:
        content = content.replace(
            'use super::paths::get_claude_dir;',
            'use super::paths::get_claude_dir;\nuse super::platform;'
        )

    # 替换 creation_flags
    content = re.sub(
        r'        cmd\.creation_flags\(0x08000000\); // CREATE_NO_WINDOW',
        '        platform::apply_no_window(&mut cmd);',
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Updated config.rs")

def update_hooks():
    """更新 hooks.rs"""
    filepath = os.path.join(BASE_DIR, 'hooks.rs')

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 添加导入
    if 'use super::platform;' not in content:
        content = content.replace(
            'use super::paths::get_claude_dir;',
            'use super::paths::get_claude_dir;\nuse super::platform;'
        )

    # 替换 creation_flags
    content = re.sub(
        r'    // Add CREATE_NO_WINDOW flag on Windows to prevent terminal window popup\n    #\[cfg\(target_os = "windows"\)\]\n    \{\n        cmd\.creation_flags\(0x08000000\); // CREATE_NO_WINDOW\n    \}',
        '    // Apply platform-specific no-window configuration\n    platform::apply_no_window(&mut cmd);',
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Updated hooks.rs")

def update_prompt_enhancer():
    """更新 prompt_enhancer.rs"""
    filepath = os.path.join(BASE_DIR, 'prompt_enhancer.rs')

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 添加导入（在文件开头合适位置）
    if 'use super::platform;' not in content:
        lines = content.split('\n')
        # 找到第一个 use super 语句后插入
        for i, line in enumerate(lines):
            if line.startswith('use super::'):
                lines.insert(i + 1, 'use super::platform;')
                break
        content = '\n'.join(lines)

    # 替换所有 creation_flags
    content = re.sub(
        r'        command\.creation_flags\(0x08000000\); // CREATE_NO_WINDOW flag',
        '        platform::apply_no_window(&mut command);',
        content
    )
    content = re.sub(
        r'            cmd\.creation_flags\(0x08000000\); // CREATE_NO_WINDOW flag',
        '            platform::apply_no_window(&mut cmd);',
        content
    )
    content = re.sub(
        r'        npm_cmd\.creation_flags\(0x08000000\); // CREATE_NO_WINDOW flag',
        '        platform::apply_no_window(&mut npm_cmd);',
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Updated prompt_enhancer.rs")

def update_mod():
    """更新 mod.rs"""
    filepath = os.path.join(BASE_DIR, 'mod.rs')

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. 添加模块声明
    if 'mod platform;' not in content:
        content = content.replace(
            'mod session_history;',
            'mod session_history;\nmod platform;\nmod file_ops;'
        )

    # 2. 导出 file_ops
    content = content.replace(
        'use self::project_store::ProjectStore;',
        'use self::project_store::ProjectStore;\npub use file_ops::{list_directory_contents, search_files};'
    )

    # 3. 删除 find_claude_binary 包装
    content = re.sub(
        r'/// Finds the full path to the claude binary.*?\nfn find_claude_binary\(app_handle: &AppHandle\) -> Result<String, String> \{\n    crate::claude_binary::find_claude_binary\(app_handle\)\n\}\n',
        '',
        content,
        flags=re.DOTALL
    )

    # 4. 删除文件操作代码（保留 Tauri 命令标注）
    # 注意：由于这些函数已经移到 file_ops.rs，这里只需移除实现
    # 但 Tauri 命令导出已经通过 pub use file_ops::... 处理

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Updated mod.rs")

if __name__ == '__main__':
    try:
        update_cli_runner()
        update_config()
        update_hooks()
        update_prompt_enhancer()
        update_mod()
        print("\n=== All files updated successfully ===")
        print("\nNext steps:")
        print("1. Run: cd src-tauri && cargo check")
        print("2. Fix any remaining compilation errors")
        print("3. Test the application")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
