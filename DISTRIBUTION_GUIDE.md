# Claude Workbench 分发指南

## 📦 分发方式

### 方式 1: 安装包 (推荐) ⭐

**位置**:
- NSIS: `src-tauri/target/release/bundle/nsis/Claude Workbench_4.1.3_x64-setup.exe` (39MB)
- MSI: `src-tauri/target/release/bundle/msi/Claude Workbench_4.1.3_x64_en-US.msi` (40MB)

**优点**:
- ✅ 用户体验最好（开始菜单、快捷方式）
- ✅ 自动包含所有依赖（包括 acemcp sidecar）
- ✅ 支持更新检测

**用户操作**:
1. 运行安装包
2. 配置 `~/.acemcp/settings.toml`（如需使用项目上下文搜索）
3. 启动应用

---

### 方式 2: 便携版 (免安装)

**位置**: `portable-build/` (45MB)

**创建方法**:
```bash
# 自动创建（已完成）
cd C:\Users\Administrator\Desktop\claude-workbench
# 便携版已在 portable-build/ 目录
```

**目录结构**:
```
portable-build/
├── claude-workbench.exe (11MB)
├── binaries/
│   └── acemcp-sidecar-x86_64-pc-windows-msvc.exe (35MB)
└── README.txt
```

**分发方式**:
1. 打包为 ZIP:
   ```bash
   cd portable-build
   zip -r ../claude-workbench-portable-v4.1.3.zip .
   ```

2. 或直接分发整个 `portable-build` 文件夹

**用户操作**:
1. 解压到任意目录
2. 配置 `~/.acemcp/settings.toml`（如需使用项目上下文搜索）
3. 双击 `claude-workbench.exe` 运行

---

### 方式 3: 仅主程序 (不含 acemcp) ❌

**位置**: `src-tauri/target/release/claude-workbench.exe` (11MB)

**限制**:
- ❌ **不支持项目上下文搜索功能**
- ❌ 缺少 acemcp sidecar
- ✅ 其他功能正常

**不推荐此方式！**

---

## 🎯 推荐分发方案

### 面向普通用户
→ **使用安装包** (NSIS/MSI)
- 最佳体验
- 自动更新
- 专业安装流程

### 面向技术用户 / 需要便携版
→ **使用 portable-build/**
- 免安装
- 可放 U 盘
- 可自定义位置

---

## 📋 用户配置指南（可选功能）

### Acemcp 项目上下文搜索配置

**仅在需要使用项目上下文功能时配置**

#### Windows:
```cmd
mkdir %USERPROFILE%\.acemcp
notepad %USERPROFILE%\.acemcp\settings.toml
```

填入：
```toml
BASE_URL = "https://your-api-endpoint.com"
TOKEN = "your-api-token"
```

#### macOS/Linux:
```bash
mkdir -p ~/.acemcp
cat > ~/.acemcp/settings.toml << EOF
BASE_URL = "https://your-api-endpoint.com"
TOKEN = "your-api-token"
EOF
```

### 使用方法

1. 在 Claude Workbench 中打开项目
2. 输入提示词
3. 点击 "优化提示词"
4. **启用** "启用项目上下文" 开关（变蓝）
5. 选择优化模型
6. 系统自动搜索相关代码并优化

---

## 🎁 分发清单

### 完整包（推荐）

**文件**:
- `Claude Workbench_4.1.3_x64-setup.exe` (39MB) - NSIS 安装包
- `Claude Workbench_4.1.3_x64_en-US.msi` (40MB) - MSI 安装包

**说明**:
- ✅ 包含 acemcp sidecar (35MB)
- ✅ 用户安装后可直接使用所有功能
- ✅ 只需配置 API 密钥（如果要用项目上下文）

### 便携版

**文件**:
- `portable-build/` 文件夹 (45MB)
- 或打包为: `claude-workbench-portable-v4.1.3.zip`

**说明**:
- ✅ 免安装，解压即用
- ✅ 包含 acemcp sidecar (35MB)
- ✅ 适合需要便携或多个版本共存的用户

---

## 🔍 验证 Sidecar 是否打包

### 安装包验证（用户侧）

用户安装后，检查以下位置是否有 sidecar：

**Windows**:
```
C:\Program Files\Claude Workbench\resources\binaries\acemcp-sidecar-x86_64-pc-windows-msvc.exe
```

或解压 NSIS 安装包查看内容。

### 便携版验证

直接检查 `portable-build/binaries/` 目录：
```bash
ls -lh portable-build/binaries/
# 应显示 35MB 的 acemcp-sidecar-*.exe
```

---

## 📝 总结

### 可以分发的版本

| 版本 | 文件 | 大小 | 包含 acemcp | 推荐 |
|------|------|------|------------|------|
| NSIS 安装包 | `*-setup.exe` | 39MB | ✅ | ⭐⭐⭐ |
| MSI 安装包 | `*.msi` | 40MB | ✅ | ⭐⭐⭐ |
| 便携版 | `portable-build/` | 45MB | ✅ | ⭐⭐ |
| 单文件 | `claude-workbench.exe` | 11MB | ❌ | ❌ |

### 用户需要做的

1. **安装/解压应用** ✅
2. **配置 API**（如果要用项目上下文）:
   ```toml
   BASE_URL = "..."
   TOKEN = "..."
   ```
3. **开始使用** ✅

**无需安装 Python、acemcp 或任何其他依赖！** 🎉

---

现在 `portable-build/` 目录已准备好，你可以直接分发这个文件夹或打包成 ZIP！