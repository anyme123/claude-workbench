# Codex AGENTS.md 前端集成文档

## 概述

已完成 Codex AGENTS.md 系统提示词管理功能的前端集成，用户现在可以通过图形界面查看和编辑 Codex 系统提示词配置。

## 实现的功能

### 1. API 层封装 ✅

**文件:** `src/lib/api.ts`

添加了两个新的 API 方法：

```typescript
// 读取 AGENTS.md
async getCodexSystemPrompt(): Promise<string>

// 保存 AGENTS.md
async saveCodexSystemPrompt(content: string): Promise<string>
```

**特性:**
- 完整的错误处理
- 详细的控制台日志
- 类型安全的返回值

### 2. UI 组件 ✅

**文件:** `src/components/CodexMarkdownEditor.tsx`

专门的 Codex 系统提示词编辑器组件。

**功能特性:**
- ✅ 实时 Markdown 编辑预览
- ✅ 加载状态指示器
- ✅ 错误处理和友好提示
- ✅ Codex 未安装检测和引导
- ✅ 未保存更改提醒
- ✅ Toast 通知反馈
- ✅ 响应式设计
- ✅ 深色模式适配

**错误处理:**
- 检测 Codex 目录不存在
- 显示安装引导信息
- 区分不同类型的错误
- 提供清晰的错误信息

### 3. 路由集成 ✅

**文件:** `src/components/layout/ViewRouter.tsx`

添加了 `codex-editor` 视图路由：

```typescript
case "codex-editor":
  return (
    <div className="flex-1 overflow-hidden">
      <CodexMarkdownEditor onBack={goBack} />
    </div>
  );
```

### 4. 导航菜单 ✅

**文件:** `src/components/layout/Sidebar.tsx`

在左侧导航栏添加了新的导航项：

```typescript
{
  view: 'codex-editor',
  icon: FileCode,
  label: 'Codex 提示词'
}
```

**视觉效果:**
- 使用 `FileCode` 图标（代码文件图标）
- 与其他导航项保持一致的样式
- 活动状态突出显示
- Tooltip 提示

### 5. 类型定义 ✅

**文件:** `src/types/navigation.ts`

更新了导航视图类型定义：

```typescript
export type View =
  | "projects"
  | "editor"           // Claude 提示词
  | "codex-editor"     // Codex 提示词 (新增)
  | "claude-file-editor"
  // ... 其他视图
```

## 用户界面流程

### 访问 Codex 系统提示词编辑器

1. **通过侧边栏导航**
   - 点击左侧导航栏的 "Codex 提示词" 按钮
   - 图标：文件代码图标（FileCode）

### 编辑流程

1. **加载阶段**
   - 显示加载动画
   - 自动读取 `~/.codex/AGENTS.md`
   - 如果 Codex 未安装，显示友好提示

2. **编辑阶段**
   - 使用 Markdown 编辑器
   - 实时预览
   - 自动检测更改

3. **保存阶段**
   - 点击"保存"按钮
   - 显示保存进度
   - Toast 通知保存结果

4. **退出检查**
   - 有未保存更改时提示用户确认
   - 防止意外丢失内容

## 错误处理场景

### 场景 1: Codex 未安装

**表现:**
```
⚠️ 未找到 Codex 目录。请确保已安装 Codex CLI。

Codex CLI 安装后会自动创建 ~/.codex 目录。
请访问 Codex 官网下载并安装 CLI 工具。
```

**处理:**
- 禁用保存按钮
- 显示安装引导信息
- 使用警告色（橙色）

### 场景 2: 文件读取失败

**表现:**
```
❌ 无法加载 AGENTS.md 文件
```

**处理:**
- 显示错误信息
- 提供重试选项

### 场景 3: 文件保存失败

**表现:**
```
❌ 保存 AGENTS.md 失败: [错误详情]
```

**处理:**
- Toast 错误通知
- 保留用户编辑内容
- 允许重试保存

## 技术特点

### 1. 架构设计

- **组件复用**: 参考 MarkdownEditor 设计，保持一致性
- **类型安全**: 完整的 TypeScript 类型定义
- **错误边界**: 完善的错误处理机制

### 2. 用户体验

- **响应式布局**: 适配各种屏幕尺寸
- **流畅动画**: Framer Motion 动画效果
- **即时反馈**: Toast 通知和状态指示
- **智能提示**: 根据不同错误提供对应引导

### 3. 代码质量

- **命名规范**: 清晰的函数和变量命名
- **代码注释**: 完整的 JSDoc 注释
- **错误日志**: 详细的控制台日志
- **编译检查**: 通过 TypeScript 编译验证

## 测试验证

### TypeScript 编译 ✅

```bash
npx tsc --noEmit --project tsconfig.json
# ✅ 无错误，无警告
```

### Git 提交 ✅

**提交记录:**
- `e4c4bd7` - feat: 前端集成 Codex AGENTS.md 系统提示词管理功能

**修改文件:**
- `src/lib/api.ts` - API 封装
- `src/components/CodexMarkdownEditor.tsx` - 新组件（261行）
- `src/components/layout/ViewRouter.tsx` - 路由集成
- `src/components/layout/Sidebar.tsx` - 导航菜单
- `src/types/navigation.ts` - 类型定义

## 使用说明

### 开发环境

1. **启动开发服务器:**
   ```bash
   npm run dev
   ```

2. **构建生产版本:**
   ```bash
   npm run build
   ```

### 生产部署

前端代码已完全集成，与后端 API 无缝配合：

- **后端 API:** `get_codex_system_prompt` / `save_codex_system_prompt`
- **前端路由:** `/codex-editor`
- **导航入口:** 左侧边栏 "Codex 提示词"

## 后续优化建议

### 1. 功能增强

- [ ] 添加模板系统，提供常用提示词模板
- [ ] 支持版本历史和回滚
- [ ] 添加语法高亮和智能补全
- [ ] 支持导入导出功能

### 2. 用户体验

- [ ] 添加快捷键支持（Ctrl+S 保存）
- [ ] 实现自动保存草稿
- [ ] 优化大文件编辑性能
- [ ] 添加搜索和替换功能

### 3. 多语言支持

- [ ] 添加英文界面翻译
- [ ] 国际化错误信息
- [ ] 支持多语言切换

## 依赖关系

### 核心依赖

- `@uiw/react-md-editor` - Markdown 编辑器
- `framer-motion` - 动画效果
- `lucide-react` - 图标库
- `@tauri-apps/api` - Tauri API 绑定

### 组件依赖

- `Button` - 按钮组件
- `Toast` - 通知组件
- `Card` - 卡片组件

## 兼容性

- ✅ Windows 10/11
- ✅ macOS 10.15+
- ✅ Linux (主流发行版)

## 问题排查

### 问题 1: 无法加载 AGENTS.md

**原因:** Codex CLI 未安装或目录不存在

**解决:**
1. 访问 Codex 官网下载 CLI
2. 完成安装后目录会自动创建
3. 刷新页面重试

### 问题 2: 保存失败

**原因:** 文件权限问题或磁盘空间不足

**解决:**
1. 检查 `~/.codex` 目录权限
2. 确保有足够的磁盘空间
3. 查看控制台日志获取详细错误

### 问题 3: 界面显示异常

**原因:** 浏览器缓存或构建问题

**解决:**
1. 清除浏览器缓存
2. 重新构建项目
3. 检查开发者控制台错误

## 总结

Codex AGENTS.md 前端集成已完全实现，提供了：

- ✅ 完整的读写功能
- ✅ 友好的用户界面
- ✅ 智能的错误处理
- ✅ 一致的用户体验
- ✅ 可维护的代码质量

用户现在可以通过图形界面轻松管理 Codex 系统提示词，无需手动编辑配置文件。
