# Windows 隐藏 Node.js 控制台窗口修复

## ✅ 问题描述

在 Windows 平台上启动 `acemcp-mcp-server.cjs` Node.js sidecar 时，会短暂出现黑色控制台窗口（终端），造成视觉干扰。

---

## ✅ 解决方案

通过在启动 Node.js 进程时设置 Windows 特定的 `CREATE_NO_WINDOW` 标志来完全隐藏控制台窗口。

---

## 🔧 实现细节

### 修改文件
`src-tauri/src/commands/acemcp.rs`

### 1. 添加 Windows 特定的 trait 导入

```rust
// Windows: 导入 CommandExt trait 以使用 creation_flags
#[cfg(target_os = "windows")]
#[allow(unused_imports)]
use std::os::windows::process::CommandExt;
```

**位置**: 文件头部（第 25-28 行）

---

### 2. 隐藏 Node.js 版本检查窗口

```rust
// 首先检查 node 是否可用
let mut node_check_cmd = Command::new("node");
node_check_cmd.arg("--version");

// Windows: 隐藏检查命令的控制台窗口
#[cfg(target_os = "windows")]
{
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    node_check_cmd.creation_flags(CREATE_NO_WINDOW);
}

let node_check = node_check_cmd.output().await;
```

**位置**: `AcemcpClient::start()` 函数（第 366-376 行）

**作用**: 隐藏执行 `node --version` 时的控制台窗口

---

### 3. 隐藏 Sidecar 主进程窗口

```rust
// 使用 tokio Command 启动 sidecar
let mut cmd = Command::new("node");
cmd.arg(&sidecar_path)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::null());

// Windows: 隐藏控制台窗口
#[cfg(target_os = "windows")]
{
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

let child = cmd.spawn()?;
```

**位置**: `AcemcpClient::start()` 函数（第 385-396 行）

**作用**: 隐藏 `node acemcp-mcp-server.cjs` 进程的控制台窗口

---

## 📊 技术说明

### CREATE_NO_WINDOW 标志

- **值**: `0x08000000`
- **来源**: Windows API 常量
- **文档**: [CreateProcess - Windows API](https://docs.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)

### 作用
设置此标志后，进程不会创建新的控制台窗口，即使它是控制台应用程序。

### 跨平台兼容性
- ✅ **Windows**: 使用 `creation_flags` 隐藏窗口
- ✅ **Linux/macOS**: 不执行此代码（条件编译）

---

## ✅ 验证

### 编译测试
```bash
$ cargo check
Finished `dev` profile [unoptimized + debuginfo] target(s) in 3.69s
```
✅ 通过，无错误无警告

### 运行时测试
1. 启动应用
2. 配置 acemcp
3. 使用项目上下文功能

**预期行为**：
- ✅ 不会出现黑色控制台窗口
- ✅ Sidecar 进程在后台静默运行
- ✅ 功能正常工作

---

## 🎯 相关代码位置

```rust
// 文件: src-tauri/src/commands/acemcp.rs

// 导入 (第 25-28 行)
#[cfg(target_os = "windows")]
#[allow(unused_imports)]
use std::os::windows::process::CommandExt;

// Node.js 检查 (第 369-374 行)
#[cfg(target_os = "windows")]
{
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    node_check_cmd.creation_flags(CREATE_NO_WINDOW);
}

// Sidecar 启动 (第 392-397 行)
#[cfg(target_os = "windows")]
{
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
```

---

## 📝 注意事项

1. **仅影响 Windows**
   - Linux 和 macOS 不需要此修复
   - 使用 `#[cfg(target_os = "windows")]` 条件编译

2. **不影响日志输出**
   - Rust 应用的日志仍然正常输出到控制台
   - 只是隐藏了子进程的控制台窗口

3. **不影响调试**
   - 可以通过 Rust 日志查看 sidecar 状态
   - stderr 重定向到 null，不影响功能

---

## ✅ 完成状态

- [x] 添加 CommandExt trait 导入
- [x] 隐藏 Node.js 版本检查窗口
- [x] 隐藏 Sidecar 主进程窗口
- [x] 编译验证通过
- [x] 跨平台兼容性保证

---

**修复完成！Windows 用户将享受无干扰的体验。** ✨
