/**
 * OpenAI Codex Event Converter
 *
 * Converts Codex JSONL events to ClaudeStreamMessage format
 * for seamless integration with existing message display components.
 */

import type {
  CodexEvent,
  CodexItem,
  CodexAgentMessageItem,
  CodexReasoningItem,
  CodexCommandExecutionItem,
  CodexFileChangeItem,
  CodexWebSearchItem,
  CodexTodoListItem,
  CodexMessageMetadata,
} from '@/types/codex';
import type { ClaudeStreamMessage } from '@/types/claude';

/**
 * State manager for Codex event conversion
 * Maintains context across multiple events for proper message construction
 */
export class CodexEventConverter {
  private threadId: string | null = null;
  private currentTurnUsage: { input_tokens: number; cached_input_tokens?: number; output_tokens: number } | null = null;
  private itemMap: Map<string, CodexItem> = new Map();

  /**
   * Converts a Codex JSONL event to ClaudeStreamMessage format
   * @param eventLine - Raw JSONL line from Codex output
   * @returns ClaudeStreamMessage or null if event should be skipped
   */
  convertEvent(eventLine: string): ClaudeStreamMessage | null {
    try {
      const event = JSON.parse(eventLine) as CodexEvent;
      return this.convertEventObject(event);
    } catch (error) {
      console.error('[CodexConverter] Failed to parse event:', eventLine, error);
      return null;
    }
  }

  /**
   * Converts a parsed Codex event object to ClaudeStreamMessage format
   * @param event - Parsed Codex event object
   * @returns ClaudeStreamMessage or null if event should be skipped
   */
  convertEventObject(event: CodexEvent): ClaudeStreamMessage | null {
      console.log('[CodexConverter] Processing event:', event.type, event);

      switch (event.type) {
        case 'thread.started':
          this.threadId = event.thread_id;
          // Return init message with session_id for frontend to track
          return {
            type: 'system',
            subtype: 'init',
            result: `Codex session started`,
            session_id: event.thread_id, // ← Important: frontend will extract this
            timestamp: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
          };

        case 'turn.started':
          // Reset turn state
          this.currentTurnUsage = null;
          console.log('[CodexConverter] Skipping turn.started event');
          return null; // Don't display turn start events

        case 'turn.completed':
          this.currentTurnUsage = event.usage;
          return this.createUsageMessage(event.usage);

        case 'turn.failed':
          return this.createErrorMessage(event.error.message);

        case 'item.started':
          this.itemMap.set(event.item.id, event.item);
          return this.convertItem(event.item, 'started');

        case 'item.updated':
          this.itemMap.set(event.item.id, event.item);
          return this.convertItem(event.item, 'updated');

        case 'item.completed':
          this.itemMap.set(event.item.id, event.item);
          return this.convertItem(event.item, 'completed');

        case 'error':
          return this.createErrorMessage(event.error.message);

        case 'session_meta':
          // Return init message
          return {
            type: 'system',
            subtype: 'init',
            result: `Codex session started (ID: ${event.payload.id})`,
            session_id: event.payload.id,
            timestamp: event.payload.timestamp || new Date().toISOString(),
            receivedAt: new Date().toISOString(),
          };

        case 'response_item':
          return this.convertResponseItem(event);

        case 'event_msg':
          return this.convertEventMsg(event as import('@/types/codex').CodexEventMsgEvent);

        case 'turn_context':
          // Turn context events are metadata, don't display
          console.log('[CodexConverter] Skipping turn_context event');
          return null;

        default:
          console.warn('[CodexConverter] Unknown event type:', (event as any).type, 'Full event:', event);
          return null;
      }
  }

  /**
   * Converts event_msg event to ClaudeStreamMessage
   */
  private convertEventMsg(event: import('@/types/codex').CodexEventMsgEvent): ClaudeStreamMessage | null {
    const { payload } = event;

    switch (payload.type) {
      case 'agent_reasoning':
        // Skip agent_reasoning - it's duplicated by response_item.reasoning
        // Codex sends both event_msg.agent_reasoning (quick notification) and
        // response_item.reasoning (full details with encrypted content)
        // We only process response_item.reasoning to avoid duplicates
        console.log('[CodexConverter] Skipping event_msg.agent_reasoning (handled by response_item.reasoning)');
        return null;

      case 'token_count':
        // Skip token count events - they are displayed separately via turn.completed
        return null;

      case 'user_message':
        // Alternative user message format
        return {
          type: 'user',
          message: {
            role: 'user',
            content: [
              {
                type: 'text',
                text: payload.message || '',
              },
            ],
          },
          timestamp: event.timestamp || new Date().toISOString(),
          receivedAt: new Date().toISOString(),
        };

      default:
        console.log('[CodexConverter] Skipping event_msg with payload.type:', payload.type);
        return null;
    }
  }

  /**
   * Converts response_item event to ClaudeStreamMessage
   * Note: This handles different payload.type values including function_call, reasoning, etc.
   */
  private convertResponseItem(event: import('@/types/codex').CodexResponseItemEvent): ClaudeStreamMessage | null {
    const { payload } = event;
    if (!payload) {
      console.warn('[CodexConverter] response_item missing payload:', event);
      return null;
    }

    // Handle different response_item payload types
    const payloadType = (payload as any).type;

    if (payloadType === 'function_call') {
      // Tool use (function call)
      return this.convertFunctionCall(event);
    }

    if (payloadType === 'function_call_output') {
      // Tool result (function call output)
      return this.convertFunctionCallOutput(event);
    }

    if (payloadType === 'reasoning') {
      // Extended thinking (encrypted content)
      return this.convertReasoningPayload(event);
    }

    if (payloadType === 'ghost_snapshot') {
      // Ghost commit snapshot - skip for now
      console.log('[CodexConverter] Skipping ghost_snapshot');
      return null;
    }

    // Handle message-type response_item (user/assistant messages)
    if (!payload.role) {
      console.warn('[CodexConverter] response_item missing role and not a recognized type:', event);
      return null;
    }

    // Filter out system environment context messages from user
    if (payload.role === 'user' && payload.content) {
      const isEnvContext = payload.content.some(c =>
        c.type === 'input_text' && c.text && (
          c.text.includes('<environment_context>') ||
          c.text.includes('# AGENTS.md instructions')
        )
      );

      if (isEnvContext) {
        console.log('[CodexConverter] Filtered out environment context message');
        return null;
      }
    }

    // Map payload to Claude message structure
    // Note: Codex uses 'input_text' for user messages and 'output_text' for assistant messages
    // Claude uses 'text' for both
    const content = payload.content?.map(c => ({
      ...c,
      type: c.type === 'input_text' || c.type === 'output_text' ? 'text' : c.type
    })) || [];

    // Check if content is empty or has only empty text blocks
    if (content.length === 0) {
      console.warn('[CodexConverter] response_item has empty content, skipping');
      return null;
    }

    const hasNonEmptyContent = content.some(c => {
      if (c.type === 'text') {
        return c.text && c.text.trim().length > 0;
      }
      return true; // Non-text content blocks are considered valid
    });

    if (!hasNonEmptyContent) {
      console.warn('[CodexConverter] response_item has no non-empty content, skipping');
      return null;
    }

    const message: ClaudeStreamMessage = {
      type: payload.role === 'user' ? 'user' : 'assistant',
      message: {
        role: payload.role,
        content: content
      },
      timestamp: payload.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };

    console.log('[CodexConverter] Converted response_item:', {
      eventType: event.type,
      role: payload.role,
      contentTypes: content?.map(c => c.type),
      contentCount: content.length,
      messageType: message.type
    });

    return message;
  }

  /**
   * Converts function_call response_item to tool_use message
   */
  private convertFunctionCall(event: any): ClaudeStreamMessage {
    const payload = event.payload;
    const toolName = payload.name || 'unknown_tool';
    const toolArgs = payload.arguments ? JSON.parse(payload.arguments) : {};
    const callId = payload.call_id || `call_${Date.now()}`;

    return {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: callId,
            name: toolName,
            input: toolArgs,
          },
        ],
      },
      timestamp: event.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };
  }

  /**
   * Converts function_call_output response_item to tool_result message
   */
  private convertFunctionCallOutput(event: any): ClaudeStreamMessage {
    const payload = event.payload;
    const callId = payload.call_id || `call_${Date.now()}`;
    const output = payload.output || '';

    // Parse output if it's JSON string
    let resultContent = output;
    try {
      if (typeof output === 'string' && output.trim().startsWith('[')) {
        const parsed = JSON.parse(output);
        if (Array.isArray(parsed) && parsed[0]?.text) {
          resultContent = parsed[0].text;
        }
      }
    } catch {
      // Keep original output if parsing fails
    }

    return {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_result',
            tool_use_id: callId,
            content: typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent),
          },
        ],
      },
      timestamp: event.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };
  }

  /**
   * Converts reasoning response_item to thinking message
   */
  private convertReasoningPayload(event: any): ClaudeStreamMessage {
    const payload = event.payload;

    // Extract summary text if available
    const summaryText = payload.summary
      ?.map((s: any) => s.text || s.summary_text)
      .filter(Boolean)
      .join('\n') || '';

    // Note: encrypted_content is encrypted and cannot be displayed
    // We use the summary instead
    return {
      type: 'thinking',
      content: summaryText || '(Extended thinking - encrypted content)',
      timestamp: event.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };
  }

  /**
   * Converts a Codex item to ClaudeStreamMessage
   */
  private convertItem(item: CodexItem, phase: 'started' | 'updated' | 'completed'): ClaudeStreamMessage | null {
    const metadata: CodexMessageMetadata = {
      codexItemType: item.type,
      codexItemId: item.id,
      threadId: this.threadId || undefined,
      usage: this.currentTurnUsage || undefined,
    };

    switch (item.type) {
      case 'agent_message':
        return this.convertAgentMessage(item, phase, metadata);

      case 'reasoning':
        return this.convertReasoning(item, phase, metadata);

      case 'command_execution':
        return this.convertCommandExecution(item, phase, metadata);

      case 'file_change':
        return this.convertFileChange(item, phase, metadata);

      case 'mcp_tool_call':
        // Only show tool calls when completed (to avoid "executing" state)
        if (phase === 'completed') {
          return this.convertMcpToolCall(item, phase, metadata);
        }
        console.log('[CodexConverter] Skipping mcp_tool_call in phase:', phase);
        return null;

      case 'web_search':
        return this.convertWebSearch(item, phase, metadata);

      case 'todo_list':
        return this.convertTodoList(item, phase, metadata);

      default:
        console.warn('[CodexConverter] Unknown item type:', (item as any).type, 'Full item:', item);
        return null;
    }
  }

  /**
   * Converts agent_message to assistant message
   */
  private convertAgentMessage(
    item: CodexAgentMessageItem,
    _phase: string,
    metadata: CodexMessageMetadata
  ): ClaudeStreamMessage {
    return {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: item.text,
          },
        ],
      },
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      codexMetadata: metadata,
    };
  }

  /**
   * Converts reasoning to thinking message
   */
  private convertReasoning(
    item: CodexReasoningItem,
    _phase: string,
    metadata: CodexMessageMetadata
  ): ClaudeStreamMessage {
    return {
      type: 'thinking',
      content: item.text,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      codexMetadata: metadata,
    };
  }

  /**
   * Converts command_execution to tool_use message
   */
  private convertCommandExecution(
    item: CodexCommandExecutionItem,
    phase: string,
    metadata: CodexMessageMetadata
  ): ClaudeStreamMessage {
    const isComplete = phase === 'completed';
    const toolUseId = `codex_cmd_${item.id}`;

    if (!isComplete) {
      // Return tool_use for started/updated
      return {
        type: 'tool_use',
        subtype: 'tool_use',
        tool_use: {
          id: toolUseId,
          name: 'bash',
          input: { command: item.command },
          type: 'tool_use',
        },
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        codexMetadata: metadata,
      };
    } else {
      // Return tool_result for completed
      return {
        type: 'tool_use',
        subtype: 'tool_result',
        tool_result: {
          tool_use_id: toolUseId,
          content: [
            {
              type: 'text',
              text: item.aggregated_output || '',
            },
          ],
          is_error: item.status === 'failed',
          type: 'tool_result',
        },
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        codexMetadata: metadata,
      };
    }
  }

  /**
   * Converts file_change to tool_use message
   */
  private convertFileChange(
    item: CodexFileChangeItem,
    phase: string,
    metadata: CodexMessageMetadata
  ): ClaudeStreamMessage {
    const toolUseId = `codex_file_${item.id}`;
    const toolName = item.change_type === 'create' ? 'write' : item.change_type === 'delete' ? 'bash' : 'edit';

    return {
      type: 'tool_use',
      subtype: phase === 'completed' ? 'tool_result' : 'tool_use',
      tool_use: phase !== 'completed' ? {
        id: toolUseId,
        name: toolName,
        input: {
          file_path: item.file_path,
          content: item.content,
          change_type: item.change_type,
        },
        type: 'tool_use',
      } : undefined,
      tool_result: phase === 'completed' ? {
        tool_use_id: toolUseId,
        content: [
          {
            type: 'text',
            text: `File ${item.change_type}: ${item.file_path}`,
          },
        ],
        is_error: item.status === 'failed',
        type: 'tool_result',
      } : undefined,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      codexMetadata: metadata,
    };
  }

  /**
   * Converts mcp_tool_call to complete tool_use + tool_result message
   * Only called when phase === 'completed'
   */
  private convertMcpToolCall(
    item: any, // Use any to handle actual Codex format
    _phase: string,
    metadata: CodexMessageMetadata
  ): ClaudeStreamMessage {
    const toolUseId = `codex_mcp_${item.id}`;

    // Extract tool name from Codex format: server.tool or just tool
    const toolName = item.server ? `mcp__${item.server}__${item.tool}` : (item.tool || item.tool_name);

    // Always create a complete message with both tool_use and tool_result
    {
    // Extract actual result content from nested structure
    const output = item.result || item.tool_output;
    let resultText = '';

    if (output && typeof output === 'object') {
      // MCP result format: { content: [{ text: "..." }], ... }
      if (output.content && Array.isArray(output.content)) {
        resultText = output.content
          .filter((c: any) => c.type === 'text' || c.text)
          .map((c: any) => c.text)
          .join('\n');
      } else {
        resultText = JSON.stringify(output, null, 2);
      }
    } else {
      resultText = output ? String(output) : '';
    }

    // Return assistant message with both tool_use and tool_result in content array
    return {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: toolUseId,
            name: toolName,
            input: item.arguments || item.tool_input || {},
          },
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: [{ type: 'text', text: resultText }],
            is_error: item.status === 'failed' || item.error !== null,
          }
        ]
      },
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      codexMetadata: metadata,
    };
  }
  }

  /**
   * Converts web_search to tool_use message
   */
  private convertWebSearch(
    item: CodexWebSearchItem,
    phase: string,
    metadata: CodexMessageMetadata
  ): ClaudeStreamMessage {
    const toolUseId = `codex_search_${item.id}`;

    if (phase !== 'completed') {
      return {
        type: 'tool_use',
        subtype: 'tool_use',
        tool_use: {
          id: toolUseId,
          name: 'web_search',
          input: { query: item.query },
          type: 'tool_use',
        },
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        codexMetadata: metadata,
      };
    } else {
      return {
        type: 'tool_use',
        subtype: 'tool_result',
        tool_result: {
          tool_use_id: toolUseId,
          content: [
            {
              type: 'text',
              text: JSON.stringify(item.results, null, 2),
            },
          ],
          is_error: item.status === 'failed',
          type: 'tool_result',
        },
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        codexMetadata: metadata,
      };
    }
  }

  /**
   * Converts todo_list to system message
   */
  private convertTodoList(
    item: CodexTodoListItem,
    _phase: string,
    metadata: CodexMessageMetadata
  ): ClaudeStreamMessage {
    const todoText = item.todos
      .map(
        (todo) =>
          `${todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '⏳' : '○'} ${todo.description}`
      )
      .join('\n');

    return {
      type: 'system',
      subtype: 'info',
      result: `**Plan:**\n${todoText}`,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      codexMetadata: metadata,
    };
  }

  /**
   * Creates a usage statistics message
   */
  private createUsageMessage(usage: {
    input_tokens: number;
    cached_input_tokens?: number;
    output_tokens: number;
  }): ClaudeStreamMessage {
    const totalTokens = usage.input_tokens + usage.output_tokens;
    const cacheInfo = usage.cached_input_tokens ? ` (${usage.cached_input_tokens} cached)` : '';

    return {
      type: 'system',
      subtype: 'info',
      result: `**Token Usage:** ${totalTokens} tokens (${usage.input_tokens} input${cacheInfo}, ${usage.output_tokens} output)`,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      usage,
    };
  }

  /**
   * Creates an error message
   */
  private createErrorMessage(errorText: string): ClaudeStreamMessage {
    return {
      type: 'system',
      subtype: 'error',
      result: `**Error:** ${errorText}`,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };
  }

  /**
   * Resets converter state (e.g., when starting a new session)
   */
  reset(): void {
    this.threadId = null;
    this.currentTurnUsage = null;
    this.itemMap.clear();
  }
}

/**
 * Singleton instance for global use
 */
export const codexConverter = new CodexEventConverter();
