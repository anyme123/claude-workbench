# Acemcp 目录管理逻辑说明

## 📁 目录结构

所有 acemcp 相关的文件都存储在用户主目录：

```
~/.acemcp/                    ← 用户主目录（由 acemcp 核心进程管理）
├── acemcp-mcp-server.cjs     ← Sidecar（由应用提取）
├── config.toml               ← 配置文件（由 acemcp 自动创建）
├── data/
│   └── projects.json         ← 索引数据（由 acemcp 自动创建）
└── log/
    └── acemcp.log            ← 日志文件（由 acemcp 自动创建）
```

**重要**：
- ✅ 所有操作都在 `~/.acemcp`（用户主目录）
- ❌ 不会在项目目录（`./acemcp`）下创建任何文件

---

## 🔧 目录创建逻辑

### 1. Sidecar 提取时（保留创建逻辑）

**位置**: `AcemcpClient::get_or_extract_sidecar()` - 第 322 行

```rust
// 创建 .acemcp 目录
std::fs::create_dir_all(&acemcp_dir)
    .map_err(|e| anyhow::anyhow!("Failed to create .acemcp directory: {}", e))?;
```

**原因**：
- ✅ 必须保留，因为提取 sidecar 文件需要目录存在
- ✅ 这是在 acemcp 进程运行之前，必须由应用创建

---

### 2. 保存配置时（已移除创建逻辑）✅

**位置**: `save_acemcp_config()` - 第 1007 行

**修改前**：
```rust
fs::create_dir_all(&config_dir)
    .map_err(|e| format!("Failed to create config dir: {}", e))?;
```

**修改后**：
```rust
// 注意：不再主动创建 .acemcp 目录
// acemcp 核心进程首次运行时会自动创建此目录和配置文件
// 如果目录不存在，说明 acemcp 尚未运行，提示用户先测试连接
if !config_dir.exists() {
    return Err(format!(
        "配置目录不存在：{:?}\n\n\
        这是因为 acemcp 尚未运行。请先点击「测试连接」按钮，\n\
        这会触发 acemcp 启动并自动创建配置目录。",
        config_dir
    ));
}
```

**原因**：
- ✅ acemcp 核心进程会自动创建和管理 `~/.acemcp` 目录
- ✅ 避免配置位置混乱
- ✅ 强制用户按照正确流程操作

---

### 3. 导出 Sidecar 时（保留创建逻辑）

**位置**: `export_acemcp_sidecar()` - 第 1265 行

```rust
// 创建父目录
if let Some(parent) = final_path.parent() {
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
}
```

**原因**：
- ✅ 必须保留，因为用户可以导出到任意路径
- ✅ 这是用户主动请求的操作

---

## 🎯 设计原则

### 职责划分

| 组件 | 职责 | 管理范围 |
|------|------|---------|
| **Claude Workbench** | 提取 sidecar 到 `~/.acemcp` | `acemcp-mcp-server.cjs` |
| **Acemcp 核心进程** | 管理配置和数据目录 | `config.toml`, `data/`, `log/` |

### 目录创建策略

```
启动流程：
1. 用户打开应用 ← 不创建任何目录
2. 用户配置 API ← 不创建任何目录
3. 用户点击"测试连接"
   ↓
   触发 AcemcpClient::start()
   ↓
   get_or_extract_sidecar()
   ↓
   【应用】创建 ~/.acemcp 目录 ✅
   【应用】提取 acemcp-mcp-server.cjs ✅
   ↓
   启动 acemcp 进程（node acemcp-mcp-server.cjs）
   ↓
   【Acemcp】自动创建 config.toml ✅
   【Acemcp】自动创建 data/ 目录 ✅
   【Acemcp】自动创建 log/ 目录 ✅
4. 用户点击"保存配置"
   ↓
   【应用】检查目录是否存在
   ↓
   如果不存在 → 提示先测试连接
   如果存在 → 写入配置文件
```

---

## 📊 修改总结

### 已移除
- ❌ `save_acemcp_config()` 中的 `fs::create_dir_all(&config_dir)`

### 已保留
- ✅ `get_or_extract_sidecar()` 中的 `fs::create_dir_all(&acemcp_dir)`
- ✅ `export_acemcp_sidecar()` 中的 `fs::create_dir_all(parent)`

### 已添加
- ✅ `save_acemcp_config()` 中的目录存在性检查
- ✅ 友好的错误提示

---

## 🎯 用户使用流程

### ✅ 推荐流程（正确）

```
1. 打开应用 → 设置 → 提示词优化
2. 填写 API Base URL 和 Token
3. 点击 "测试连接" ← 这会创建 ~/.acemcp 目录
4. 看到 "Acemcp 可用！"
5. 点击 "保存配置" ← 此时目录已存在
6. 配置保存成功 ✅
```

### ❌ 错误流程（会提示）

```
1. 打开应用 → 设置 → 提示词优化
2. 填写 API Base URL 和 Token
3. 直接点击 "保存配置" ← 目录不存在
4. 看到错误提示：
   "配置目录不存在：~/.acemcp

    这是因为 acemcp 尚未运行。请先点击「测试连接」按钮，
    这会触发 acemcp 启动并自动创建配置目录。"
5. 点击 "测试连接"
6. 再次点击 "保存配置"
7. 配置保存成功 ✅
```

---

## 🔍 验证

### 代码检查

**确认所有 `.acemcp` 都基于用户主目录**：
```bash
$ grep -n "\.acemcp" src-tauri/src/commands/acemcp.rs
308:  // 发布模式：从嵌入资源提取到 ~/.acemcp/ 目录
311:  .join(".acemcp");             ← dirs::home_dir()
1005: .join(".acemcp");             ← dirs::home_dir()
1082: .join(".acemcp");             ← dirs::home_dir()
1296: .join(".acemcp");             ← dirs::home_dir()
```

✅ **确认**：所有引用都是 `dirs::home_dir().join(".acemcp")`，没有基于项目路径的创建。

### 编译检查
```bash
$ cargo check
Finished `dev` profile [unoptimized + debuginfo] target(s) in 3.69s
```
✅ 编译通过

---

## 💡 设计优势

### 1. 职责清晰
- **应用**: 只负责提取 sidecar
- **Acemcp**: 负责管理自己的配置和数据

### 2. 避免混乱
- ❌ 不会在多个位置创建配置
- ✅ 统一由 acemcp 管理

### 3. 错误提示友好
- ✅ 明确告诉用户问题原因
- ✅ 提供解决方案（先测试连接）

---

## 🔄 对比其他方案

### 方案 A: 应用主动创建目录（旧逻辑）
```rust
fs::create_dir_all(&config_dir)?;  // 总是创建
fs::write(&config_file, content)?;
```
**问题**：
- ❌ 与 acemcp 的职责重叠
- ❌ 可能导致配置管理混乱

### 方案 B: 应用完全不管（过于严格）
```rust
// 不检查，直接写入
fs::write(&config_file, content)?;
```
**问题**：
- ❌ 错误提示不友好："No such file or directory"
- ❌ 用户不知道如何解决

### 方案 C: 检查并提示（当前实现）✅
```rust
if !config_dir.exists() {
    return Err("目录不存在，请先测试连接");
}
fs::write(&config_file, content)?;
```
**优势**：
- ✅ 友好的错误提示
- ✅ 引导用户正确操作
- ✅ 职责清晰

---

## ✅ 完成状态

- [x] 确认无项目目录下的 `.acemcp` 创建逻辑
- [x] 移除 `save_acemcp_config` 中的冗余目录创建
- [x] 添加友好的错误检查和提示
- [x] 保留必要的目录创建（sidecar 提取、导出）
- [x] 编译验证通过

---

**修改完成！配置目录现在完全由 acemcp 核心进程管理。** ✨
