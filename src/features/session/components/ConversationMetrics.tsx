import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Activity,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Layers,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { aggregateSessionCost, type BillingEvent } from "@/lib/sessionCost";
import type { ClaudeStreamMessage } from "@/types/claude";

/**
 * Interface for conversation metrics data
 */
export interface ConversationMetricsData {
  /** Current message count */
  messageCount: number;
  /** Estimated total tokens in conversation */
  totalTokens: number;
  /** Input tokens used */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Cache tokens (creation + read) */
  cacheTokens: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Conversation efficiency score (0-100) */
  efficiencyScore: number;
  /** Average tokens per message */
  avgTokensPerMessage: number;
  /** Conversation duration in minutes */
  durationMinutes: number;
  /** Tool calls made */
  toolCallsCount: number;
  /** Unique files referenced */
  filesReferenced: number;
  /** Model distribution */
  modelUsage: { [model: string]: number };
  /** Compaction history */
  compactionHistory: CompactionEvent[];
}

/**
 * Interface for compaction event tracking
 */
export interface CompactionEvent {
  id: string;
  timestamp: string;
  beforeMessages: number;
  afterMessages: number;
  tokensSaved: number;
  compressionRatio: number;
}

/**
 * Props for ConversationMetrics component
 */
interface ConversationMetricsProps {
  /** Current metrics data */
  metrics: ConversationMetricsData;
  /** Whether the conversation is currently active */
  isActive: boolean;
  /** Whether to show expanded view */
  expanded?: boolean;
  /** Callback when expansion state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Callback when compaction is suggested */
  onCompactionSuggested?: () => void;
  /** Optional className for styling */
  className?: string;
}

/**
 * Comprehensive conversation metrics display component
 */
export const ConversationMetrics: React.FC<ConversationMetricsProps> = ({
  metrics,
  isActive,
  expanded = false,
  onExpandedChange,
  onCompactionSuggested,
  className
}) => {
  const [showDetailedMetrics, setShowDetailedMetrics] = useState(false);
  const [animateMetrics, setAnimateMetrics] = useState(false);

  // Calculate efficiency indicators
  const getEfficiencyColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getEfficiencyLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Poor";
  };

  // Calculate token distribution
  const totalTokensDisplayed = metrics.inputTokens + metrics.outputTokens + metrics.cacheTokens;
  const inputPercentage = (metrics.inputTokens / totalTokensDisplayed) * 100;
  const outputPercentage = (metrics.outputTokens / totalTokensDisplayed) * 100;
  const cachePercentage = (metrics.cacheTokens / totalTokensDisplayed) * 100;

  // Determine if compaction is recommended
  const shouldRecommendCompaction = () => {
    return metrics.messageCount > 50 || 
           metrics.totalTokens > 100000 || 
           metrics.efficiencyScore < 60;
  };

  // Animate metrics when they change
  useEffect(() => {
    setAnimateMetrics(true);
    const timer = setTimeout(() => setAnimateMetrics(false), 300);
    return () => clearTimeout(timer);
  }, [metrics.messageCount, metrics.totalTokens]);

  // Format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  // Format cost
  const formatCost = (cost: number) => {
    if (cost < 0.01) return `<$0.01`;
    return `$${cost.toFixed(3)}`;
  };

  // Get model usage array for display
  const modelUsageEntries = Object.entries(metrics.modelUsage)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);

  return (
    <TooltipProvider>
      <div className={cn("space-y-2", className)}>
        {/* Main Metrics Card */}
        <Card className={cn(
          "transition-all duration-200",
          isActive && "border-primary/40 bg-primary/5",
          animateMetrics && "scale-[1.02]"
        )}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Conversation Metrics
                {isActive && (
                  <Badge variant="secondary" className="text-xs">
                    <Activity className="h-3 w-3 mr-1" />
                    Live
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {shouldRecommendCompaction() && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onCompactionSuggested}
                        className="h-6 px-2 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/20"
                      >
                        <Layers className="h-3 w-3 mr-1" />
                        Compact
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Consider compacting this conversation</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newExpanded = !expanded;
                    setShowDetailedMetrics(newExpanded);
                    onExpandedChange?.(newExpanded);
                  }}
                  className="h-6 w-6 p-0"
                >
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-3">
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-4 gap-3">
              <motion.div
                animate={animateMetrics ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <div className="text-lg font-bold text-foreground">
                  {metrics.messageCount}
                </div>
                <div className="text-xs text-muted-foreground">Messages</div>
              </motion.div>
              
              <motion.div
                animate={animateMetrics ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="text-center"
              >
                <div className="text-lg font-bold text-primary">
                  {formatNumber(metrics.totalTokens)}
                </div>
                <div className="text-xs text-muted-foreground">Tokens</div>
              </motion.div>
              
              <div className="text-center">
                <div className={cn("text-lg font-bold", getEfficiencyColor(metrics.efficiencyScore))}>
                  {metrics.efficiencyScore}%
                </div>
                <div className="text-xs text-muted-foreground">Efficiency</div>
              </div>
              
              <div className="text-center">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">
                  {formatCost(metrics.estimatedCost)}
                </div>
                <div className="text-xs text-muted-foreground">Cost</div>
              </div>
            </div>

            {/* Efficiency Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Conversation Efficiency</span>
                <span className={cn("font-medium", getEfficiencyColor(metrics.efficiencyScore))}>
                  {getEfficiencyLabel(metrics.efficiencyScore)}
                </span>
              </div>
              <Progress 
                value={metrics.efficiencyScore} 
                className={cn(
                  "h-2",
                  metrics.efficiencyScore >= 80 && "progress-green",
                  metrics.efficiencyScore >= 60 && metrics.efficiencyScore < 80 && "progress-yellow",
                  metrics.efficiencyScore < 60 && "progress-red"
                )}
              />
            </div>

            {/* Compaction History */}
            {metrics.compactionHistory.length > 0 && (
              <div className="bg-muted/50 rounded-md p-2">
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium">Recent Compactions</span>
                </div>
                <div className="space-y-1">
                  {metrics.compactionHistory.slice(0, 2).map((compaction) => (
                    <div key={compaction.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {new Date(compaction.timestamp).toLocaleTimeString()}
                      </span>
                      <div className="flex items-center gap-1">
                        <span>{compaction.beforeMessages}</span>
                        <ArrowRight className="h-2 w-2" />
                        <span>{compaction.afterMessages}</span>
                        <Badge variant="outline" className="text-xs ml-1">
                          -{formatNumber(compaction.tokensSaved)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detailed Metrics */}
        <AnimatePresence>
          {expanded && showDetailedMetrics && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Detailed Analytics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Token Distribution */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Token Distribution</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span>Input Tokens</span>
                        <span className="font-medium">{formatNumber(metrics.inputTokens)} ({inputPercentage.toFixed(1)}%)</span>
                      </div>
                      <Progress value={inputPercentage} className="h-1" />
                      
                      <div className="flex items-center justify-between text-xs">
                        <span>Output Tokens</span>
                        <span className="font-medium">{formatNumber(metrics.outputTokens)} ({outputPercentage.toFixed(1)}%)</span>
                      </div>
                      <Progress value={outputPercentage} className="h-1" />
                      
                      <div className="flex items-center justify-between text-xs">
                        <span>Cache Tokens</span>
                        <span className="font-medium">{formatNumber(metrics.cacheTokens)} ({cachePercentage.toFixed(1)}%)</span>
                      </div>
                      <Progress value={cachePercentage} className="h-1" />
                    </div>
                  </div>

                  {/* Model Usage */}
                  {modelUsageEntries.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Model Usage</h4>
                      <div className="space-y-1">
                        {modelUsageEntries.map(([model, count]) => (
                          <div key={model} className="flex items-center justify-between text-xs">
                            <span className="capitalize">{model}</span>
                            <Badge variant="outline">{count} messages</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Activity Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Average per Message</div>
                      <div className="text-sm font-medium">{Math.round(metrics.avgTokensPerMessage)} tokens</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Duration</div>
                      <div className="text-sm font-medium">
                        {metrics.durationMinutes < 60 
                          ? `${Math.round(metrics.durationMinutes)}m` 
                          : `${Math.floor(metrics.durationMinutes / 60)}h ${Math.round(metrics.durationMinutes % 60)}m`
                        }
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Tool Calls</div>
                      <div className="text-sm font-medium">{metrics.toolCallsCount}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Files Referenced</div>
                      <div className="text-sm font-medium">{metrics.filesReferenced}</div>
                    </div>
                  </div>

                  {/* Optimization Suggestions */}
                  {shouldRecommendCompaction() && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md border border-amber-200 dark:border-amber-800">
                      <div className="flex gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-700 dark:text-amber-300 mb-1">
                            Optimization Recommended
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                            This conversation could benefit from compaction to improve efficiency and reduce costs.
                          </p>
                          <Button 
                            size="sm" 
                            onClick={onCompactionSuggested}
                            className="h-6 text-xs"
                          >
                            <Layers className="h-3 w-3 mr-1" />
                            Compact Now
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
};

/**
 * Hook to calculate and track conversation metrics
 */
export const useConversationMetrics = (
  messages: ClaudeStreamMessage[],
  sessionStartTime?: string
): ConversationMetricsData => {
  const [metrics, setMetrics] = useState<ConversationMetricsData>({
    messageCount: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    estimatedCost: 0,
    efficiencyScore: 100,
    avgTokensPerMessage: 0,
    durationMinutes: 0,
    toolCallsCount: 0,
    filesReferenced: 0,
    modelUsage: {},
    compactionHistory: []
  });

  useEffect(() => {
    const { totals, events } = aggregateSessionCost(messages);

    const uniqueAssistantCount = events.length;
    const userMessageCount = messages.filter(message => message.type === 'user').length;
    const otherMessageCount = messages.filter(message => message.type !== 'user' && message.type !== 'assistant').length;
    const messageCount = userMessageCount + uniqueAssistantCount + otherMessageCount;

    const cacheTokens = totals.cacheReadTokens + totals.cacheWriteTokens;

    let toolCallsCount = 0;
    events.forEach(event => {
      toolCallsCount += countToolUses(event.message);
    });

    const filesReferenced = new Set<string>();
    messages.forEach(message => {
      if (message.message?.content) {
        const content = JSON.stringify(message.message.content);
        const fileMatches = content.match(/['"](\/[^"]+\.[a-zA-Z]+)['"]/g);
        if (fileMatches) {
          fileMatches.forEach(match => filesReferenced.add(match.slice(1, -1)));
        }
      }
    });

    const modelUsage: { [key: string]: number } = {};
    events.forEach(event => {
      const modelKey = event.model || 'unknown';
      modelUsage[modelKey] = (modelUsage[modelKey] || 0) + 1;
    });

    const durationMinutes = calculateDurationMinutes(messages, sessionStartTime, events);

    const avgTokensPerMessage = messageCount > 0 ? totals.totalTokens / messageCount : 0;
    let efficiencyScore = 100;

    if (avgTokensPerMessage > 1000) efficiencyScore -= 20;
    if (messageCount > 50) efficiencyScore -= 15;
    if (toolCallsCount > messageCount * 2) efficiencyScore -= 15;

    efficiencyScore = Math.max(0, efficiencyScore);

    setMetrics({
      messageCount,
      totalTokens: totals.totalTokens,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cacheTokens,
      estimatedCost: totals.totalCost,
      efficiencyScore,
      avgTokensPerMessage,
      durationMinutes,
      toolCallsCount,
      filesReferenced: filesReferenced.size,
      modelUsage,
      compactionHistory: [] // TODO: Implement compaction history tracking
    });
  }, [messages, sessionStartTime]);

  return metrics;
};

function countToolUses(message: ClaudeStreamMessage): number {
  const content = (message as any)?.message?.content;
  if (!Array.isArray(content)) {
    return 0;
  }

  return content.filter((item: any) => item?.type === 'tool_use').length;
}

function calculateDurationMinutes(
  messages: ClaudeStreamMessage[],
  sessionStartTime: string | undefined,
  events: BillingEvent[]
): number {
  const messageTimestamps = messages
    .map(extractTimestampMs)
    .filter((value): value is number => typeof value === 'number');

  if (messageTimestamps.length >= 2) {
    const earliest = Math.min(...messageTimestamps);
    const latest = Math.max(...messageTimestamps);
    if (latest >= earliest) {
      return (latest - earliest) / 60000;
    }
  }

  if (sessionStartTime) {
    const parsedStart = Date.parse(sessionStartTime);
    if (!Number.isNaN(parsedStart)) {
      return (Date.now() - parsedStart) / 60000;
    }
  }

  const eventTimestamps = events
    .map(event => event.timestampMs)
    .filter((value): value is number => typeof value === 'number');

  if (eventTimestamps.length >= 2) {
    const earliest = Math.min(...eventTimestamps);
    const latest = Math.max(...eventTimestamps);
    if (latest >= earliest) {
      return (latest - earliest) / 60000;
    }
  }

  return 0;
}

function extractTimestampMs(message: ClaudeStreamMessage): number | undefined {
  const candidates = [
    (message as any).timestamp,
    (message as any).receivedAt,
    (message as any).sentAt,
    (message as any)?.message?.timestamp,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim() === '') {
      continue;
    }

    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
}