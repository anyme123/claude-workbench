/**
 * Claude SDK Service - Direct TypeScript SDK Integration
 *
 * This service provides direct Claude API integration using the official
 * Anthropic TypeScript SDK, replacing CLI calls where appropriate.
 */

import Anthropic from '@anthropic-ai/sdk';
import { api } from './api';

export interface ClaudeSDKConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ClaudeStreamMessage {
  type: 'message_start' | 'content_block_delta' | 'message_delta' | 'message_stop';
  message?: {
    id: string;
    type: string;
    role: string;
    content: any[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  delta?: {
    type: string;
    text?: string;
    stop_reason?: string;
    stop_sequence?: string | null;
  };
  usage?: {
    output_tokens: number;
  };
}

export interface ClaudeResponse {
  id: string;
  content: string;
  role: 'assistant';
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  stop_reason: string | null;
}

export class ClaudeSDKService {
  private client: Anthropic | null = null;
  private config: ClaudeSDKConfig;
  private isInitialized = false;

  constructor(config: ClaudeSDKConfig = {}) {
    this.config = {
      defaultModel: 'claude-3-5-sonnet-20241022',
      maxTokens: 4000,
      temperature: 0.7,
      topP: 1,
      ...config,
    };
  }

  /**
   * Initialize the SDK with current provider configuration
   */
  async initialize(): Promise<void> {
    try {
      // Get current provider configuration
      const providerConfig = await api.getCurrentProviderConfig();

      // Use API key from provider config or environment
      const apiKey = providerConfig.anthropic_api_key ||
                    providerConfig.anthropic_auth_token ||
                    this.config.apiKey;

      if (!apiKey) {
        throw new Error('No API key available. Please configure provider settings.');
      }

      // Use base URL from provider config if available
      const baseURL = providerConfig.anthropic_base_url || this.config.baseURL;

      this.client = new Anthropic({
        apiKey,
        baseURL,
      });

      this.isInitialized = true;
      console.log('[ClaudeSDK] Initialized successfully');
    } catch (error) {
      console.error('[ClaudeSDK] Initialization failed:', error);
      throw new Error(`Failed to initialize Claude SDK: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Ensure SDK is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized || !this.client) {
      await this.initialize();
    }
  }

  /**
   * Send a single message and get response (non-streaming)
   */
  async sendMessage(
    messages: ClaudeMessage[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
    } = {}
  ): Promise<ClaudeResponse> {
    await this.ensureInitialized();

    if (!this.client) {
      throw new Error('Claude SDK not initialized');
    }

    const model = options.model || this.config.defaultModel!;
    const maxTokens = options.maxTokens || this.config.maxTokens!;

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature: options.temperature || this.config.temperature,
        top_p: this.config.topP,
        system: options.systemPrompt,
        messages: messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      });

      return {
        id: response.id,
        content: response.content[0]?.type === 'text' ? response.content[0].text : '',
        role: 'assistant',
        model: response.model,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens || undefined,
          cache_read_input_tokens: response.usage.cache_read_input_tokens || undefined,
        },
        stop_reason: response.stop_reason,
      };
    } catch (error) {
      console.error('[ClaudeSDK] Message sending failed:', error);
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send a message with streaming response
   */
  async *sendMessageStream(
    messages: ClaudeMessage[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
      onTokenUsage?: (usage: { input_tokens: number; output_tokens: number; cache_read_tokens?: number }) => void;
    } = {}
  ): AsyncGenerator<{ type: 'content' | 'usage' | 'done'; content?: string; usage?: any; response?: ClaudeResponse }, void, unknown> {
    await this.ensureInitialized();

    if (!this.client) {
      throw new Error('Claude SDK not initialized');
    }

    const model = options.model || this.config.defaultModel!;
    const maxTokens = options.maxTokens || this.config.maxTokens!;

    try {
      const stream = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature: options.temperature || this.config.temperature,
        top_p: this.config.topP,
        system: options.systemPrompt,
        messages: messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        stream: true,
      });

      let fullContent = '';
      let messageId = '';
      let usage: any = null;

      for await (const chunk of stream) {
        switch (chunk.type) {
          case 'message_start':
            messageId = chunk.message.id;
            usage = chunk.message.usage;
            break;

          case 'content_block_delta':
            if (chunk.delta.type === 'text_delta' && chunk.delta.text) {
              fullContent += chunk.delta.text;
              yield {
                type: 'content',
                content: chunk.delta.text,
              };
            }
            break;

          case 'message_delta':
            // 🔥 修复：正确累积增量output_tokens而不是直接覆盖
            if (chunk.usage && usage) {
              // message_delta中的output_tokens是增量值，需要累积
              if (chunk.usage.output_tokens !== undefined) {
                usage.output_tokens = (usage.output_tokens || 0) + chunk.usage.output_tokens;
              }
              
              // 合并其他usage字段（如果存在）
              if (chunk.usage.cache_read_input_tokens !== undefined) {
                usage.cache_read_input_tokens = chunk.usage.cache_read_input_tokens;
              }
              if (chunk.usage.cache_creation_input_tokens !== undefined) {
                usage.cache_creation_input_tokens = chunk.usage.cache_creation_input_tokens;
              }
            }
            break;

          case 'message_stop':
            // Report final usage
            if (usage && options.onTokenUsage) {
              options.onTokenUsage({
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
                cache_read_tokens: usage.cache_read_input_tokens,
              });
            }

            yield {
              type: 'usage',
              usage,
            };

            yield {
              type: 'done',
              response: {
                id: messageId,
                content: fullContent,
                role: 'assistant',
                model,
                usage,
                stop_reason: 'stop',
              },
            };
            break;
        }
      }
    } catch (error) {
      console.error('[ClaudeSDK] Streaming failed:', error);
      throw new Error(`Failed to stream message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Test connection with current configuration
   */
  async testConnection(): Promise<{ success: boolean; error?: string; model?: string }> {
    try {
      await this.ensureInitialized();

      const response = await this.sendMessage([
        { role: 'user', content: 'Hello, please respond with "Connection successful"' }
      ], {
        maxTokens: 50,
      });

      return {
        success: true,
        model: response.model,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get available models (mock implementation for now)
   */
  getAvailableModels(): string[] {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
    ];
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ClaudeSDKConfig>): void {
    this.config = { ...this.config, ...newConfig };
    // Force re-initialization on next use
    this.isInitialized = false;
    this.client = null;
  }

  /**
   * Check if SDK is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.client = null;
    this.isInitialized = false;
  }
}

// Export singleton instance
export const claudeSDK = new ClaudeSDKService();

// Auto-initialize on import
claudeSDK.initialize().catch(error => {
  console.warn('[ClaudeSDK] Auto-initialization failed:', error);
});