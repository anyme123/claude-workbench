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

export { WriteWidget } from './file-operations/WriteWidget';
export type { WriteWidgetProps } from './file-operations/WriteWidget';

// ==================== 搜索类 ====================
export { LSWidget } from './search/LSWidget';
export type { LSWidgetProps } from './search/LSWidget';

export { GlobWidget } from './search/GlobWidget';
export type { GlobWidgetProps } from './search/GlobWidget';

export { GrepWidget } from './search/GrepWidget';
export type { GrepWidgetProps } from './search/GrepWidget';

// ==================== 任务管理类 ====================
export { TodoWidget } from './task-management/TodoWidget';
export type { TodoWidgetProps } from './task-management/TodoWidget';

// ==================== 子代理类 ====================
export { TaskWidget } from './agent/TaskWidget';
export type { TaskWidgetProps } from './agent/TaskWidget';

export { MultiEditWidget } from './agent/MultiEditWidget';
export type { MultiEditWidgetProps } from './agent/MultiEditWidget';

// ==================== Result 组件 ====================
// Result 组件用于显示工具执行的结果
export { ReadResultWidget } from './file-operations/ReadResultWidget';
export type { ReadResultWidgetProps } from './file-operations/ReadResultWidget';

export { EditResultWidget } from './file-operations/EditResultWidget';
export type { EditResultWidgetProps } from './file-operations/EditResultWidget';

export { LSResultWidget } from './search/LSResultWidget';
export type { LSResultWidgetProps } from './search/LSResultWidget';

export { MultiEditResultWidget } from './agent/MultiEditResultWidget';
export type { MultiEditResultWidgetProps } from './agent/MultiEditResultWidget';

// ==================== Web 工具类 ====================
export { WebFetchWidget } from './web/WebFetchWidget';
export type { WebFetchWidgetProps } from './web/WebFetchWidget';

export { WebSearchWidget } from './web/WebSearchWidget';
export type { WebSearchWidgetProps } from './web/WebSearchWidget';

// ==================== MCP 工具类 ====================
export { MCPWidget } from './mcp/MCPWidget';
export type { MCPWidgetProps } from './mcp/MCPWidget';

// ==================== 系统初始化（已补充） ====================
export { SystemInitializedWidget } from './system/SystemInitializedWidget';
export type { SystemInitializedWidgetProps } from './system/SystemInitializedWidget';

// ==================== 全部组件已迁移完成！====================
// ✅ 原 ToolWidgets.tsx 的所有活跃组件已完成迁移
// ✅ 3537 行巨型文件已成功拆分为 30+ 个模块化组件
// ✅ TodoReadWidget (502行) 未在注册表使用，已跳过迁移
//
// 迁移统计：
// - 23 个组件已迁移到新目录结构
// - 平均文件大小：~100 行
// - 共享组件：3 个 (WidgetLayout, useToolTranslation, languageDetector)
// - 子组件：6 个 (SearchResults, ToolsList, CodePreview, FullScreenPreview, GrepResults 等)
