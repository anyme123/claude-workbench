# ✅ 单文件分发指南 - Acemcp 已嵌入

## 🎯 实现方式

使用 Rust `include_bytes!` 宏将 35MB 的 acemcp-sidecar 嵌入到主程序中。

### 技术实现

**编译时**:
```rust
const ACEMCP_SIDECAR_BYTES: &[u8] = include_bytes!("../../binaries/acemcp-sidecar-x86_64-pc-windows-msvc.exe");
```

**运行时**:
```rust
// 首次使用时自动提取到: %TEMP%\.claude-workbench\acemcp-sidecar.exe
// 后续使用直接调用已提取的文件
```

---

## 📦 文件大小

| 文件 | 大小 | 说明 |
|------|------|------|
| **claude-workbench.exe** | **45MB** | 单文件，包含所有功能 ✅ |
| ├─ 主程序 | 11MB | Tauri + Rust 后端 |
| └─ 嵌入的 acemcp | 35MB | Python 运行时 + acemcp |

---

## 🚀 用户使用指南

### 分发给用户

**只需一个文件**:
```
claude-workbench.exe (45MB)
```

### 用户操作

1. **下载并运行** `claude-workbench.exe`
   - 双击即可启动
   - 无需安装
   - 无需额外文件

2. **配置 Acemcp**（可选，仅在需要项目上下文搜索时）

   **Windows**:
   ```cmd
   mkdir %USERPROFILE%\.acemcp
   notepad %USERPROFILE%\.acemcp\settings.toml
   ```

   填入:
   ```toml
   BASE_URL = "https://your-api-endpoint.com"
   TOKEN = "your-api-token"
   ```

3. **使用项目上下文搜索**
   - 打开项目会话
   - 输入提示词
   - 点击 "优化提示词"
   - 启用 "启用项目上下文" 开关
   - 选择优化模型

---

## 🔍 首次运行时的自动提取

### 提取流程

当用户**第一次使用项目上下文功能**时：

1. 系统检测到 sidecar 未提取
2. 自动创建目录: `%TEMP%\.claude-workbench\`
3. 从主程序提取 `acemcp-sidecar.exe` (35MB)
4. 启动 sidecar 进程

**提取时间**: ~1-2 秒（仅首次）

### 提取位置

**Windows**:
```
C:\Users\<用户名>\AppData\Local\Temp\.claude-workbench\acemcp-sidecar.exe
```

**macOS**:
```
/var/folders/xxx/.claude-workbench/acemcp-sidecar
```

**Linux**:
```
/tmp/.claude-workbench/acemcp-sidecar
```

---

## 🎯 对比分发方式

### 之前（需要两个文件）

```
分发包:
├── claude-workbench.exe (11MB)
└── binaries/
    └── acemcp-sidecar-x86_64-pc-windows-msvc.exe (35MB)

用户操作: 需要保持目录结构
```

### 现在（单文件）✅

```
分发包:
└── claude-workbench.exe (45MB) ← 单文件！

用户操作: 直接运行，自动处理
```

---

## 🔧 构建指令

### 开发模式
```bash
npm run tauri:dev
# 仍然使用 src-tauri/binaries/ 中的 sidecar
```

### 发布模式（单文件）
```bash
npm run tauri:build
# 生成: src-tauri/target/release/claude-workbench.exe (45MB)
# acemcp 已嵌入，可直接分发这一个文件
```

---

## 🎁 分发清单

### 推荐分发方式

**方式 1: 单个 EXE** ⭐⭐⭐ 最简单
```
文件: claude-workbench.exe (45MB)
优点:
  ✅ 单文件，无需安装
  ✅ 放 U 盘即用
  ✅ 包含完整功能
  ✅ 自动提取 sidecar
```

**方式 2: 安装包** ⭐⭐ 更专业
```
文件: Claude Workbench_4.1.3_x64-setup.exe (39MB)
优点:
  ✅ 开始菜单快捷方式
  ✅ 自动更新
  ✅ 卸载程序
```

**两种方式都包含完整的 acemcp 功能！**

---

## 📝 用户文档（建议）

### README.txt

```
Claude Workbench v4.1.3
======================

使用方法:
1. 双击 claude-workbench.exe 启动

可选功能 - 项目上下文搜索:
1. 创建配置文件: %USERPROFILE%\.acemcp\settings.toml
2. 填写:
   BASE_URL = "https://your-api.com"
   TOKEN = "your-token"

无需安装 Python 或其他依赖！
```

---

## 🧪 测试验证

### 测试 1: 验证嵌入

```bash
# 检查文件大小
ls -lh src-tauri/target/release/claude-workbench.exe
# 应显示 ~45MB
```

### 测试 2: 验证单文件可用

```bash
# 复制到其他目录测试
cp src-tauri/target/release/claude-workbench.exe ~/Desktop/test.exe
cd ~/Desktop
./test.exe
# 应正常启动，功能完整
```

### 测试 3: 验证自动提取

1. 运行应用
2. 使用项目上下文功能
3. 检查临时目录:
   ```cmd
   dir %TEMP%\.claude-workbench\
   ```
   应看到 `acemcp-sidecar.exe` (35MB)

---

## 💡 技术细节

### 为什么首次运行要提取？

**不能直接从内存运行 sidecar**，因为：
1. Sidecar 需要作为独立进程启动
2. 进程需要可执行文件路径
3. Windows/Linux 不支持从内存执行 EXE

**提取到临时目录的优势**:
- ✅ 自动管理（系统清理临时文件）
- ✅ 不污染用户目录
- ✅ 支持多版本共存

### 提取时机

**仅在以下情况提取**:
- 首次使用项目上下文功能时
- 临时文件被清理后

**不会每次都提取**，提取一次后会复用。

---

## 🎊 总结

### 最终成果

✅ **单个 EXE 文件** (45MB)
✅ **包含完整 acemcp 功能**
✅ **自动提取和管理**
✅ **用户零配置**（除了 API 密钥）

### 分发文件

**主要**:
- `src-tauri/target/release/claude-workbench.exe` (45MB)

**可选**（如果要做安装包）:
- `src-tauri/target/release/bundle/nsis/*.exe` (39MB)
- `src-tauri/target/release/bundle/msi/*.msi` (40MB)

**所有方式都包含 acemcp，用户只需配置 API 即可使用！** 🎉
