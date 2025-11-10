# 🔧 在 Claude Code CLI 中使用 Acemcp

## 🎯 方案：从 Claude Workbench 导出 Sidecar

### 步骤 1: 在 Claude Workbench 中导出

1. **打开 Claude Workbench**
2. **进入设置** → 提示词优化
3. **找到 "Acemcp 项目上下文搜索配置"**
4. **在底部看到橙色卡片**：
   ```
   🔧 在 Claude Code CLI 中使用 Acemcp
   将内置的 acemcp sidecar 导出，即可在命令行中使用相同的功能
   [导出] [复制配置]
   ```

5. **点击 "导出" 按钮**
   - 自动导出到: `C:\Users\Administrator\.local\bin\acemcp-sidecar.exe`
   - 弹窗显示导出路径

6. **点击 "复制配置" 按钮**
   - 自动复制 MCP 配置到剪贴板

### 步骤 2: 配置 Claude Code CLI

#### 方式 A：使用 Claude Workbench 的 MCP 管理界面

1. **在 Claude Workbench 中**
2. **点击顶部 "MCP" 按钮**
3. **切换到 "Add Server" 标签**
4. **填写**：
   ```
   Server Name: acemcp
   Transport: stdio
   Command: C:\Users\Administrator\.local\bin\acemcp-sidecar.exe
   Arguments: (留空)
   Scope: local
   ```
5. **点击 "Add Server"**

#### 方式 B：手动编辑配置文件

1. **打开配置文件**:
   ```bash
   notepad %USERPROFILE%\.claude\settings.json
   ```

2. **粘贴刚才复制的配置**（或手动添加）:
   ```json
   {
     "mcpServers": {
       "acemcp": {
         "command": "C:\\Users\\Administrator\\.local\\bin\\acemcp-sidecar.exe",
         "args": []
       }
     }
   }
   ```

3. **保存文件**

### 步骤 3: 验证配置

```bash
# 查看 MCP 服务器列表
claude mcp list

# 应该看到:
# acemcp: C:\Users\Administrator\.local\bin\acemcp-sidecar.exe - ✓ Connected
```

---

## ✅ 完成！

现在你可以在 Claude Code CLI 中使用 acemcp 了：

```bash
# 进入项目目录
cd C:\your-project

# 使用 Claude Code
# acemcp 会自动工作，搜索相关代码
claude "优化数据库查询功能"
```

---

## 🎯 共享配置

CLI 和 GUI 共享同一个配置：

| 配置项 | 位置 | 共享 |
|--------|------|------|
| API 配置 | `~/.acemcp/settings.toml` | ✅ 共享 |
| 索引数据 | `~/.acemcp/data/projects.json` | ✅ 共享 |
| 日志 | `~/.acemcp/log/acemcp.log` | ✅ 共享 |
| Sidecar | `~/.local/bin/acemcp-sidecar.exe` | ✅ 共享 |

**一次配置，两处使用！** 🎉

---

## 🔍 UI 展示

在 Claude Workbench 设置页面中：

```
┌────────────────────────────────────────────┐
│ 🗄️ Acemcp 项目上下文搜索配置               │
│ ┌────────────────────────────────────────┐ │
│ │ API Base URL: [https://...]           │ │
│ │ API Token: [••••••••]         [👁️]   │ │
│ │ ... 其他配置 ...                       │ │
│ └────────────────────────────────────────┘ │
│                                            │
│ ⚠️ 在 Claude Code CLI 中使用 Acemcp      │
│ 将内置的 acemcp sidecar 导出，即可在命令行 │
│ 中使用相同的功能                           │
│ [📥 导出]  [📋 复制配置]                   │
└────────────────────────────────────────────┘
```

点击后：
- **导出**: 提取到 `~/.local/bin/acemcp-sidecar.exe`
- **复制配置**: 自动生成 MCP 配置并复制到剪贴板

---

## 📝 手动导出（备选方案）

如果 UI 按钮不可用，可以手动操作：

### Windows:
```cmd
# 1. 运行 Claude Workbench 一次（触发 sidecar 提取）
# 2. 复制临时文件
copy "%TEMP%\.claude-workbench\acemcp-sidecar.exe" "%USERPROFILE%\.local\bin\acemcp-sidecar.exe"

# 3. 配置 Claude Code
claude mcp add acemcp -s local
# 然后手动编辑 ~/.claude/settings.json 指向上面的路径
```

### macOS/Linux:
```bash
# 1. 运行 Claude Workbench 一次
# 2. 复制临时文件
mkdir -p ~/.local/bin
cp /tmp/.claude-workbench/acemcp-sidecar ~/.local/bin/
chmod +x ~/.local/bin/acemcp-sidecar

# 3. 配置 Claude Code
claude mcp add acemcp -s local
# 编辑 ~/.claude/settings.json
```

---

## 🎊 总结

### GUI 方式（最简单）✅

1. Claude Workbench → 设置 → 提示词优化
2. 点击 "导出" + "复制配置"
3. 粘贴到 ~/.claude/settings.json
4. 完成！

### 手动方式

1. 找到临时目录的 sidecar
2. 复制到固定位置
3. 手动编辑配置

**推荐使用 GUI 方式，一键完成！** 🚀
