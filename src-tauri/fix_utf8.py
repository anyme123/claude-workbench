#!/usr/bin/env python3
"""
UTF-8 字符串切片修复脚本
自动在 claude.rs 和 acemcp.rs 中添加安全的 UTF-8 截断函数并修复所有切片操作
"""

import re

# UTF-8 安全的截断函数代码
TRUNCATE_FUNCTION = '''
/// UTF-8 安全的字符串截断函数
/// 如果 max_bytes 不在字符边界上，会向前寻找最近的边界，防止 panic
fn truncate_utf8_safe(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }

    // 从 max_bytes 开始向前查找字符边界
    let mut index = max_bytes;
    while index > 0 && !s.is_char_boundary(index) {
        index -= 1;
    }

    if index == 0 {
        // 极端情况：第一个字符就超过 max_bytes
        // 返回第一个字符的边界
        s.char_indices()
            .next()
            .map(|(_, ch)| &s[..ch.len_utf8()])
            .unwrap_or("")
    } else {
        &s[..index]
    }
}

'''

def fix_claude_rs():
    """修复 claude.rs 文件"""
    file_path = 'src/commands/claude.rs'

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 在 enhance_prompt 函数前添加辅助函数（如果还没有）
    if 'fn truncate_utf8_safe' not in content:
        # 查找插入位置
        pattern = r'(\n\n/// Enhance a prompt using local Claude  Code CLI\n#\[tauri::command\]\npub async fn enhance_prompt\()'
        content = re.sub(pattern, TRUNCATE_FUNCTION + r'\1', content)
        print("[OK] 已在 claude.rs 中添加 truncate_utf8_safe 函数")
    else:
        print("[OK] claude.rs 中已存在 truncate_utf8_safe 函数")

    # 修复第一处切片：&trimmed_prompt[..MAX_PROMPT_LENGTH]
    content = re.sub(
        r'&trimmed_prompt\[\.\.MAX_PROMPT_LENGTH\]',
        'truncate_utf8_safe(trimmed_prompt, MAX_PROMPT_LENGTH)',
        content
    )
    print("[OK] 已修复 claude.rs 中的第一处切片（trimmed_prompt）")

    # 修复第二处切片：&context_str[..MAX_CONTEXT_LENGTH]
    content = re.sub(
        r'&context_str\[\.\.MAX_CONTEXT_LENGTH\]',
        'truncate_utf8_safe(&context_str, MAX_CONTEXT_LENGTH)',
        content
    )
    print("[OK] 已修复 claude.rs 中的第二处切片（context_str）")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"[SUCCESS] claude.rs 修复完成")

def fix_acemcp_rs():
    """修复 acemcp.rs 文件"""
    file_path = 'src/commands/acemcp.rs'

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 在 enhance_prompt_with_context 函数前添加辅助函数（如果还没有）
    if 'fn truncate_utf8_safe' not in content:
        # 查找插入位置
        pattern = r'(\n#\[tauri::command\]\npub async fn enhance_prompt_with_context\()'
        content = re.sub(pattern, TRUNCATE_FUNCTION + r'\1', content)
        print("[OK] 已在 acemcp.rs 中添加 truncate_utf8_safe 函数")
    else:
        print("[OK] acemcp.rs 中已存在 truncate_utf8_safe 函数")

    # 修复第一处切片：&context_result[..max_length]
    content = re.sub(
        r'&context_result\[\.\.max_length\]',
        'truncate_utf8_safe(&context_result, max_length)',
        content
    )
    print("[OK] 已修复 acemcp.rs 中的第一处切片（context_result）")

    # 修复第二处切片：&trimmed_context[..available_space]
    content = re.sub(
        r'&trimmed_context\[\.\.available_space\]',
        'truncate_utf8_safe(&trimmed_context, available_space)',
        content
    )
    print("[OK] 已修复 acemcp.rs 中的第二处切片（trimmed_context）")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"[SUCCESS] acemcp.rs 修复完成")

if __name__ == '__main__':
    print("=" * 60)
    print("开始修复 UTF-8 字符串切片问题...")
    print("=" * 60)
    print()

    try:
        fix_claude_rs()
        print()
        fix_acemcp_rs()
        print()
        print("=" * 60)
        print("[SUCCESS] 所有修复完成！")
        print("=" * 60)
    except Exception as e:
        print(f"\n[ERROR] 修复失败: {e}")
        import traceback
        traceback.print_exc()
