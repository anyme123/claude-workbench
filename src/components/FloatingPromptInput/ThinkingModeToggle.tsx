import React from "react";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ThinkingModeToggleProps {
  isEnabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * ThinkingModeToggle component - Simple on/off toggle for extended thinking
 * Conforms to official Claude Code standard (Tab key to toggle)
 */
export const ThinkingModeToggle: React.FC<ThinkingModeToggleProps> = ({
  isEnabled,
  onToggle,
  disabled = false
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isEnabled ? "default" : "outline"}
            size="default"
            disabled={disabled}
            onClick={onToggle}
            className={cn(
              "gap-2 transition-all duration-200",
              isEnabled
                ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600 shadow-sm shadow-amber-500/20"
                : "bg-muted/50 hover:bg-muted text-muted-foreground border-muted-foreground/20"
            )}
          >
            <Brain className={cn(
              "h-4 w-4 transition-all duration-200",
              isEnabled ? "animate-pulse text-white" : "text-muted-foreground"
            )} />
            <span className="text-sm font-medium">
              {isEnabled ? "思考: 开" : "思考: 关"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <p className="font-medium">
              {isEnabled ? "扩展思考已启用" : "扩展思考已关闭"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isEnabled ? "Claude 将进行深度思考 (10K tokens)" : "正常响应速度"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              快捷键: <kbd className="px-1 py-0.5 bg-muted rounded">Tab</kbd>
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
