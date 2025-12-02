/**
 * GeminiSubagentWidget - Gemini CLI 子代理工具渲染组件
 *
 * 用于渲染 Gemini CLI 的子代理工具调用，如:
 * - codebase_investigator: 代码库调查
 * - code_executor: 代码执行
 * - analyst/planner: 分析和规划
 */

import React, { useState } from 'react';
import { Cpu, ChevronDown, ChevronRight, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import ReactMarkdown from 'react-markdown';

export interface GeminiSubagentWidgetProps {
  /** 工具名称 */
  toolName: string;
  /** 工具显示名称 */
  displayName?: string;
  /** 工具描述 */
  description?: string;
  /** 工具输入参数 */
  input?: Record<string, any>;
  /** 工具执行结果 */
  result?: {
    content?: any;
    is_error?: boolean;
  };
}

// 子代理工具显示名称映射
const SUBAGENT_DISPLAY_NAMES: Record<string, string> = {
  codebase_investigator: '代码库调查器',
  code_executor: '代码执行器',
  analyst: '分析器',
  planner: '规划器',
  task: '任务代理',
};

// 子代理工具描述映射
const SUBAGENT_DESCRIPTIONS: Record<string, string> = {
  codebase_investigator: '分析代码库结构，理解系统架构和依赖关系',
  code_executor: '执行代码片段并返回结果',
  analyst: '分析问题并提供解决方案',
  planner: '规划任务执行步骤',
  task: '执行子任务',
};

export const GeminiSubagentWidget: React.FC<GeminiSubagentWidgetProps> = ({
  toolName,
  displayName,
  description,
  input,
  result,
}) => {
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [isArgsOpen, setIsArgsOpen] = useState(false);

  // 获取显示名称和描述
  const displayedName = displayName || SUBAGENT_DISPLAY_NAMES[toolName] || toolName;
  const displayedDesc = description || SUBAGENT_DESCRIPTIONS[toolName] || '';

  // 判断状态
  const hasResult = result !== undefined;
  const isError = result?.is_error === true;
  const isPending = !hasResult;

  // 提取结果内容
  const resultContent = (() => {
    if (!result?.content) return '';
    if (typeof result.content === 'string') return result.content;
    try {
      return JSON.stringify(result.content, null, 2);
    } catch {
      return String(result.content);
    }
  })();

  // 判断结果是否较长需要折叠
  const isLongResult = resultContent.length > 500;

  // 状态图标和颜色
  let StatusIcon = Loader2;
  let statusColor = 'text-blue-500';
  let statusBg = 'bg-blue-500/10';
  let statusText = '执行中';

  if (hasResult) {
    if (isError) {
      StatusIcon = XCircle;
      statusColor = 'text-red-500';
      statusBg = 'bg-red-500/10';
      statusText = '失败';
    } else {
      StatusIcon = CheckCircle;
      statusColor = 'text-green-500';
      statusBg = 'bg-green-500/10';
      statusText = '成功';
    }
  }

  return (
    <div className="gemini-subagent-widget rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-purple-500/10 border-b border-purple-500/20">
        <Cpu className="h-4 w-4 text-purple-500 flex-shrink-0" />
        <span className="font-medium text-sm">{displayedName}</span>
        <Badge
          variant="outline"
          className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/30"
        >
          子代理
        </Badge>
        <div className="flex-1" />
        <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded', statusBg, statusColor)}>
          <StatusIcon className={cn('h-3 w-3', isPending && 'animate-spin')} />
          {statusText}
        </span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Description */}
        {displayedDesc && (
          <p className="text-xs text-muted-foreground">{displayedDesc}</p>
        )}

        {/* Input Arguments */}
        {input && Object.keys(input).length > 0 && (
          <Collapsible open={isArgsOpen} onOpenChange={setIsArgsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                {isArgsOpen ? (
                  <ChevronDown className="h-3 w-3 mr-1" />
                ) : (
                  <ChevronRight className="h-3 w-3 mr-1" />
                )}
                输入参数 ({Object.keys(input).length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 p-3 bg-muted/50 rounded-md text-xs overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(input, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Result */}
        {hasResult && resultContent && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">执行结果:</span>
            </div>

            {isLongResult ? (
              <Collapsible open={isResultOpen} onOpenChange={setIsResultOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    {isResultOpen ? (
                      <ChevronDown className="h-3 w-3 mr-1" />
                    ) : (
                      <ChevronRight className="h-3 w-3 mr-1" />
                    )}
                    {isResultOpen ? '收起内容' : `展开 (${resultContent.length} 字符)`}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className={cn(
                    'mt-2 p-3 rounded-md text-xs overflow-x-auto max-h-96 overflow-y-auto',
                    isError ? 'bg-red-500/10' : 'bg-muted/50'
                  )}>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{resultContent}</ReactMarkdown>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <div className={cn(
                'p-3 rounded-md text-xs',
                isError ? 'bg-red-500/10' : 'bg-muted/50'
              )}>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{resultContent}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pending indicator */}
        {isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>正在执行子代理任务...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default GeminiSubagentWidget;
