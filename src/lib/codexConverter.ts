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
  CodexMcpToolCallItem,
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

        default:
          console.warn('[CodexConverter] Unknown event type:', event);
          return null;
      }
    } catch (error) {
      console.error('[CodexConverter] Failed to parse event:', eventLine, error);
      return null;
    }
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
        return null;

      case 'web_search':
        return this.convertWebSearch(item, phase, metadata);

      case 'todo_list':
        return this.convertTodoList(item, phase, metadata);

      default:
        console.warn('[CodexConverter] Unknown item type:', item);
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
   * Creates a system message
   */
  private createSystemMessage(subtype: string, message: string): ClaudeStreamMessage {
    return {
      type: 'system',
      subtype: subtype as any,
      result: message,
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
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
