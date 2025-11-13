/**
 * ✅ Widgets 统一导出文件
 *
 * 提供向后兼容的导出，保持与 ToolWidgets.tsx 相同的导入路径
 *
 * 使用方式：
 * ```typescript
 * // 新的导入方式（推荐）
 * import { SystemReminderWidget } from '@/components/widgets/system';
 * import { CommandWidget } from '@/components/widgets/execution';
 *
 * // 向后兼容导入（已迁移的组件）
 * import { SystemReminderWidget, CommandWidget } from '@/components/widgets';
 *
 * // 旧的导入方式（未迁移的组件仍从 ToolWidgets.tsx 导入）
 * import { TodoWidget, GrepWidget } from '@/components/ToolWidgets';
 * ```
 */

// ==================== 通用工具 ====================
export { WidgetLayout, WidgetSection } from './common/WidgetLayout';
export { useToolTranslation } from './common/useToolTranslation';
export { getLanguage } from './common/languageDetector';

// ==================== 系统信息类 ====================
export { SystemReminderWidget } from './system/SystemReminderWidget';
export type { SystemReminderWidgetProps } from './system/SystemReminderWidget';

export { SummaryWidget } from './system/SummaryWidget';
export type { SummaryWidgetProps } from './system/SummaryWidget';

export { ThinkingWidget } from './system/ThinkingWidget';
export type { ThinkingWidgetProps } from './system/ThinkingWidget';

// ==================== 命令执行类 ====================
export { CommandWidget } from './execution/CommandWidget';
export type { CommandWidgetProps } from './execution/CommandWidget';

export { CommandOutputWidget } from './execution/CommandOutputWidget';
export type { CommandOutputWidgetProps } from './execution/CommandOutputWidget';

export { BashWidget } from './execution/BashWidget';
export type { BashWidgetProps } from './execution/BashWidget';

export { BashOutputWidget } from './execution/BashOutputWidget';
export type { BashOutputWidgetProps } from './execution/BashOutputWidget';

// ==================== 文件操作类 ====================
export { ReadWidget } from './file-operations/ReadWidget';
export type { ReadWidgetProps } from './file-operations/ReadWidget';

export { EditWidget } from './file-operations/EditWidget';
export type { EditWidgetProps } from './file-operations/EditWidget';

// ==================== 搜索类 ====================
export { LSWidget } from './search/LSWidget';
export type { LSWidgetProps } from './search/LSWidget';

export { GlobWidget } from './search/GlobWidget';
export type { GlobWidgetProps } from './search/GlobWidget';

// ==================== 任务管理类 ====================
export { TodoWidget } from './task-management/TodoWidget';
export type { TodoWidgetProps } from './task-management/TodoWidget';

// ==================== 子代理类 ====================
export { TaskWidget } from './agent/TaskWidget';
export type { TaskWidgetProps } from './agent/TaskWidget';

export { MultiEditWidget } from './agent/MultiEditWidget';
export type { MultiEditWidgetProps } from './agent/MultiEditWidget';

// ==================== 待迁移组件 ====================
// ⚠️ 以下组件尚未迁移，仍从 ToolWidgets.tsx 导入
export {
  // Todo 管理
  TodoReadWidget,

  // 文件操作
  ReadResultWidget,
  WriteWidget,
  EditResultWidget,
  MultiEditResultWidget,

  // 搜索
  LSResultWidget,
  GrepWidget,

  // Web 工具
  WebSearchWidget,
  WebFetchWidget,

  // MCP 工具
  MCPWidget,

  // 系统信息
  SystemInitializedWidget,
} from '../ToolWidgets';
