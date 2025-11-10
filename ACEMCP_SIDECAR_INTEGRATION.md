# Acemcp Sidecar 集成方案

## 📋 概述

本方案将 acemcp 打包为独立可执行文件，作为 Tauri Sidecar 集成到 Claude Workbench 中，实现：
- ✅ 无需用户安装 Python
- ✅ 无需用户单独安装 acemcp
- ✅ 配置存储在 `~/.acemcp/settings.toml`（与原 acemcp 兼容）
- ✅ 用户只需配置 BASE_URL 和 TOKEN

## 🏗️ 架构设计

```
Claude Workbench
├── 前端 (React)
│   └── 提示词优化 UI
├── Rust 后端
│   └── Sidecar 管理器
│       └── 调用 acemcp-sidecar.exe
└── Sidecar Binary
    └── acemcp-sidecar.exe (打包的 Python + acemcp)
        ├── Python 运行时
        ├── acemcp 源码
        └── 所有依赖
```

## 📦 实施步骤

### 步骤 1: 打包 acemcp 为独立可执行文件

已准备好打包脚本：
- `C:\Users\Administrator\Desktop\acemcp\build_sidecar.py`
- `C:\Users\Administrator\Desktop\acemcp\acemcp_entry.py`
- `C:\Users\Administrator\Desktop\acemcp\acemcp-sidecar.spec`

**执行打包**：
```bash
cd C:\Users\Administrator\Desktop\acemcp
python acemcp_entry.py  # 测试入口点
python -m PyInstaller acemcp-sidecar.spec  # 打包
```

**输出**：`dist/acemcp-sidecar.exe` (约 30-50MB)

### 步骤 2: 复制到 Tauri binaries 目录

```bash
# Windows
copy dist\acemcp-sidecar.exe claude-workbench\src-tauri\binaries\acemcp-x86_64-pc-windows-msvc.exe

# macOS (如果需要)
# cp dist/acemcp-sidecar claude-workbench/src-tauri/binaries/acemcp-aarch64-apple-darwin

# Linux (如果需要)
# cp dist/acemcp-sidecar claude-workbench/src-tauri/binaries/acemcp-x86_64-unknown-linux-gnu
```

### 步骤 3: 配置 Tauri Sidecar

**编辑 `src-tauri/tauri.conf.json`**：

```json
{
  "bundle": {
    "externalBin": [
      "binaries/acemcp-sidecar"
    ]
  }
}
```

### 步骤 4: 修改 Rust 代码调用 Sidecar

**修改 `src-tauri/src/commands/acemcp.rs`**：

```rust
use tauri::AppHandle;

impl AcemcpClient {
    async fn start(app: &AppHandle) -> Result<Self> {
        info!("Starting acemcp sidecar...");

        // 获取 sidecar 路径
        let sidecar_command = app.shell().sidecar("acemcp-sidecar")
            .map_err(|e| anyhow::anyhow!("Failed to get sidecar: {}", e))?;

        // 启动 sidecar
        let child = sidecar_command
            .spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn sidecar: {}", e))?;

        // 转换为 tokio child
        let child = tokio::process::Child::from(child);

        info!("Acemcp sidecar started successfully");
        Ok(Self { child, request_id: 0 })
    }
}

// 更新 enhance_prompt_with_context 调用
#[tauri::command]
pub async fn enhance_prompt_with_context(
    app: AppHandle,  // 新增参数
    prompt: String,
    project_path: String,
    max_context_length: Option<usize>,
) -> Result<EnhancementResult, String> {
    // ...
    let mut client = match AcemcpClient::start(&app).await {
        Ok(c) => c,
        Err(e) => {
            // ...
        }
    };
    // ...
}
```

**同时更新 `src-tauri/src/main.rs` 中的命令注册**：
```rust
// Tauri command 需要添加 app: AppHandle 参数
```

### 步骤 5: 添加配置管理 (可选)

用户可以手动编辑 `~/.acemcp/settings.toml`，或者你可以添加 UI：

**添加配置界面**（在设置页面）：

```typescript
// src/components/Settings/AcemcpSettings.tsx
interface AcemcpConfig {
  BASE_URL: string;
  TOKEN: string;
  BATCH_SIZE?: number;
  MAX_LINES_PER_BLOB?: number;
}

export function AcemcpSettings() {
  const [config, setConfig] = useState<AcemcpConfig>({
    BASE_URL: '',
    TOKEN: '',
  });

  const handleSave = async () => {
    // 调用 Rust 命令保存配置到 ~/.acemcp/settings.toml
    await api.saveAcemcpConfig(config);
  };

  return (
    <div>
      <h3>Acemcp 语义搜索配置</h3>
      <Input
        label="API Base URL"
        value={config.BASE_URL}
        onChange={(e) => setConfig({...config, BASE_URL: e.target.value})}
      />
      <Input
        label="API Token"
        type="password"
        value={config.TOKEN}
        onChange={(e) => setConfig({...config, TOKEN: e.target.value})}
      />
      <Button onClick={handleSave}>保存</Button>
    </div>
  );
}
```

**对应的 Rust 命令**（可选）：

```rust
// src-tauri/src/commands/acemcp.rs

#[tauri::command]
pub async fn save_acemcp_config(
    base_url: String,
    token: String,
    batch_size: Option<u32>,
    max_lines_per_blob: Option<u32>,
) -> Result<(), String> {
    use std::fs;
    use toml::Value;

    let config_dir = dirs::home_dir()
        .ok_or("Cannot find home directory")?
        .join(".acemcp");

    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    let config_file = config_dir.join("settings.toml");

    let mut config = toml::map::Map::new();
    config.insert("BASE_URL".to_string(), Value::String(base_url));
    config.insert("TOKEN".to_string(), Value::String(token));

    if let Some(batch_size) = batch_size {
        config.insert("BATCH_SIZE".to_string(), Value::Integer(batch_size as i64));
    }

    if let Some(max_lines) = max_lines_per_blob {
        config.insert("MAX_LINES_PER_BLOB".to_string(), Value::Integer(max_lines as i64));
    }

    let toml_string = toml::to_string(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(config_file, toml_string)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_acemcp_config() -> Result<AcemcpConfigData, String> {
    use std::fs;

    let config_file = dirs::home_dir()
        .ok_or("Cannot find home directory")?
        .join(".acemcp")
        .join("settings.toml");

    if !config_file.exists() {
        return Ok(AcemcpConfigData::default());
    }

    let content = fs::read_to_string(config_file)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: toml::Value = toml::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(AcemcpConfigData {
        base_url: config.get("BASE_URL")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        token: config.get("TOKEN")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        batch_size: config.get("BATCH_SIZE")
            .and_then(|v| v.as_integer())
            .map(|v| v as u32),
        max_lines_per_blob: config.get("MAX_LINES_PER_BLOB")
            .and_then(|v| v.as_integer())
            .map(|v| v as u32),
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AcemcpConfigData {
    pub base_url: String,
    pub token: String,
    pub batch_size: Option<u32>,
    pub max_lines_per_blob: Option<u32>,
}

impl Default for AcemcpConfigData {
    fn default() -> Self {
        Self {
            base_url: String::new(),
            token: String::new(),
            batch_size: Some(10),
            max_lines_per_blob: Some(800),
        }
    }
}
```

## 🧪 测试步骤

### 1. 测试 Sidecar 可执行文件

```bash
# 直接运行测试
cd C:\Users\Administrator\Desktop\acemcp\dist
acemcp-sidecar.exe --help
```

应该显示 acemcp 帮助信息。

### 2. 测试 MCP 通信

```bash
# 启动 sidecar (stdio 模式)
acemcp-sidecar.exe
# 发送 JSON-RPC 初始化请求（通过 stdin）
```

### 3. 测试集成

在 Claude Workbench 中：
1. 打开项目会话
2. 输入提示词
3. 点击 "优化提示词" → "🔍 添加项目上下文 (acemcp)"
4. 检查是否正确附加了代码上下文

## 📊 文件大小估算

- acemcp-sidecar.exe: ~30-50MB (包含 Python 运行时 + 依赖)
- Claude Workbench 安装包增加: ~30-50MB

## 🔧 故障排除

### 问题 1: 打包失败

```bash
# 如果缺少某些模块
python -m pip install <missing-module>

# 重新打包
python -m PyInstaller --clean acemcp-sidecar.spec
```

### 问题 2: Sidecar 启动失败

检查日志：
```rust
// 在 Rust 代码中添加详细日志
info!("Sidecar path: {:?}", sidecar_path);
info!("Sidecar spawn result: {:?}", result);
```

### 问题 3: MCP 通信失败

验证 stdio 连接：
```rust
// 确保 stdin/stdout 正确配置
.stdin(Stdio::piped())
.stdout(Stdio::piped())
.stderr(Stdio::null())
```

### 问题 4: 配置文件未找到

确认路径：
```rust
let config_path = dirs::home_dir()?.join(".acemcp/settings.toml");
println!("Config path: {:?}", config_path);
```

## 📈 性能考虑

1. **首次启动**：Sidecar 启动时间 ~1-2秒
2. **搜索延迟**：取决于 API 响应时间
3. **内存占用**：Sidecar 进程 ~100-200MB

## 🔐 安全考虑

1. **Token 存储**：存储在用户主目录 `~/.acemcp/settings.toml`
2. **进程隔离**：Sidecar 作为独立进程运行
3. **通信安全**：通过 stdio 管道通信，无网络暴露

## 📝 下一步

1. ✅ 打包脚本已创建
2. ⏳ 执行打包生成 sidecar
3. ⏳ 修改 Rust 代码使用 sidecar
4. ⏳ 更新 tauri.conf.json
5. ⏳ 测试完整流程
6. ⏳ 添加配置 UI（可选）

## 🎯 当前状态

### 已完成
- ✅ 分析 acemcp 源码和依赖
- ✅ 创建 PyInstaller 打包配置
- ✅ 创建打包脚本
- ✅ 准备 Tauri sidecar 结构

### 待完成
- ⏳ 执行打包生成可执行文件
- ⏳ 测试 sidecar 独立运行
- ⏳ 修改 Rust 调用代码
- ⏳ 更新 Tauri 配置
- ⏳ 集成测试

---

**下一步操作**：执行以下命令开始打包

```bash
cd C:\Users\Administrator\Desktop\acemcp
python -m PyInstaller acemcp-sidecar.spec
```
