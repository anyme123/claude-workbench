# Claude Workbench 3.0 🚀

<div align="center">

**专业级 Claude CLI 桌面应用与工具集**

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/anyme123/claude-workbench)
[![License](https://img.shields.io/badge/license-AGPL--3.0-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg)]()
[![Tauri](https://img.shields.io/badge/Tauri-2.0-orange.svg)](https://tauri.app)

[English](#english) | [中文](#chinese)

</div>

---

## 📖 项目简介

Claude Workbench 是一款为 Claude CLI 打造的**专业级桌面应用**，旨在提供更强大、更智能、更高效的 AI 编程体验。通过现代化的 GUI 界面、智能代理系统、自动化工作流和深度集成的项目管理功能，让您的 AI 开发效率飞速提升。

### 🎯 为什么选择 Claude Workbench？

- 🧠 **智能代理系统** - 自定义专业化 AI 代理，处理复杂多步骤任务
- 🌍 **智能翻译中间件** - 无缝中英文交互，零语言障碍
- 📊 **实时使用统计** - 详细的 Token 追踪与成本分析
- 🔄 **自动上下文管理** - 智能压缩对话历史，节省成本
- ⏱️ **时间线与检查点** - 会话状态快照，随时回溯和分支
- 🔌 **MCP 服务器管理** - 完整的 Model Context Protocol 支持
- 🪝 **Hooks 自动化** - 强大的事件驱动工作流自动化
- 📑 **多标签页管理** - 同时处理多个项目和会话

---

## ✨ 核心功能特性

### 1️⃣ 智能代理系统（Agent System）

打造您的 AI 专家团队，每个代理都有独特的专业领域和任务处理能力。

**特性亮点：**
- 📥 **从 GitHub 导入代理** - 支持 getAsterisk/claudia 仓库
- 🛠️ **自定义代理创建** - 通过 `.claudia.json` 格式定义
- 📈 **执行追踪与指标** - 详细的运行历史、Token 使用、成本统计
- 🔄 **实时输出流** - 流式查看代理执行过程
- 🎭 **子代理专业化** - 智能路由到最合适的专业代理

**使用场景：**
```typescript
// 创建代码审查代理
const agent = await api.createAgent(
  "Code Reviewer",
  "🔍",
  "You are a senior code reviewer...",
  "Review code for security and performance",
  "opus"
);

// 执行代理任务
const runId = await api.executeAgent(
  agentId,
  "/path/to/project",
  "Review the authentication module"
);
```

---

### 2️⃣ 智能翻译中间件（Translation Service）

打破语言障碍，用中文与 Claude 自然交流，获得原生英文性能。

**核心技术：**
- 🔍 **智能语言检测** - 自动识别中英文内容
- 🔄 **双向透明翻译** - 中文输入→英文发送，英文响应→中文显示
- 💾 **翻译缓存优化** - 相同内容本地缓存，提速 10x
- 🛡️ **降级保护机制** - 翻译失败时自动使用原文
- ⚙️ **自定义 API 配置** - 支持 Silicon Flow 等翻译服务

**工作流程：**
```
用户输入中文 → 检测语言 → 翻译为英文 → 发送给 Claude API
                    ↓
Claude 返回英文 → 翻译为中文 → 展示给用户
```

**配置示例：**
```typescript
const config = {
  enabled: true,
  api_base_url: "https://api.siliconflow.cn/v1",
  api_key: "your-api-key",
  model: "tencent/Hunyuan-MT-7B",
  cache_ttl_seconds: 3600
};
```

---

### 3️⃣ 自动上下文压缩（Auto-Compact Context）

智能管理对话上下文，自动压缩历史消息，节省 Token 成本高达 70%。

**智能策略：**
- 📊 **实时 Token 监控** - 持续追踪会话 Token 使用量
- 🎯 **自动触发机制** - 达到阈值自动压缩（可配置）
- 🧠 **智能压缩算法** - 保留关键信息，压缩冗余内容
- 🔄 **多种压缩策略** - Smart / Aggressive / Conservative / Custom
- 📝 **保留最近消息** - 确保上下文连贯性

**压缩策略：**
| 策略 | 压缩率 | 信息保留 | 适用场景 |
|------|--------|----------|----------|
| **Smart** | 中等 | 高 | 日常开发（推荐）|
| **Aggressive** | 高 | 中 | 成本敏感项目 |
| **Conservative** | 低 | 极高 | 关键业务会话 |
| **Custom** | 自定义 | 自定义 | 特殊需求 |

**配置示例：**
```typescript
const autoCompactConfig = {
  enabled: true,
  max_context_tokens: 150000,
  compaction_threshold: 0.85,
  compaction_strategy: "Smart",
  preserve_recent_messages: true,
  preserve_message_count: 10
};
```

---

### 4️⃣ MCP 服务器管理

完整的 Model Context Protocol 支持，轻松集成第三方工具和服务。

**功能特性：**
- 🔌 **多传输协议** - 支持 stdio 和 SSE
- 📦 **从 Claude Desktop 导入** - 一键导入现有配置
- 🧪 **连接测试** - 实时检测服务器状态
- 🌐 **多级配置** - local / project / user 三级作用域
- 📝 **JSON 配置支持** - 灵活的配置管理

**配置示例：**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"],
      "env": {}
    }
  }
}
```

---

### 5️⃣ 使用统计与成本追踪

全方位的使用数据分析，精确掌控 API 成本。

**统计维度：**
- 📊 **按模型分组** - Claude Opus / Sonnet / Haiku 详细统计
- 📁 **按项目分组** - 每个项目的独立成本核算
- 🌐 **按 API 源分组** - 多 API 提供商成本对比
- 📅 **按日期分组** - 每日、每周、每月趋势分析
- 💾 **缓存效率分析** - Cache Creation / Cache Read Token 统计

**数据展示：**
```typescript
interface UsageStats {
  total_cost: number;              // 总成本（美元）
  total_tokens: number;            // 总 Token 数
  total_input_tokens: number;      // 输入 Token
  total_output_tokens: number;     // 输出 Token
  total_cache_creation_tokens: number; // 缓存创建 Token
  total_cache_read_tokens: number; // 缓存读取 Token
  total_sessions: number;          // 会话总数
  by_model: ModelUsage[];          // 按模型统计
  by_date: DailyUsage[];           // 按日期统计
  by_project: ProjectUsage[];      // 按项目统计
}
```

**实时成本监控：**
- 💰 今日消费、本周消费实时显示
- 📈 Token 使用趋势图表
- 🎯 成本预警与优化建议
- 💾 缓存命中率分析

---

### 6️⃣ 检查点与时间线系统

会话状态的"时光机"，随时保存、恢复、分支您的对话历史。

**核心能力：**
- 📸 **状态快照** - 保存完整的会话状态
- 🌲 **时间线树** - 可视化的分支历史
- 🔄 **状态恢复** - 一键回到任意历史点
- 🔀 **时间线分支** - 从任意检查点创建新分支
- ⚡ **自动检查点** - 智能触发策略

**检查点策略：**
- **Manual** - 手动创建检查点
- **PerPrompt** - 每次用户输入后自动创建
- **PerToolUse** - 每次工具调用后自动创建
- **Smart** - 智能判断重要操作时创建

**使用场景：**
```typescript
// 创建检查点
const checkpoint = await api.createCheckpoint(
  sessionId,
  projectId,
  projectPath,
  messageIndex,
  "Before refactoring authentication"
);

// 恢复到检查点
await api.restoreCheckpoint(
  checkpointId,
  sessionId,
  projectId,
  projectPath
);

// 从检查点创建分支
await api.forkFromCheckpoint(
  checkpointId,
  sessionId,
  projectId,
  projectPath,
  newSessionId,
  "Experimental feature branch"
);
```

---

### 7️⃣ Hooks 自动化系统

强大的事件驱动工作流，让 AI 开发流程完全自动化。

**支持的事件类型：**
| 事件 | 触发时机 | 典型用途 |
|------|----------|----------|
| **PreToolUse** | 工具调用前 | 权限检查、参数验证 |
| **PostToolUse** | 工具调用后 | 日志记录、通知 |
| **OnSessionStart** | 会话开始 | 环境初始化 |
| **OnSessionEnd** | 会话结束 | 清理、总结 |
| **OnContextCompact** | 上下文压缩 | 备份、通知 |
| **OnCheckpointCreate** | 创建检查点 | 额外备份 |
| **OnFileChange** | 文件修改 | 自动保存、验证 |
| **OnAgentSwitch** | 切换代理 | 状态传递 |

**高级特性：**
- 🎯 **条件表达式** - 只在特定条件下执行
- 🔗 **Hook 链** - 多个 Hook 串联执行
- 🌐 **多级配置** - user / project / local 作用域
- 🛡️ **安全验证** - 命令语法检查

**配置示例：**
```typescript
{
  "hooks": {
    "PreToolUse": [
      {
        "name": "validate-file-access",
        "command": "echo 'Validating file access...'",
        "condition": "tool === 'read' || tool === 'write'"
      }
    ],
    "OnSessionEnd": [
      {
        "name": "generate-summary",
        "command": "echo 'Session completed. Generating summary...'"
      }
    ]
  }
}
```

---

### 8️⃣ 多标签页管理

像浏览器一样管理多个 AI 会话，多任务并行处理。

**特性：**
- 🗂️ **多项目同时打开** - 在不同标签页中管理不同项目
- 💾 **标签页状态保存** - 自动保存每个标签的工作状态
- 🔄 **无缝切换** - 快速在不同会话间切换
- 🎨 **视觉指示器** - 清晰的标签页状态图标
- 🔔 **活动提醒** - 后台标签页有新消息时通知

---

## 🏗️ 技术架构

### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                    │
├──────────────────┬──────────────────┬───────────────────┤
│  React Frontend  │   Tauri Bridge   │   Rust Backend    │
│   (TypeScript)   │       IPC        │                   │
├──────────────────┼──────────────────┼───────────────────┤
│ • UI Components  │ • Command Router │ • Process Manager │
│ • State Mgmt     │ • Event System   │ • SQLite Database │
│ • API Client     │ • Type Safety    │ • File System     │
│ • Hooks & Context│ • Async Handler  │ • Claude CLI Exec │
└──────────────────┴──────────────────┴───────────────────┘
           ↓                  ↓                  ↓
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │ Rendering│      │   IPC    │      │  System  │
    │  Engine  │      │  Bridge  │      │   APIs   │
    └──────────┘      └──────────┘      └──────────┘
```

### 技术栈

**前端技术：**
- ⚛️ **React 18** - 现代化 UI 框架
- 📘 **TypeScript** - 类型安全
- 🎨 **Tailwind CSS 4** - 原子化样式
- 🧩 **Radix UI** - 无障碍组件库
- 🎭 **Framer Motion** - 流畅动画
- 🌐 **i18next** - 国际化支持

**后端技术：**
- 🦀 **Rust** - 高性能、安全的系统级语言
- 🖥️ **Tauri 2** - 轻量级桌面应用框架
- 💾 **SQLite (rusqlite)** - 嵌入式数据库
- ⚡ **Tokio** - 异步运行时
- 🔐 **Serde** - 序列化/反序列化
- 📝 **Regex** - 正则表达式引擎

**核心依赖：**
- 🤖 **@anthropic-ai/sdk** - Claude API 官方 SDK
- 🎯 **@tanstack/react-virtual** - 虚拟滚动优化
- 📊 **date-fns** - 日期处理
- 🔍 **lucide-react** - 图标库
- 📝 **react-markdown** - Markdown 渲染

---

## 🚀 快速开始

### 系统要求

- **操作系统**: Windows 10+ / macOS 10.15+
- **Node.js**: 18.0+
- **Bun**: 最新版本（推荐）或 npm/yarn
- **Rust**: 1.70+
- **Claude CLI**: 已安装并配置

### 安装步骤

1️⃣ **克隆仓库**
```bash
git clone https://github.com/anyme123/claude-workbench.git
cd claude-workbench
```

2️⃣ **安装依赖**
```bash
# 推荐使用 Bun（更快）
bun install

# 或使用 npm
npm install
```

3️⃣ **开发模式运行**
```bash
bun run tauri:dev
```

4️⃣ **构建生产版本**
```bash
# 完整优化构建
bun run tauri:build

# 快速开发构建
bun run tauri:build-fast
```

### 配置 Claude CLI

确保已安装 Claude CLI 并配置 API 密钥：

```bash
# 检查 Claude CLI 版本
claude --version

# 配置 API 密钥（如果还没有）
# 按照 Claude CLI 官方文档配置
```

---

## 📸 功能截图

> 💡 **提示**: 建议在此处添加项目的实际截图，展示：
> - 主界面
> - 代理管理界面
> - 翻译设置界面
> - 使用统计仪表板
> - 检查点时间线
> - MCP 服务器管理
> - 多标签页界面

```
[主界面截图]
[代理系统截图]
[统计仪表板截图]
[检查点时间线截图]
```

---

## 🎯 使用场景

### 场景 1：多语言团队协作
中文母语开发者可以用中文与 Claude 交流，获得与英文用户相同的性能和准确度，打破语言障碍。

### 场景 2：大规模项目开发
通过自动上下文压缩，在超长对话中节省 Token 成本，同时保持上下文连贯性。

### 场景 3：专业化任务处理
创建不同专业领域的代理（代码审查、测试生成、文档编写等），提升特定任务的处理效率。

### 场景 4：成本敏感项目
通过详细的使用统计和成本追踪，精确控制 API 开支，优化 Token 使用策略。

### 场景 5：实验性功能开发
利用检查点系统，安全地尝试不同方案，随时回滚到稳定状态。

---

## 🗺️ 路线图

### ✅ 已完成（v3.0）
- [x] 智能代理系统
- [x] 翻译中间件
- [x] 自动上下文压缩
- [x] MCP 服务器管理
- [x] 使用统计与成本追踪
- [x] 检查点与时间线
- [x] Hooks 自动化
- [x] 多标签页管理
- [x] 跨平台支持（Windows + macOS）

### 🚧 进行中（v3.1）
- [ ] 云端同步功能
- [ ] 团队协作模式
- [ ] 插件系统
- [ ] 更多 MCP 服务器预设

### 🔮 计划中（v4.0）
- [ ] AI 代理市场
- [ ] 可视化工作流编排
- [ ] 集成开发环境（IDE）插件
- [ ] 移动端伴侣应用

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！

### 如何贡献

1. **Fork 本仓库**
2. **创建功能分支** (`git checkout -b feature/AmazingFeature`)
3. **提交更改** (`git commit -m 'Add some AmazingFeature'`)
4. **推送到分支** (`git push origin feature/AmazingFeature`)
5. **开启 Pull Request**

### 代码规范

- **TypeScript/React**: 遵循 ESLint 规则，使用 PascalCase 命名组件
- **Rust**: 遵循标准 Rust 约定，使用 `cargo fmt` 格式化
- **提交信息**: 使用语义化提交信息（Conventional Commits）

### 开发建议

- 运行 `tsc` 进行类型检查
- 使用 `bun run build` 确保前端构建通过
- 使用 `cargo build` 确保后端编译通过

---

## 📄 许可证

本项目采用 [AGPL-3.0 许可证](LICENSE)。

**这意味着：**
- ✅ 可以自由使用、修改和分发
- ✅ 可用于商业用途
- ⚠️ 修改后的代码必须开源
- ⚠️ 网络使用也需要开源

---

## 🙏 致谢

特别感谢以下项目和贡献者：

- [Tauri](https://tauri.app) - 优秀的桌面应用框架
- [Anthropic](https://anthropic.com) - Claude AI 和 Claude CLI
- [React](https://react.dev) - 强大的 UI 框架
- [Rust](https://www.rust-lang.org) - 卓越的系统编程语言
- 所有为本项目做出贡献的开发者

---

## 📞 联系方式

- **GitHub Issues**: [提交问题](https://github.com/anyme123/claude-workbench/issues)
- **GitHub Discussions**: [参与讨论](https://github.com/anyme123/claude-workbench/discussions)
- **项目主页**: [Claude Workbench](https://github.com/anyme123/claude-workbench)

---

## ⭐ Star History

如果这个项目对您有帮助，请考虑给我们一个 ⭐️ Star！

[![Star History Chart](https://api.star-history.com/svg?repos=anyme123/claude-workbench&type=Date)](https://star-history.com/#anyme123/claude-workbench&Date)

---

<div align="center">

**用 ❤️ 构建 | Built with ❤️**

[⬆️ 回到顶部](#claude-workbench-30-)

</div>