# Claude Workbench

> 🚀 专业的 Claude Code 桌面管理工具 - 现代化、高效、功能完备的 GUI 工具包

[![Release](https://img.shields.io/github/v/release/anyme123/claude-workbench?style=flat-square)](https://github.com/anyme123/claude-workbench/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=flat-square)](https://github.com/anyme123/claude-workbench)
[![Made with Tauri](https://img.shields.io/badge/Made%20with-Tauri-FFC131?style=flat-square&logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-Latest-orange?style=flat-square&logo=rust)](https://rust-lang.org/)

---

## 📖 简介

Claude Workbench 是一个为 [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/overview) 量身打造的专业桌面应用，提供完整的项目管理、会话控制、成本追踪和高级功能扩展。通过直观的可视化界面，让您更高效地使用 Claude Code 进行 AI 辅助开发。

### 为什么选择 Claude Workbench？

- ✅ **完整的会话管理** - 多标签页会话、历史记录、实时流式输出
- ✅ **精确的成本追踪** - 多模型定价、Token 统计、使用分析仪表板
- ✅ **强大的扩展系统** - MCP 集成、Hooks 自动化、Claude 扩展管理
- ✅ **智能翻译中间件** - 中英文透明翻译，无缝 API 调用
- ✅ **开发者友好** - Git 集成、代码上下文搜索、Slash 命令
- ✅ **现代化 UI/UX** - 深色/浅色主题、流畅动画、响应式设计

---

## ✨ 核心特性

### 🎯 会话管理

<table>
<tr>
<td width="50%">

**可视化项目管理**
- 直观的项目和会话浏览器
- 实时会话状态监控
- 支持多项目并行管理
- 会话历史完整保留

**多标签页会话**
- 同时管理多个 Claude 会话
- 后台会话继续运行
- 快速切换和恢复
- 会话独立状态管理

</td>
<td width="50%">

**实时流式输出**
- 流畅的 Claude 响应显示
- 支持 Markdown 实时渲染
- 代码高亮和语法支持
- 进度和状态指示器

**高级会话控制**
- Continue（继续对话）
- Resume（恢复会话）
- Cancel（取消执行）
- 消息撤回和回滚

</td>
</tr>
</table>

---

### 💰 智能成本追踪

<table>
<tr>
<td width="50%">

**精确计费**
- 支持多模型定价计算
  - Opus 4.1: $15/$75 (input/output)
  - Sonnet 4.5: $3/$15
  - Sonnet 3.5: $3/$15
- Cache 读写分离计费
- 实时成本更新

**详细统计**
- Token 分类统计
  - 输入/输出 Tokens
  - Cache 创建/读取 Tokens
- 会话时长追踪
- API 执行时间分析

</td>
<td width="50%">

**使用分析仪表板**
- 总成本和 Token 使用概览
- 按模型统计成本分布
- 按项目分析使用情况
- 按日期查看使用趋势
- 导出使用报告

**成本优化建议**
- Cache 命中率分析
- 成本节省计算
- 效率评分系统
- 最佳实践推荐

</td>
</tr>
</table>

---

### 🔧 开发者工具

#### MCP (Model Context Protocol) 集成

- **完整的 MCP 服务器管理**
  - 添加/删除/配置 MCP 服务器
  - 支持 stdio 和 SSE 传输协议
  - 从 Claude Desktop 导入配置
  - 连接状态监控和测试
  - 项目级和用户级配置

- **MCP 服务器市场**
  - 内置常用 MCP 服务器模板
  - 一键安装流行服务器
  - 自定义服务器配置
  - 环境变量管理

#### Claude 扩展管理器 🆕

管理和查看 Claude Code 扩展生态：

- **Plugins 查看器**
  - 已安装插件列表
  - 组件统计和依赖关系
  - 插件配置编辑
  - 一键打开插件文件

- **Subagents 管理**
  - 浏览专用子代理
  - 查看代理配置
  - 编辑代理行为
  - 代理性能统计

- **Agent Skills 查看**
  - AI 技能列表和描述
  - 技能配置参数
  - 技能启用/禁用
  - 自定义技能开发

> 📚 **官方资源**: [Plugins 文档](https://docs.claude.com/en/docs/claude-code/plugins) | [Anthropic Skills 仓库](https://github.com/anthropics/skills) (13.7k ⭐)

#### Hooks 自动化系统

- **智能 Hook 模板**
  - 提交前代码审查
  - 安全漏洞扫描
  - 性能优化检查
  - 自定义审查规则

- **Hook 链执行**
  - 多 Hook 串联执行
  - 条件触发和过滤
  - 错误处理和重试
  - 执行日志和报告

- **预定义场景**
  - 严格质量门禁
  - 安全优先模式
  - 性能监控模式
  - 自动化测试集成

#### 代码上下文搜索 (Acemcp)

- **语义代码搜索**
  - 基于 MCP 的智能搜索
  - 项目预索引加速
  - 上下文增强提示
  - 相关代码自动关联

- **增强型提示词**
  - 自动补充相关上下文
  - 减少不必要的 Token 消耗
  - 提高 Claude 理解准确度
  - 优化响应质量

---

### 🌐 智能翻译中间件

<table>
<tr>
<td width="50%">

**透明翻译工作流**
1. 用户输入中文提示词
2. 自动检测并翻译为英文
3. 发送英文到 Claude API
4. Claude 返回英文响应
5. 自动翻译为中文显示
6. 用户看到中文响应

**特性**
- 基于 Hunyuan-MT-7B 模型
- 翻译缓存加速
- 智能语言检测
- 成本节省（减少中文 Token）

</td>
<td width="50%">

**配置选项**
- 启用/禁用翻译
- 置信度阈值调整
- 缓存策略配置
- 翻译质量监控

**性能**
- 翻译缓存命中率统计
- 缓存大小管理
- 一键清除缓存
- 批量翻译支持

</td>
</tr>
</table>

---

### 🎨 现代化 UI/UX

- **主题系统**
  - 深色/浅色主题切换
  - 顶栏快速切换按钮
  - 自动保存用户偏好
  - 平滑过渡动画

- **国际化支持**
  - 简体中文 / English
  - 一键切换语言
  - 完整的界面翻译
  - 持久化语言设置

- **响应式设计**
  - 适配不同屏幕尺寸
  - 紧凑高效的布局
  - 清晰的视觉层次
  - 无障碍访问支持

- **流畅动画**
  - Framer Motion 驱动
  - 页面转场效果
  - 微交互反馈
  - 性能优化的渲染

---

## 🚀 快速开始

### 系统要求

- **操作系统**: Windows 10/11、macOS 10.15+、Linux (Ubuntu 20.04+)
- **Claude Code**: 需要安装 [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/overview)
- **磁盘空间**: 至少 200MB 可用空间

### 安装方式

#### 📦 预构建版本（推荐）

从 [Releases](https://github.com/anyme123/claude-workbench/releases) 下载对应平台的安装包：

<details>
<summary><b>Windows 安装</b></summary>

**方式一：MSI 安装包**（推荐）
- 下载 `.msi` 文件
- 双击运行安装程序
- 按照向导完成安装

**方式二：NSIS 安装包**
- 下载 `.exe` 文件
- 以管理员身份运行
- 选择安装路径

**方式三：便携版**
- 下载 `.zip` 压缩包
- 解压到任意目录
- 运行 `Claude Workbench.exe`

</details>

<details>
<summary><b>macOS 安装</b></summary>

**支持架构**: Apple Silicon (ARM64) + Intel (x86_64)

**方式一：DMG 安装包**（推荐）
1. 下载 `.dmg` 文件
2. 双击挂载磁盘映像
3. 拖拽应用到 Applications 文件夹

**方式二：APP 应用包**
1. 下载 `.app.tar.gz` 文件
2. 解压并移动到 Applications

**⚠️ 重要：解决 Gatekeeper 阻止**

如果安装后提示"应用已损坏，无法打开"，请在终端执行：

```bash
# 方法 1：移除隔离属性（推荐，最简单）
sudo xattr -r -d com.apple.quarantine /Applications/Claude\ Workbench.app

# 方法 2：清除所有扩展属性
xattr -cr /Applications/Claude\ Workbench.app

# 方法 3：重新签名应用
sudo codesign --force --deep --sign - /Applications/Claude\ Workbench.app
```

**原因**: macOS Gatekeeper 默认会阻止未经 Apple 公证的应用。执行上述命令后即可正常使用。

</details>

<details>
<summary><b>Linux 安装</b></summary>

**方式一：AppImage**（推荐）
```bash
# 下载 AppImage 文件
chmod +x Claude-Workbench-*.AppImage

# 运行应用
./Claude-Workbench-*.AppImage
```

**方式二：DEB 包** (Debian/Ubuntu)
```bash
sudo dpkg -i claude-workbench-*.deb
sudo apt-get install -f  # 修复依赖
```

**方式三：RPM 包** (Fedora/RHEL)
```bash
sudo rpm -i claude-workbench-*.rpm
```

</details>

---

#### 🛠️ 源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/anyme123/claude-workbench.git
cd claude-workbench

# 2. 安装依赖
npm install

# 3. 开发模式（热重载）
npm run tauri dev

# 4. 构建生产版本
npm run tauri build

# 5. 快速构建（开发版，速度更快）
npm run tauri:build-fast
```

**构建要求**:
- Node.js 18.0+ (推荐 LTS)
- Rust 1.70+
- 平台特定工具链（WebView2 Runtime for Windows）

---

## 📖 使用指南

### 首次使用

1. **配置 Claude Code CLI**
   - 安装 Claude Code CLI
   - 设置 API Key: `claude config set api_key YOUR_KEY`
   - 验证安装: `claude --version`

2. **启动 Claude Workbench**
   - 首次启动会自动检测 Claude CLI
   - 如果未找到，会提示设置自定义路径

3. **创建第一个会话**
   - 点击"新建会话"按钮
   - 选择项目目录
   - 开始与 Claude 对话

### 核心功能使用

#### 会话管理

- **新建会话**: 顶部工具栏点击 `+` 按钮
- **切换会话**: 点击标签页或使用 `Ctrl+Tab` (macOS: `⌘+Tab`)
- **恢复会话**: 从会话历史列表双击会话
- **关闭会话**: 标签页关闭按钮或 `Ctrl+W` (macOS: `⌘+W`)

#### 提示词撤回

1. 找到要撤回的用户消息
2. 点击消息右侧的圆形撤回按钮
3. 确认撤回操作
4. 该消息及之后的所有对话将被删除
5. 代码自动回滚到发送前状态
6. 提示词恢复到输入框可修改

#### Plan Mode（只读分析模式）

- **切换**: 按 `Shift+Tab` 或输入框右侧切换按钮
- **用途**: 代码探索、方案设计、风险评估
- **特点**: 不修改文件、不执行命令、只返回分析结果

#### 成本追踪

- **基础显示**: 输入框底部实时显示会话总成本
- **详细统计**: 鼠标悬停查看完整成本分析
  - Token 分类统计
  - 会话时长
  - API 执行时间
  - Cache 效率

- **使用仪表板**: 侧边栏"使用统计"查看全局分析
  - 总成本和 Token 使用
  - 按模型/项目/日期分析
  - 趋势图表和导出

---

## 🔧 高级配置

### MCP 服务器配置

```json
// ~/.claude/mcp_servers.json
{
  "acemcp": {
    "transport": "stdio",
    "command": "acemcp",
    "args": [],
    "env": {
      "ACEMCP_PROJECT_ROOT": "/path/to/project"
    }
  },
  "filesystem": {
    "transport": "stdio",
    "command": "mcp-server-filesystem",
    "args": ["/allowed/path"]
  }
}
```

### Hooks 配置示例

```json
// ~/.claude/settings.json
{
  "hooks": {
    "user-prompt-submit": {
      "command": "echo 'Submitting prompt...'",
      "enabled": true
    },
    "tool-result": {
      "command": "custom-tool-handler.sh",
      "enabled": true,
      "filter": {
        "tool_name": ["bash", "edit"]
      }
    }
  }
}
```

### 翻译中间件配置

```typescript
// 在设置中配置
{
  "translation": {
    "enabled": true,
    "confidence_threshold": 0.7,
    "cache_enabled": true,
    "cache_ttl_hours": 24
  }
}
```

---

## 🏗️ 技术架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Workbench                         │
├─────────────────────┬─────────────────┬─────────────────────┤
│                     │                 │                     │
│   React 前端层      │   Tauri 桥接层   │   Rust 后端层       │
│                     │                 │                     │
│ • React 18 + TS     │ • IPC 通信      │ • Claude CLI 封装   │
│ • Tailwind CSS 4    │ • 安全调用      │ • 进程管理          │
│ • Framer Motion     │ • 类型安全      │ • 会话控制          │
│ • i18next           │ • 事件系统      │ • 文件操作          │
│ • Radix UI          │ • 资源管理      │ • Git 集成          │
│                     │                 │ • SQLite 存储       │
│                     │                 │ • MCP 管理          │
└─────────────────────┴─────────────────┴─────────────────────┘
         ▲                     ▲                     ▲
         │                     │                     │
         └─────────────────────┴─────────────────────┘
                            IPC 事件流

         ┌──────────────────────────────────┐
         │      Claude Code CLI (Node)      │
         │  • Agent SDK                     │
         │  • MCP Servers                   │
         │  • Tools & Extensions            │
         └──────────────────────────────────┘
```

### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **React** | 18.3.1 | UI 框架 |
| **TypeScript** | 5.9.3 | 类型安全 |
| **Tailwind CSS** | 4.1.8 | 样式框架 |
| **Framer Motion** | 12.23.24 | 动画系统 |
| **i18next** | 25.6.0 | 国际化 |
| **Radix UI** | Latest | 组件库 |
| **React Markdown** | 9.0.3 | Markdown 渲染 |
| **React Syntax Highlighter** | 15.6.1 | 代码高亮 |

### 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **Tauri** | 2.9 | 桌面应用框架 |
| **Rust** | 2021 Edition | 系统编程语言 |
| **SQLite** | 0.32 (rusqlite) | 嵌入式数据库 |
| **Tokio** | 1.x | 异步运行时 |
| **Serde** | 1.x | 序列化/反序列化 |
| **Reqwest** | 0.12 | HTTP 客户端 |

### 数据流架构

```
用户操作 → React 组件 → Tauri Command
                           ↓
                    Rust 后端处理
                           ↓
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   文件系统操作      Claude CLI 调用    数据库操作
         │                 │                 │
         └─────────────────┴─────────────────┘
                           ↓
                   IPC 事件返回
                           ↓
                    React 状态更新
                           ↓
                      UI 重新渲染
```

### 数据库架构

```sql
-- 使用统计表
CREATE TABLE usage_entries (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_creation_tokens INTEGER,
    cache_read_tokens INTEGER,
    total_tokens INTEGER,
    cost REAL,
    project_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 性能索引
CREATE INDEX idx_usage_session_id ON usage_entries(session_id);
CREATE INDEX idx_usage_timestamp ON usage_entries(timestamp DESC);
CREATE INDEX idx_usage_project_path ON usage_entries(project_path);
CREATE INDEX idx_usage_model_timestamp ON usage_entries(model, timestamp DESC);
```

---

## 🆕 最新更新

### v4.3.8 (2025-01-20)

#### 🐛 Bug 修复
- 修复 AppLayout 中 ThemeToggle 组件的 props 类型错误
- 修复构建失败问题，确保 CI/CD 正常运行

### v4.3.7 (2025-01-20)

#### 🎉 版本发布
- 版本号统一更新到 4.3.7
- 所有平台配置文件同步更新

### v4.0.1 更新亮点

#### 🆕 新功能
- ✅ Claude 扩展管理器（Plugins/Subagents/Skills）
- ✅ 多模型精确成本计算
- ✅ 成本详情悬停显示
- ✅ Git 代码变更统计 API
- ✅ 点击打开 .md 文件编辑
- ✅ Acemcp 代码上下文搜索集成

#### 🎨 UI 改进
- ✅ 默认浅色主题，更护眼
- ✅ 顶栏紧凑设计优化
- ✅ 按钮阴影和边框美化
- ✅ 文件预览性能优化
- ✅ 响应式布局改进

#### ⚡ 性能优化
- ✅ 会话历史加载速度提升 50%
- ✅ 翻译检查优化，减少不必要的 API 调用
- ✅ SQLite WAL 模式启用，数据库性能提升
- ✅ 索引优化，查询速度提升 3-5 倍
- ✅ Plan Mode 对齐官方规范

---

## 🤝 贡献指南

我们欢迎各种形式的贡献！无论是 Bug 报告、功能建议还是代码提交。

### 开发环境设置

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/YOUR_USERNAME/claude-workbench.git
cd claude-workbench

# 2. 安装依赖
npm install

# 3. 创建功能分支
git checkout -b feature/your-feature-name

# 4. 启动开发服务器
npm run tauri dev

# 5. 进行更改并测试

# 6. 提交更改
git add .
git commit -m "feat: add your feature description"

# 7. 推送到 Fork
git push origin feature/your-feature-name

# 8. 创建 Pull Request
```

### 代码规范

**TypeScript/React**
- 使用 TypeScript 严格模式
- 遵循 React Hooks 最佳实践
- 组件使用函数式组件 + Hooks
- Props 使用明确的类型定义
- 使用 ESLint 和 Prettier 格式化

**Rust**
- 遵循 Rust 2021 Edition 标准
- 使用 `cargo fmt` 格式化代码
- 使用 `cargo clippy` 检查代码质量
- 错误处理使用 `Result` 和 `anyhow`
- 异步代码使用 `tokio`

**提交信息规范**
```
<type>(<scope>): <subject>

<body>

<footer>
```

类型:
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行）
- `refactor`: 重构（既不是新功能，也不是 Bug 修复）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

### 问题报告

提交 Issue 时请包含：
- 详细的问题描述
- 复现步骤
- 预期行为 vs 实际行为
- 系统环境信息
- 相关截图或日志

---

## 🐛 故障排除

### 常见问题

<details>
<summary><b>Q: 应用无法启动或闪退</b></summary>

**A**: 检查以下几点：
1. 确认 Claude Code CLI 已正确安装
2. 检查系统是否安装了必要的运行时（Windows: WebView2 Runtime）
3. 查看应用日志文件（位置见下方）
4. 尝试以管理员/root 权限运行

日志位置：
- Windows: `%APPDATA%\claude-workbench\logs`
- macOS: `~/Library/Application Support/claude-workbench/logs`
- Linux: `~/.config/claude-workbench/logs`

</details>

<details>
<summary><b>Q: Claude Code CLI 未找到</b></summary>

**A**:
1. 确认 Claude Code CLI 已安装: `claude --version`
2. 在设置中手动指定 Claude CLI 路径
3. 确保 PATH 环境变量包含 Claude CLI 安装目录

</details>

<details>
<summary><b>Q: 会话无法加载或历史记录丢失</b></summary>

**A**:
1. 检查 `~/.claude/projects/` 目录权限
2. 确认 JSONL 文件没有损坏
3. 尝试重启应用
4. 查看应用日志获取详细错误信息

</details>

<details>
<summary><b>Q: MCP 服务器连接失败</b></summary>

**A**:
1. 确认 MCP 服务器正确安装
2. 检查配置文件路径和命令是否正确
3. 测试手动运行 MCP 服务器命令
4. 查看服务器日志获取错误信息

</details>

<details>
<summary><b>Q: 翻译功能不工作</b></summary>

**A**:
1. 在设置中确认翻译中间件已启用
2. 检查网络连接
3. 尝试清除翻译缓存
4. 重新初始化翻译服务

</details>

---

## 📄 许可证

本项目基于 **AGPL-3.0** 开源协议发布。

这意味着：
- ✅ 可以自由使用、修改和分发
- ✅ 必须开源修改后的代码
- ✅ 网络服务也需要开源
- ✅ 必须保留版权和许可声明

详见 [LICENSE](LICENSE) 文件。

---

## 🔗 相关资源

### 官方文档
- [Claude Code 官方文档](https://docs.claude.com/en/docs/claude-code/overview)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [Anthropic Skills 仓库](https://github.com/anthropics/skills) ⭐ 13.7k

### 技术文档
- [Tauri 框架](https://tauri.app/) - 桌面应用框架
- [React 文档](https://react.dev/) - 前端框架
- [Rust 官网](https://rust-lang.org/) - 系统编程语言

### 社区资源
- [MCP 协议规范](https://modelcontextprotocol.io/) - Model Context Protocol
- [Claude Code GitHub Discussions](https://github.com/anthropics/claude-code/discussions)

---

## 💬 社区与支持

### 获取帮助

- **GitHub Issues**: [报告问题](https://github.com/anyme123/claude-workbench/issues)
- **GitHub Discussions**: [讨论和提问](https://github.com/anyme123/claude-workbench/discussions)

### 参与讨论

我们欢迎任何形式的反馈和建议！

- 💡 功能建议
- 🐛 Bug 报告
- 📝 文档改进
- 🌍 翻译贡献

---

## 🙏 致谢

感谢以下项目和社区：

- [Anthropic](https://anthropic.com/) - 提供强大的 Claude AI
- [Tauri](https://tauri.app/) - 优秀的桌面应用框架
- [React](https://react.dev/) - 灵活的前端框架
- [Rust 社区](https://rust-lang.org/) - 高性能系统编程
- 所有贡献者和用户的支持 ❤️

---

## ⭐ Star History

如果这个项目对您有帮助，请给我们一个 **Star** ⭐！

[![Star History Chart](https://api.star-history.com/svg?repos=anyme123/claude-workbench&type=Date)](https://star-history.com/#anyme123/claude-workbench&Date)

---

<div align="center">

**Claude Workbench** - 让 Claude Code 更好用

Made with ❤️ by the Claude Workbench Team

🔗 **项目地址**: https://github.com/anyme123/claude-workbench

</div>
