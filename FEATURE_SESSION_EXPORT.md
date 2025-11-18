# 会话记录导出功能

## 功能概述

为 Claude Workbench 实现了完整的会话记录导出功能，参考 opcode 项目的实现方案。

## 功能特点

### 1. 多种导出格式

- **JSON**: 结构化数据格式，包含完整的会话元数据和消息列表
- **JSONL**: 每行一个 JSON 对象，便于流式处理和增量解析
- **Markdown**: 人类可读的格式，适合阅读和分享

### 2. 快捷复制功能

- 复制为 JSONL：快速复制原始消息数据
- 复制为 Markdown：快速复制格式化的对话内容

### 3. UI 集成

导出按钮集成在 FloatingPromptInput 组件的控制栏中，与其他会话控制功能（模型选择、思考模式等）保持一致的设计风格。

## 实现文件

### 核心模块

1. **src/lib/sessionExport.ts**
   - 导出格式转换函数
   - 文件下载功能
   - 剪贴板复制功能
   - 文件名生成规则

2. **src/components/SessionToolbar.tsx**
   - 导出工具栏 UI 组件
   - 下拉菜单集成
   - 状态管理和反馈

### 集成点

1. **src/components/FloatingPromptInput/index.tsx**
   - 在控制栏中集成 SessionToolbar
   - 传递消息列表和会话信息

2. **src/components/FloatingPromptInput/types.ts**
   - 添加 `session` 属性支持

3. **src/components/ClaudeCodeSession.tsx**
   - 传递完整会话信息到 FloatingPromptInput

## 使用方法

### 复制会话内容

1. 在会话中点击"复制"按钮
2. 选择复制格式：
   - **复制为 JSONL**: 原始消息数据
   - **复制为 Markdown**: 格式化对话内容
3. 内容已复制到剪贴板，可在其他应用中粘贴

### 导出会话文件

1. 在会话中点击"导出"按钮
2. 选择导出格式：
   - **导出为 JSON**: 完整结构化数据（包含元数据）
   - **导出为 JSONL**: 流式数据格式
   - **导出为 Markdown**: 可读文档格式
3. 文件自动下载到浏览器默认下载目录

## 导出文件格式说明

### JSON 格式示例

```json
{
  "version": 1,
  "exported_at": "2025-11-18T15:30:00.000Z",
  "session": {
    "id": "abc123def",
    "project_id": "project-001",
    "project_path": "/path/to/project",
    "created_at": 1700318400,
    "model": "claude-sonnet-4-5-20250929"
  },
  "messages": [
    {
      "type": "user",
      "message": { "content": "..." },
      "sentAt": "2025-11-18T15:30:00.000Z"
    },
    {
      "type": "assistant",
      "message": { "content": [...] },
      "receivedAt": "2025-11-18T15:30:05.000Z"
    }
  ],
  "message_count": 10
}
```

### JSONL 格式示例

```jsonl
{"type":"user","message":{"content":"..."},"sentAt":"2025-11-18T15:30:00.000Z"}
{"type":"assistant","message":{"content":[...]},"receivedAt":"2025-11-18T15:30:05.000Z"}
```

### Markdown 格式示例

```markdown
# Claude 会话记录

## 会话信息

- **会话 ID**: abc123def
- **项目路径**: /path/to/project
- **模型**: claude-sonnet-4-5-20250929
- **创建时间**: 2025-11-18 15:30:00

---

## 对话内容

### 👤 用户

如何实现一个二叉树？

---

### 🤖 Assistant

我来帮你实现一个二叉树...

---

## 统计信息

- 用户消息: 5
- AI 回复: 5
- 总消息数: 10

*导出时间: 2025-11-18 15:35:00*
```

## 文件命名规则

导出的文件名格式为：`claude-session-{session_id前8位}-{日期}.{扩展名}`

例如：
- `claude-session-abc123de-2025-11-18.json`
- `claude-session-abc123de-2025-11-18.jsonl`
- `claude-session-abc123de-2025-11-18.md`

## 技术特点

### 数据完整性

- 保留完整的会话元数据
- 包含所有消息类型（用户、助手、工具调用等）
- 支持复杂的消息内容结构（文本、工具使用、工具结果）

### 用户体验

- 实时状态反馈（已复制提示）
- 正在流式输出时禁用导出功能
- 无消息时隐藏导出按钮
- 统一的设计风格和交互模式

### 兼容性

- 使用标准的 Blob API 和 URL.createObjectURL
- 剪贴板 API 降级处理（支持老旧浏览器）
- 与现有组件无缝集成

## 参考项目对比

### opcode 项目实现

- 位置：SessionHeader 组件中的 Popover
- 格式：JSONL 和 Markdown
- 方式：复制到剪贴板

### 当前项目增强

- 位置：FloatingPromptInput 控制栏
- 格式：JSON、JSONL 和 Markdown
- 方式：复制到剪贴板 + 文件下载
- 元数据：更完整的会话信息

## 未来扩展

可能的功能扩展方向：

1. **批量导出**: 支持一次导出多个会话
2. **自定义格式**: 支持用户自定义导出模板
3. **云端同步**: 将会话记录同步到云端
4. **分享功能**: 生成可分享的会话链接
5. **导入功能**: 支持导入之前导出的会话记录

## 测试建议

1. **基础功能测试**
   - 复制 JSONL 格式
   - 复制 Markdown 格式
   - 导出 JSON 文件
   - 导出 JSONL 文件
   - 导出 Markdown 文件

2. **边界情况测试**
   - 空会话（无消息）
   - 正在流式输出时
   - 包含图片的消息
   - 包含工具调用的消息
   - 非常长的会话

3. **兼容性测试**
   - 不同浏览器（Chrome, Firefox, Edge）
   - 不同操作系统（Windows, macOS, Linux）
   - 剪贴板权限受限的情况

## 维护说明

- 导出格式版本号当前为 `1`，如有重大格式变更应递增版本号
- 文件名规则应保持一致性，便于用户管理导出的文件
- UI 反馈应及时清晰，避免用户重复操作
