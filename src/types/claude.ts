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
  [key: string]: any;
}
