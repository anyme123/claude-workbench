import React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toolRegistry } from "@/lib/toolRegistry";
import type { ClaudeStreamMessage } from "@/types/claude";

interface SystemMessageProps {
  message: ClaudeStreamMessage;
  className?: string;
  claudeSettings?: { showSystemInitialization?: boolean };
}

const formatTimestamp = (timestamp: string | undefined): string => {
  if (!timestamp) {
    return "";
  }

  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
};

const extractMessageContent = (message: ClaudeStreamMessage): string => {
  const content = message.message?.content;

  if (!content) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && typeof item.text === "string") {
          return item.text;
        }
        if (item && typeof item === "object" && typeof item.content === "string") {
          return item.content;
        }
        try {
          return JSON.stringify(item, null, 2);
        } catch {
          return String(item);
        }
      })
      .filter(Boolean)
      .join("\n");
  }

  if (typeof content === "object") {
    if (typeof (content as any).text === "string") {
      return (content as any).text;
    }
    if (typeof (content as any).message === "string") {
      return (content as any).message;
    }

    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }

  return String(content);
};

export const SystemMessage: React.FC<SystemMessageProps> = ({
  message,
  className,
  claudeSettings,
}) => {
  const subtype = message.subtype;

  if (subtype === "init") {
    const showSystemInit = claudeSettings?.showSystemInitialization !== false;
    if (!showSystemInit) {
      return null;
    }

    const renderer = toolRegistry.getRenderer("system_initialized");

    if (renderer) {
      const Renderer = renderer.render;
      return (
        <div className={cn("my-4", className)}>
          <Renderer
            toolName="system_initialized"
            input={{
              sessionId: (message as any).session_id ?? (message as any).sessionId ?? undefined,
              model: (message as any).model ?? undefined,
              cwd: (message as any).cwd ?? undefined,
              tools: (message as any).tools ?? undefined,
              timestamp: (message as any).receivedAt ?? (message as any).timestamp ?? undefined,
            }}
          />
        </div>
      );
    }

    // Fallback rendering when registry is unavailable
    return (
      <div className={cn("my-4", className)}>
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          系统初始化完成。
        </div>
      </div>
    );
  }

  const content = extractMessageContent(message);
  if (!content) {
    return null;
  }

  const formattedTime = formatTimestamp((message as any).receivedAt ?? (message as any).timestamp);

  return (
    <div className={cn("my-4", className)}>
      <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
          <Info className="h-3.5 w-3.5" />
          系统消息
          {formattedTime && (
            <>
              <span className="text-muted-foreground/40">•</span>
              <span className="font-mono normal-case text-muted-foreground/70">{formattedTime}</span>
            </>
          )}
        </div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {content}
        </div>
      </div>
    </div>
  );
};

SystemMessage.displayName = "SystemMessage";


