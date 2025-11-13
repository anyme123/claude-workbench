/**
 * ✅ MCP Widget - Model Context Protocol 工具展示
 *
 * 迁移自 ToolWidgets.tsx (原 1655-1840 行)
 * 用于展示 MCP 工具的调用信息和参数
 */

import React, { useState } from "react";
import { Package2, Sparkles, Code, ChevronRight, ChevronUp, ChevronDown, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

export interface MCPWidgetProps {
  /** MCP 工具名称 (格式: mcp__namespace__method) */
  toolName: string;
  /** 输入参数 */
  input?: any;
  /** 工具结果 */
  result?: any;
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
  result: _result,
}) => {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isParametersExpanded, setIsParametersExpanded] = useState(false);

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

  return (
    <div className="rounded-lg border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-purple-500/5 overflow-hidden">
      {/* 头部 */}
      <div className="px-4 py-3 bg-zinc-700/30 border-b border-violet-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Package2 className="h-4 w-4 text-violet-500" />
              <Sparkles className="h-2.5 w-2.5 text-violet-400 absolute -top-1 -right-1" />
            </div>
            <span className="text-sm font-medium text-violet-600 dark:text-violet-400">MCP 工具</span>
          </div>
          <div className="flex items-center gap-2">
            {hasInput && (
              <Badge
                variant="outline"
                className="text-xs border-violet-500/30 text-violet-600 dark:text-violet-400"
              >
                ~{inputTokens} 令牌
              </Badge>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-violet-500 hover:text-violet-600 transition-colors"
            >
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3">
          {/* 工具调用路径 */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-violet-500 font-medium">MCP</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-purple-600 dark:text-purple-400 font-medium">
              {formatNamespace(namespace)}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-violet-500" />
              <code className="text-sm font-mono font-semibold text-foreground">
                {formatMethod(method)}
                <span className="text-muted-foreground">()</span>
              </code>
            </div>
          </div>

          {/* 输入参数 */}
          {hasInput && (
            <div className={cn(
              "transition-all duration-200",
              !isParametersExpanded && isLargeInput && "max-h-[200px]"
            )}>
              <div className="relative">
                <div className={cn(
                  "rounded-lg border bg-zinc-950 overflow-hidden",
                  !isParametersExpanded && isLargeInput && "max-h-[200px]"
                )}>
                  <div className="px-3 py-2 border-b bg-zinc-700/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Code className="h-3 w-3 text-violet-500" />
                      <span className="text-xs font-mono text-muted-foreground">参数</span>
                    </div>
                    {isLargeInput && (
                      <button
                        onClick={() => setIsParametersExpanded(!isParametersExpanded)}
                        className="text-violet-500 hover:text-violet-600 transition-colors"
                      >
                        {isParametersExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <div className={cn(
                    "overflow-auto",
                    !isParametersExpanded && isLargeInput && "max-h-[150px]"
                  )}>
                    <SyntaxHighlighter
                      language="json"
                      style={getClaudeSyntaxTheme(theme === 'dark')}
                      customStyle={{
                        margin: 0,
                        padding: '0.75rem',
                        background: 'transparent',
                        fontSize: '0.75rem',
                        lineHeight: '1.5',
                      }}
                      wrapLongLines={false}
                    >
                      {inputString}
                    </SyntaxHighlighter>
                  </div>
                </div>

                {/* 折叠视图的渐变遮罩 */}
                {!isParametersExpanded && isLargeInput && (
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zinc-950/80 to-transparent pointer-events-none" />
                )}
              </div>
            </div>
          )}

          {/* 无参数提示 */}
          {!hasInput && (
            <div className="text-xs text-muted-foreground italic px-2">
              不需要参数
            </div>
          )}
        </div>
      )}

      {/* 折叠时的预览 */}
      {!isExpanded && (
        <div className="px-4 py-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-violet-500 font-medium">MCP</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-purple-600 dark:text-purple-400">
              {formatNamespace(namespace)}
            </span>
            <ChevronRight className="h-3 w-3" />
            <code className="text-sm font-mono text-foreground">
              {formatMethod(method)}()
            </code>
          </div>
        </div>
      )}
    </div>
  );
};
