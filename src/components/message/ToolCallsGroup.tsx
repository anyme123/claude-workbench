/**
 * ToolCallsGroup - 工具调用组组件（重构版）
 *
 * 基于工具注册中心的插件化架构
 * 支持批量管理工具调用，提供折叠/展开功能
 * 当工具数量 >= 3 时默认折叠，显示摘要信息
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Wrench, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toolRegistry } from '@/lib/toolRegistry';
import type { ClaudeStreamMessage } from '@/types/claude';

interface ToolCall {
  id: string;
  type: 'tool_use';
  name: string;
  input?: Record<string, any>;
}

interface ToolResult {
  content?: any;
  is_error?: boolean;
}

export interface ToolCallsGroupProps {
  /** 消息数据 */
  message: ClaudeStreamMessage;

  /** 所有消息（用于查找对应的结果） */
  streamMessages: ClaudeStreamMessage[];

  /** 默认折叠状态 */
  defaultCollapsed?: boolean;

  /** 折叠阈值（工具数量 >= 此值时默认折叠） */
  collapseThreshold?: number;

  /** 折叠状态变化回调 */
  onToggle?: (collapsed: boolean) => void;

  /** 链接检测回调 */
  onLinkDetected?: (url: string) => void;

  /** 自定义类名 */
  className?: string;
}

export const ToolCallsGroup: React.FC<ToolCallsGroupProps> = ({
  message,
  streamMessages,
  defaultCollapsed,
  collapseThreshold = 3,
  onToggle,
  onLinkDetected,
  className,
}) => {
  // 提取工具调用
  const toolCalls = useMemo((): ToolCall[] => {
    if (!message.message?.content || !Array.isArray(message.message.content)) {
      return [];
    }
    return message.message.content.filter((item: any) => item.type === 'tool_use') as ToolCall[];
  }, [message]);

  // 提取工具结果
  const toolResults = useMemo(() => {
    const results = new Map<string, ToolResult>();

    // 在当前消息中查找结果
    if (message.message?.content && Array.isArray(message.message.content)) {
      message.message.content
        .filter((item: any) => item.type === 'tool_result')
        .forEach((result: any) => {
          if (result.tool_use_id) {
            results.set(result.tool_use_id, result);
          }
        });
    }

    // 在后续消息中查找结果
    const messageIndex = streamMessages.findIndex(m => m === message);
    if (messageIndex !== -1) {
      for (let i = messageIndex + 1; i < streamMessages.length; i++) {
        const nextMsg = streamMessages[i];
        if (nextMsg.type === 'user' && nextMsg.message?.content) {
          const content = Array.isArray(nextMsg.message.content) ? nextMsg.message.content : [];

          content
            .filter((item: any) => item.type === 'tool_result')
            .forEach((result: any) => {
              if (result.tool_use_id) {
                results.set(result.tool_use_id, result);
              }
            });
        }
      }
    }

    return results;
  }, [message, streamMessages]);

  // 自动判断是否应该折叠
  const shouldCollapse = defaultCollapsed ?? toolCalls.length >= collapseThreshold;
  const [isCollapsed, setIsCollapsed] = useState(shouldCollapse);

  // 计算工具执行统计
  const stats = useMemo(() => {
    let successCount = 0;
    let errorCount = 0;
    let pendingCount = 0;

    toolCalls.forEach(tool => {
      const result = toolResults.get(tool.id);
      if (!result) {
        pendingCount++;
      } else if (result.is_error) {
        errorCount++;
      } else {
        successCount++;
      }
    });

    return { successCount, errorCount, pendingCount, total: toolCalls.length };
  }, [toolCalls, toolResults]);

  // 切换折叠状态
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    onToggle?.(newState);
  };

  // 获取工具类型摘要
  const toolTypesSummary = useMemo(() => {
    const types = new Set(toolCalls.map(t => t.name));
    const typeArray = Array.from(types);
    if (typeArray.length <= 3) {
      return typeArray.join(', ');
    }
    return `${typeArray.slice(0, 3).join(', ')} +${typeArray.length - 3}`;
  }, [toolCalls]);

  if (toolCalls.length === 0) return null;

  // 只有一个工具时，直接渲染不提供折叠功能
  if (toolCalls.length === 1) {
    const tool = toolCalls[0];
    return (
      <div className={cn('tool-single-call my-2', className)}>
        <SingleToolCall tool={tool} result={toolResults.get(tool.id)} onLinkDetected={onLinkDetected} />
      </div>
    );
  }

  return (
    <div className={cn('tool-calls-group my-2 border border-border rounded-lg overflow-hidden', className)}>
      {/* 折叠/展开头部 */}
      <button
        onClick={toggleCollapse}
        className="flex items-center gap-2 w-full px-4 py-3 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
        <Wrench className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="font-medium text-sm">工具调用 ({stats.total})</span>

        {/* 状态徽章 */}
        <div className="flex items-center gap-2 ml-auto">
          {stats.successCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-500/10 px-2 py-1 rounded">
              <CheckCircle className="w-3 h-3" />
              {stats.successCount}
            </span>
          )}
          {stats.errorCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-600 bg-red-500/10 px-2 py-1 rounded">
              <AlertCircle className="w-3 h-3" />
              {stats.errorCount}
            </span>
          )}
          {stats.pendingCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-500/10 px-2 py-1 rounded">
              <Loader2 className="w-3 h-3 animate-spin" />
              {stats.pendingCount}
            </span>
          )}
        </div>

        <span className="text-xs text-muted-foreground ml-2 truncate max-w-[200px]">{toolTypesSummary}</span>
      </button>

      {/* 折叠摘要或完整内容 */}
      {isCollapsed ? (
        <CollapsedSummary stats={stats} toolCalls={toolCalls} toolResults={toolResults} />
      ) : (
        <div className="space-y-2 p-4 bg-background">
          {toolCalls.map((tool, index) => (
            <SingleToolCall
              key={tool.id}
              tool={tool}
              result={toolResults.get(tool.id)}
              onLinkDetected={onLinkDetected}
              index={index + 1}
              total={toolCalls.length}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 折叠时的摘要显示
 */
interface CollapsedSummaryProps {
  stats: any;
  toolCalls: ToolCall[];
  toolResults: Map<string, ToolResult>;
}

const CollapsedSummary: React.FC<CollapsedSummaryProps> = ({ stats, toolCalls, toolResults }) => {
  return (
    <div className="px-4 py-3 bg-background/50 border-t border-border space-y-2">
      {/* 显示前3个工具 */}
      {toolCalls.slice(0, 3).map((tool, idx) => {
        const result = toolResults.get(tool.id);
        const hasResult = !!result;
        const isError = result?.is_error;

        let StatusIcon = Loader2;
        let statusColor = 'text-blue-600';

        if (hasResult) {
          if (isError) {
            StatusIcon = AlertCircle;
            statusColor = 'text-red-600';
          } else {
            StatusIcon = CheckCircle;
            statusColor = 'text-green-600';
          }
        }

        return (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <StatusIcon className={cn('w-3 h-3', statusColor, !hasResult && 'animate-spin')} />
            <span className="font-mono font-medium">{tool.name}</span>
            {tool.input?.path && <span className="text-muted-foreground truncate">: {tool.input.path}</span>}
          </div>
        );
      })}

      {toolCalls.length > 3 && (
        <div className="text-xs text-muted-foreground pl-5">还有 {toolCalls.length - 3} 个工具...</div>
      )}

      <div className="text-[10px] text-muted-foreground/70 pt-1">点击展开查看详情</div>
    </div>
  );
};

/**
 * 单个工具调用渲染
 */
interface SingleToolCallProps {
  tool: ToolCall;
  result?: ToolResult;
  onLinkDetected?: (url: string) => void;
  index?: number;
  total?: number;
}

const SingleToolCall: React.FC<SingleToolCallProps> = ({ tool, result, onLinkDetected, index, total }) => {
  const renderer = toolRegistry.getRenderer(tool.name);

  // 构建渲染 props
  const renderProps = {
    toolName: tool.name,
    input: tool.input,
    result,
    toolId: tool.id,
    onLinkDetected,
  };

  // 判断状态
  const hasResult = !!result;
  const isError = result?.is_error;

  let StatusIcon = Loader2;
  let statusColor = 'text-blue-600';
  let statusBg = 'bg-blue-500/10';
  let borderColor = 'border-blue-500/20';

  if (hasResult) {
    if (isError) {
      StatusIcon = AlertCircle;
      statusColor = 'text-red-600';
      statusBg = 'bg-red-500/10';
      borderColor = 'border-red-500/20';
    } else {
      StatusIcon = CheckCircle;
      statusColor = 'text-green-600';
      statusBg = 'bg-green-500/10';
      borderColor = 'border-green-500/20';
    }
  }

  return (
    <div className={cn('tool-call-item bg-card border rounded-lg p-3', borderColor)}>
      {/* 工具头部 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('w-4 h-4', statusColor, !hasResult && 'animate-spin')} />
          <span className="font-mono text-sm font-medium">{tool.name}</span>
          {index && total && (
            <span className="text-xs text-muted-foreground">
              ({index}/{total})
            </span>
          )}
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded', statusBg, statusColor)}>
          {hasResult ? (isError ? '失败' : '成功') : '执行中'}
        </span>
      </div>

      {/* 使用注册的工具渲染器 */}
      {renderer ? (
        <div className="tool-widget-container">
          <renderer.render {...renderProps} />
        </div>
      ) : (
        <FallbackToolRender tool={tool} result={result} />
      )}
    </div>
  );
};

/**
 * 未注册工具的降级渲染
 */
interface FallbackToolRenderProps {
  tool: ToolCall;
  result?: ToolResult;
}

const FallbackToolRender: React.FC<FallbackToolRenderProps> = ({ tool, result }) => {
  return (
    <div className="fallback-tool-render space-y-2 text-xs">
      <div className="text-muted-foreground">此工具尚未注册专用渲染器，显示原始数据：</div>

      {tool.input && Object.keys(tool.input).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
            输入参数
          </summary>
          <pre className="mt-1 p-2 bg-muted rounded text-[10px] overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
        </details>
      )}

      {result && (
        <div className={cn('p-2 rounded', result.is_error ? 'bg-red-500/10' : 'bg-muted')}>
          <div className="font-medium mb-1 text-xs">{result.is_error ? '执行失败' : '执行结果'}:</div>
          <pre className="text-[10px] overflow-x-auto whitespace-pre-wrap">
            {typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ToolCallsGroup;
