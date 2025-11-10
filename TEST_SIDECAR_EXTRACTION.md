# 🧪 测试 Sidecar 自动提取

## 测试目的

验证 acemcp-sidecar 是否正确提取到 `~/.acemcp/` 目录。

---

## 🔍 测试步骤

### 步骤 1: 清空测试环境

```bash
# 删除现有的 sidecar（如果有）
rm "C:\Users\Administrator\.acemcp\acemcp-sidecar.exe"

# 确认目录内容
ls "C:\Users\Administrator\.acemcp"
# 应只看到: data, log, settings.toml
```

### 步骤 2: 运行应用并触发提取

#### 方式 A: 使用项目上下文功能（自动提取）

```bash
# 1. 运行新构建的应用
"C:\Users\Administrator\Desktop\claude-workbench\src-tauri\target\release\claude-workbench.exe"

# 2. 在应用中:
#    - 选择项目
#    - 输入提示词
#    - 点击"优化提示词"
#    - 启用"启用项目上下文"开关
#    - 选择任意优化模型
```

**预期结果**：
- 日志显示: `Extracting embedded sidecar to: "C:\Users\Administrator\.acemcp\acemcp-sidecar.exe"`
- 自动提取 sidecar (35MB)

#### 方式 B: 点击导出按钮（手动导出）

```bash
# 1. 运行应用
# 2. 打开设置 → 提示词优化
# 3. 滚动到"Acemcp 项目上下文搜索配置"
# 4. 在底部橙色卡片点击"导出"按钮
```

**预期结果**：
- 弹窗显示: `Acemcp sidecar 已导出到: C:\Users\Administrator\.acemcp\acemcp-sidecar.exe`

### 步骤 3: 验证文件已提取

```bash
# 检查文件是否存在
ls -lh "C:\Users\Administrator\.acemcp\acemcp-sidecar.exe"

# 应显示: 35MB 文件
```

### 步骤 4: 验证 sidecar 可运行

```bash
# 直接运行测试
"C:\Users\Administrator\.acemcp\acemcp-sidecar.exe" --help

# 应显示 acemcp 帮助信息
```

---

## 🐛 如果没有提取，检查以下

### 检查 1: 是否在 Release 模式

```bash
# 开发模式不会提取（直接使用源码目录）
# 必须使用 Release 构建
npm run tauri:build
```

### 检查 2: 查看日志

**Rust 日志**（应用窗口的控制台）:
```
[INFO] Starting acemcp sidecar...
[INFO] Extracting embedded sidecar to: "C:\Users\Administrator\.acemcp\acemcp-sidecar.exe"
[INFO] Sidecar extracted successfully (36700000 bytes)
```

如果没有看到这些日志，说明：
- 没有触发过项目上下文功能
- 或在开发模式运行

### 检查 3: 检查权限

```bash
# 确保有写权限
mkdir "C:\Users\Administrator\.acemcp"
echo test > "C:\Users\Administrator\.acemcp\test.txt"
rm "C:\Users\Administrator\.acemcp\test.txt"
```

---

## 📊 预期目录结构

```
C:\Users\Administrator\.acemcp\
├── acemcp-sidecar.exe    ← 35MB（自动提取或手动导出）
├── settings.toml         ← 配置文件
├── data\
│   └── projects.json     ← 索引数据
└── log\
    └── acemcp.log        ← 日志
```

---

## ✅ CLI 配置验证

### 配置 Claude Code

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "acemcp": {
      "command": "C:\\Users\\Administrator\\.acemcp\\acemcp-sidecar.exe",
      "args": []
    }
  }
}
```

### 验证

```bash
# 查看 MCP 列表
claude mcp list

# 应看到:
# acemcp: C:\Users\Administrator\.acemcp\acemcp-sidecar.exe - ✓ Connected
```

---

## 🎯 快速测试脚本

```bash
# 完整测试流程
cd "C:\Users\Administrator\Desktop\claude-workbench"

# 1. 清空
rm "C:\Users\Administrator\.acemcp\acemcp-sidecar.exe" 2>/dev/null

# 2. 运行应用
npm run tauri:dev

# 3. 在应用中使用项目上下文功能

# 4. 验证
ls -lh "C:\Users\Administrator\.acemcp\acemcp-sidecar.exe"
```

---

如果还是没有提取，请把日志发给我，我来帮你分析问题！
