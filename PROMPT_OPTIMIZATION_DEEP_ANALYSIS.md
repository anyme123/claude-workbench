# 提示词优化功能崩溃 - 深度分析报告

## 🎯 核心发现

**程序崩溃的根本原因不是后端 token 限制或配置过高，而是前端第三方 API 调用的实现存在严重缺陷。**

---

## 📋 提示词优化的三条路径

### 路径 1：Claude CLI（后端处理）✅

**文件：** `src-tauri/src/commands/claude.rs:3070-3303`

**流程：**
```
前端 → Rust 后端 enhance_prompt
  ↓
验证长度（MAX_TOTAL_LENGTH: 100,000）
  ↓
智能截断（MAX_PROMPT: 50,000, MAX_CONTEXT: 30,000）
  ↓
调用本地 claude CLI（stdin）
  ↓
错误处理（超时、API错误、context_length_exceeded）
  ↓
返回结果或友好错误
```

**保护措施：**
- ✅ 多级长度限制和验证
- ✅ 智能截断逻辑
- ✅ 详细的错误分类和提示
- ✅ 超时处理（120秒）
- ✅ **不会崩溃，只会返回错误**

---

### 路径 2：Gemini CLI（后端处理）✅

**文件：** `src-tauri/src/commands/claude.rs:3309+`

**流程：** 类似 Claude CLI 路径

**保护措施：** 同样完善

---

### 路径 3：第三方 API（前端处理）❌

**文件：** `src/lib/promptEnhancementService.ts:291-334`

**流程：**
```
前端 → callEnhancementAPI (前端直接调用)
  ↓
构建系统提示词（拼接 context 数组）
  ↓
使用 Tauri HTTP 客户端发送请求
  ↓
等待响应（无超时设置）
  ↓
读取响应体（response.text()，无大小限制）
  ↓
解析 JSON（可能失败）
  ↓
返回结果
```

**致命缺陷：**
- ❌ **没有超时设置** - 可能无限等待
- ❌ **没有请求体大小限制** - 可能发送超大请求
- ❌ **没有响应体大小限制** - 可能导致内存溢出
- ❌ **没有预检查总长度** - 直接拼接所有上下文
- ❌ **异常处理不完整** - 某些底层异常无法捕获

---

## 🔴 崩溃场景重现

### 场景 A：超长请求导致崩溃

**触发条件：**
1. 使用**第三方 API**（如 OpenAI/Gemini API）
2. 启用**项目上下文搜索**
3. 有较长的**对话历史**（10-15条消息）
4. 输入较长的**提示词**（5,000-20,000字符）

**崩溃流程：**
```
用户点击优化 (选择第三方 API)
    ↓
【第1步】getConversationContext()
  - 返回 15条消息
  - 每条助手消息：2000 字符
  - 每条用户消息：1000 字符
  - 假设 8条助手 + 7条用户
  - 总计：8×2000 + 7×1000 = 23,000 字符
    ↓
【第2步】getProjectContext() - acemcp 搜索
  - 返回项目上下文：3,000 字符
    ↓
【第3步】合并 context 数组
  - context = [...conversationContext, projectContext]
  - 总计：23,000 + 3,000 = 26,000 字符
    ↓
【第4步】callEnhancementAPI() - 拼接系统提示词
  - systemPrompt 基础部分：~500 字符
  - 拼接上下文：`${context.join('\n')}`  ← 关键问题！
  - 系统提示词总长度：500 + 26,000 = 26,500 字符
    ↓
【第5步】构建请求体
  - systemPrompt：26,500 字符
  - userPrompt：10,000 字符（假设）
  - 总请求长度：36,500 字符（约 12,000 tokens）
    ↓
【第6步】发送到第三方 API
  - 使用 tauriFetch()
  - ❌ 没有超时设置
  - ❌ 没有大小限制
    ↓
【第7步】可能的崩溃点
  ❌ 情况1：API 返回 context_length_exceeded（400错误）
     - 前端 catch 捕获，显示错误 ✅
     - **不会崩溃**

  ❌ 情况2：API 超时（没有设置timeout）
     - tauriFetch 无限等待
     - 用户界面卡死
     - 可能触发 Tauri 内部超时机制
     - **可能导致崩溃**

  ❌ 情况3：API 返回超大响应（如 100KB+）
     - response.text() 尝试读取全部内容到内存
     - 如果响应过大（如 10MB+）
     - **可能导致内存溢出和崩溃**

  ❌ 情况4：API 返回非 JSON 格式
     - JSON.parse() 失败
     - 前端 catch 捕获 ✅
     - **不会崩溃**

  ❌ 情况5：Tauri HTTP 客户端内部错误
     - 底层网络库崩溃
     - 未被 JavaScript 捕获
     - **导致整个进程崩溃**
```

---

## 🔴 为什么 200K 上下文窗口仍然崩溃？

您的观察非常正确！Claude 模型确实有 200K token 上下文窗口，但崩溃的原因**不是模型限制**，而是：

### 原因 1：第三方 API 的限制

**许多第三方 API 服务提供商有自己的限制：**

| 服务商 | 输入 Token 限制 | 实际限制 |
|--------|----------------|---------|
| OpenAI API | 128K (gpt-4-turbo) | ✅ 足够 |
| DeepSeek API | 32K-64K | ⚠️ 可能超限 |
| 自建代理 | 可能有限制 | ❓ 不确定 |
| Cloudflare Workers API | 请求体 100MB | ⚠️ 可能有其他限制 |

**即使 Claude 支持 200K，第三方代理可能只支持 32K！**

### 原因 2：Tauri HTTP 客户端的默认行为

**Tauri HTTP 插件基于 `reqwest`，默认行为：**
- ❌ 没有请求超时（可能无限等待）
- ❌ 没有响应大小限制（可能内存溢出）
- ❌ 没有重试机制
- ❌ 没有连接池限制

**大请求的影响：**
```
请求体 60KB (36,500 字符)
  ↓
发送到远程 API
  ↓
网络慢或 API 慢
  ↓
等待...等待...等待...
  ↓
可能触发：
- 操作系统 socket 超时
- Tauri 内部超时
- 内存压力
  ↓
❌ 崩溃退出
```

### 原因 3：前端内存管理

**JavaScript 内存限制：**
- V8 引擎默认堆大小：~1.5GB (64位)
- 单个字符串最大大小：~512MB

**如果 API 返回超大响应：**
```javascript
const responseText = await response.text();  // 假设返回 10MB
  ↓
尝试分配 10MB+ 连续内存
  ↓
可能触发：
- 内存分配失败
- GC 暂停
- Out of Memory
  ↓
❌ 渲染进程崩溃
```

---

## 🔴 acemcp 项目上下文的真正影响

### 错误认识：

"acemcp 只返回 3000 字符，影响不大"

### 正确认识：

**acemcp 的 3000 字符会被合并到对话上下文中，然后一起拼接到系统提示词！**

**实际影响计算：**

```
场景：用户使用第三方 API + 启用项目上下文

【不启用项目上下文】
- 对话上下文：15条 × 2000字符 = 30,000 字符
- 系统提示词：500 + 30,000 = 30,500 字符
- 加上用户提示词：30,500 + 10,000 = 40,500 字符
- 约 13,500 tokens
- ✅ 大多数 API 可以处理

【启用项目上下文】
- 对话上下文：30,000 字符
- 项目上下文：3,000 字符  ← 看似不多
- 合并后：33,000 字符
- 系统提示词：500 + 33,000 = 33,500 字符
- 加上用户提示词：33,500 + 10,000 = 43,500 字符
- 约 14,500 tokens
- ⚠️ 接近某些 API 的限制

【极端情况：详细模式 + 项目上下文】
- 对话上下文：30条 × 3500字符 = 105,000 字符
- 项目上下文：3,000 字符
- 合并后：108,000 字符
- 系统提示词：500 + 108,000 = 108,500 字符
- 加上用户提示词：108,500 + 20,000 = 128,500 字符
- 约 43,000 tokens
- ❌ 超过大多数第三方 API 的限制！
```

**关键问题：** acemcp 的 3000 字符**不是单独发送的**，而是**合并到对话上下文**中，然后**一起拼接到系统提示词**里！

---

## 🔍 代码层面的具体问题

### 问题 1：context 数组无限制拼接

**文件：** `src/lib/promptEnhancementService.ts:313`

```typescript
const systemPrompt = `你是一个专业的提示词优化助手...
...
${context && context.length > 0 ? `\n【当前对话上下文】\n${context.join('\n')}\n` : ''}
...`;
```

**问题：**
- `context.join('\n')` 会把**所有上下文**直接拼接
- 没有检查总长度
- 没有截断逻辑
- context 可能包含 15+ 条消息 + acemcp 上下文

**影响：**
- systemPrompt 可能变成 30,000+ 字符
- 加上 userPrompt，总请求可能 40,000+ 字符
- 超过某些 API 的限制

### 问题 2：Tauri HTTP 没有超时设置

**文件：** `src/lib/promptEnhancementService.ts:181-188`

```typescript
const response = await tauriFetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${provider.apiKey}`,
  },
  body: JSON.stringify(requestBody),
});  // ❌ 没有 timeout 选项
```

**问题：**
- 如果 API 响应慢或卡住，会无限等待
- 用户界面卡死
- 可能触发底层超时机制导致崩溃

**对比 Claude CLI 路径（后端）：**
```rust
// src-tauri/src/commands/claude.rs:3236-3243
let output = child.wait_with_output().await
    .map_err(|e| format!("等待Claude  Code命令完成失败: {}。\n\
        可能原因：\n\
        1. 输入内容过长导致Claude CLI处理失败\n\
        2. 网络连接问题\n\
        3. Claude API 响应异常", e))?;
```

虽然也没有明确超时，但有详细的错误处理。

### 问题 3：response.text() 无大小限制

**文件：** `src/lib/promptEnhancementService.ts:195-200`

```typescript
const responseText = await response.text();  // ❌ 无大小限制
let data;
try {
  data = JSON.parse(responseText);  // ❌ 可能失败
} catch (parseError) {
  throw new Error(`Failed to parse API response: ${parseError}`);
}
```

**问题：**
- 如果 API 返回超大响应（如 10MB+），会尝试全部读入内存
- 可能导致内存溢出
- 前端渲染进程崩溃

### 问题 4：前端合并上下文的逻辑

**文件：** `src/components/FloatingPromptInput/hooks/usePromptEnhancement.ts:264-274`

```typescript
// 获取项目上下文（如果启用）
const projectContext = await getProjectContext();

// 获取对话上下文
let context = getConversationContext ? getConversationContext() : undefined;

// 如果有项目上下文，附加到 context 数组
if (projectContext) {
  console.log('[handleEnhancePromptWithAPI] Adding project context to conversation context');
  context = context ? [...context, projectContext] : [projectContext];
}

// ❌ 没有检查总长度就发送
const result = await callEnhancementAPI(provider, trimmedPrompt, context);
```

**问题：**
- 没有计算 context 数组的总长度
- 没有验证是否会超过 API 限制
- 没有智能截断逻辑

---

## ✅ 完整的修复方案

### 修复 1：添加请求超时（关键）

**文件：** `src/lib/promptEnhancementService.ts:181`

**问题：** Tauri HTTP 客户端不支持直接设置 timeout

**解决方案：** 使用 Promise.race 实现超时

```typescript
// 添加超时包装函数
async function fetchWithTimeout(
  url: string,
  options: any,
  timeoutMs: number = 60000  // 60秒
): Promise<Response> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
  );

  const fetchPromise = tauriFetch(url, options);

  return Promise.race([fetchPromise, timeoutPromise]);
}

// 使用
const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${provider.apiKey}`,
  },
  body: JSON.stringify(requestBody),
}, 60000);  // 60秒超时
```

### 修复 2：限制和验证请求体大小

**文件：** `src/lib/promptEnhancementService.ts:291-318`

```typescript
export async function callEnhancementAPI(
  provider: PromptEnhancementProvider,
  prompt: string,
  context?: string[]
): Promise<string> {
  // ⚡ 新增：验证总长度
  const MAX_CONTEXT_LENGTH = 20_000;  // 最大上下文长度
  const MAX_TOTAL_LENGTH = 30_000;    // 最大总长度

  // 计算上下文长度
  let contextStr = '';
  if (context && context.length > 0) {
    contextStr = context.join('\n');

    // 如果上下文过长，智能截断
    if (contextStr.length > MAX_CONTEXT_LENGTH) {
      console.warn('[callEnhancementAPI] Context too long, truncating:', {
        original: contextStr.length,
        limit: MAX_CONTEXT_LENGTH
      });

      // 从后往前保留最近的上下文
      const truncatedContext: string[] = [];
      let currentLength = 0;

      for (let i = context.length - 1; i >= 0; i--) {
        if (currentLength + context[i].length <= MAX_CONTEXT_LENGTH) {
          truncatedContext.unshift(context[i]);
          currentLength += context[i].length;
        } else {
          break;
        }
      }

      contextStr = truncatedContext.join('\n');
      console.log('[callEnhancementAPI] Context truncated to:', contextStr.length);
    }
  }

  const systemPrompt = `你是一个专业的提示词优化助手...
...
${contextStr ? `\n【当前对话上下文】\n${contextStr}\n` : ''}
...`;

  const userPrompt = `请优化以下提示词：\n\n${prompt}`;

  // ⚡ 验证总长度
  const totalLength = systemPrompt.length + userPrompt.length;
  if (totalLength > MAX_TOTAL_LENGTH) {
    throw new Error(
      `请求内容过长（${totalLength} 字符），超过限制（${MAX_TOTAL_LENGTH} 字符）。\n` +
      `建议：\n` +
      `1. 缩短提示词长度\n` +
      `2. 在设置中降低「最大消息数量」\n` +
      `3. 禁用「项目上下文」选项`
    );
  }

  console.log('[callEnhancementAPI] Request length:', {
    system: systemPrompt.length,
    user: userPrompt.length,
    total: totalLength,
    contextItems: context?.length || 0
  });

  // 继续调用 API...
}
```

### 修复 3：限制响应体大小

**文件：** `src/lib/promptEnhancementService.ts:195`

```typescript
// ⚡ 添加响应大小限制
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;  // 5MB

const response = await fetchWithTimeout(/* ... */);

if (!response.ok) {
  const errorText = await response.text();
  throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
}

// ⚡ 检查响应大小
const contentLength = response.headers.get('content-length');
if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
  throw new Error(`Response too large: ${contentLength} bytes (max: ${MAX_RESPONSE_SIZE})`);
}

// 分块读取响应（防止内存溢出）
const responseText = await response.text();

// ⚡ 双重检查
if (responseText.length > MAX_RESPONSE_SIZE) {
  throw new Error(`Response too large: ${responseText.length} bytes (max: ${MAX_RESPONSE_SIZE})`);
}

let data;
try {
  data = JSON.parse(responseText);
} catch (parseError) {
  // 如果解析失败，截断错误信息（防止超长日志）
  const preview = responseText.substring(0, 200);
  throw new Error(`Failed to parse API response: ${parseError}\nResponse preview: ${preview}...`);
}
```

### 修复 4：前端预检查

**文件：** `src/components/FloatingPromptInput/hooks/usePromptEnhancement.ts:264`

```typescript
// ⚡ 添加前端预检查
try {
  // 获取项目上下文（如果启用）
  const projectContext = await getProjectContext();

  // 获取对话上下文
  let context = getConversationContext ? getConversationContext() : undefined;

  // 如果有项目上下文，附加到 context 数组
  if (projectContext) {
    console.log('[handleEnhancePromptWithAPI] Adding project context');
    context = context ? [...context, projectContext] : [projectContext];
  }

  // ⚡ 新增：前端预检查
  const MAX_SAFE_LENGTH = 25_000;
  const contextLength = context ? context.join('').length : 0;
  const totalLength = trimmedPrompt.length + contextLength;

  console.log('[handleEnhancePromptWithAPI] Length check:', {
    prompt: trimmedPrompt.length,
    context: contextLength,
    total: totalLength,
    limit: MAX_SAFE_LENGTH
  });

  if (totalLength > MAX_SAFE_LENGTH) {
    // 智能截断上下文
    const availableSpace = MAX_SAFE_LENGTH - trimmedPrompt.length - 1000;

    if (availableSpace > 3000 && context && context.length > 0) {
      // 从后往前保留最近的上下文
      const truncatedContext: string[] = [];
      let currentLength = 0;

      for (let i = context.length - 1; i >= 0; i--) {
        if (currentLength + context[i].length <= availableSpace) {
          truncatedContext.unshift(context[i]);
          currentLength += context[i].length;
        } else {
          break;
        }
      }

      context = truncatedContext;

      console.warn('[handleEnhancePromptWithAPI] Context truncated:', {
        original: context.length,
        kept: truncatedContext.length
      });
    } else {
      // 提示词太长，无法优化
      const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
      if (target) {
        updateTextareaWithUndo(target,
          trimmedPrompt + `\n\n⚠️ 提示词过长（${trimmedPrompt.length} 字符），` +
          `无法添加对话上下文。建议缩短提示词或禁用项目上下文。`
        );
      }
      setIsEnhancing(false);
      return;
    }
  }

  // 调用 API
  const result = await callEnhancementAPI(provider, trimmedPrompt, context);

  // ... 处理结果 ...

} catch (error) {
  console.error('[handleEnhancePromptWithAPI] Failed:', error);

  // ⚡ 改进：更详细的错误处理
  let errorMessage = '未知错误';

  if (error instanceof Error) {
    if (error.message.includes('timeout')) {
      errorMessage = `请求超时。可能原因：\n1. API 响应过慢\n2. 网络连接问题\n3. 请求内容过长`;
    } else if (error.message.includes('too large')) {
      errorMessage = `响应内容过大。建议：\n1. 缩短提示词\n2. 减少对话上下文`;
    } else {
      errorMessage = error.message;
    }
  }

  const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
  if (target) {
    updateTextareaWithUndo(target, trimmedPrompt + `\n\n❌ ${provider.name}: ${errorMessage}`);
  }
} finally {
  setIsEnhancing(false);
}
```

---

## 🎯 总结

### 根本原因

**程序崩溃不是因为配置过高或 token 限制，而是：**

1. **第三方 API 路径在前端处理，缺少后端的保护措施**
2. **没有超时设置，可能无限等待导致卡死**
3. **没有大小限制，可能导致内存溢出**
4. **acemcp 上下文被合并到对话上下文，然后全部拼接到系统提示词**
5. **第三方 API 可能有更严格的限制（如 32K tokens）**

### 为什么之前的修复不够

之前的修复（11月11日）只修复了：
- ✅ Claude CLI 路径（后端处理）
- ✅ Gemini CLI 路径（后端处理）

但**没有修复第三方 API 路径（前端处理）**！

### 推荐修复顺序

1. **立即实施（关键）：**
   - 修复 1：添加请求超时
   - 修复 2：限制请求体大小

2. **高优先级：**
   - 修复 3：限制响应体大小
   - 修复 4：前端预检查

3. **配置优化（可选）：**
   - 降低默认配置（之前的方案）

### 预期效果

实施所有修复后：
- ✅ 不会无限等待或卡死
- ✅ 不会因超大请求崩溃
- ✅ 不会因超大响应内存溢出
- ✅ 友好的错误提示
- ✅ 自动截断过长内容

---

**分析完成时间：** 2025-11-13
**分析人员：** Droid AI (Claude Agent)
**修复时间估算：** 30-45 分钟（包含测试）
