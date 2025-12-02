/**
 * 工具注册初始化模块
 *
 * 将所有工具 Widget 组件注册到 toolRegistry
 * 在应用启动时调用 initializeToolRegistry() 完成注册
 */

import React from 'react';
import { toolRegistry, ToolRenderer, ToolRenderProps } from './toolRegistry';

// ✅ 已迁移组件：从新的 widgets 目录导入
import {
  // 系统信息类
  SystemReminderWidget,
  SummaryWidget,
  ThinkingWidget,

  // 命令执行类
  CommandWidget,
  CommandOutputWidget,
  BashWidget,
  BashOutputWidget,

  // 文件操作类
  ReadWidget,
  EditWidget,

  // 搜索类
  LSWidget,
  GlobWidget,

  // 任务管理类
  TodoWidget,
  UpdatePlanWidget,

  // 子代理类
  TaskWidget,
  MultiEditWidget,
  GeminiSubagentWidget,

  // Web 工具类
  WebFetchWidget,
  WebSearchWidget,

  // MCP 工具类
  MCPWidget,

  // 系统初始化
  SystemInitializedWidget,

  // Plan 模式切换
  PlanModeWidget,

  // 用户交互类
  AskUserQuestionWidget,

  // 文件操作（已补充）
  WriteWidget,

  // 搜索（已补充）
  GrepWidget,
} from '@/components/widgets';

// ✅ 所有活跃组件已完成迁移！
// Note: TodoReadWidget (502行) 未在注册表使用，已跳过迁移

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

const ViewImageWidget: React.FC<{ src: string; caption?: string }> = ({ src, caption }) => {
  if (!src) return null;
  return (
    <div className="rounded-lg border bg-muted/20 overflow-hidden">
      <div className="p-3 border-b text-xs font-mono text-muted-foreground break-all">
        {caption || '图像预览'}
      </div>
      <div className="p-3 flex items-center justify-center bg-background">
        <img
          src={src}
          alt={caption || 'image preview'}
          className="max-h-[320px] max-w-full rounded-md shadow-sm border"
        />
      </div>
      <div className="px-3 pb-3 text-[11px] text-muted-foreground break-all">{src}</div>
    </div>
  );
};

/**
 * 解析 unified diff 格式，提取旧内容和新内容
 * @param diff unified diff 字符串
 * @returns { oldContent, newContent }
 */
function parseDiffContent(diff: string): { oldContent: string; newContent: string } {
  const lines = diff.split('\n');
  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (const line of lines) {
    // 跳过 diff 头部信息
    if (line.startsWith('---') || line.startsWith('+++') ||
        line.startsWith('@@') || line.startsWith('diff ') ||
        line.startsWith('index ')) {
      continue;
    }

    if (line.startsWith('-')) {
      // 删除的行（旧内容）
      oldLines.push(line.substring(1));
    } else if (line.startsWith('+')) {
      // 添加的行（新内容）
      newLines.push(line.substring(1));
    } else if (line.startsWith(' ') || line === '') {
      // 上下文行（两边都有）
      const contextLine = line.startsWith(' ') ? line.substring(1) : line;
      oldLines.push(contextLine);
      newLines.push(contextLine);
    }
  }

  return {
    oldContent: oldLines.join('\n'),
    newContent: newLines.join('\n'),
  };
}

/**
 * 解析 Gemini functionResponse 格式的结果
 * Gemini 返回格式: [{"functionResponse":{"id":"...","name":"...","response":{"output":"..."}}}]
 * @param result 原始结果对象
 * @returns 解析后的结果对象，如果无法解析则返回原结果
 */
function parseGeminiResult(result: any): any {
  if (!result?.content) return result;

  const content = result.content;

  // 如果是字符串且看起来是 JSON 数组
  if (typeof content === 'string' && content.trim().startsWith('[{')) {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed[0]?.functionResponse?.response?.output !== undefined) {
        return { content: parsed[0].functionResponse.response.output };
      }
    } catch {
      // 解析失败，保持原样
    }
  }

  return result;
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
        todos: Array.isArray(props.input?.todos) ? props.input.todos : [],
        result: props.result,
      })),
      description: 'Todo 列表管理工具',
    },
    {
      name: 'todoread',
      render: createToolAdapter(TodoWidget, (props) => {
        // 确保 todos 始终是数组
        let todos: any[] = [];
        if (Array.isArray(props.input?.todos)) {
          todos = props.input.todos;
        } else if (Array.isArray(props.result?.content)) {
          todos = props.result.content;
        } else if (Array.isArray(props.result?.content?.todos)) {
          todos = props.result.content.todos;
        }

        return {
          todos,
          result: props.result,
        };
      }),
      description: 'Todo 列表读取工具',
    },

    // Update Plan - 计划更新（Codex 专用）
    // Codex 格式: { plan: [{ status: "completed", step: "步骤描述" }, ...] }
    {
      name: 'update_plan',
      render: createToolAdapter(UpdatePlanWidget, (props) => {
        // Codex update_plan 的 arguments 是 JSON 字符串，包含 plan 数组
        let plan = props.input?.plan;

        // 如果 plan 是字符串，尝试解析
        if (typeof plan === 'string') {
          try {
            const parsed = JSON.parse(plan);
            plan = parsed.plan || parsed;
          } catch {
            // 忽略解析错误
          }
        }

        return {
          plan: Array.isArray(plan) ? plan : [],
          result: props.result,
        };
      }),
      description: 'Codex 计划更新工具',
    },

    // LS - 列出目录
    // 支持: ls, list_directory (Gemini)
    {
      name: 'ls',
      pattern: /^(?:ls|list[-_]?directory)$/i,
      render: createToolAdapter(LSWidget, (props) => ({
        path: props.input?.path || props.input?.directory_path || '.',
        result: parseGeminiResult(props.result),
      })),
      description: '目录列表工具',
    },

    // Read - 读取文件
    // 支持: read, read_file (Gemini)
    {
      name: 'read',
      pattern: /^(?:read|read[-_]?file)$/i,
      render: createToolAdapter(ReadWidget, (props) => ({
        filePath: props.input?.file_path || props.input?.path || '',
        result: parseGeminiResult(props.result),
      })),
      description: '文件读取工具',
    },

    // View Image - 图像预览
    {
      name: 'view_image',
      render: (props) => {
        const src =
          props.input?.file_path ||
          props.input?.path ||
          props.input?.image ||
          props.result?.content ||
          '';
        const caption =
          props.input?.caption ||
          props.input?.description ||
          (typeof props.result?.content === 'object' && (props.result?.content as any)?.caption) ||
          undefined;
        return <ViewImageWidget src={src} caption={caption} />;
      },
      description: '图像预览工具',
    },

    // Edit - 编辑文件
    // 支持: edit, replace (Gemini)
    {
      name: 'edit',
      pattern: /^(?:edit|replace)$/i,
      render: createToolAdapter(EditWidget, (props) => {
        const input = props.input || {};
        const result = parseGeminiResult(props.result);

        // Claude Code 格式：old_string + new_string
        if (input.old_string !== undefined || input.new_string !== undefined) {
          return {
            file_path: input.file_path || '',
            old_string: input.old_string || '',
            new_string: input.new_string || '',
            result,
          };
        }

        // Codex 格式：可能有 diff/patch/content
        // 尝试从 diff/patch 中提取变更内容
        const diff = input.diff || input.patch || '';
        const content = input.content || '';

        if (diff) {
          // 解析 unified diff 格式提取旧/新内容
          const { oldContent, newContent } = parseDiffContent(diff);
          return {
            file_path: input.file_path || '',
            old_string: oldContent,
            new_string: newContent,
            result,
          };
        }

        // 如果只有 content，根据 change_type 决定显示方式
        const changeType = input.change_type || 'update';
        if (changeType === 'create') {
          return {
            file_path: input.file_path || '',
            old_string: '',
            new_string: content,
            result,
          };
        } else if (changeType === 'delete') {
          return {
            file_path: input.file_path || '',
            old_string: content,
            new_string: '',
            result,
          };
        }

        // 默认：显示 content 作为新内容
        return {
          file_path: input.file_path || '',
          old_string: '',
          new_string: content,
          result,
        };
      }),
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
    // 支持: bash, run_shell_command (Gemini), shell_command (Codex)
    {
      name: 'bash',
      pattern: /^(?:bash|run[-_]?shell[-_]?command|shell[-_]?command)$/i,
      render: createToolAdapter(BashWidget, (props) => {
        const input = props.input || {};
        // Support multiple parameter formats:
        // - Claude Code: { command: "..." }
        // - Codex shell_command: { cmd: "..." } or { command: "..." }
        const command = input.command || input.cmd || '';
        return {
          command,
          description: input.description,
          result: parseGeminiResult(props.result),
        };
      }),
      description: 'Bash 命令执行工具',
    },

    // KillShell - 终止 Shell 进程
    {
      name: 'killshell',
      render: createToolAdapter(BashWidget, (props) => {
        const id = props.input?.id || '';
        return {
          command: `kill ${id}`,
          description: '终止后台进程',
          result: props.result,
        };
      }),
      description: '终止 Shell 进程工具',
    },

    // Grep - 搜索内容
    // 支持: grep, search_file_content (Gemini), search_files (Codex)
    {
      name: 'grep',
      pattern: /^(?:grep|search[-_]?file[-_]?content|search[-_]?files)$/i,
      render: createToolAdapter(GrepWidget, (props) => ({
        pattern: props.input?.pattern || props.input?.query || props.input?.search_term || '',
        path: props.input?.path || props.input?.directory,
        include: props.input?.include || props.input?.file_pattern,
        exclude: props.input?.exclude,
        result: parseGeminiResult(props.result),
      })),
      description: '代码搜索工具',
    },

    // Glob - 查找文件
    // 支持: glob, find_files (Codex), list_files
    {
      name: 'glob',
      pattern: /^(?:glob|find[-_]?files|list[-_]?files)$/i,
      render: createToolAdapter(GlobWidget, (props) => ({
        pattern: props.input?.pattern || props.input?.file_pattern || '',
        path: props.input?.path || props.input?.directory,
        result: parseGeminiResult(props.result),
      })),
      description: '文件匹配查找工具',
    },

    // Write - 写入文件
    // 支持: write, write_file (Gemini), create_file (Codex), save_file
    {
      name: 'write',
      pattern: /^(?:write|write[-_]?file|create[-_]?file|save[-_]?file)$/i,
      render: createToolAdapter(WriteWidget, (props) => {
        const input = props.input || {};
        const filePath = input.file_path || input.path || '';
        let content = input.content || '';

        // Codex 格式：如果没有 content 但有 diff/patch，从中提取新内容
        if (!content && (input.diff || input.patch)) {
          const { newContent } = parseDiffContent(input.diff || input.patch || '');
          content = newContent;
        }

        return {
          filePath,
          content,
          result: parseGeminiResult(props.result),
        };
      }),
      description: '文件写入工具',
    },

    // WebSearch - 网络搜索
    // 支持: websearch, web_search (Codex/Gemini), search_web
    {
      name: 'websearch',
      pattern: /^(?:web[-_]?search|search[-_]?web)$/i,
      render: createToolAdapter(WebSearchWidget, (props) => ({
        query: props.input?.query || props.input?.search_query || '',
        result: parseGeminiResult(props.result),
      })),
      description: '网络搜索工具',
    },

    // WebFetch - 获取网页
    // 支持: webfetch, web_fetch, fetch_url (Codex), get_url
    {
      name: 'webfetch',
      pattern: /^(?:web[-_]?fetch|fetch[-_]?url|get[-_]?url)$/i,
      render: createToolAdapter(WebFetchWidget, (props) => ({
        url: props.input?.url || '',
        prompt: props.input?.prompt,
        result: parseGeminiResult(props.result),
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
        subagentType: props.input?.subagent_type ?? props.result?.content?.subagent_type,
      })),
      description: 'Claude Code 子代理工具',
    },

    // Gemini 子代理工具（codebase_investigator, code_executor 等）
    {
      name: 'codebase_investigator',
      pattern: /^(?:codebase[-_]?investigator|code[-_]?executor|analyst|planner)$/i,
      priority: 5,
      render: createToolAdapter(GeminiSubagentWidget, (props) => ({
        toolName: props.toolName,
        displayName: props.input?.displayName,
        description: props.input?.description,
        input: props.input,
        result: props.result,
      })),
      description: 'Gemini CLI 子代理工具',
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

    // ExitPlanMode - 退出 Plan 模式
    {
      name: 'exitplanmode',
      pattern: /^exit[-_]?plan[-_]?mode$/i,
      render: createToolAdapter(PlanModeWidget, (props) => ({
        action: 'exit' as const,
        // 从 input 中提取计划内容
        plan: props.input?.plan || props.input?.content || '',
        result: props.result,
      })),
      description: '退出 Plan 模式',
    },

    // EnterPlanMode - 进入 Plan 模式
    {
      name: 'enterplanmode',
      pattern: /^enter[-_]?plan[-_]?mode$/i,
      render: createToolAdapter(PlanModeWidget, (props) => ({
        action: 'enter' as const,
        result: props.result,
      })),
      description: '进入 Plan 模式',
    },

    // AskUserQuestion - 用户问题询问
    {
      name: 'askuserquestion',
      pattern: /^ask[-_]?user[-_]?question$/i,
      render: createToolAdapter(AskUserQuestionWidget, (props) => ({
        questions: props.input?.questions || [],
        answers: props.input?.answers || props.result?.content?.answers || {},
        result: props.result,
      })),
      description: '用户问题询问工具',
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
