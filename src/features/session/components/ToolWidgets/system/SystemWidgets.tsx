import React, { useState } from "react";
import { Info, AlertCircle, Settings, Fingerprint, Cpu, FolderOpen, CheckSquare, Terminal, FolderSearch, List, LogOut, FileText, Edit3, FilePlus, Book, BookOpen, Globe, ListChecks, ListPlus, Globe2, Wrench, Package, Package2, ChevronDown, Bot, Sparkles, Brain, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToolContentTranslation } from "@/components/ToolWidgets/hooks/useToolContentTranslation";
export const SummaryWidget: React.FC<{
  summary: string;
  leafUuid?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  };
}> = ({ summary, leafUuid, usage }) => {
  const { translateContent } = useToolContentTranslation();
  const [translatedSummary, setTranslatedSummary] = React.useState<string>('');

  // Translate summary content on mount and when content changes
  React.useEffect(() => {
    const translateSummary = async () => {
      if (summary?.trim()) {
        const cacheKey = `summary-${summary.substring(0, 100)}`;
        const translated = await translateContent(summary, cacheKey);
        setTranslatedSummary(translated);
      }
    };

    translateSummary();
  }, [summary, translateContent]);

  // Use translated content if available, fallback to original
  const displaySummary = translatedSummary || summary;

  // Format token usage similar to StreamMessage formatUsageBreakdown
  const formatTokenUsage = (usage: any) => {
    if (!usage) return null;

    const { input_tokens = 0, output_tokens = 0, cache_creation_tokens = 0, cache_read_tokens = 0 } = usage;
    const parts = [
      { label: "in", value: input_tokens },
      { label: "out", value: output_tokens },
      { label: "creation", value: cache_creation_tokens },
      { label: "read", value: cache_read_tokens },
    ];

    const breakdown = parts
      .map(({ label, value }) => `${value} ${label}`)
      .join(", ");

    return `Tokens: ${breakdown}`;
  };

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5">
          <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Info className="h-4 w-4 text-blue-500" />
          </div>
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400">AI 总结</div>
          <p className="text-sm text-foreground">{displaySummary}</p>

          {/* Token usage display */}
          {usage && (
            <div className="text-xs text-foreground/70 mt-2">
              {formatTokenUsage(usage)}
            </div>
          )}

          {leafUuid && (
            <div className="text-xs text-muted-foreground mt-2">
              ID: <code className="font-mono">{leafUuid.slice(0, 8)}...</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Widget for displaying MultiEdit tool usage
 */

export const SystemReminderWidget: React.FC<{ message: string }> = ({ message }) => {
  // Extract icon based on message content
  let icon = <Info className="h-4 w-4" />;
  let colorClass = "border-blue-500/20 bg-blue-500/5 text-blue-600";
  
  if (message.toLowerCase().includes("warning")) {
    icon = <AlertCircle className="h-4 w-4" />;
    colorClass = "border-yellow-500/20 bg-yellow-500/5 text-yellow-600";
  } else if (message.toLowerCase().includes("error")) {
    icon = <AlertCircle className="h-4 w-4" />;
    colorClass = "border-destructive/20 bg-destructive/5 text-destructive";
  }
  
  return (
    <div className={cn("flex items-start gap-2 p-3 rounded-md border", colorClass)}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 text-sm">{message}</div>
    </div>
  );
};

/**
 * Widget for displaying system initialization information in a visually appealing way
 * Separates regular tools from MCP tools and provides icons for each tool type
 */

export const SystemInitializedWidget: React.FC<{
  sessionId?: string;
  model?: string;
  cwd?: string;
  tools?: string[];
  timestamp?: string;
}> = ({ sessionId, model, cwd, tools = [], timestamp }) => {
  const [mcpExpanded, setMcpExpanded] = useState(false);
  
  // Utility function to format timestamp
  const formatTimestamp = (timestamp: string | undefined): string => {
    if (!timestamp) return '';
    
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      
      return date.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
    } catch {
      return '';
    }
  };
  
  // Separate regular tools from MCP tools
  const regularTools = tools.filter(tool => !tool.startsWith('mcp__'));
  const mcpTools = tools.filter(tool => tool.startsWith('mcp__'));
  
  // Tool icon mapping for regular tools
  const toolIcons: Record<string, LucideIcon> = {
    'task': CheckSquare,
    'bash': Terminal,
    'glob': FolderSearch,
    'grep': Search,
    'ls': List,
    'exit_plan_mode': LogOut,
    'read': FileText,
    'edit': Edit3,
    'multiedit': Edit3,
    'write': FilePlus,
    'notebookread': Book,
    'notebookedit': BookOpen,
    'webfetch': Globe,
    'todoread': ListChecks,
    'todowrite': ListPlus,
    'websearch': Globe2,
  };
  
  // Get icon for a tool, fallback to Wrench
  const getToolIcon = (toolName: string) => {
    const normalizedName = toolName.toLowerCase();
    return toolIcons[normalizedName] || Wrench;
  };
  
  // Format MCP tool name (remove mcp__ prefix and format underscores)
  const formatMcpToolName = (toolName: string) => {
    // Remove mcp__ prefix
    const withoutPrefix = toolName.replace(/^mcp__/, '');
    // Split by double underscores first (provider separator)
    const parts = withoutPrefix.split('__');
    if (parts.length >= 2) {
      // Format provider name and method name separately
      const provider = parts[0].replace(/_/g, ' ').replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      const method = parts.slice(1).join('__').replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return { provider, method };
    }
    // Fallback formatting
    return {
      provider: 'MCP',
      method: withoutPrefix.replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    };
  };
  
  // Group MCP tools by provider
  const mcpToolsByProvider = mcpTools.reduce((acc, tool) => {
    const { provider } = formatMcpToolName(tool);
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(tool);
    return acc;
  }, {} as Record<string, string[]>);
  
  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Settings className="h-5 w-5 text-blue-500 mt-0.5" />
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">System Initialized</h4>
              {formatTimestamp(timestamp) && (
                <span className="text-xs text-muted-foreground font-mono">
                  {formatTimestamp(timestamp)}
                </span>
              )}
            </div>
            
            {/* Session Info */}
            <div className="space-y-2">
              {sessionId && (
                <div className="flex items-center gap-2 text-xs">
                  <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Session ID:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {sessionId}
                  </code>
                </div>
              )}
              
              {model && (
                <div className="flex items-center gap-2 text-xs">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Model:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {model}
                  </code>
                </div>
              )}
              
              {cwd && (
                <div className="flex items-center gap-2 text-xs">
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Working Directory:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                    {cwd}
                  </code>
                </div>
              )}
            </div>
            
            {/* Regular Tools */}
            {regularTools.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Available Tools ({regularTools.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {regularTools.map((tool, idx) => {
                    const Icon = getToolIcon(tool);
                    return (
                      <Badge 
                        key={idx} 
                        variant="secondary" 
                        className="text-xs py-0.5 px-2 flex items-center gap-1"
                      >
                        <Icon className="h-3 w-3" />
                        {tool}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* MCP Tools */}
            {mcpTools.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setMcpExpanded(!mcpExpanded)}
                  className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Package className="h-3.5 w-3.5" />
                  <span>MCP Services ({mcpTools.length})</span>
                  <ChevronDown className={cn(
                    "h-3 w-3 transition-transform",
                    mcpExpanded && "rotate-180"
                  )} />
                </button>
                
                {mcpExpanded && (
                  <div className="ml-5 space-y-3">
                    {Object.entries(mcpToolsByProvider).map(([provider, providerTools]) => (
                      <div key={provider} className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Package2 className="h-3 w-3" />
                          <span className="font-medium">{provider}</span>
                          <span className="text-muted-foreground/60">({providerTools.length})</span>
                        </div>
                        <div className="ml-4 flex flex-wrap gap-1">
                          {providerTools.map((tool, idx) => {
                            const { method } = formatMcpToolName(tool);
                            return (
                              <Badge 
                                key={idx} 
                                variant="outline" 
                                className="text-xs py-0 px-1.5 font-normal"
                              >
                                {method}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Show message if no tools */}
            {tools.length === 0 && (
              <div className="text-xs text-muted-foreground italic">
                无工具可用
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Widget for Task tool - displays sub-agent task information
 */

export const ThinkingWidget: React.FC<{
  thinking: string;
  signature?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  };
}> = ({ thinking, usage }) => {
  const { translateContent } = useToolContentTranslation();
  const [translatedThinking, setTranslatedThinking] = React.useState<string>('');

  // Strip whitespace from thinking content
  const trimmedThinking = thinking.trim();

  // Determine display state based on content
  const hasContent = trimmedThinking.length > 0;

  // Translate thinking content on mount and when content changes
  React.useEffect(() => {
    const translateThinking = async () => {
      if (hasContent) {
        const cacheKey = `thinking-${trimmedThinking.substring(0, 100)}`;
        const translated = await translateContent(trimmedThinking, cacheKey);
        setTranslatedThinking(translated);
      }
    };

    translateThinking();
  }, [trimmedThinking, hasContent, translateContent]);

  // Format token usage for thinking content
  const formatThinkingTokens = (usage: any) => {
    if (!usage) return null;

    const { input_tokens = 0, output_tokens = 0, cache_creation_tokens = 0, cache_read_tokens = 0 } = usage;
    const parts = [
      { label: "in", value: input_tokens },
      { label: "out", value: output_tokens },
      { label: "creation", value: cache_creation_tokens },
      { label: "read", value: cache_read_tokens },
    ];

    const breakdown = parts
      .map(({ label, value }) => `${value} ${label}`)
      .join(", ");

    return `Tokens: ${breakdown}`;
  };

  // When there's no content, show "thinking in progress" state
  if (!hasContent) {
    return (
      <div className="rounded-lg border border-gray-500/20 bg-gray-500/5 overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2">
          <div className="relative">
            <Bot className="h-4 w-4 text-gray-500" />
            <Sparkles className="h-2.5 w-2.5 text-gray-400 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <span className="text-sm font-medium italic text-gray-600 dark:text-gray-400">
            思考中...
          </span>
        </div>
      </div>
    );
  }

  // When there's content, show the translated thinking result with token usage
  const displayContent = translatedThinking || trimmedThinking;

  return (
    <div className="rounded-lg border border-green-500/20 bg-green-500/5 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">思考过程</span>
          </div>

          {/* Token usage display for thinking content */}
          {usage && (
            <div className="text-xs text-green-600/80 dark:text-green-400/80">
              {formatThinkingTokens(usage)}
            </div>
          )}
        </div>

        <pre className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-gray-500/5 p-3 rounded-lg italic leading-relaxed">
          {displayContent}
        </pre>
      </div>
    </div>
  );
};

/**
 * Widget for WebFetch tool - displays URL fetching with optional prompts
 */
