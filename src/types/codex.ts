/**
 * OpenAI Codex Integration - Type Definitions
 *
 * This file defines TypeScript types for OpenAI Codex exec mode integration.
 * Based on: https://github.com/openai/codex/blob/main/docs/exec.md
 */

// ============================================================================
// Event Types (JSONL Stream)
// ============================================================================

/**
 * Base event structure for Codex JSONL stream
 */
export interface CodexBaseEvent {
  type: string;
  timestamp?: string;
}

/**
 * Thread started event - when a thread is started or resumed
 */
export interface CodexThreadStartedEvent extends CodexBaseEvent {
  type: 'thread.started';
  thread_id: string;
}

/**
 * Turn started event - when a turn starts
 */
export interface CodexTurnStartedEvent extends CodexBaseEvent {
  type: 'turn.started';
}

/**
 * Turn completed event - when a turn completes
 */
export interface CodexTurnCompletedEvent extends CodexBaseEvent {
  type: 'turn.completed';
  usage: {
    input_tokens: number;
    cached_input_tokens?: number;
    output_tokens: number;
  };
}

/**
 * Turn failed event - when a turn fails
 */
export interface CodexTurnFailedEvent extends CodexBaseEvent {
  type: 'turn.failed';
  error: {
    message: string;
    code?: string;
  };
}

/**
 * Item started event
 */
export interface CodexItemStartedEvent extends CodexBaseEvent {
  type: 'item.started';
  item: CodexItem;
}

/**
 * Item updated event
 */
export interface CodexItemUpdatedEvent extends CodexBaseEvent {
  type: 'item.updated';
  item: CodexItem;
}

/**
 * Item completed event
 */
export interface CodexItemCompletedEvent extends CodexBaseEvent {
  type: 'item.completed';
  item: CodexItem;
}

/**
 * Error event - unrecoverable error
 */
export interface CodexErrorEvent extends CodexBaseEvent {
  type: 'error';
  error: {
    message: string;
    code?: string;
  };
}

/**
 * Event message event (general event wrapper)
 */
export interface CodexEventMsgEvent extends CodexBaseEvent {
  type: 'event_msg';
  payload: {
    type: string;
    message?: string;
    text?: string;
    info?: any;
    rate_limits?: any;
    [key: string]: any;
  };
}

/**
 * Turn context event
 */
export interface CodexTurnContextEvent extends CodexBaseEvent {
  type: 'turn_context';
  payload: {
    cwd: string;
    approval_policy: string;
    sandbox_policy: any;
    model: string;
    effort: string;
    summary: string;
  };
}

/**
 * Union type for all Codex events
 */
export type CodexEvent =
  | CodexThreadStartedEvent
  | CodexTurnStartedEvent
  | CodexTurnCompletedEvent
  | CodexTurnFailedEvent
  | CodexItemStartedEvent
  | CodexItemUpdatedEvent
  | CodexItemCompletedEvent
  | CodexErrorEvent
  | CodexSessionMetaEvent
  | CodexResponseItemEvent
  | CodexEventMsgEvent
  | CodexTurnContextEvent;

/**
 * Session metadata event
 */
export interface CodexSessionMetaEvent extends CodexBaseEvent {
  type: 'session_meta';
  payload: {
    id: string;
    timestamp: string;
    cwd: string;
    model?: string;
  };
}

/**
 * Response item event (Alternative format)
 */
export interface CodexResponseItemEvent extends CodexBaseEvent {
  type: 'response_item';
  payload: {
    id?: string;
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
      [key: string]: any;
    }>;
    timestamp?: string;
    [key: string]: any;
  };
}

// ============================================================================
// Item Types
// ============================================================================

/**
 * Agent message item
 */
export interface CodexAgentMessageItem {
  id: string;
  type: 'agent_message';
  text: string;
}

/**
 * Reasoning item - assistant's thinking
 */
export interface CodexReasoningItem {
  id: string;
  type: 'reasoning';
  text: string;
}

/**
 * Command execution item
 */
export interface CodexCommandExecutionItem {
  id: string;
  type: 'command_execution';
  command: string;
  aggregated_output: string;
  exit_code?: number;
  status: 'in_progress' | 'completed' | 'failed';
}

/**
 * File change item
 */
export interface CodexFileChangeItem {
  id: string;
  type: 'file_change';
  file_path: string;
  change_type: 'create' | 'update' | 'delete';
  content?: string;
  status: 'in_progress' | 'completed' | 'failed';
}

/**
 * MCP tool call item
 */
export interface CodexMcpToolCallItem {
  id: string;
  type: 'mcp_tool_call';
  tool_name: string;
  tool_input: any;
  tool_output?: any;
  status: 'in_progress' | 'completed' | 'failed';
}

/**
 * Web search item
 */
export interface CodexWebSearchItem {
  id: string;
  type: 'web_search';
  query: string;
  results?: any[];
  status: 'in_progress' | 'completed' | 'failed';
}

/**
 * Todo list item - agent's running plan
 */
export interface CodexTodoListItem {
  id: string;
  type: 'todo_list';
  todos: Array<{
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
  }>;
}

/**
 * Union type for all Codex items
 */
export type CodexItem =
  | CodexAgentMessageItem
  | CodexReasoningItem
  | CodexCommandExecutionItem
  | CodexFileChangeItem
  | CodexMcpToolCallItem
  | CodexWebSearchItem
  | CodexTodoListItem;

// ============================================================================
// Execution Configuration
// ============================================================================

/**
 * Codex execution mode
 */
export type CodexExecutionMode = 'read-only' | 'full-auto' | 'danger-full-access';

/**
 * Codex execution options
 */
export interface CodexExecutionOptions {
  /** Project path */
  projectPath: string;

  /** User prompt */
  prompt: string;

  /** Execution mode (default: read-only) */
  mode?: CodexExecutionMode;

  /** Model to use (e.g., gpt-5.1-codex-max) */
  model?: string;

  /** Enable JSON output mode */
  json?: boolean;

  /** Output schema for structured output (JSON Schema) */
  outputSchema?: string;

  /** Output file path */
  outputFile?: string;

  /** Skip Git repository check */
  skipGitRepoCheck?: boolean;

  /** API key (overrides default) */
  apiKey?: string;

  /** Session ID for resuming */
  sessionId?: string;

  /** Resume last session */
  resumeLast?: boolean;
}

/**
 * Codex execution result
 */
export interface CodexExecutionResult {
  /** Success status */
  success: boolean;

  /** Session/thread ID */
  sessionId: string;

  /** Final message from agent */
  finalMessage?: string;

  /** Structured output (if outputSchema was provided) */
  structuredOutput?: any;

  /** Token usage statistics */
  usage?: {
    input_tokens: number;
    cached_input_tokens?: number;
    output_tokens: number;
  };

  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Codex session metadata
 */
export interface CodexSession {
  /** Session/thread ID */
  id: string;

  /** Project path */
  projectPath: string;

  /** Creation timestamp */
  createdAt: number;

  /** Last updated timestamp */
  updatedAt: number;

  /** Execution mode used */
  mode: CodexExecutionMode;

  /** Model used */
  model?: string;

  /** Session status */
  status: 'active' | 'completed' | 'failed';

  /** 🆕 First user message */
  firstMessage?: string;

  /** 🆕 Last message timestamp (ISO string) */
  lastMessageTimestamp?: string;
}

// ============================================================================
// Message Conversion (Codex → ClaudeStreamMessage)
// ============================================================================

/**
 * Codex item to message conversion metadata
 */
export interface CodexMessageMetadata {
  /** Original Codex item type */
  codexItemType: string;

  /** Original Codex item ID */
  codexItemId: string;

  /** Codex thread ID */
  threadId?: string;

  /** Token usage (if available) */
  usage?: {
    input_tokens: number;
    cached_input_tokens?: number;
    output_tokens: number;
  };
}
