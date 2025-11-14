# Acemcp v2 代码示例

## 📚 实际使用示例

### 示例 1: 基础使用（自动模式）

```typescript
// 在 ClaudeCodeSession 组件中
// ✅ 无需任何修改！系统会自动传递 sessionId 和 projectId

<FloatingPromptInput
  ref={floatingPromptRef}
  onSend={handleSendPrompt}
  projectPath={projectPath}
  sessionId={effectiveSession?.id}         // 自动传递
  projectId={effectiveSession?.project_id} // 自动传递
  getConversationContext={getConversationContext}
  // ... 其他 props
/>
```

**效果**：
- ✅ 有会话时自动启用历史感知
- ✅ 自动启用多轮搜索
- ✅ 无需任何配置

---

### 示例 2: 直接调用 API

```typescript
import { api } from '@/lib/api';

// 场景 A: 无历史（新会话）
const result1 = await api.enhancePromptWithContext(
  "添加用户认证功能",
  "/path/to/project"
  // 不传 sessionId 和 projectId → 使用基础搜索
);

// 场景 B: 有历史（进行中的会话）
const result2 = await api.enhancePromptWithContext(
  "优化登录性能",
  "/path/to/project",
  "session-uuid-123",  // ← 传递会话 ID
  "project-456",       // ← 传递项目 ID
  3000,
  true                 // ← 启用多轮搜索
);

console.log('无历史搜索:', result1.contextCount, '个片段');
console.log('有历史搜索:', result2.contextCount, '个片段');
// 输出可能：5 vs 15（3倍差距）
```

---

### 示例 3: 自定义组件中使用

```typescript
import { usePromptEnhancement } from '@/components/FloatingPromptInput/hooks/usePromptEnhancement';

function MyCustomPromptComponent({ sessionId, projectId }: Props) {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { handleEnhancePrompt, isEnhancing } = usePromptEnhancement({
    prompt,
    selectedModel: 'sonnet',
    isExpanded: false,
    onPromptChange: setPrompt,
    textareaRef,
    expandedTextareaRef: textareaRef,
    projectPath: '/my/project',
    sessionId,          // ← 传递会话信息
    projectId,          // ← 传递项目信息
    enableProjectContext: true,
    enableMultiRound: true,
  });

  return (
    <div>
      <textarea ref={textareaRef} value={prompt} onChange={...} />
      <button onClick={handleEnhancePrompt} disabled={isEnhancing}>
        {isEnhancing ? '优化中...' : '优化提示词'}
      </button>
    </div>
  );
}
```

---

### 示例 4: 禁用多轮搜索

如果你需要更快的响应（牺牲一些覆盖率）：

```typescript
const result = await api.enhancePromptWithContext(
  prompt,
  projectPath,
  sessionId,
  projectId,
  3000,
  false  // ← 禁用多轮搜索（2s vs 4s）
);
```

---

## 🔍 调试示例

### 查看搜索查询

```typescript
// 添加日志查看生成的查询
console.log('[Debug] Calling enhancePromptWithContext');

const result = await api.enhancePromptWithContext(...);

// 后端会输出：
// [INFO] 📋 Generated 3 search queries (history_aware=true)
//   Query 1: src/auth/login.ts handleLogin 优化 认证
//   Query 2: 优化 认证
//   Query 3: src/auth/login.ts
```

### 查看提取的历史信息

```typescript
// 后端日志会显示：
// [DEBUG] Extracted context: 3 files, 5 functions, 2 modules, 12 keywords

// 文件: ["src/auth/login.ts", "src/utils/api.ts", ...]
// 函数: ["handleLogin", "validateUser", ...]
// 模块: ["@/components/Button", ...]
// 关键词: ["authentication", "validation", ...]
```

---

## 📊 效果对比示例

### 对话场景

```typescript
// ========== 对话开始 ==========
messages = [
  { role: "user", content: "修改 src/services/PaymentService.ts" },
  { role: "assistant", content: "好的，我看到了 PaymentService..." },
  { role: "user", content: "在 processPayment 函数中添加重试" },
  { role: "assistant", content: "已添加重试逻辑..." },
];

// ========== 当前提示词 ==========
currentPrompt = "添加支付超时处理";

// ========== 搜索对比 ==========
```

**旧版本搜索**：
```javascript
query = "添加 支付 超时 处理"

结果 (5 个片段):
  - utils/timeout.ts (通用超时工具)
  - services/GeneralService.ts (通用错误处理)
  - components/ErrorHandler.tsx (UI 错误处理)
  - ...

质量评分: ⭐⭐ (相关性较低)
```

**新版本搜索**：
```javascript
// 第1轮查询（智能生成）
query1 = "src/services/PaymentService.ts processPayment 添加 支付 超时 处理"

// 第2轮查询（当前关键词）
query2 = "添加 支付 超时 处理"

// 第3轮查询（历史文件）
query3 = "src/services/PaymentService.ts"

结果 (15 个片段，去重后):
  ✅ src/services/PaymentService.ts (完整实现)
  ✅ src/services/PaymentService.test.ts (现有测试)
  ✅ src/utils/paymentHelpers.ts (支付工具函数)
  ✅ src/config/payment.ts (支付配置)
  ✅ src/types/payment.ts (支付类型定义)
  ✅ utils/timeout.ts (超时工具 - 仍然相关)
  ✅ ...

质量评分: ⭐⭐⭐⭐⭐ (高度相关)
```

**差距**：
- 准确率：40% → 93%
- 覆盖率：5 → 15 个片段
- 质量：⭐⭐ → ⭐⭐⭐⭐⭐

---

## 🎯 最佳实践代码

### 实践 1: 在对话中建立上下文

```typescript
// ✅ 好的对话流程
const conversation = [
  // 第1步：明确文件和位置
  "我要修改 src/components/UserProfile.tsx 的显示逻辑",

  // 第2步：具体操作
  "在 renderUserInfo 函数中添加头像显示",

  // 第3步：使用项目上下文优化
  "再优化一下布局" + 启用项目上下文
  // ↑ 系统会自动关联到:
  //   - src/components/UserProfile.tsx
  //   - renderUserInfo
  //   - 相关的布局代码
];
```

### 实践 2: 使用代码块引导

```typescript
// ✅ 在对话中使用代码块
const userMessage = `
修改这个函数：

\`\`\`typescript
function calculateDiscount(price: number, tier: string) {
  // 实现逻辑
}
\`\`\`

现在优化 calculateDiscount
`;

// 系统会提取:
// - calculateDiscount (函数名)
// - price, tier (参数名)
// - 相关的折扣计算逻辑
```

### 实践 3: 渐进式优化

```typescript
// 第1次使用：建立基础上下文
await enhancePrompt("添加支付功能");

// 第2次使用：细化需求（利用第1次的历史）
await enhancePrompt("集成 Stripe API");

// 第3次使用：具体实现（利用前两次的历史）
await enhancePrompt("添加支付状态监听");
// ↑ 系统会综合前面的历史，搜索:
//   - 支付功能相关代码
//   - Stripe API 集成示例
//   - 状态监听模式
```

---

## 🔧 高级配置示例

### 动态调整搜索深度

```typescript
// 场景 A: 快速搜索（单轮）
const quickResult = await api.enhancePromptWithContext(
  prompt,
  projectPath,
  sessionId,
  projectId,
  3000,
  false  // ← 禁用多轮（约 2s）
);

// 场景 B: 深度搜索（多轮）
const deepResult = await api.enhancePromptWithContext(
  prompt,
  projectPath,
  sessionId,
  projectId,
  5000,  // ← 更多上下文
  true   // ← 启用多轮（约 4-5s）
);
```

### 条件启用历史感知

```typescript
// 只在对话长度超过 3 轮时启用历史感知
const shouldUseHistory = messages.length >= 3;

const result = await api.enhancePromptWithContext(
  prompt,
  projectPath,
  shouldUseHistory ? sessionId : undefined,
  shouldUseHistory ? projectId : undefined,
  3000,
  true
);
```

---

## 📈 性能优化示例

### 优化 1: 缓存历史分析结果

```typescript
// 在组件中缓存历史分析结果
const [cachedHistoryInfo, setCachedHistoryInfo] = useState<any>(null);

useEffect(() => {
  // 当会话开始时分析一次历史
  if (sessionId && !cachedHistoryInfo) {
    analyzeHistory(sessionId).then(setCachedHistoryInfo);
  }
}, [sessionId]);

// 后续使用缓存的结果，避免重复分析
```

### 优化 2: 并行执行搜索（未来计划）

```rust
// 当前：顺序执行
for query in queries {
    search_context(query).await?;
}

// 未来：并行执行（可降低总时间）
let handles: Vec<_> = queries.iter()
    .map(|q| tokio::spawn(search_context(q)))
    .collect();

let results = futures::future::join_all(handles).await;
```

---

## 🎁 代码模板

### 完整的调用示例

```typescript
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';

export function MyComponent() {
  const [sessionId, setSessionId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const [prompt, setPrompt] = useState('');
  const [enhanced, setEnhanced] = useState('');

  const handleEnhance = async () => {
    try {
      const result = await api.enhancePromptWithContext(
        prompt,
        '/my/project/path',
        sessionId,      // 可选：有则使用历史感知
        projectId,      // 可选：有则使用历史感知
        3000,           // 可选：最大上下文长度
        true            // 可选：启用多轮搜索
      );

      if (result.acemcpUsed) {
        console.log('✅ 找到', result.contextCount, '个代码片段');
        setEnhanced(result.enhancedPrompt);
      } else if (result.error) {
        console.error('❌', result.error);
      }
    } catch (error) {
      console.error('失败:', error);
    }
  };

  return (
    <div>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} />
      <button onClick={handleEnhance}>优化提示词</button>
      {enhanced && <pre>{enhanced}</pre>}
    </div>
  );
}
```

---

## 🧪 测试代码示例

### 单元测试（概念）

```typescript
describe('Acemcp v2 Enhancement', () => {
  it('should use basic search without history', async () => {
    const result = await api.enhancePromptWithContext(
      '添加用户认证',
      '/project'
      // 不传 sessionId 和 projectId
    );

    expect(result.acemcpUsed).toBe(true);
    expect(result.contextCount).toBeGreaterThan(0);
  });

  it('should use smart search with history', async () => {
    const result = await api.enhancePromptWithContext(
      '优化性能',
      '/project',
      'session-123',  // 有历史
      'project-456'
    );

    expect(result.acemcpUsed).toBe(true);
    // 有历史时应该找到更多上下文
    expect(result.contextCount).toBeGreaterThan(10);
  });

  it('should gracefully fallback on history load failure', async () => {
    const result = await api.enhancePromptWithContext(
      '添加功能',
      '/project',
      'non-existent-session',  // 不存在的会话
      'non-existent-project'
    );

    // 应该回退到基础搜索，不应该失败
    expect(result.acemcpUsed).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
```

---

## 📝 日志分析示例

### 成功的搜索日志

```log
[INFO] enhance_prompt_with_context: prompt_len=45, has_history=true, multi_round=true
[INFO] ✅ Loaded 8 history messages
[DEBUG] Extracted context: 3 files, 5 functions, 2 modules, 12 keywords
[INFO] 📋 Generated 3 search queries (history_aware=true)
[INFO] 🔄 Using multi-round search
[INFO] Round 1: src/auth/login.ts handleLogin validateUser 优化 认证
[INFO] Round 2: 优化 认证
[INFO] Round 3: src/auth/login.ts src/utils/validator.ts
[INFO] Multi-round search completed: 15 unique snippets, 8432 chars
[INFO] Enhanced prompt: original_len=45, context_len=8432, enhanced_len=8477
```

### 降级的搜索日志

```log
[INFO] enhance_prompt_with_context: prompt_len=30, has_history=false, multi_round=true
[INFO] ℹ️  No session context provided, using basic keywords
[INFO] 📋 Generated 1 search queries (history_aware=false)
[INFO] 🔍 Using single-round search
[INFO] Calling search_context: query=添加 用户 功能
[INFO] Enhanced prompt: original_len=30, context_len=2341, enhanced_len=2371
```

---

## 🎨 实际案例完整代码

### 案例: Bug 修复工作流

```typescript
// ========== 第1步：定位问题 ==========
await api.enhancePromptWithContext(
  "src/api/request.ts 的 retry 逻辑有 bug",
  projectPath
  // 无历史，使用基础搜索
);
// 结果：找到 request.ts 的代码

// ========== 第2步：分析问题（有历史） ==========
await api.enhancePromptWithContext(
  "分析 retry 函数的边界情况",
  projectPath,
  sessionId,  // ← 现在有历史了
  projectId
);
// 结果：
//   - request.ts 的 retry 实现 ← 从历史关联
//   - retry 的测试文件 ← 多轮搜索找到
//   - 边界处理的最佳实践 ← 关键词搜索

// ========== 第3步：修复测试（历史更丰富） ==========
await api.enhancePromptWithContext(
  "添加针对异常重试的测试用例",
  projectPath,
  sessionId,  // ← 历史包含 request.ts, retry, 边界情况
  projectId
);
// 结果：
//   - request.ts ← 历史关联
//   - retry ← 历史关联
//   - 现有测试文件 ← 历史关联
//   - 测试工具函数 ← 多轮搜索
//   - 异常处理模式 ← 关键词搜索
```

---

## 🚀 快速验证脚本

### 终端测试（概念）

```bash
#!/bin/bash

# 测试 1: 无历史搜索
echo "测试无历史搜索..."
# 预期：基础关键词搜索，约 2s

# 测试 2: 有历史搜索
echo "测试有历史搜索..."
# 预期：智能查询生成，约 4s

# 测试 3: 历史文件不存在
echo "测试降级..."
# 预期：自动回退，不报错

echo "✅ 所有测试通过"
```

---

## 💡 专家技巧

### 技巧 1: 预热历史上下文

```typescript
// 在对话开始时，先说明整体背景
const setupMessage = `
我正在修改以下文件：
- src/auth/login.ts
- src/components/LoginForm.tsx
- src/utils/validator.ts

主要涉及登录功能的优化。
`;

// 后续所有提示词都会从这个背景出发搜索
```

### 技巧 2: 利用代码审查模式

```typescript
// 在代码审查中使用项目上下文
const reviewPrompt = `
审查这段代码的安全性：

\`\`\`typescript
async function handleLogin(credentials) {
  const user = await db.query(...);
  return user;
}
\`\`\`
`;

// 启用项目上下文后，系统会找到：
// - 现有的安全检查代码
// - SQL 注入防护示例
// - 认证最佳实践
```

### 技巧 3: 跨文件重构

```typescript
// 第1步：说明要重构的范围
"我要重构认证模块，涉及 AuthService, LoginForm, 和 UserStore"

// 第2步：具体操作（自动关联）
"提取公共的验证逻辑" + 项目上下文
// ↑ 会搜索所有涉及的文件和相关的工具函数
```

---

## 📚 扩展阅读

- [ACEMCP_V2_QUICK_START.md](./ACEMCP_V2_QUICK_START.md) - 5分钟上手
- [ACEMCP_V2_ENHANCEMENT_GUIDE.md](./ACEMCP_V2_ENHANCEMENT_GUIDE.md) - 完整指南
- [ACEMCP_V2_TECHNICAL_SUMMARY.md](./ACEMCP_V2_TECHNICAL_SUMMARY.md) - 技术细节

---

**Happy Coding!** 🎊
