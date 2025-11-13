# 🚨 关键修复：UTF-8 字符串切片导致的程序崩溃

## ✅ 根本原因确认

**程序崩溃的真正原因：Rust 字符串切片在 UTF-8 字符边界中间切断，导致 panic 退出！**

### 为什么会崩溃？

**Rust 的字符串切片索引是按字节，不是按字符：**

```rust
let s = "你好世界";  // 每个中文字符占 3 字节
// 字节布局: [你:3字节][好:3字节][世:3字节][界:3字节]
//            0-2      3-5      6-8      9-11

// ❌ 错误：如果索引不在字符边界上
&s[..5]  // PANIC! "byte index 5 is not a char boundary"
         // 因为索引 5 在"好"字符的中间！

// ✅ 正确：
&s[..6]  // "你好" - 索引 6 在字符边界上
```

**当用户输入包含中文、emoji、特殊符号时：**
- `MAX_PROMPT_LENGTH = 50000` 字节可能切在多字节字符中间
- `MAX_CONTEXT_LENGTH = 30000` 字节可能切在多字节字符中间
- **直接导致整个程序 panic 退出，不是抛出错误！**

---

## 🔴 问题代码位置

### 文件 1: `src-tauri/src/commands/claude.rs`

**位置 1 - 第 3093 行：**
```rust
let (final_prompt, prompt_truncated) = if trimmed_prompt.len() > MAX_PROMPT_LENGTH {
    log::warn!("Prompt too long ({} chars), truncating to {} chars",
        trimmed_prompt.len(), MAX_PROMPT_LENGTH);
    let truncated = format!("{}...\n\n[提示词过长，已自动截断]",
        &trimmed_prompt[..MAX_PROMPT_LENGTH]);  // ❌ PANIC!
    (truncated, true)
}
```

**位置 2 - 第 3110 行：**
```rust
if context_str.len() > MAX_CONTEXT_LENGTH {
    log::warn!("Context too long ({} chars), truncating to {} chars",
        context_str.len(), MAX_CONTEXT_LENGTH);
    let truncated = format!("{}\n\n[上下文过长，已自动截断]",
        &context_str[..MAX_CONTEXT_LENGTH]);  // ❌ PANIC!
    (format!("\n\nRecent conversation context:\n{}\n", truncated), true)
}
```

### 文件 2: `src-tauri/src/commands/acemcp.rs`

**位置 3 - 第 475 行：**
```rust
let trimmed_context = if context_result.len() > max_length {
    warn!("Context too long ({} chars), truncating to {} chars",
        context_result.len(), max_length);
    format!("{}...\n\n[上下文过长，已自动截断。建议在设置中降低 maxContextLength 参数]",
        &context_result[..max_length])  // ❌ PANIC!
}
```

**位置 4 - 第 500 行：**
```rust
let available_space = MAX_TOTAL_OUTPUT_LENGTH.saturating_sub(prompt.len() + 100);
if available_space > 1000 {
    let adjusted_context = format!("{}...\n\n[上下文已自动调整以适应长度限制]",
        &trimmed_context[..available_space]);  // ❌ PANIC!
    format!("{}\n\n--- 项目上下文 (来自 acemcp 语义搜索) ---\n{}",
        prompt.trim(), adjusted_context)
}
```

---

## ✅ 修复方案

### 方法 1：找到最近的字符边界（推荐）

**优点：** 性能最好，保留最多内容
**缺点：** 代码稍复杂

```rust
/// UTF-8 安全的字符串截断函数
/// 如果 max_bytes 不在字符边界上，会向前寻找最近的边界
fn truncate_utf8(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }

    // 从 max_bytes 开始向前查找，直到找到字符边界
    let mut index = max_bytes;
    while index > 0 && !s.is_char_boundary(index) {
        index -= 1;
    }

    &s[..index]
}
```

**使用示例：**
```rust
// 修复前（会 panic）：
let truncated = format!("{}...\n\n[提示词过长，已自动截断]",
    &trimmed_prompt[..MAX_PROMPT_LENGTH]);

// 修复后（安全）：
let truncated = format!("{}...\n\n[提示词过长，已自动截断]",
    truncate_utf8(trimmed_prompt, MAX_PROMPT_LENGTH));
```

### 方法 2：按字符数截断（简单但性能稍差）

**优点：** 代码简单
**缺点：** 性能较差（需要遍历字符）

```rust
/// 按字符数截断（而非字节数）
fn truncate_chars(s: &str, max_chars: usize) -> String {
    s.chars().take(max_chars).collect()
}
```

**使用示例：**
```rust
let truncated = format!("{}...\n\n[提示词过长，已自动截断]",
    truncate_chars(trimmed_prompt, MAX_PROMPT_LENGTH));
```

---

## 🔧 完整修复代码

### 步骤 1：在 `src-tauri/src/commands/claude.rs` 文件开头添加辅助函数

在 `pub async fn enhance_prompt` 函数**之前**添加：

```rust
/// UTF-8 安全的字符串截断函数
/// 如果 max_bytes 不在字符边界上，会向前寻找最近的边界
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
```

### 步骤 2：修复 `claude.rs` 中的两处切片

**修复位置 1（第 3092-3093 行）：**

```rust
// 修复前：
let truncated = format!("{}...\n\n[提示词过长，已自动截断]",
    &trimmed_prompt[..MAX_PROMPT_LENGTH]);  // ❌

// 修复后：
let truncated = format!("{}...\n\n[提示词过长，已自动截断]",
    truncate_utf8_safe(trimmed_prompt, MAX_PROMPT_LENGTH));  // ✅
```

**修复位置 2（第 3109-3110 行）：**

```rust
// 修复前：
let truncated = format!("{}\n\n[上下文过长，已自动截断]",
    &context_str[..MAX_CONTEXT_LENGTH]);  // ❌

// 修复后：
let truncated = format!("{}\n\n[上下文过长，已自动截断]",
    truncate_utf8_safe(&context_str, MAX_CONTEXT_LENGTH));  // ✅
```

### 步骤 3：修复 `acemcp.rs` 中的两处切片

在 `src-tauri/src/commands/acemcp.rs` 文件开头添加同样的辅助函数：

```rust
/// UTF-8 安全的字符串截断函数
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
```

**修复位置 3（第 474-475 行）：**

```rust
// 修复前：
format!("{}...\n\n[上下文过长，已自动截断。建议在设置中降低 maxContextLength 参数]",
    &context_result[..max_length])  // ❌

// 修复后：
format!("{}...\n\n[上下文过长，已自动截断。建议在设置中降低 maxContextLength 参数]",
    truncate_utf8_safe(&context_result, max_length))  // ✅
```

**修复位置 4（第 499-500 行）：**

```rust
// 修复前：
let adjusted_context = format!("{}...\n\n[上下文已自动调整以适应长度限制]",
    &trimmed_context[..available_space]);  // ❌

// 修复后：
let adjusted_context = format!("{}...\n\n[上下文已自动调整以适应长度限制]",
    truncate_utf8_safe(&trimmed_context, available_space));  // ✅
```

---

## 🧪 测试用例

### 测试 1：纯中文超长提示词

```rust
// 输入：60,000 字节的中文文本
let prompt = "你好世界".repeat(5000);  // 约 60,000 字节

// 预期：
// - 不会 panic
// - 截断到约 50,000 字节
// - 不会切在字符中间
```

### 测试 2：包含 Emoji 的超长文本

```rust
// 输入：包含 emoji 的文本
let prompt = "Hello 😀 World 🌍 Test 🎉".repeat(3000);

// 预期：
// - 不会 panic
// - emoji 不会被切断（emoji 占 4 字节）
```

### 测试 3：边界情况

```rust
// 测试 1：刚好在字符边界
let s = "你好世界";  // 12 字节
truncate_utf8_safe(s, 6);  // "你好" ✅

// 测试 2：不在字符边界
truncate_utf8_safe(s, 5);  // "你" ✅ (向前找到字节3)

// 测试 3：超大字符
let s = "🎉测试";  // emoji 4字节 + 中文 6字节 = 10字节
truncate_utf8_safe(s, 5);  // "🎉" ✅
```

---

## ⚡ 修复效果

### 修复前：
- ❌ 用户输入包含中文/emoji 时随机崩溃
- ❌ 无法预测何时崩溃（取决于字符位置）
- ❌ 整个程序退出，用户体验极差
- ❌ 无错误提示，难以调试

### 修复后：
- ✅ 任何 UTF-8 字符都能正确截断
- ✅ 不会崩溃，只会截断到安全长度
- ✅ 保留最多的有效内容
- ✅ 友好的截断提示
- ✅ 日志清晰，易于调试

---

## 📋 实施步骤

### 1. 修改代码（15 分钟）

```bash
# 编辑两个文件
1. src-tauri/src/commands/claude.rs
   - 添加 truncate_utf8_safe 函数
   - 修复第 3093 行
   - 修复第 3110 行

2. src-tauri/src/commands/acemcp.rs
   - 添加 truncate_utf8_safe 函数
   - 修复第 475 行
   - 修复第 500 行
```

### 2. 编译测试（5 分钟）

```bash
cd src-tauri
cargo build --release
```

### 3. 测试验证（10 分钟）

```bash
# 测试用例 1：超长中文提示词
输入：包含 60,000 字符的中文提示词
预期：正常截断，不崩溃

# 测试用例 2：包含 emoji
输入：包含大量 emoji 的超长文本
预期：正常截断，不崩溃

# 测试用例 3：混合字符
输入：中文 + 英文 + emoji + 特殊符号
预期：正常截断，不崩溃
```

### 4. 回归测试（5 分钟）

```bash
# 确保正常功能不受影响
- 短提示词（< 1000 字符）正常工作
- 正常长度提示词（1000-10000 字符）正常工作
- 所有优化模式（Claude/Gemini/第三方API）正常工作
```

---

## 🎯 总结

### 根本原因

**Rust 字符串切片 `&s[..n]` 使用字节索引，不是字符索引。**
**当索引 n 不在 UTF-8 字符边界上时，会 panic 导致程序崩溃退出。**

### 为什么之前没发现

1. **测试用例不够全面** - 没有测试包含大量中文/emoji 的超长输入
2. **英文环境不易触发** - 英文字符都是 1 字节，很少切在字符中间
3. **随机性** - 只有当截断位置刚好在多字节字符中间时才崩溃

### 为什么影响所有路径

无论使用 Claude CLI、Gemini CLI 还是第三方 API：
- 都会走 `enhance_prompt` 函数
- 都会在超长时触发截断逻辑
- 都会执行相同的字符串切片操作
- **因此都会在相同位置 panic**

### 修复的重要性

这是一个 **P0 级别的关键 bug**：
- 🔴 导致程序崩溃退出（不是错误提示）
- 🔴 影响所有使用提示词优化的用户
- 🔴 在包含中文/emoji 的场景下必现
- 🔴 用户体验极差（突然崩溃）

**必须立即修复！**

---

**修复完成时间估算：** 30 分钟（包含编译和测试）
**风险等级：** 低（只是改变截断方式，不影响核心逻辑）
**优先级：** 🔴 P0 - 立即修复

---

**分析人员：** Droid AI (Claude Agent)
**分析时间：** 2025-11-13
