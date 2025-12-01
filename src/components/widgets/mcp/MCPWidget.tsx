/**
 * ✅ MCP Widget - Model Context Protocol 工具展示
 *
 * 迁移自 ToolWidgets.tsx (原 1655-1840 行)
 * 用于展示 MCP 工具的调用信息和参数
 */

import React, { useState, useRef, useEffect } from "react";
import { Package2, Sparkles, Code, ChevronRight, ChevronUp, ChevronDown, Zap, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

/** 结果折叠高度阈值 */
const RESULT_COLLAPSE_HEIGHT = 300;

export interface MCPWidgetProps {
  /** MCP 工具名称 (格式: mcp__namespace__method) */
  toolName: string;
  /** 输入参数 */
  input?: any;
  /** 工具结果 */
  result?: {
    content?: any;
    is_error?: boolean;
  };
}

/**
 * MCP 工具 Widget
 *
 * Features:
 * - 解析 MCP 工具名称 (mcp__namespace__method)
 * - 显示参数（支持折叠）
 * - Token 估算
 * - 语法高亮的 JSON 参数
 */
export const MCPWidget: React.FC<MCPWidgetProps> = ({
  toolName,
  input,
  result,
}) => {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isParametersExpanded, setIsParametersExpanded] = useState(false);
  const [isResultExpanded, setIsResultExpanded] = useState(false);
  const [shouldCollapseResult, setShouldCollapseResult] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // 检查结果是否需要折叠
  useEffect(() => {
    if (resultRef.current) {
      setShouldCollapseResult(resultRef.current.scrollHeight > RESULT_COLLAPSE_HEIGHT);
    }
  }, [result, isExpanded]);

  // 解析结果内容
  const hasResult = result && result.content !== undefined;
  const isError = result?.is_error ?? false;
  const resultContent = hasResult
    ? typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content, null, 2)
    : '';
  const resultTokens = hasResult ? Math.ceil(resultContent.length / 4) : 0;

  // 解析工具名称
  // 格式: mcp__namespace__method
  const parts = toolName.split('__');
  const namespace = parts[1] || '';
  const method = parts[2] || '';

  /**
   * 格式化命名空间显示
   */
  const formatNamespace = (ns: string) => {
    return ns
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  /**
   * 格式化方法名
   */
  const formatMethod = (m: string) => {
    return m
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const hasInput = input && Object.keys(input).length > 0;
  const inputString = hasInput ? JSON.stringify(input, null, 2) : '';
  const isLargeInput = inputString.length > 200;

  /**
   * Token 估算（粗略估计: ~4字符/token）
   */
  const estimateTokens = (str: string) => {
    return Math.ceil(str.length / 4);
  };

  const inputTokens = hasInput ? estimateTokens(inputString) : 0;

  // 状态相关样式
  const statusIcon = hasResult
    ? isError
      ? <XCircle className="h-3.5 w-3.5 text-red-500" />
      : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    : <Loader2 className="h-3.5 w-3.5 text-violet-500 animate-spin" />;

  const statusText = hasResult ? (isError ? '失败' : '成功') : '执行中';
  const statusColor = hasResult ? (isError ? 'text-red-500' : 'text-green-500') : 'text-violet-500';

  return (
    <div className="space-y-2 w-full">
      {/* 紧凑型头部 */}
      <div 
        className="flex items-center justify-between bg-muted/30 p-2.5 rounded-md border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors group/header select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-shrink-0">
              <Package2 className="h-4 w-4 text-violet-500" />
              <Sparkles className="h-2 w-2 text-violet-400 absolute -top-0.5 -right-0.5" />
            </div>
            
            {/* 工具名称 */}
            <div className="flex items-center gap-1.5 min-w-0 text-sm">
              <span className="text-violet-600 dark:text-violet-400 font-medium truncate">
                {formatNamespace(namespace)}
              </span>
              <span className="text-muted-foreground/40">/</span>
              <code className="font-mono text-foreground/90 font-medium truncate">
                {formatMethod(method)}
              </code>
            </div>
          </div>

          {/* 状态与统计 */}
          <div className="flex items-center gap-2 text-xs flex-shrink-0">
            <div className="flex items-center gap-1">
              {statusIcon}
              <span className={cn("font-medium hidden sm:inline", statusColor)}>{statusText}</span>
            </div>
            
            {(hasInput || hasResult) && (
              <span className="text-muted-foreground/60 font-mono hidden sm:inline">
                ~{inputTokens + resultTokens} toks
              </span>
            )}
          </div>
        </div>

        {/* 展开/收起按钮 */}
        <div className="h-6 px-2 ml-2 text-muted-foreground group-hover/header:text-foreground flex items-center gap-1 transition-colors">
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </div>
      </div>

      {/* 展开内容区域 */}
      {isExpanded && (
        <div className="space-y-3 pl-1">
          {/* 输入参数 */}
          {hasInput && (
            <div className="rounded-lg border overflow-hidden bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
              <div className="px-3 py-2 border-b border-border/50 bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-xs font-medium text-muted-foreground">参数</span>
                </div>
              </div>
              <div className="overflow-auto max-h-[300px]">
                <SyntaxHighlighter
                  language="json"
                  style={getClaudeSyntaxTheme(theme === 'dark')}
                  customStyle={{
                    margin: 0,
                    padding: '0.75rem',
                    background: 'transparent',
                    fontSize: '0.8rem',
                    lineHeight: '1.5',
                  }}
                  wrapLongLines={false}
                >
                  {inputString}
                </SyntaxHighlighter>
              </div>
            </div>
          )}

          {/* 无参数提示 */}
          {!hasInput && (
            <div className="text-xs text-muted-foreground italic px-2">
              (无参数)
            </div>
          )}

          {/* 执行结果 */}
          {hasResult && (
            <div className="rounded-lg border overflow-hidden bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
              <div className={cn(
                "px-3 py-2 border-b flex items-center justify-between",
                isError
                  ? "bg-red-500/10 border-red-500/20"
                  : "bg-green-500/10 border-green-500/20"
              )}>
                <div className="flex items-center gap-2">
                  {isError ? (
                    <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  )}
                  <span className={cn(
                    "text-xs font-medium",
                    isError ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                  )}>
                    {isError ? '执行失败' : '执行结果'}
                  </span>
                </div>
              </div>
              
              <div className="relative">
                <div
                  ref={resultRef}
                  className={cn(
                    "p-3 overflow-auto transition-[max-height]",
                    shouldCollapseResult && !isResultExpanded && "overflow-hidden"
                  )}
                  style={shouldCollapseResult && !isResultExpanded ? { maxHeight: `${RESULT_COLLAPSE_HEIGHT}px` } : undefined}
                >
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground/80" style={{ fontSize: '0.8rem' }}>
                    {resultContent}
                  </pre>
                </div>
                
                {/* 折叠遮罩和按钮 */}
                {shouldCollapseResult && (
                  <>
                    {!isResultExpanded && (
                      <div className={cn(
                        "absolute bottom-0 left-0 right-0 h-12 pointer-events-none",
                        isError
                          ? "bg-gradient-to-t from-red-50/50 dark:from-red-950/50 to-transparent"
                          : "bg-gradient-to-t from-green-50/50 dark:from-green-950/50 to-transparent"
                      )} />
                    )}
                    <div className="absolute bottom-2 right-3">
                      <button
                        onClick={() => setIsResultExpanded(!isResultExpanded)}
                        className="text-xs bg-background/80 backdrop-blur-sm border shadow-sm px-2 py-1 rounded hover:bg-accent transition-colors"
                      >
                        {isResultExpanded ? "收起结果" : "展开全部"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 等待结果提示 */}
          {!hasResult && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-2 py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              等待执行结果...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
