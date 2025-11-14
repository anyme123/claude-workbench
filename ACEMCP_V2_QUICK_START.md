# Acemcp v2 快速上手指南

## 🚀 5 分钟了解新功能

### 什么变了？

#### ✅ 改进 1: 历史上下文感知
**之前**：只分析当前提示词
**现在**：分析对话历史 + 当前提示词

**实际效果**：
```
对话历史：
  "修改 src/auth/login.ts 的 handleLogin 函数"
  "添加了错误处理逻辑"

当前提示词：
  "再添加重试机制"

搜索查询：
  旧版：❌ "添加 重试 机制"（找不到相关代码）
  新版：✅ "src/auth/login.ts handleLogin 添加 重试 机制"（精准定位）
```

#### ✅ 改进 2: 多轮搜索
**之前**：单次搜索
**现在**：3轮搜索 + 自动去重

**实际效果**：
```
第1轮：智能查询（历史+当前）→ 找到 5 个代码片段
第2轮：当前关键词        → 找到 3 个新片段
第3轮：历史文件路径      → 找到 2 个新片段
------------------------------------------------------
结果：10 个不重复的代码片段（覆盖更全面）
```

---

## 📖 使用方法

### 方式 1: 自动使用（推荐）

**无需任何修改！** 只要：
1. 在有对话历史的会话中
2. 启用"启用项目上下文"开关
3. 点击优化提示词

✅ 系统会自动：
- 检测是否有历史
- 读取并分析历史
- 生成智能查询
- 执行多轮搜索

---

### 方式 2: 手动传递会话信息

如果你在自定义代码中使用 API：

```typescript
import { api } from '@/lib/api';

// 调用增强 API
const result = await api.enhancePromptWithContext(
  "优化登录功能",           // 提示词
  "/path/to/project",      // 项目路径
  "session-uuid-123",      // 🆕 会话 ID（可选）
  "project-id-456",        // 🆕 项目 ID（可选）
  3000,                    // 最大上下文长度
  true                     // 🆕 启用多轮搜索
);

console.log('找到', result.contextCount, '个上下文');
```

---

## 🎯 最佳实践

### ✅ DO - 这样做效果更好

1. **明确提及文件路径**
   ```
   ✅ "修改 src/components/Header.tsx"
   ✅ "在 utils/api.ts 中添加..."
   ```

2. **使用具体的函数名**
   ```
   ✅ "handleSubmit 函数需要优化"
   ✅ "processPayment 方法有 bug"
   ```

3. **在对话中使用代码块**
   ````markdown
   ```typescript
   function calculateTotal() { ... }
   ```
   现在优化 calculateTotal
   ````

4. **保持对话连贯性**
   ```
   User: "修改 UserService"
   User: "再添加缓存" ← 会关联到 UserService
   ```

### ❌ DON'T - 避免这些做法

1. **过于模糊的引用**
   ```
   ❌ "修改那个文件"
   ❌ "优化一下代码"
   ```

2. **跳跃式对话**
   ```
   ❌ User: "修改支付逻辑"
   ❌ User: "添加登录功能" ← 跨度太大
   ❌ User: "再优化性能" ← 不知道优化什么
   ```

---

## 📊 实际案例

### 案例 1: Bug 修复

```
1️⃣ User: "src/api/request.ts 的 retry 逻辑有问题"

2️⃣ AI: (分析并修复代码)

3️⃣ User: "测试一下边界情况" + 启用项目上下文

   系统自动搜索：
   ✅ "src/api/request.ts retry 测试 边界"

   找到：
   ✅ src/api/request.ts (retry 实现)
   ✅ src/__tests__/api.test.ts (现有测试)
   ✅ src/utils/testHelpers.ts (测试工具)

4️⃣ 结果：AI 能看到完整的测试上下文，给出更好的建议
```

---

### 案例 2: 功能开发

```
1️⃣ User: "在 UserDashboard 添加图表"

2️⃣ AI: (实现图表组件)

3️⃣ User: "让图表响应式" + 启用项目上下文

   系统自动搜索：
   ✅ "UserDashboard 图表 响应式 布局"

   找到：
   ✅ src/components/UserDashboard.tsx (当前组件)
   ✅ src/hooks/useResponsive.ts (响应式 hook)
   ✅ src/styles/responsive.css (响应式样式)

4️⃣ 结果：AI 能看到现有的响应式方案，保持代码一致性
```

---

## 🔍 调试技巧

### 查看搜索过程

**浏览器控制台**：
```javascript
[getProjectContext] Has session info: { sessionId: "...", projectId: "..." }
✅ Loaded 8 history messages
Generated 3 search queries
🔄 Using multi-round search
```

**应用日志**：
```
[INFO] ✅ Loaded 8 history messages for smart query generation
[DEBUG] Extracted context: 3 files, 5 functions, 2 modules, 12 keywords
[INFO] 📋 Generated 3 search queries (history_aware=true)
[INFO] Round 1: searching with query: ...
[INFO] Round 2: searching with query: ...
[INFO] Round 3: searching with query: ...
[INFO] Multi-round search completed: 15 unique snippets
```

---

## ⚙️ 配置调优

### 调整历史读取数量

如果对话历史特别长，可以调整读取数量：

```rust
// src-tauri/src/commands/acemcp.rs:714
match load_recent_history(sid, pid, 10).await {
                                    // ↑ 改成 15 或 20
```

### 调整搜索轮数

```rust
// src-tauri/src/commands/acemcp.rs:720-730
let queries = vec![
    smart_query.clone(),              // 第1轮
    extract_keywords(&prompt),        // 第2轮
    history_info.file_paths.join(),   // 第3轮
    // 添加第4轮、第5轮...
];
```

### 调整提取数量

```rust
// src-tauri/src/commands/acemcp.rs:247-262
.take(3)  // 文件路径：3 → 5
.take(5)  // 函数名：5 → 10
.take(5)  // 关键词：5 → 10
```

---

## 💡 小技巧

### 技巧 1: 强制触发历史搜索
即使在新会话，也可以通过提及具体代码来触发精准搜索：

```
User: "我要修改 src/auth/login.ts 的 handleLogin 函数"
User: "现在优化这个函数" + 项目上下文
      ↑ 系统会提取 src/auth/login.ts 和 handleLogin
```

### 技巧 2: 利用代码块引导搜索
在代码块中提及关键标识符：

````markdown
```typescript
interface UserProfile {
  id: string;
  name: string;
  avatar: string;
}
```

现在扩展 UserProfile 接口 ← 会关联到接口定义
````

### 技巧 3: 组合使用对话上下文和项目上下文
```
1. 先聊几轮，让 AI 理解需求
2. 再启用项目上下文，获取精准的代码片段
3. 结合两者，得到最佳结果
```

---

## 🎁 额外福利

### 向后兼容
✅ 所有旧代码无需修改，新参数都是可选的

### 自动降级
✅ 如果历史读取失败，自动回退到基础搜索

### 性能友好
✅ 历史读取很快（<100ms），多轮搜索可控（2-5s）

---

## 🙋 需要帮助？

查看完整文档：
- [ACEMCP_V2_ENHANCEMENT_GUIDE.md](./ACEMCP_V2_ENHANCEMENT_GUIDE.md) - 详细使用指南
- [ACEMCP_V2_TECHNICAL_SUMMARY.md](./ACEMCP_V2_TECHNICAL_SUMMARY.md) - 技术实现细节

---

**开始享受更智能的上下文搜索吧！** 🎊
