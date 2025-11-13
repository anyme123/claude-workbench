# Acemcp 迁移总结 - Python → Node.js

## 🎯 迁移目标

将项目中基于 Python 的 `acemcp-sidecar.exe` 集成，替换为新的、基于 Node.js 的独立可执行文件 `acemcp-mcp-server.cjs`。

---

## ✅ 完成的变更

### 1. **Sidecar 可执行文件替换**

#### 变更前：
- **文件名**: `acemcp-sidecar.exe` (Windows), `acemcp-sidecar` (Linux/macOS)
- **技术栈**: Python (PyInstaller 打包)
- **文件大小**: ~23MB

#### 变更后：
- **文件名**: `acemcp-mcp-server.cjs` (所有平台统一)
- **技术栈**: Node.js
- **文件大小**: 取决于新版本

**修改的文件**:
- `src-tauri/binaries/acemcp-mcp-server.cjs` (新增)
- `src-tauri/src/commands/acemcp.rs:25-31` (嵌入资源引用)

---

### 2. **配置文件更名**

#### 变更前：
- **配置文件**: `~/.acemcp/settings.toml`

#### 变更后：
- **配置文件**: `~/.acemcp/config.toml`

**修改的文件**:
- `src-tauri/src/commands/acemcp.rs` (所有引用)
- `src/components/AcemcpConfigSettings.tsx` (UI 显示)
- `ACEMCP_README.md` (文档)

---

### 3. **进程启动命令调整**

#### 变更前：
```rust
// 直接运行可执行文件
let mut cmd = Command::new(&sidecar_path);
```

#### 变更后：
```rust
// 通过 Node.js 运行 .cjs 文件
// 1. 检查 Node.js 是否可用
let node_check = Command::new("node")
    .arg("--version")
    .output()
    .await;

if node_check.is_err() {
    return Err(anyhow::anyhow!(
        "Node.js not found. Please install Node.js to use acemcp.\n\
        Download from: https://nodejs.org/"
    ));
}

// 2. 使用 node 启动
let mut cmd = Command::new("node");
cmd.arg(&sidecar_path)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
```

**关键变更点**:
- 添加了 Node.js 可用性检查
- 使用 `node` 命令启动 `.cjs` 文件
- 提供友好的错误提示，引导用户安装 Node.js

**修改的文件**:
- `src-tauri/src/commands/acemcp.rs:152-179`

---

### 4. **配置迁移逻辑**

#### 新增功能：
自动检测并迁移旧配置文件 (`settings.toml` → `config.toml`)

```rust
// 迁移逻辑：如果 settings.toml 存在而 config.toml 不存在，自动迁移
if !config_file.exists() && old_config_file.exists() {
    info!("Migrating configuration from settings.toml to config.toml");
    match fs::rename(&old_config_file, &config_file) {
        Ok(_) => info!("✅ Configuration migrated successfully"),
        Err(e) => {
            warn!("Failed to migrate config file: {}. Will try to copy instead.", e);
            // 如果重命名失败（可能是跨设备），尝试复制
            if let Ok(content) = fs::read_to_string(&old_config_file) {
                if let Err(copy_err) = fs::write(&config_file, content) {
                    return Err(format!("Failed to migrate config: {}", copy_err));
                }
                info!("✅ Configuration copied successfully");
            }
        }
    }
}
```

**特性**:
- 首次运行时自动检测旧配置
- 优先尝试重命名（更快）
- 失败时回退到复制方式
- 完全透明，用户无感知

**修改的文件**:
- `src-tauri/src/commands/acemcp.rs:727-743`

---

### 5. **其他相关修改**

#### 5.1 文件名硬编码更新
- **开发模式**: `src-tauri/src/commands/acemcp.rs:92-102`
- **发布模式**: `src-tauri/src/commands/acemcp.rs:103-111`
- **导出功能**: `src-tauri/src/commands/acemcp.rs:893-901`
- **路径获取**: `src-tauri/src/commands/acemcp.rs:931-940`

#### 5.2 前端组件更新
- UI 文字更新: `src/components/AcemcpConfigSettings.tsx`
- CLI 配置生成: `src/components/AcemcpConfigSettings.tsx:130-135`

#### 5.3 文档更新
- 用户指南: `ACEMCP_README.md`

---

## 📁 文件结构变化

### 变更前：
```
~/.acemcp/
├── acemcp-sidecar.exe          ← Python 版本 (23MB)
├── settings.toml               ← 配置文件
├── data/
│   └── projects.json
└── log/
    └── acemcp.log
```

### 变更后：
```
~/.acemcp/
├── acemcp-mcp-server.cjs       ← Node.js 版本
├── config.toml                 ← 配置文件 (自动迁移)
├── data/
│   └── projects.json
└── log/
    └── acemcp.log
```

---

## 🔧 使用者须知

### 系统要求（新增）:
- **Node.js**: 需要安装 Node.js 运行时
  - 下载地址: https://nodejs.org/
  - 推荐版本: v18+ 或 v20+

### 升级路径：
1. **首次运行**:
   - 应用自动提取新的 `acemcp-mcp-server.cjs`
   - 自动检测并迁移 `settings.toml` → `config.toml`

2. **如果未安装 Node.js**:
   - 应用启动 acemcp 时会显示友好错误提示
   - 引导用户下载安装 Node.js

3. **CLI 用户**:
   - 更新 `~/.claude/settings.json`:
     ```json
     {
       "mcpServers": {
         "acemcp": {
           "command": "~/.acemcp/acemcp-mcp-server.cjs",
           "args": []
         }
       }
     }
     ```

---

## ✅ 验证清单

- [x] Rust 代码编译通过 (`cargo check`)
- [x] 所有 `acemcp-sidecar` 引用已更新
- [x] 所有 `settings.toml` 引用已更新为 `config.toml`
- [x] 配置迁移逻辑已实现
- [x] Node.js 检查逻辑已添加
- [x] 文档已更新

---

## 🚀 下一步

### 测试建议：
1. **基础功能测试**:
   - [ ] 启动应用，检查 sidecar 是否正确提取
   - [ ] 测试项目上下文搜索功能
   - [ ] 验证配置加载/保存

2. **迁移测试**:
   - [ ] 创建 `~/.acemcp/settings.toml` 测试文件
   - [ ] 运行应用，验证自动迁移
   - [ ] 确认 `config.toml` 内容正确

3. **错误处理测试**:
   - [ ] 卸载 Node.js，验证错误提示
   - [ ] 测试无配置文件时的默认行为
   - [ ] 测试配置文件权限问题

4. **CLI 集成测试**:
   - [ ] 导出 sidecar
   - [ ] 配置到 Claude  Code CLI
   - [ ] 验证 CLI 中的功能

---

## 📝 技术说明

### Node.js 版本选择理由：
- **跨平台统一**: 单一 `.cjs` 文件支持所有平台
- **更新灵活**: 无需重新编译 Rust
- **开发友好**: JavaScript 更易于调试和维护
- **生态系统**: 可以利用 npm 包生态

### 向后兼容性：
- ✅ 自动配置迁移
- ✅ 保持 API 接口不变
- ✅ 保持 MCP 协议兼容

---

**迁移完成时间**: 2025-11-13
**迁移状态**: ✅ 完成
**编译状态**: ✅ 通过
