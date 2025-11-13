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

// ==================== 系统信息类 ====================
export { SystemReminderWidget } from './system/SystemReminderWidget';
export type { SystemReminderWidgetProps } from './system/SystemReminderWidget';

// ==================== 命令执行类 ====================
export { CommandWidget } from './execution/CommandWidget';
export type { CommandWidgetProps } from './execution/CommandWidget';

// ==================== 待迁移组件 ====================
// 以下组件尚未迁移，仍从 ToolWidgets.tsx 导入
// TODO: 逐步迁移以下组件到新的目录结构
export {
  // Todo 管理
  TodoWidget,
  TodoReadWidget,

  // 文件操作
  ReadWidget,
  ReadResultWidget,
  WriteWidget,
  EditWidget,
  EditResultWidget,
  MultiEditWidget,
  MultiEditResultWidget,

  // 搜索
  LSWidget,
  LSResultWidget,
  GrepWidget,
  GlobWidget,

  // 命令执行
  BashWidget,
  BashOutputWidget,
  CommandOutputWidget,

  // Web 工具
  WebSearchWidget,
  WebFetchWidget,

  // MCP 工具
  MCPWidget,

  // 系统信息
  SystemInitializedWidget,
  SummaryWidget,
  ThinkingWidget,

  // 子代理
  TaskWidget,
} from '../ToolWidgets';
