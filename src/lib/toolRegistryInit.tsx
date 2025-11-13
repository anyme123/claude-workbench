/**
 * 工具注册初始化模块
 *
 * 将所有工具 Widget 组件注册到 toolRegistry
 * 在应用启动时调用 initializeToolRegistry() 完成注册
 */

import { toolRegistry, ToolRenderer, ToolRenderProps } from './toolRegistry';

// ✅ 已迁移组件：从新的 widgets 目录导入
import { SystemReminderWidget } from '@/components/widgets/system/SystemReminderWidget';
import { CommandWidget } from '@/components/widgets/execution/CommandWidget';

// 未迁移组件：仍从 ToolWidgets.tsx 导入
import {
  TodoWidget,
  LSWidget,
  ReadWidget,
  EditWidget,
  MultiEditWidget,
  BashWidget,
  GrepWidget,
  GlobWidget,
  WriteWidget,
  WebSearchWidget,
  WebFetchWidget,
  BashOutputWidget,
  MCPWidget,
  TaskWidget,
  CommandOutputWidget,
  SummaryWidget,
  SystemInitializedWidget,
  ThinkingWidget,
} from '@/components/ToolWidgets';

/**
 * 工具适配器工厂
 * 将旧的 Widget 组件适配到新的 ToolRenderProps 接口
 */
function createToolAdapter<T extends Record<string, any>>(
  WidgetComponent: React.FC<T>,
  propsMapper: (renderProps: ToolRenderProps) => T
): React.FC<ToolRenderProps> {
  return (renderProps: ToolRenderProps) => {
    const widgetProps = propsMapper(renderProps);
    return <WidgetComponent {...widgetProps} />;
  };
}

/**
 * 注册所有内置工具
 */
export function initializeToolRegistry(): void {
  const extractStringContent = (value: unknown): string => {
    if (typeof value === 'string') {
      return value;
    }

    if (value == null) {
      return '';
    }

    if (Array.isArray(value)) {
      return value.map(extractStringContent).filter(Boolean).join('\n');
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;

      if (typeof record.text === 'string') {
        return record.text;
      }

      if (typeof record.message === 'string') {
        return record.message;
      }

      if (typeof record.content === 'string') {
        return record.content;
      }

      try {
        return JSON.stringify(record, null, 2);
      } catch {
        return String(record);
      }
    }

    return String(value);
  };

  const extractTaggedValue = (content: string, tag: string): string | undefined => {
    if (!content) {
      return undefined;
    }

    const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = content.match(regex);
    return match?.[1]?.trim() || undefined;
  };

  const tools: ToolRenderer[] = [
    // TodoWrite / TodoRead
    {
      name: 'todowrite',
      render: createToolAdapter(TodoWidget, (props) => ({
        todos: props.input?.todos || [],
        result: props.result,
      })),
      description: 'Todo 列表管理工具',
    },
    {
      name: 'todoread',
      render: createToolAdapter(TodoWidget, (props) => ({
        todos: props.input?.todos || props.result?.content || [],
        result: props.result,
      })),
      description: 'Todo 列表读取工具',
    },

    // LS - 列出目录
    {
      name: 'ls',
      render: createToolAdapter(LSWidget, (props) => ({
        path: props.input?.path || '.',
        result: props.result,
      })),
      description: '目录列表工具',
    },

    // Read - 读取文件
    {
      name: 'read',
      render: createToolAdapter(ReadWidget, (props) => ({
        filePath: props.input?.file_path || props.input?.path || '',
        result: props.result,
      })),
      description: '文件读取工具',
    },

    // Edit - 编辑文件
    {
      name: 'edit',
      render: createToolAdapter(EditWidget, (props) => ({
        file_path: props.input?.file_path || '',
        old_string: props.input?.old_string || '',
        new_string: props.input?.new_string || '',
        result: props.result,
      })),
      description: '文件编辑工具（搜索替换）',
    },

    // MultiEdit - 批量编辑
    {
      name: 'multiedit',
      render: createToolAdapter(MultiEditWidget, (props) => ({
        file_path: props.input?.file_path || '',
        edits: props.input?.edits || [],
        result: props.result,
      })),
      description: '批量文件编辑工具',
    },

    // Bash - 执行命令
    {
      name: 'bash',
      render: createToolAdapter(BashWidget, (props) => ({
        command: props.input?.command || '',
        description: props.input?.description,
        result: props.result,
      })),
      description: 'Bash 命令执行工具',
    },

    // Grep - 搜索内容
    {
      name: 'grep',
      render: createToolAdapter(GrepWidget, (props) => ({
        pattern: props.input?.pattern || '',
        path: props.input?.path,
        include: props.input?.include,
        exclude: props.input?.exclude,
        result: props.result,
      })),
      description: '代码搜索工具',
    },

    // Glob - 查找文件
    {
      name: 'glob',
      render: createToolAdapter(GlobWidget, (props) => ({
        pattern: props.input?.pattern || '',
        path: props.input?.path,
        result: props.result,
      })),
      description: '文件匹配查找工具',
    },

    // Write - 写入文件
    {
      name: 'write',
      render: createToolAdapter(WriteWidget, (props) => ({
        filePath: props.input?.file_path || '',
        content: props.input?.content || '',
        result: props.result,
      })),
      description: '文件写入工具',
    },

    // WebSearch - 网络搜索
    {
      name: 'websearch',
      render: createToolAdapter(WebSearchWidget, (props) => ({
        query: props.input?.query || '',
        result: props.result,
      })),
      description: '网络搜索工具',
    },

    // WebFetch - 获取网页
    {
      name: 'webfetch',
      render: createToolAdapter(WebFetchWidget, (props) => ({
        url: props.input?.url || '',
        prompt: props.input?.prompt,
        result: props.result,
      })),
      description: '网页获取工具',
    },

    // BashOutput - 后台命令输出
    {
      name: 'bashoutput',
      render: createToolAdapter(BashOutputWidget, (props) => ({
        bash_id: props.input?.bash_id || '',
        result: props.result,
      })),
      description: '后台命令输出查看工具',
    },

    // MCP 工具（正则匹配）
    {
      name: 'mcp',
      pattern: /^mcp__/,
      priority: 10,
      render: createToolAdapter(MCPWidget, (props) => ({
        toolName: props.toolName,
        input: props.input,
        result: props.result,
      })),
      description: 'Model Context Protocol 工具（通用）',
    },

    // Task - 子代理工具（Claude Code 特有）
    {
      name: 'task',
      render: createToolAdapter(TaskWidget, (props) => ({
        description: props.input?.description ?? props.result?.content?.description,
        prompt: props.input?.prompt ?? props.result?.content?.prompt,
        result: props.result,
      })),
      description: 'Claude Code 子代理工具',
    },

    // System Reminder - 系统提醒信息
    {
      name: 'system_reminder',
      pattern: /^system[-_]reminder$/,
      render: createToolAdapter(SystemReminderWidget, (props) => {
        const raw = extractStringContent(props.input?.message ?? props.result?.content ?? '');
        const message = extractTaggedValue(raw, 'system-reminder') ?? raw.trim();

        return {
          message: message || '系统提醒',
        };
      }),
      description: '系统提醒信息显示',
    },

    // Command - 命令信息展示
    {
      name: 'command',
      render: createToolAdapter(CommandWidget, (props) => {
        const raw = extractStringContent(props.input?.raw ?? props.result?.content ?? '');
        const commandName = props.input?.commandName
          ?? props.input?.command_name
          ?? extractTaggedValue(raw, 'command-name')
          ?? props.toolName;
        const commandMessage = props.input?.commandMessage
          ?? props.input?.command_message
          ?? extractTaggedValue(raw, 'command-message')
          ?? raw;
        const commandArgs = props.input?.commandArgs
          ?? props.input?.command_args
          ?? extractTaggedValue(raw, 'command-args');

        return {
          commandName: commandName || props.toolName,
          commandMessage,
          commandArgs,
        };
      }),
      description: 'Slash 命令展示',
    },

    // Command Output - 命令输出展示
    {
      name: 'command_output',
      pattern: /^command[-_]?(output|result)$/,
      render: createToolAdapter(CommandOutputWidget, (props) => ({
        output: extractStringContent(props.result?.content ?? props.input?.output ?? ''),
        onLinkDetected: props.onLinkDetected,
      })),
      description: '命令执行输出',
    },

    // Summary - 会话总结展示
    {
      name: 'summary',
      render: createToolAdapter(SummaryWidget, (props) => ({
        summary: extractStringContent(props.input?.summary ?? props.result?.content ?? ''),
        leafUuid: props.input?.leafUuid ?? props.input?.leaf_uuid ?? props.result?.content?.leafUuid,
        usage: props.input?.usage ?? (props.result as any)?.usage,
      })),
      description: '会话摘要展示',
    },

    // System Initialized - 系统初始化信息
    {
      name: 'system_initialized',
      pattern: /^system[_-]?init(?:ialized)?$/,
      render: createToolAdapter(SystemInitializedWidget, (props) => ({
        sessionId: props.input?.sessionId ?? props.input?.session_id ?? props.result?.content?.sessionId,
        model: props.input?.model ?? props.result?.content?.model,
        cwd: props.input?.cwd ?? props.result?.content?.cwd,
        tools: props.input?.tools ?? props.result?.content?.tools,
        timestamp: props.input?.timestamp ?? props.result?.content?.timestamp,
      })),
      description: '系统初始化信息展示',
    },

    // Thinking - 思考过程展示
    {
      name: 'thinking',
      render: createToolAdapter(ThinkingWidget, (props) => ({
        thinking: extractStringContent(props.input?.thinking ?? props.result?.content ?? ''),
        signature: props.input?.signature ?? props.result?.content?.signature,
        usage: props.input?.usage ?? (props.result as any)?.usage,
      })),
      description: 'AI 思考过程展示',
    },
  ];

  // 批量注册所有工具
  toolRegistry.registerBatch(tools);

  // 输出注册统计
  const stats = toolRegistry.getStats();
  console.log(`[ToolRegistry] 工具注册完成: ${stats.total} 个工具, ${stats.withPattern} 个模式匹配工具`);
}

/**
 * 注册自定义工具（供外部扩展使用）
 */
export function registerCustomTool(tool: ToolRenderer): void {
  toolRegistry.register(tool);
  console.log(`[ToolRegistry] 自定义工具注册: ${tool.name}`);
}

/**
 * 获取所有已注册工具的列表（用于调试）
 */
export function getRegisteredTools(): ToolRenderer[] {
  return toolRegistry.getAllRenderers();
}
