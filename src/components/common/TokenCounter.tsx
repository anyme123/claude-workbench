import React from "react";
import { motion } from "framer-motion";
import { Hash, DollarSign, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { tokenCounter, type TokenUsage } from "@/lib/tokenCounter";
import { tokenExtractor } from "@/lib/tokenExtractor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TokenCounterProps {
  /**
   * Token usage data (supports both legacy number and new detailed format)
   */
  tokens?: number | TokenUsage;
  /**
   * Model name for accurate pricing
   */
  model?: string;
  /**
   * Whether to show the counter
   */
  show?: boolean;
  /**
   * Display mode
   */
  mode?: 'simple' | 'detailed' | 'compact';
  /**
   * Whether to include cost information
   */
  includeCost?: boolean;
  /**
   * Whether to include efficiency metrics
   */
  includeEfficiency?: boolean;
  /**
   * Optional className for styling
   */
  className?: string;
  /**
   * Position of the floating counter
   */
  position?: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left';
}

/**
 * TokenCounter component - Displays enhanced token information with cost and efficiency metrics
 *
 * @example
 * // Simple usage (backward compatible)
 * <TokenCounter tokens={1234} show={true} />
 *
 * // Advanced usage with detailed breakdown
 * <TokenCounter
 *   tokens={{ input_tokens: 100, output_tokens: 200, cache_read_tokens: 50 }}
 *   model="claude-3-5-sonnet-20240620"
 *   mode="detailed"
 *   includeCost={true}
 *   includeEfficiency={true}
 * />
 */
export const TokenCounter: React.FC<TokenCounterProps> = ({
  tokens,
  model,
  show = true,
  mode = 'simple',
  includeCost = false,
  includeEfficiency = false,
  className,
  position = 'bottom-right',
}) => {
  // Convert legacy number format to TokenUsage format
  const tokenUsage: TokenUsage = React.useMemo(() => {
    if (!tokens) return { input_tokens: 0, output_tokens: 0 };

    if (typeof tokens === 'number') {
      // Legacy format: assume it's total tokens, split as input/output estimate
      return {
        input_tokens: Math.floor(tokens * 0.3), // Rough estimate: 30% input
        output_tokens: Math.floor(tokens * 0.7), // 70% output
      };
    }

    return tokenCounter.normalizeUsage(tokens);
  }, [tokens]);

  const breakdown = React.useMemo(() => {
    return tokenCounter.calculateBreakdown(tokenUsage, model);
  }, [tokenUsage, model]);

  const shouldShow = show && breakdown.total > 0;

  if (!shouldShow) return null;

  // Position classes
  const positionClasses = {
    'bottom-right': 'bottom-20 right-4',
    'top-right': 'top-20 right-4',
    'bottom-left': 'bottom-20 left-4',
    'top-left': 'top-20 left-4',
  };

  const formatContent = () => {
    if (mode === 'compact') {
      return tokenCounter.formatBreakdown(tokenUsage, model, {
        compact: true,
        includeCost,
        includeEfficiency
      });
    }

    if (mode === 'detailed') {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Hash className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{tokenCounter.formatCount(breakdown.total)}</span>
            <span className="text-muted-foreground">tokens</span>
          </div>
          {(includeCost || includeEfficiency) && breakdown.cost.total_cost > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              <span className="font-mono">{tokenCounter.formatCost(breakdown.cost.total_cost)}</span>
            </div>
          )}
          {includeEfficiency && breakdown.efficiency.cache_hit_rate > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-green-600">
              <Zap className="h-3 w-3" />
              <span className="font-mono">{breakdown.efficiency.cache_hit_rate.toFixed(1)}%</span>
              <span className="text-muted-foreground">cached</span>
            </div>
          )}
        </div>
      );
    }

    // Simple mode (default)
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Hash className="h-3 w-3 text-muted-foreground" />
        <span className="font-mono">{tokenCounter.formatCount(breakdown.total)}</span>
        <span className="text-muted-foreground">tokens</span>
        {(includeCost || includeEfficiency) && (
          <span className="text-muted-foreground ml-1">•</span>
        )}
        {includeCost && breakdown.cost.total_cost > 0 && (
          <span className="font-mono text-green-600">{tokenCounter.formatCost(breakdown.cost.total_cost)}</span>
        )}
        {includeEfficiency && breakdown.efficiency.cache_hit_rate > 0 && (
          <span className="font-mono text-blue-600">
            {breakdown.efficiency.cache_hit_rate.toFixed(1)}% cached
          </span>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={cn(
              "fixed z-30",
              positionClasses[position],
              "bg-background/90 backdrop-blur-sm",
              "border border-border rounded-full",
              "px-3 py-1.5 shadow-lg cursor-help",
              "hover:bg-background/95 transition-colors",
              className
            )}
          >
            {formatContent()}
          </motion.div>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <pre className="text-xs whitespace-pre-wrap">
            {tokenCounter.createTooltip(tokenUsage, model)}
          </pre>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Compact inline token display component
 */
export const InlineTokenCounter: React.FC<{
  tokens: number | TokenUsage;
  model?: string;
  className?: string;
}> = ({ tokens, model, className }) => {
  const tokenUsage = React.useMemo(() => {
    if (!tokens) return { input_tokens: 0, output_tokens: 0 };

    if (typeof tokens === 'number') {
      return {
        input_tokens: Math.floor(tokens * 0.3),
        output_tokens: Math.floor(tokens * 0.7),
      };
    }

    return tokenCounter.normalizeUsage(tokens);
  }, [tokens]);

  const breakdown = tokenCounter.calculateBreakdown(tokenUsage, model);

  if (breakdown.total === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            "inline-flex items-center gap-1 text-xs text-muted-foreground cursor-help",
            "hover:text-foreground transition-colors",
            className
          )}>
            <Hash className="h-3 w-3" />
            <span className="font-mono">
              {tokenExtractor.format(tokenExtractor.extract({ message: { usage: tokenUsage } }), { showDetails: true })}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <pre className="text-xs whitespace-pre-wrap">
            {tokenExtractor.tooltip(tokenExtractor.extract({ message: { usage: tokenUsage } }), model).content}
          </pre>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export { tokenCounter };