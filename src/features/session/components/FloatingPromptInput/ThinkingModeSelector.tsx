import React from "react";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ThinkingMode } from "./types";
import { THINKING_MODES } from "./constants";
import { ThinkingModeIndicator } from "./ThinkingModeIndicator";

interface ThinkingModeSelectorProps {
  selectedMode: ThinkingMode;
  onModeChange: (mode: ThinkingMode) => void;
  disabled?: boolean;
}

/**
 * ThinkingModeSelector component - Dropdown for selecting thinking intensity
 */
export const ThinkingModeSelector: React.FC<ThinkingModeSelectorProps> = ({
  selectedMode,
  onModeChange,
  disabled = false
}) => {
  const [open, setOpen] = React.useState(false);
  const selectedModeData = THINKING_MODES.find(m => m.id === selectedMode) || THINKING_MODES[0];

  return (
    <Popover
      trigger={
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="default"
                disabled={disabled}
                className="gap-2"
              >
                <Brain className="h-4 w-4" />
                <ThinkingModeIndicator level={selectedModeData.level} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{selectedModeData.name}</p>
              <p className="text-xs text-muted-foreground">{selectedModeData.description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      }
      content={
        <div className="w-[280px] p-1">
          {THINKING_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                onModeChange(mode.id);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-start gap-3 p-3 rounded-md transition-colors text-left",
                "hover:bg-accent",
                selectedMode === mode.id && "bg-accent"
              )}
            >
              <Brain className="h-4 w-4 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm">{mode.name}</div>
                <div className="text-xs text-muted-foreground">
                  {mode.description}
                </div>
              </div>
              <ThinkingModeIndicator level={mode.level} />
            </button>
          ))}
        </div>
      }
      open={open}
      onOpenChange={setOpen}
      align="start"
      side="top"
    />
  );
};
