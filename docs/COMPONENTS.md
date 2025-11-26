# UI 组件库文档

本文档介绍了 Claude Code 项目中使用的主要 UI 组件及其用法。

## 基础组件 (src/components/ui)

### Button

现代化的按钮组件，支持多种变体和尺寸。

**用法:**

```tsx
import { Button } from "@/components/ui/button";

<Button variant="default" size="default" onClick={handleClick}>
  点击我
</Button>
```

**Props:**

*   `variant`: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
*   `size`: "default" | "sm" | "lg" | "icon" | "icon-sm" | "icon-lg"

### Input

简洁的输入框组件。

**用法:**

```tsx
import { Input } from "@/components/ui/input";

<Input placeholder="请输入..." value={value} onChange={handleChange} />
```

### Card

通用的卡片容器组件。

**用法:**

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
  </CardHeader>
  <CardContent>
    内容...
  </CardContent>
</Card>
```

### Dialog

模态对话框组件。

**用法:**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>对话框标题</DialogTitle>
    </DialogHeader>
    <div>内容...</div>
  </DialogContent>
</Dialog>
```

## 业务组件

### FloatingPromptInput

浮动提示词输入框，支持多行输入、文件选择、斜杠命令等。

**位置:** `src/components/FloatingPromptInput`

**用法:**

```tsx
import { FloatingPromptInput } from "@/components/FloatingPromptInput";

<FloatingPromptInput
  onSend={handleSend}
  isLoading={isLoading}
  projectPath={projectPath}
/>
```

### StreamMessageV2

消息渲染组件，支持多种消息类型和流式输出。

**位置:** `src/components/message/StreamMessageV2.tsx`

**用法:**

```tsx
import { StreamMessageV2 } from "@/components/message";

<StreamMessageV2
  message={message}
  isStreaming={isStreaming}
/>
```

### ProjectList

项目列表组件，支持列表/网格视图切换和骨架屏加载。

**位置:** `src/components/ProjectList.tsx`

**用法:**

```tsx
import { ProjectList } from "@/components/ProjectList";

<ProjectList
  projects={projects}
  loading={loading}
  onProjectClick={handleProjectClick}
/>
```

### MCPServerList

MCP 服务器列表组件，支持状态显示和骨架屏加载。

**位置:** `src/components/MCPServerList.tsx`

**用法:**

```tsx
import { MCPServerList } from "@/components/MCPServerList";

<MCPServerList
  servers={servers}
  loading={loading}
  onServerRemoved={handleServerRemoved}
/>
```

## 样式系统

项目使用 Tailwind CSS 和 CSS 变量构建样式系统。

*   **主题变量**: `src/styles/theme.css`
*   **排版样式**: `src/styles/typography.css`
*   **动画定义**: `src/styles/animations.css`
*   **组件样式**: `src/styles/components.css`

请参考 `src/styles/theme.css` 查看所有可用的颜色变量和设计 Token。