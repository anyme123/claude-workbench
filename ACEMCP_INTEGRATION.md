# Acemcp 语义搜索集成文档

## 📋 概述

本次集成为 Claude Workbench 添加了 `acemcp` 语义搜索能力，在提示词优化阶段自动为用户提供项目代码上下文，解决新会话或历史会话中上下文缺失的问题。

## ✨ 功能特性

### 核心功能
- **自动语义搜索**：从用户提示词中提取关键词，搜索相关代码
- **智能上下文增强**：将搜索到的代码片段自动附加到提示词
- **无缝集成**：作为提示词优化选项之一，与现有功能完美融合
- **优雅降级**：当 acemcp 不可用时，自动回退到原始提示词

### 触发时机
- ✅ 用户开启新会话时
- ✅ 用户查看历史会话时
- ✅ 任何需要项目上下文的场景

## 🏗️ 技术架构

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    用户输入提示词                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓ 点击 "🔍 添加项目上下文 (acemcp)"
┌─────────────────────────────────────────────────────────────┐
│ 前端层 (TypeScript/React)                                   │
│ • FloatingPromptInput 组件                                  │
│ • usePromptEnhancement Hook                                 │
│ • handleEnhancePromptWithContext()                          │
└────────────────────┬────────────────────────────────────────┘
                     │ Tauri IPC
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Rust 后端层 (src-tauri/src/commands/acemcp.rs)              │
│ 1. 启动 acemcp MCP server (stdio)                           │
│ 2. 初始化 MCP 协议连接                                       │
│ 3. 提取技术关键词                                            │
│ 4. 调用 search_context 工具                                 │
│ 5. 格式化返回结果                                            │
└────────────────────┬────────────────────────────────────────┘
                     │ JSON-RPC over stdio
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Acemcp MCP Server                                           │
│ • 语义搜索引擎                                               │
│ • 增量索引                                                   │
│ • 代码上下文提取                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓ 返回增强后的提示词
┌─────────────────────────────────────────────────────────────┐
│ 显示增强后的提示词                                           │
│                                                              │
│ [用户原始提示词]                                             │
│                                                              │
│ --- 项目上下文 (来自 acemcp 语义搜索) ---                    │
│ Path: src/components/App.tsx                                │
│ ...                                                          │
│ 10  export function App() {                                 │
│ 11    return <div>Hello</div>                               │
│ ...                                                          │
└─────────────────────────────────────────────────────────────┘
```

## 📁 文件修改清单

### 新增文件

#### 1. `src-tauri/src/commands/acemcp.rs` (新建)
**核心功能模块**，包含：
- `AcemcpClient` - MCP 客户端实现
- `enhance_prompt_with_context` - Tauri 命令
- `test_acemcp_availability` - 可用性测试
- MCP JSON-RPC 协议通信
- 关键词提取逻辑

**关键函数**：
```rust
#[tauri::command]
pub async fn enhance_prompt_with_context(
    prompt: String,
    project_path: String,
    max_context_length: Option<usize>,
) -> Result<EnhancementResult, String>
```

### 修改的文件

#### 2. `src-tauri/src/commands/mod.rs`
```rust
pub mod acemcp;  // 新增模块注册
```

#### 3. `src-tauri/src/main.rs`
```rust
use commands::acemcp::{enhance_prompt_with_context, test_acemcp_availability};

// 在 invoke_handler 中注册命令
enhance_prompt_with_context,
test_acemcp_availability,
```

#### 4. `src/lib/api.ts`
新增 API 接口：
```typescript
async enhancePromptWithContext(
  prompt: string,
  projectPath: string,
  maxContextLength?: number
): Promise<EnhancementResult>

async testAcemcpAvailability(): Promise<boolean>
```

#### 5. `src/components/FloatingPromptInput/hooks/usePromptEnhancement.ts`
新增 Hook 函数：
```typescript
const handleEnhancePromptWithContext = async (projectPath: string) => {
  // 调用 acemcp 增强提示词
}
```

#### 6. `src/components/FloatingPromptInput/index.tsx`
在优化下拉菜单中添加选项：
```tsx
{projectPath && (
  <>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={() => handleEnhancePromptWithContext(projectPath)}>
      🔍 添加项目上下文 (acemcp)
    </DropdownMenuItem>
  </>
)}
```

## 🚀 使用方法

### 前置条件

1. **安装 acemcp**
   ```bash
   # 使用 uv 安装
   cd C:\Users\Administrator\Desktop\acemcp
   uv pip install -e .
   ```

2. **配置 acemcp**
   编辑 `~/.acemcp/settings.toml`：
   ```toml
   BASE_URL = "https://your-api-endpoint.com"
   TOKEN = "your-token-here"
   BATCH_SIZE = 10
   MAX_LINES_PER_BLOB = 800
   ```

3. **验证安装**
   ```bash
   acemcp --help
   ```

### 使用步骤

1. **启动 Claude Workbench**
   ```bash
   npm run tauri:dev
   ```

2. **打开项目**
   - 选择或创建一个项目会话

3. **输入提示词**
   - 在提示词输入框中输入你的问题或需求
   - 例如："修复登录功能的 bug"

4. **点击优化按钮**
   - 点击输入框右侧的 "优化提示词" 按钮
   - 从下拉菜单中选择 "🔍 添加项目上下文 (acemcp)"

5. **查看增强结果**
   - 系统会自动提取关键词（如 "登录功能"、"bug"）
   - 调用 acemcp 搜索相关代码
   - 将找到的代码上下文附加到提示词中

6. **发送提示词**
   - 检查增强后的提示词
   - 点击 "发送" 按钮开始会话

## 📊 输出格式

增强后的提示词格式如下：

```
[用户原始提示词]

--- 项目上下文 (来自 acemcp 语义搜索) ---
Path: src/auth/login.ts
...
    10  export async function login(username: string, password: string) {
    11    const response = await api.post('/auth/login', { username, password });
    12    return response.data;
    13  }
...

Path: src/components/LoginForm.tsx
...
    25  const handleSubmit = async (e) => {
    26    e.preventDefault();
    27    try {
    28      await login(username, password);
    29    } catch (error) {
    30      setError(error.message);
    31    }
    32  }
...
```

## ⚙️ 配置选项

### 上下文长度控制

默认最大上下文长度：**3000 字符**

可以在调用时自定义：
```typescript
api.enhancePromptWithContext(prompt, projectPath, 5000)
```

### 关键词提取策略

当前策略：
- 移除停用词（"请"、"帮我"、"how"、"can" 等）
- 保留长度 > 2 的词
- 最多提取 10 个关键词

可以在 `src-tauri/src/commands/acemcp.rs` 中修改 `extract_keywords` 函数自定义。

## 🔧 故障排除

### 问题 1: "Failed to start acemcp"
**原因**：acemcp 未安装或不在 PATH 中

**解决方案**：
```bash
# 检查 acemcp 是否可用
acemcp --help

# 重新安装
cd C:\Users\Administrator\Desktop\acemcp
uv pip install -e .
```

### 问题 2: "No keywords could be extracted"
**原因**：提示词过于简单或包含过多停用词

**解决方案**：
- 使用更具体的技术术语
- 添加代码相关的关键词
- 例如：将 "帮我看看" 改为 "分析登录认证模块"

### 问题 3: "Request timeout (30s)"
**原因**：项目太大或网络慢

**解决方案**：
- 检查 acemcp 配置中的 API 端点
- 减少 `MAX_LINES_PER_BLOB` 设置
- 添加更多排除模式到 `EXCLUDE_PATTERNS`

### 问题 4: "未找到相关代码上下文"
**原因**：关键词与代码库不匹配

**解决方案**：
- 使用项目中实际存在的技术术语
- 增加关键词的具体性
- 确保项目已被 acemcp 索引

## 🧪 测试

### 单元测试

测试 acemcp 可用性：
```typescript
const isAvailable = await api.testAcemcpAvailability();
console.log('Acemcp available:', isAvailable);
```

### 集成测试

完整流程测试：
```typescript
const result = await api.enhancePromptWithContext(
  "修复用户登录bug",
  "C:/path/to/project",
  3000
);

console.log('Original:', result.originalPrompt);
console.log('Enhanced:', result.enhancedPrompt);
console.log('Context count:', result.contextCount);
console.log('Acemcp used:', result.acemcpUsed);
```

## 📈 性能优化

### 1. 索引优化
- acemcp 自动使用增量索引
- 只索引修改过的文件
- 使用 hash 去重

### 2. 搜索优化
- 限制上下文长度（默认 3000 字符）
- 自动重试机制（3 次，递增延迟）
- 30 秒超时保护

### 3. 内存优化
- 流式读取大文件
- 及时关闭 MCP 连接
- 避免在内存中累积大量上下文

## 🔐 安全考虑

### 1. 路径验证
- 验证项目路径存在性
- 使用绝对路径
- 防止路径遍历攻击

### 2. 进程隔离
- acemcp 作为独立进程运行
- 通过 stdio 通信，隔离内存空间
- 自动清理子进程

### 3. 错误处理
- 捕获所有异常
- 提供友好的错误消息
- 不暴露系统内部信息

## 📝 未来改进

### 短期计划
- [ ] 添加上下文质量评分
- [ ] 支持多个项目路径搜索
- [ ] 缓存搜索结果以提高性能
- [ ] 添加搜索历史记录

### 长期计划
- [ ] 支持自定义关键词提取策略
- [ ] 集成向量数据库以提高搜索质量
- [ ] 支持多模态搜索（代码+文档+注释）
- [ ] 添加搜索结果排序和过滤

## 🤝 贡献

如果你想改进这个功能，请：

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 创建 Pull Request

## 📄 许可证

本项目遵循 AGPL-3.0 许可证。

## 📧 联系方式

- GitHub Issues: [项目 Issues](https://github.com/anyme123/claude-workbench/issues)
- 邮箱: [项目邮箱]

---

**集成完成时间**: 2025-11-10
**版本**: Claude Workbench 4.1.3
**集成者**: Claude (Sonnet 4.5)
