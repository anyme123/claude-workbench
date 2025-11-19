import React from "react";
import { cn } from "@/lib/utils";
import { toolRegistry } from "@/lib/toolRegistry";
import type { ClaudeStreamMessage } from "@/types/claude";

interface SummaryMessageProps {
  message: ClaudeStreamMessage;
  className?: string;
}

export const SummaryMessage: React.FC<SummaryMessageProps> = ({ message, className }) => {
  const summary = (message as any).summary as string | undefined;
  if (!summary || typeof summary !== "string" || summary.trim() === "") {
    return null;
  }

  const renderer = toolRegistry.getRenderer("summary");

  if (renderer) {
    const Renderer = renderer.render;
    return (
      <div className={cn("my-4", className)}>
        <Renderer
          toolName="summary"
          input={{
            summary,
            leafUuid: (message as any).leafUuid ?? (message as any).leaf_uuid ?? undefined,
            usage: message.usage ?? (message as any).usage ?? undefined,
          }}
        />
      </div>
    );
  }

  return (
    <div className={cn("my-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary", className)}>
      {summary}
    </div>
  );
};

SummaryMessage.displayName = "SummaryMessage";


