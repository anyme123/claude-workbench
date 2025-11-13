# Acemcp 重构测试指南

## 🎯 测试目标

验证 acemcp 从 Python 版本迁移到 Node.js 版本后的功能完整性。

---

## ✅ 前提条件

### 必需：
1. **Node.js 已安装**
   ```bash
   node --version
   # 应该显示 v18+ 或 v20+
   ```
   如果未安装：https://nodejs.org/

2. **acemcp API 配置**
   - 需要有效的 API Base URL
   - 需要有效的 API Token

---

## 📋 测试清单

### 1. 基础功能测试 ⭐

#### 1.1 首次启动
```bash
# 步骤：
1. 删除旧的 sidecar 和配置（如果存在）
   - Windows: rmdir /s /q "%USERPROFILE%\.acemcp"
   - Linux/Mac: rm -rf ~/.acemcp

2. 启动应用

3. 验证：
   ✅ ~/.acemcp/acemcp-mcp-server.cjs 已创建
   ✅ 文件大小正确（检查是否为 Node.js 版本）
```

#### 1.2 配置保存/加载
```bash
# 步骤：
1. 打开应用 → 设置 → 提示词优化
2. 找到 "Acemcp 项目上下文搜索配置"
3. 填写：
   - API Base URL: https://your-api-endpoint.com
   - API Token: your-token-here
   - Batch Size: 10
   - Max Lines: 800
4. 点击"保存配置"
5. 重启应用
6. 再次打开设置页面

验证：
✅ 配置已保存到 ~/.acemcp/config.toml
✅ 重启后配置保持不变
✅ 所有字段正确加载
```

#### 1.3 测试连接
```bash
# 步骤：
1. 在配置页面点击"测试连接"按钮

验证：
✅ 显示 "正在测试..." 状态
✅ 如果 Node.js 未安装，显示友好错误提示
✅ 如果配置正确，显示 "Acemcp 可用！"
✅ 如果配置错误，显示 "Acemcp 不可用，请检查配置"
```

---

### 2. 配置迁移测试 ⭐⭐

#### 2.1 自动迁移
```bash
# 步骤：
1. 关闭应用
2. 手动创建旧配置文件：

   Windows PowerShell:
   mkdir "$env:USERPROFILE\.acemcp" -Force
   echo 'BASE_URL = "https://test-api.com"' > "$env:USERPROFILE\.acemcp\settings.toml"
   echo 'TOKEN = "test-token-123"' >> "$env:USERPROFILE\.acemcp\settings.toml"

   Linux/Mac:
   mkdir -p ~/.acemcp
   cat > ~/.acemcp/settings.toml << EOF
   BASE_URL = "https://test-api.com"
   TOKEN = "test-token-123"
   EOF

3. 启动应用
4. 打开设置 → 提示词优化

验证：
✅ ~/.acemcp/config.toml 已创建
✅ 配置内容正确迁移
✅ settings.toml 已被重命名/删除
✅ UI 中显示迁移后的配置
```

---

### 3. 项目上下文搜索测试 ⭐⭐⭐

#### 3.1 基础搜索
```bash
# 步骤：
1. 打开一个项目
2. 输入提示词，例如："优化登录功能"
3. 点击"优化提示词"
4. 启用"启用项目上下文"开关
5. 选择优化模型（如 Claude Sonnet）
6. 查看优化结果

验证：
✅ Sidecar 进程成功启动（通过 node）
✅ 搜索请求成功发送
✅ 返回相关的代码上下文
✅ 优化后的提示词包含项目上下文
✅ 显示 "找到 X 个上下文条目"
```

#### 3.2 错误处理
```bash
# 测试场景 A: Node.js 未安装
1. 卸载或重命名 node 可执行文件
2. 尝试使用项目上下文

验证：
✅ 显示友好错误："Node.js not found. Please install Node.js..."
✅ 提供下载链接

# 测试场景 B: 配置错误
1. 配置无效的 API URL
2. 尝试使用项目上下文

验证：
✅ 显示错误信息
✅ 不会导致应用崩溃
✅ 返回原始提示词（未增强）
```

---

### 4. CLI 集成测试 ⭐⭐

#### 4.1 导出 Sidecar
```bash
# 步骤：
1. 打开应用 → 设置 → 提示词优化
2. 滚动到 "在 Claude  Code CLI 中使用 Acemcp" 部分
3. 点击"导出"按钮

验证：
✅ 显示成功消息，路径为 ~/.acemcp/acemcp-mcp-server.cjs
✅ 文件确实存在于该位置
✅ 文件大小正确
```

#### 4.2 复制 CLI 配置
```bash
# 步骤：
1. 点击"复制配置"按钮
2. 粘贴到文本编辑器

验证：
✅ JSON 格式正确
✅ command 路径正确：~/.acemcp/acemcp-mcp-server.cjs
✅ args 为空数组 []
```

#### 4.3 CLI 功能验证（如果安装了 Claude  Code CLI）
```bash
# 步骤：
1. 编辑 ~/.claude/settings.json
2. 添加 acemcp 服务器配置
3. 运行：
   claude mcp list

验证：
✅ 列表中显示 "acemcp" 服务器
✅ 状态为 "Connected" 或类似
✅ 路径正确

4. 测试搜索：
   claude mcp test acemcp

验证：
✅ MCP 服务器响应正常
✅ search_context 工具可用
```

---

### 5. 性能和稳定性测试 ⭐

#### 5.1 并发测试
```bash
# 步骤：
1. 快速连续多次点击"优化提示词"
2. 同时在多个项目中使用上下文搜索

验证：
✅ 没有进程泄漏
✅ 没有内存持续增长
✅ 所有请求都得到正确处理
```

#### 5.2 长时间运行
```bash
# 步骤：
1. 保持应用运行 30 分钟
2. 定期触发上下文搜索

验证：
✅ 功能持续正常
✅ 没有性能下降
✅ 没有异常日志
```

---

## 🔍 日志检查

### 应用日志位置：
- **Rust 日志**: 查看控制台输出（开发模式）
- **Acemcp 日志**: `~/.acemcp/log/acemcp.log`

### 关键日志消息：
```
✅ 正常启动：
   "Starting acemcp sidecar..."
   "Sidecar path: ~/.acemcp/acemcp-mcp-server.cjs"
   "Acemcp sidecar started successfully"

✅ 配置迁移：
   "Migrating configuration from settings.toml to config.toml"
   "✅ Configuration migrated successfully"

❌ Node.js 未找到：
   "Node.js not found. Please install Node.js..."

✅ MCP 会话：
   "Initializing MCP session..."
   "MCP session initialized successfully"
```

---

## 🐛 常见问题排查

### 问题 1: "Node.js not found"
**解决方案**:
```bash
# 1. 安装 Node.js
下载: https://nodejs.org/

# 2. 验证安装
node --version

# 3. 重启应用
```

### 问题 2: Sidecar 进程无法启动
**检查**:
```bash
# 1. 文件是否存在
ls ~/.acemcp/acemcp-mcp-server.cjs

# 2. 手动测试
node ~/.acemcp/acemcp-mcp-server.cjs

# 3. 检查权限（Linux/Mac）
chmod +x ~/.acemcp/acemcp-mcp-server.cjs
```

### 问题 3: 配置迁移失败
**检查**:
```bash
# 1. 检查旧配置
cat ~/.acemcp/settings.toml

# 2. 手动迁移
mv ~/.acemcp/settings.toml ~/.acemcp/config.toml

# 3. 验证内容
cat ~/.acemcp/config.toml
```

### 问题 4: 搜索返回空结果
**检查**:
```bash
# 1. API 配置是否正确
cat ~/.acemcp/config.toml

# 2. 网络连接
ping <your-api-domain>

# 3. 查看日志
tail -f ~/.acemcp/log/acemcp.log
```

---

## 📊 测试报告模板

```markdown
## Acemcp 重构测试报告

**测试日期**: YYYY-MM-DD
**测试环境**:
- OS: Windows/Linux/macOS
- Node.js 版本:
- 应用版本:

### 测试结果

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 1.1 首次启动 | ✅/❌ | |
| 1.2 配置保存/加载 | ✅/❌ | |
| 1.3 测试连接 | ✅/❌ | |
| 2.1 自动迁移 | ✅/❌ | |
| 3.1 基础搜索 | ✅/❌ | |
| 3.2 错误处理 | ✅/❌ | |
| 4.1 导出 Sidecar | ✅/❌ | |
| 4.2 复制 CLI 配置 | ✅/❌ | |
| 5.1 并发测试 | ✅/❌ | |
| 5.2 长时间运行 | ✅/❌ | |

### 发现的问题
1.
2.
3.

### 改进建议
1.
2.
3.
```

---

**测试愉快！** 🚀
