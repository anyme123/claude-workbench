# 提示词优化功能修复 - 测试指南

## 修复完成状态

✅ **构建成功**
- 修复文件：`src-tauri/src/commands/claude.rs` (enhance_prompt 函数)
- 修复文件：`src-tauri/src/commands/acemcp.rs` (enhance_prompt_with_context 函数)
- 构建时间：1分44秒
- 输出文件：
  - `src-tauri/target/release/claude-workbench.exe`
  - `src-tauri/target/release/bundle/msi/Claude Workbench_4.1.3_x64_en-US.msi`
  - `src-tauri/target/release/bundle/nsis/Claude Workbench_4.1.3_x64-setup.exe`

## 测试准备

### 1. 安装修复后的版本

#### 方式一：直接运行 EXE
```bash
cd C:\Users\Administrator\Desktop\claude-workbench\src-tauri\target\release
.\claude-workbench.exe
```

#### 方式二：安装 MSI（推荐）
```bash
# 安装
start C:\Users\Administrator\Desktop\claude-workbench\src-tauri\target\release\bundle\msi\Claude Workbench_4.1.3_x64_en-US.msi
```

### 2. 确保 Claude  Code CLI 已安装并登录

```bash
# 检查 Claude  Code CLI
claude --version

# 如果未登录，先登录
claude auth login
```

## 测试用例

### 测试用例 1：正常长度提示词 ✅

**目的**：验证基本功能正常工作

**步骤**：
1. 打开 Claude Workbench
2. 在提示词输入框中输入：
   ```
   帮我写一个 React 组件，用于显示用户列表
   ```
3. 点击提示词优化按钮（使用 Claude  Code CLI）
4. 观察结果

**预期结果**：
- ✅ 提示词被成功优化
- ✅ 优化后的提示词更清晰、更结构化
- ✅ 没有错误提示

---

### 测试用例 2：超长提示词（自动截断）⚠️

**目的**：验证长度验证和自动截断功能

**步骤**：
1. 创建一个超过 50,000 字符的提示词（可以重复文本）
2. 尝试优化这个提示词
3. 观察日志和结果

**预期结果**：
- ⚠️ 提示词被自动截断到 50,000 字符
- ⚠️ 显示提示信息："[提示词过长，已自动截断]"
- ✅ 程序不会崩溃
- ✅ 返回优化后的截断版本

**如何生成测试数据**：
```javascript
// 在浏览器控制台执行
const longPrompt = "这是一个很长的提示词。".repeat(10000);
console.log(longPrompt.length); // 应该超过 50,000
// 复制这个内容到提示词输入框
```

---

### 测试用例 3：超长上下文（动态调整）⚠️

**目的**：验证上下文截断功能

**步骤**：
1. 在设置中将上下文配置调整为：
   - 最大消息数量：50 条
   - 助手消息最大长度：5000 字符
   - 用户消息最大长度：2000 字符
2. 进行多轮对话，生成大量上下文
3. 尝试优化一个新的提示词

**预期结果**：
- ⚠️ 上下文被自动截断到 30,000 字符
- ⚠️ 显示提示信息："[上下文过长，已自动截断]"
- ✅ 程序不会崩溃
- ✅ 优化功能正常工作

---

### 测试用例 4：总长度超限（友好错误）❌

**目的**：验证总长度超限时的错误提示

**步骤**：
1. 准备一个接近 50,000 字符的提示词
2. 同时设置大量上下文（最大消息数量：50）
3. 启用项目上下文（maxContextLength：3000）
4. 尝试优化

**预期结果**：
- ❌ 显示友好的错误信息：
  ```
  输入内容过长（XXX 字符），即使截断后仍超过限制（100,000 字符）。

  建议：
  1. 减少提示词长度（当前：XXX 字符）
  2. 在设置中调低上下文提取数量
  3. 使用更简洁的描述
  ```
- ✅ 程序不会崩溃
- ✅ 用户可以根据提示调整设置

---

### 测试用例 5：项目上下文过长（acemcp）⚠️

**目的**：验证 acemcp 的动态调整功能

**步骤**：
1. 选择一个大型项目（例如有很多文件的代码库）
2. 启用项目上下文
3. 输入一个技术性的提示词（例如："如何优化数据库查询性能？"）
4. 尝试优化

**预期结果**：
- ⚠️ acemcp 返回的上下文被动态调整
- ⚠️ 可能显示："[上下文已自动调整以适应长度限制]"
- ✅ 程序不会崩溃
- ✅ 返回包含项目上下文的优化结果

---

### 测试用例 6：Claude API 错误处理 ❌

**目的**：验证详细的错误解析功能

**步骤**：
1. **模拟 context_length_exceeded 错误**：
   - 使用测试用例 4 的设置
   - 如果真的触发了 context_length 错误

2. **模拟认证错误**：
   - 退出 Claude  Code CLI：`claude auth logout`
   - 尝试优化提示词

**预期结果**：

**Context Length 错误**：
```
输入内容超过模型上下文窗口限制。

当前输入：XXX 字符（约 XXX tokens）

解决方案：
1. 减少提示词长度
2. 在设置中降低「最大消息数量」
3. 禁用「包含执行结果」选项
4. 关闭「项目上下文」开关

技术细节：[具体错误信息]
```

**认证错误**：
```
Claude API 认证失败。

请检查：
1. 是否已登录 Claude  Code CLI（运行 'claude auth login'）
2. API 密钥是否有效
3. 账户是否有足够的额度

错误详情：[具体错误信息]
```

---

### 测试用例 7：第三方 API 优化（对比测试）

**目的**：验证第三方 API 的相同保护机制

**步骤**：
1. 在设置中配置一个第三方 API（例如 Deepseek）
2. 使用超长提示词测试
3. 观察错误处理

**预期结果**：
- ✅ 第三方 API 调用也应该有类似的保护
- ✅ 错误提示应该清晰明确

---

## 性能测试

### 1. 响应时间测试

测试不同长度提示词的优化时间：

| 提示词长度 | 预期时间 |
|-----------|---------|
| 100 字符 | < 5秒 |
| 1,000 字符 | < 10秒 |
| 10,000 字符 | < 20秒 |
| 50,000 字符（最大） | < 30秒 |

### 2. 内存占用测试

在任务管理器中观察：
- 正常情况：< 200MB
- 处理超长输入：< 500MB

### 3. 并发测试

同时打开多个优化任务，验证：
- ✅ 不会相互干扰
- ✅ 所有任务都能正常完成或返回合适的错误

---

## 日志检查

### 查看日志文件

日志位置（Windows）：
```
%APPDATA%\claude-workbench\logs\
```

### 关键日志项

**正常优化**：
```
[INFO] Enhancement request prepared: prompt=100 chars, context=500 chars, total=1200 chars
[INFO] Successfully enhanced prompt: 100 -> 150 chars
```

**截断警告**：
```
[WARN] Prompt too long (60000 chars), truncating to 50000 chars
[WARN] Content was truncated: prompt=true, context=false
```

**错误日志**：
```
[ERROR] Total request length (120000 chars) exceeds maximum allowed (100000)
[ERROR] Claude  Code command failed: context_length_exceeded
```

---

## 回滚方案

如果修复后出现问题，可以回滚：

```bash
cd C:\Users\Administrator\Desktop\claude-workbench\src-tauri\src\commands

# 恢复原始版本
cp claude.rs.backup claude.rs

# 重新构建
cd ../..
npm run tauri build
```

---

## 问题报告

如果在测试中发现问题，请记录：

1. **问题描述**
2. **复现步骤**
3. **预期行为 vs 实际行为**
4. **日志片段**
5. **系统信息**（Windows 版本、内存等）

---

## 成功指标

修复被认为成功的标准：

✅ **稳定性**
- [ ] 无论输入多长，程序都不会崩溃
- [ ] 所有错误都有友好的提示信息

✅ **功能性**
- [ ] 正常长度的提示词可以成功优化
- [ ] 超长输入被正确截断并优化
- [ ] 项目上下文功能正常工作

✅ **用户体验**
- [ ] 错误信息清晰，包含解决建议
- [ ] 自动截断时有明确提示
- [ ] 响应时间合理

✅ **日志质量**
- [ ] 关键操作都有日志记录
- [ ] 错误日志包含足够的调试信息

---

## 总结

- **修复时间**：约 2 小时
- **修复范围**：2 个函数，共约 300 行代码改动
- **新增功能**：
  - 多级长度验证
  - 智能截断机制
  - 详细错误解析
  - 友好的用户提示
- **向后兼容**：是（不影响现有功能）
- **性能影响**：最小（仅增加少量长度检查）

---

**测试人员**: ___________
**测试日期**: ___________
**测试结果**: [ ] 通过 / [ ] 需要改进
**备注**: _____________________
