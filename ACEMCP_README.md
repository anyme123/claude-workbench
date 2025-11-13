# Acemcp 语义搜索集成 - 使用指南

## ✨ 功能概述

Claude Workbench 已完全集成 acemcp 语义搜索引擎，提供智能的项目代码上下文搜索功能。

### 核心特性

- ✅ **完全内置** - 无需安装 Python 或 acemcp
- ✅ **单文件分发** - 45MB EXE 包含所有功能
- ✅ **可视化配置** - UI 界面配置，无需手动编辑文件
- ✅ **自动后台索引** - 选择项目时自动索引
- ✅ **持久化开关** - 启用一次，永久生效
- ✅ **GUI + CLI 支持** - 同时支持图形界面和命令行

---

## 🚀 快速开始

### 1. 配置 API（首次使用）

**打开设置** → **提示词优化** → **Acemcp 项目上下文搜索配置**

填写：
- **API Base URL**: `https://your-api-endpoint.com`
- **API Token**: `your-api-token`
- （可选）批量大小: 10
- （可选）最大行数: 800

点击 **保存配置**

### 2. 使用项目上下文

1. 选择项目（自动后台索引）
2. 输入提示词
3. 点击 **优化提示词**
4. **启用 "启用项目上下文" 开关**（变蓝）
5. 选择优化模型
6. 查看优化结果

---

## 📁 文件位置

### 运行时目录结构

```
~/.acemcp/
├── acemcp-mcp-server.exe     ← Sidecar（首次运行时自动提取，35MB）
├── config.toml          ← 配置文件（UI 或手动编辑）
├── data/
│   └── projects.json      ← 索引数据
└── log/
    └── acemcp.log         ← 日志文件
```

---

## 🔧 CLI 配置（可选）

### 导出 Sidecar

在 Claude Workbench 中：
1. **设置** → **提示词优化**
2. 滚动到橙色卡片 "在 Claude Code CLI 中使用 Acemcp"
3. 点击 **导出** 按钮（自动导出到 `~/.acemcp/acemcp-mcp-server.exe`）
4. 点击 **复制配置** 按钮

### 配置 Claude Code

编辑 `~/.claude/settings.json`，添加：

```json
{
  "mcpServers": {
    "acemcp": {
      "command": "C:\\Users\\<用户名>\\.acemcp\\acemcp-mcp-server.exe",
      "args": []
    }
  }
}
```

验证：
```bash
claude mcp list
# 应看到: acemcp: ~/.acemcp/acemcp-mcp-server.exe - ✓ Connected
```

---

## 💡 使用场景

### 新会话（无对话历史）

优化模型基于：
- ✅ 原提示词
- ✅ 项目代码上下文（acemcp 搜索）

→ 得到针对项目的优化建议

### 历史会话（有对话历史）

优化模型基于：
- ✅ 原提示词
- ✅ 对话历史
- ✅ 项目代码上下文（acemcp 搜索）

→ 得到更连贯、更精准的优化建议

---

## 🎯 常见问题

### Q: 开关状态会保存吗？
A: ✅ 会！启用一次后永久生效，重启应用也保持。

### Q: 需要安装 Python 吗？
A: ❌ 不需要！acemcp 已完全嵌入应用。

### Q: 首次使用会很慢吗？
A: ❌ 不会！选择项目时已自动后台索引，使用时索引已完成。

### Q: 配置文件在哪？
A: `~/.acemcp/config.toml`，可在 UI 中配置。

### Q: CLI 和 GUI 共享配置吗？
A: ✅ 是的！共享同一个配置文件和索引数据。

---

## 📊 性能指标

| 操作 | 耗时 | 说明 |
|------|------|------|
| 选择项目 | 即时 | 后台自动索引 |
| 首次使用上下文 | 2-5秒 | 索引已完成 |
| 后续使用 | 2-5秒 | 增量索引 |

---

## 📝 相关文档

- **CLI_ACEMCP_SETUP.md** - 命令行配置详细指南
- **FINAL_SUMMARY.md** - 完整功能总结

---

**单文件分发，UI 配置，开箱即用！** 🎉
