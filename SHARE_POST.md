# Claude Workbench - 双引擎 AI 编程助手桌面工具

> 一款为 Claude Code 和 OpenAI Codex 打造的专业 GUI 工具，让 AI 辅助开发更高效

**GitHub**: https://github.com/anyme123/claude-workbench

---

## 核心亮点

### 1. Claude + Codex 双引擎，一键切换

终于不用在两个终端之间来回切换了！Claude Workbench 同时支持 **Claude Code CLI** 和 **OpenAI Codex**，统一界面管理。

**Windows 用户福音：WSL Codex 无缝支持**

很多人在 Windows 上用 Codex 都遇到过问题，我们做了智能检测：

```
Auto 模式 → 优先原生 Codex → 不可用时自动切到 WSL
```

- Windows 路径自动转换为 `/mnt/c/...` 格式
- 可指定特定的 WSL 发行版
- 环境变量自动传递

不用手动配置，开箱即用。

---

### 2. 统一会话管理

Claude 和 Codex 的会话在同一个列表里，不再割裂：

- **多标签页** - 同时开多个会话，后台继续运行
- **历史记录** - 随时恢复之前的会话
- **智能上下文压缩** - Token 快用完时自动压缩，保留关键信息

Codex 的 JSON 事件流会自动转换成和 Claude 一样的消息格式，体验一致。

---

### 3. Acemcp 提示词优化

发送提示词前，自动从代码库搜索相关上下文注入，让 AI 更懂你的项目：

**智能关键词提取**
- 驼峰命名：`getUserInfo` → `get`, `User`, `Info`
- 下划线命名：`user_config` → `user`, `config`
- 中文技术词汇：`用户认证` → 自动识别

**历史感知**
- 从之前的对话里提取文件路径、函数名
- 多轮搜索，逐步扩大范围
- 过长自动截断，不浪费 Token

效果：减少 "你说的那个文件在哪" 这类来回，AI 直接就知道上下文。

---

### 4. 基于 Git 的撤回功能（两个引擎都能用）

这是我最喜欢的功能 —— AI 改崩了？一键回滚！

**三种撤回模式**

| 模式 | 效果 |
|-----|------|
| 只删消息 | 删除对话，代码保留 |
| 只回滚代码 | 代码恢复，对话保留 |
| 全部撤回 | 代码+对话都恢复到执行前 |

**原理**
- 每次发送提示词前，自动记录当前 Git commit
- AI 执行完后，自动提交一个 `[Claude Code] After prompt #N`
- 撤回时，`git reset --hard` 到对应的 commit

**安全保护**
- 回滚前自动 `git stash` 你未提交的修改
- 不会丢失任何你自己写的代码

快捷键：按两次 ESC 弹出撤回选择器。

---

## 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS
- **后端**: Rust + Tauri 2.9
- **存储**: SQLite (WAL 模式)

跨平台：Windows / macOS / Linux 都支持。

---

## 安装

从 [Releases](https://github.com/anyme123/claude-workbench/releases) 下载对应平台安装包，或者源码构建：

```bash
git clone https://github.com/anyme123/claude-workbench.git
cd claude-workbench
npm install
npm run tauri dev
```

---

欢迎试用和反馈！
