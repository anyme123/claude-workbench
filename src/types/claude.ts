// Claude stream message types

export interface ClaudeStreamMessage {
  type: "system" | "assistant" | "user" | "result" | "summary" | "queue-operation" | "thinking" | "tool_use";
  subtype?: string;
  message?: {
    content?: any[];
    role?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_tokens?: number;
      cache_read_tokens?: number;
    };
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  };
  // OpenAI Codex metadata (when converted from Codex events)
  codexMetadata?: {
    codexItemType: string;
    codexItemId: string;
    threadId?: string;
    usage?: {
      input_tokens: number;
      cached_input_tokens?: number;
      output_tokens: number;
    };
  };
  // Google Gemini metadata (when converted from Gemini events)
  geminiMetadata?: {
    provider: 'gemini';
    eventType: string;
    delta?: boolean;
    stats?: {
      total_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
      duration_ms?: number;
      tool_calls?: number;
    };
    toolName?: string;
    toolId?: string;
    status?: string;
    exitCode?: number;
    raw?: unknown;
  };
  // Execution engine identifier
  engine?: 'claude' | 'codex' | 'gemini';
  [key: string]: any;
}
