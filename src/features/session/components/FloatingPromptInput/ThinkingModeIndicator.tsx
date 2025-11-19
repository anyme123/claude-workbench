import React from "react";
import { cn } from "@/lib/utils";

interface ThinkingModeIndicatorProps {
  level: number;
}

/**
 * ThinkingModeIndicator component - Shows visual indicator bars for thinking level
 * Supports 0-5 levels to match Claude Code thinking intensities
 */
export const ThinkingModeIndicator: React.FC<ThinkingModeIndicatorProps> = ({ level }) => {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={cn(
            "w-1 h-3 rounded-full transition-colors",
            i <= level ? "bg-blue-500 dark:bg-blue-400" : "bg-muted"
          )}
        />
      ))}
    </div>
  );
};
