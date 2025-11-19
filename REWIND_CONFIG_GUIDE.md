# Rewind 功能 Git 操作配置指南

## 功能概述

本功能允许您在配置中禁用撤回（Rewind）功能中的 Git 相关操作。启用此选项后：

- ✅ 仍然可以撤回对话历史（删除消息记录）
- ❌ 无法执行代码回滚（Git reset/stash 操作）
- ⚠️ UI 中会显示警告信息，提醒用户功能限制

## 配置方法

### 方法 1：通过 UI 设置（推荐✨）

这是最简单直接的方式：

1. 打开应用的设置页面（Settings）
2. 在 **"常规"（General）** 标签页中找到 **"禁用撤回中的 Git 操作"** 开关
3. 切换开关启用此功能
4. 点击右上角的 **"保存"** 按钮
5. 配置立即生效

**说明**：
- 开关描述：启用后，撤回功能只能删除对话历史，无法回滚代码变更（适用于多人协作或生产环境）
- 保存后会自动应用到所有新的撤回操作

### 方法 2：直接编辑配置文件

1. 打开 Claude Code 配置目录中的 `execution_config.json` 文件：
   - **Windows**: `%USERPROFILE%\.claude\execution_config.json`
   - **macOS/Linux**: `~/.claude/execution_config.json`

2. 在配置文件中添加或修改 `disable_rewind_git_operations` 字段：

```json
{
  "output_format": "StreamJson",
  "timeout_seconds": null,
  "max_tokens": null,
  "max_thinking_tokens": null,
  "verbose": true,
  "permissions": {
    "allowed_tools": ["Read", "Write", "Edit", "Bash"],
    "disallowed_tools": [],
    "permission_mode": "Interactive",
    "auto_approve_edits": false,
    "enable_dangerous_skip": true
  },
  "disable_rewind_git_operations": true
}
```

3. 保存文件并重启应用

### 方法 3：通过 API 调用（适用于前端集成）

使用 API 方法更新配置：

```typescript
import { api } from '@/lib/api';

// 获取当前配置
const config = await api.getClaudeExecutionConfig();

// 修改配置
config.disable_rewind_git_operations = true;

// 保存配置
await api.updateClaudeExecutionConfig(config);
```

## 功能行为

### 启用 Git 操作禁用后

1. **撤回能力检查（check_rewind_capabilities）**
   - 返回的 `RewindCapabilities` 对象中：
     - `conversation`: `true` （仍然可以撤回对话）
     - `code`: `false` （无法回滚代码）
     - `both`: `false` （无法同时撤回）
     - `warning`: "Git 操作已在配置中禁用。只能撤回对话历史，无法回滚代码变更。"

2. **执行撤回操作（revert_to_prompt）**
   - **ConversationOnly 模式**：✅ 正常工作，删除对话记录
   - **CodeOnly 模式**：❌ 返回错误："无法回滚代码：Git 操作已在配置中禁用..."
   - **Both 模式**：❌ 返回错误："无法回滚代码：Git 操作已在配置中禁用..."

3. **Git 记录管理**
   - 在 `ConversationOnly` 模式下，跳过 Git 记录的截断操作
   - 保留现有的 Git 记录文件，但不再更新

### 禁用 Git 操作禁用后（默认行为）

所有撤回模式正常工作：
- ✅ ConversationOnly：删除对话记录 + 截断 Git 记录
- ✅ CodeOnly：Git stash + reset 到指定提交
- ✅ Both：同时执行对话和代码撤回

## 使用场景

### 适合启用此配置的情况

1. **多人协作项目**：避免意外的代码回滚影响其他开发者
2. **生产环境**：禁止直接操作 Git 历史
3. **只关注对话历史**：只需要管理对话记录，不需要代码回滚功能
4. **Git 操作不可靠**：在某些特殊环境下 Git 操作可能出现问题

### 不适合启用的情况

1. **个人开发项目**：需要完整的撤回功能来恢复代码状态
2. **实验性开发**：经常需要回滚代码变更
3. **原型开发**：需要快速尝试和回退

## 技术实现细节

### 后端修改

1. **permission_config.rs**
   - 在 `ClaudeExecutionConfig` 结构体中添加 `disable_rewind_git_operations` 字段
   - 默认值为 `false`（不禁用）

2. **prompt_tracker.rs**
   - `revert_to_prompt` 函数：
     - 加载执行配置
     - 在执行 Git 操作前检查配置
     - 跳过 Git stash/reset 和 Git 记录截断
   - `check_rewind_capabilities` 函数：
     - 检查配置状态
     - 如果禁用，返回带警告的能力信息

### 配置存储

配置存储在：`~/.claude/execution_config.json`

配置会在以下时机加载：
- 每次执行撤回操作前
- 检查撤回能力时

## 故障排查

### 问题：修改配置后没有生效

**解决方案**：
1. 确认配置文件路径正确
2. 确认 JSON 格式正确
3. 重启应用
4. 检查日志输出：`Git operations are disabled in rewind config`

### 问题：配置文件不存在

**解决方案**：
1. 创建 `~/.claude/execution_config.json` 文件
2. 复制上面的完整配置示例
3. 修改 `disable_rewind_git_operations` 为 `true`

### 问题：仍然可以执行代码回滚

**解决方案**：
1. 检查配置文件中的字段名是否正确（`disable_rewind_git_operations`）
2. 确认字段值为 `true`（布尔类型，不是字符串 `"true"`）
3. 查看后端日志确认配置已加载

## 相关文件

### 后端（Rust）
- 后端配置结构：`src-tauri/src/commands/permission_config.rs`
- 撤回逻辑实现：`src-tauri/src/commands/prompt_tracker.rs`
- 配置管理：`src-tauri/src/commands/claude/config.rs`

### 前端（TypeScript）
- API 类型定义和方法：`src/lib/api.ts`
- Settings UI 组件：`src/features/settings/components/Settings.tsx`

## API 参考

### get_claude_execution_config

获取当前执行配置：

```rust
#[tauri::command]
pub async fn get_claude_execution_config(app: AppHandle) -> Result<ClaudeExecutionConfig, String>
```

### update_claude_execution_config

更新执行配置：

```rust
#[tauri::command]
pub async fn update_claude_execution_config(
    app: AppHandle,
    config: ClaudeExecutionConfig,
) -> Result<(), String>
```

### check_rewind_capabilities

检查撤回能力（会考虑 Git 操作配置）：

```rust
#[tauri::command]
pub async fn check_rewind_capabilities(
    session_id: String,
    project_id: String,
    prompt_index: usize,
) -> Result<RewindCapabilities, String>
```

### revert_to_prompt

执行撤回操作（会检查 Git 操作配置）：

```rust
#[tauri::command]
pub async fn revert_to_prompt(
    session_id: String,
    project_id: String,
    project_path: String,
    prompt_index: usize,
    mode: RewindMode,
) -> Result<String, String>
```

## 更新日志

- **2025-11-19**: 初始版本，添加 Git 操作禁用配置
