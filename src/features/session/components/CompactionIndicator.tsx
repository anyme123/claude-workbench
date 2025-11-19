import React from "react";
import { motion } from "framer-motion";
import {
  Minimize2,
  Layers,
  ArrowRight,
  Clock,
  Info,
  CheckCircle2,
  TrendingDown
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Props for CompactionIndicator component
 */
interface CompactionIndicatorProps {
  /** Whether this message/section was affected by compaction */
  isCompacted?: boolean;
  /** Original message count before compaction */
  originalCount?: number;
  /** Final message count after compaction */
  compactedCount?: number;
  /** Tokens saved through compaction */
  tokensSaved?: number;
  /** Timestamp when compaction occurred */
  compactionTimestamp?: string;
  /** Type of compaction indicator */
  variant?: "message" | "section" | "summary";
  /** Whether to show detailed information */
  showDetails?: boolean;
  /** Callback when details are toggled */
  onToggleDetails?: () => void;
  /** Optional className for styling */
  className?: string;
}

/**
 * Visual indicator for compacted conversation state
 */
export const CompactionIndicator: React.FC<CompactionIndicatorProps> = ({
  isCompacted = false,
  originalCount,
  compactedCount,
  tokensSaved,
  compactionTimestamp,
  variant = "message",
  showDetails = false,
  onToggleDetails,
  className
}) => {
  if (!isCompacted) return null;

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  // Message-level indicator (small badge)
  if (variant === "message") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
                "bg-primary/10 border border-primary/20 text-primary",
                "text-xs font-medium",
                className
              )}
            >
              <Minimize2 className="h-3 w-3" />
              <span>Compacted</span>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p>This message was optimized during compaction</p>
              {compactionTimestamp && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatTimestamp(compactionTimestamp)}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Section-level indicator (inline summary)
  if (variant === "section") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md",
          "bg-primary/5 border border-primary/20",
          "text-sm",
          className
        )}
      >
        <Layers className="h-4 w-4 text-primary" />
        <span className="text-muted-foreground">
          Section compacted:
        </span>
        {originalCount && compactedCount && (
          <div className="flex items-center gap-1">
            <span className="font-medium">{originalCount}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{compactedCount}</span>
            <span className="text-muted-foreground">messages</span>
          </div>
        )}
        {tokensSaved && (
          <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
            <TrendingDown className="h-3 w-3 mr-1" />
            -{formatTokens(tokensSaved)}
          </Badge>
        )}
      </motion.div>
    );
  }

  // Summary-level indicator (detailed card)
  if (variant === "summary") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={className}
      >
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                className="flex-shrink-0 p-2 bg-primary/20 rounded-full"
              >
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </motion.div>
              
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-primary">
                    Conversation Optimized
                  </h4>
                  {compactionTimestamp && (
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatTimestamp(compactionTimestamp)}
                    </Badge>
                  )}
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Your conversation has been optimized to improve efficiency while preserving context.
                </p>
                
                {(originalCount && compactedCount) || tokensSaved ? (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    {originalCount && compactedCount && (
                      <div className="text-center p-2 bg-background/50 rounded-md">
                        <div className="text-sm font-medium mb-1">Messages</div>
                        <div className="flex items-center justify-center gap-1 text-lg font-bold">
                          <span>{originalCount}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="text-primary">{compactedCount}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {Math.round((1 - compactedCount / originalCount) * 100)}% reduction
                        </div>
                      </div>
                    )}
                    
                    {tokensSaved && (
                      <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
                        <div className="text-sm font-medium mb-1">Tokens Saved</div>
                        <div className="text-lg font-bold text-green-600 dark:text-green-400">
                          {formatTokens(tokensSaved)}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400">
                          Improved efficiency
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                
                {showDetails !== undefined && (
                  <div className="flex items-center justify-between pt-2 border-t border-primary/10">
                    <span className="text-xs text-muted-foreground">
                      {showDetails ? "Hide details" : "Show details"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onToggleDetails}
                      className="h-6 px-2 text-xs"
                    >
                      <Info className="h-3 w-3 mr-1" />
                      {showDetails ? "Less" : "More"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return null;
};

/**
 * Compact summary component for showing compaction results in conversation flow
 */
export const CompactionSummary: React.FC<{
  originalCount: number;
  compactedCount: number;
  tokensSaved: number;
  timestamp: string;
  strategy?: string;
}> = ({ originalCount, compactedCount, tokensSaved, timestamp, strategy }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-3xl mx-auto my-4"
    >
      <div className="bg-gradient-to-r from-primary/5 to-green-500/5 border border-primary/20 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-shrink-0 p-2 bg-primary/20 rounded-full">
            <Minimize2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h4 className="font-medium text-primary">Conversation Compacted</h4>
            <p className="text-xs text-muted-foreground">
              {strategy && `Using ${strategy} strategy • `}
              {new Date(timestamp).toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-1">
            <div className="text-lg font-bold">
              {originalCount}→{compactedCount}
            </div>
            <div className="text-xs text-muted-foreground">Messages</div>
          </div>
          <div className="space-y-1">
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              -{tokensSaved.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">Tokens</div>
          </div>
          <div className="space-y-1">
            <div className="text-lg font-bold text-primary">
              {Math.round((1 - compactedCount / originalCount) * 100)}%
            </div>
            <div className="text-xs text-muted-foreground">Reduced</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/**
 * Floating compaction status indicator
 */
export const FloatingCompactionStatus: React.FC<{
  isVisible: boolean;
  message: string;
  type?: "success" | "error" | "info";
  onDismiss?: () => void;
}> = ({ isVisible, message, type = "info", onDismiss }) => {
  if (!isVisible) return null;

  const getTypeStyles = () => {
    switch (type) {
      case "success":
        return "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400";
      case "error":
        return "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400";
      default:
        return "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50"
    >
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg border shadow-lg backdrop-blur",
          getTypeStyles()
        )}
      >
        <Minimize2 className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-medium">{message}</span>
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-6 w-6 p-0 ml-2"
          >
            ×
          </Button>
        )}
      </div>
    </motion.div>
  );
};