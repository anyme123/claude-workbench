/**
 * Unified Error Handling System
 *
 * Comprehensive error handling for both Claude SDK API and CLI integration.
 * Provides detailed error classification, recovery strategies, and user-friendly messages.
 *
 * Merged from errorHandler.ts and errorHandling.ts for unified error management.
 */

import { APIError } from '@anthropic-ai/sdk/error';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ErrorContext {
  operation: string;
  model?: string;
  projectPath?: string;
  sessionId?: string;
  timestamp: number;
  userAgent?: string;
  retryCount?: number;
}

export interface RecoveryAction {
  label: string;
  action: () => void | Promise<void>;
  primary?: boolean;
  destructive?: boolean;
}

// Backward compatibility - alias for RecoveryAction
export type ErrorAction = RecoveryAction;

export interface ErrorDetails {
  code: string;
  type: ErrorType;
  message: string;
  userMessage: string;
  recoverable: boolean;
  retryable: boolean;
  context?: ErrorContext;
  originalError?: Error;
  actions?: RecoveryAction[];
  documentation?: string;
}

export enum ErrorType {
  // Authentication & Authorization
  AUTH_INVALID_API_KEY = 'AUTH_INVALID_API_KEY',
  AUTH_PERMISSION_DENIED = 'AUTH_PERMISSION_DENIED',
  AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',
  AUTH_QUOTA_EXCEEDED = 'AUTH_QUOTA_EXCEEDED',

  // Network & Connectivity
  NETWORK_CONNECTION_FAILED = 'NETWORK_CONNECTION_FAILED',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_DNS_ERROR = 'NETWORK_DNS_ERROR',

  // API & Request Errors
  API_INVALID_REQUEST = 'API_INVALID_REQUEST',
  API_MODEL_NOT_FOUND = 'API_MODEL_NOT_FOUND',
  API_CONTEXT_TOO_LONG = 'API_CONTEXT_TOO_LONG',
  API_OVERLOADED = 'API_OVERLOADED',

  // SDK & Integration Errors
  SDK_NOT_INITIALIZED = 'SDK_NOT_INITIALIZED',
  SDK_CONFIGURATION_ERROR = 'SDK_CONFIGURATION_ERROR',
  SDK_VERSION_MISMATCH = 'SDK_VERSION_MISMATCH',

  // CLI Specific Errors (merged from errorHandler.ts)
  CLAUDE_NOT_FOUND = 'CLAUDE_NOT_FOUND',
  CLAUDE_NOT_EXECUTABLE = 'CLAUDE_NOT_EXECUTABLE',
  CLAUDE_VERSION_MISMATCH = 'CLAUDE_VERSION_MISMATCH',
  CLAUDE_PERMISSION_DENIED = 'CLAUDE_PERMISSION_DENIED',
  CLAUDE_NETWORK_ERROR = 'CLAUDE_NETWORK_ERROR',
  CLAUDE_TIMEOUT = 'CLAUDE_TIMEOUT',
  CLAUDE_PROCESS_ERROR = 'CLAUDE_PROCESS_ERROR',
  CLAUDE_CONFIG_ERROR = 'CLAUDE_CONFIG_ERROR',
  SYSTEM_PATH_ERROR = 'SYSTEM_PATH_ERROR',

  // Application Errors
  APP_SESSION_EXPIRED = 'APP_SESSION_EXPIRED',
  APP_INVALID_STATE = 'APP_INVALID_STATE',
  APP_RESOURCE_NOT_FOUND = 'APP_RESOURCE_NOT_FOUND',

  // Cache & Storage Errors
  CACHE_CORRUPTION = 'CACHE_CORRUPTION',
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  STORAGE_ACCESS_DENIED = 'STORAGE_ACCESS_DENIED',

  // Unknown Errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// Backward compatibility - legacy ErrorCode type
export type ErrorCode =
  | 'CLAUDE_NOT_FOUND'
  | 'CLAUDE_NOT_EXECUTABLE'
  | 'CLAUDE_VERSION_MISMATCH'
  | 'CLAUDE_PERMISSION_DENIED'
  | 'CLAUDE_NETWORK_ERROR'
  | 'CLAUDE_TIMEOUT'
  | 'CLAUDE_PROCESS_ERROR'
  | 'CLAUDE_CONFIG_ERROR'
  | 'SYSTEM_PATH_ERROR'
  | 'UNKNOWN_ERROR';

// ============================================================================
// ClaudeError Class
// ============================================================================

export class ClaudeError extends Error {
  public readonly code: string;
  public readonly type: ErrorType;
  public readonly userMessage: string;
  public readonly recoverable: boolean;
  public readonly retryable: boolean;
  public readonly context?: ErrorContext;
  public readonly originalError?: Error;
  public readonly actions: RecoveryAction[];
  public readonly documentation?: string;

  constructor(details: ErrorDetails);
  constructor(
    code: ErrorCode,
    message: string,
    userMessage: string,
    options?: {
      recoverable?: boolean;
      retryable?: boolean;
      actions?: ErrorAction[];
      originalError?: Error;
    }
  );
  constructor(
    detailsOrCode: ErrorDetails | ErrorCode,
    message?: string,
    userMessage?: string,
    options?: {
      recoverable?: boolean;
      retryable?: boolean;
      actions?: ErrorAction[];
      originalError?: Error;
    }
  ) {
    // Handle both constructor signatures for backward compatibility
    if (typeof detailsOrCode === 'object') {
      const details = detailsOrCode;
      super(details.message);
      this.code = details.code;
      this.type = details.type;
      this.userMessage = details.userMessage;
      this.recoverable = details.recoverable;
      this.retryable = details.retryable;
      this.context = details.context;
      this.originalError = details.originalError;
      this.actions = details.actions ?? [];
      this.documentation = details.documentation;
    } else {
      // Legacy constructor for backward compatibility
      const code = detailsOrCode;
      super(message!);
      this.code = code;
      this.type = ErrorType[code as keyof typeof ErrorType] || ErrorType.UNKNOWN_ERROR;
      this.userMessage = userMessage!;
      this.recoverable = options?.recoverable ?? true;
      this.retryable = options?.retryable ?? false;
      this.actions = options?.actions ?? [];
      this.originalError = options?.originalError;
    }

    this.name = 'ClaudeError';
  }

  /**
   * Convert error to user-friendly object
   */
  toUserObject() {
    return {
      type: this.type,
      message: this.userMessage,
      recoverable: this.recoverable,
      retryable: this.retryable,
      actions: this.actions,
      documentation: this.documentation,
      timestamp: this.context?.timestamp || Date.now(),
    };
  }

  /**
   * Check if error should trigger retry
   */
  shouldRetry(): boolean {
    return this.retryable && (this.context?.retryCount || 0) < 3;
  }
}

// ============================================================================
// ErrorHandler Class
// ============================================================================

export class ErrorHandler {
  private errorHistory: ClaudeError[] = [];
  private maxHistorySize = 100;

  /**
   * Process and classify an error
   */
  handleError(error: unknown, context?: Partial<ErrorContext>): ClaudeError {
    const fullContext: ErrorContext = {
      operation: 'unknown',
      timestamp: Date.now(),
      retryCount: 0,
      ...context,
    };

    let claudeError: ClaudeError;

    if (error instanceof ClaudeError) {
      claudeError = error;
    } else if (error instanceof APIError) {
      claudeError = this.handleAPIError(error, fullContext);
    } else if (error instanceof Error) {
      claudeError = this.handleGenericError(error, fullContext);
    } else {
      claudeError = this.handleUnknownError(error, fullContext);
    }

    // Add to history
    this.addToHistory(claudeError);

    // Log error for debugging
    console.error(`[ErrorHandler] ${claudeError.type}:`, {
      message: claudeError.message,
      context: claudeError.context,
      originalError: claudeError.originalError,
    });

    return claudeError;
  }

  /**
   * Handle Anthropic API errors
   */
  private handleAPIError(error: APIError, context: ErrorContext): ClaudeError {
    const status = error.status || 500;

    switch (status) {
      case 400:
        if (error.message.includes('context_length_exceeded')) {
          return new ClaudeError({
            code: 'API_CONTEXT_TOO_LONG',
            type: ErrorType.API_CONTEXT_TOO_LONG,
            message: error.message,
            userMessage: '对话内容过长，请使用压缩功能或开始新对话',
            recoverable: true,
            retryable: false,
            context,
            originalError: error,
            actions: [
              {
                label: '自动压缩',
                action: () => {
                  window.dispatchEvent(new CustomEvent('trigger-auto-compact'));
                },
                primary: true,
              },
              {
                label: '开始新对话',
                action: () => {
                  window.dispatchEvent(new CustomEvent('start-new-conversation'));
                },
              },
            ],
            documentation: 'https://docs.anthropic.com/en/api/rate-limits',
          });
        }
        return new ClaudeError({
          code: 'API_INVALID_REQUEST',
          type: ErrorType.API_INVALID_REQUEST,
          message: error.message,
          userMessage: '请求参数无效，请检查输入内容',
          recoverable: true,
          retryable: false,
          context,
          originalError: error,
        });

      case 401:
        return new ClaudeError({
          code: 'AUTH_INVALID_API_KEY',
          type: ErrorType.AUTH_INVALID_API_KEY,
          message: error.message,
          userMessage: 'API 密钥无效或已过期，请检查配置',
          recoverable: true,
          retryable: false,
          context,
          originalError: error,
          actions: [
            {
              label: '检查API密钥',
              action: () => {
                window.dispatchEvent(new CustomEvent('open-provider-settings'));
              },
              primary: true,
            },
          ],
          documentation: 'https://console.anthropic.com/',
        });

      case 403:
        return new ClaudeError({
          code: 'AUTH_PERMISSION_DENIED',
          type: ErrorType.AUTH_PERMISSION_DENIED,
          message: error.message,
          userMessage: '访问被拒绝，请检查账户权限和余额',
          recoverable: true,
          retryable: false,
          context,
          originalError: error,
          actions: [
            {
              label: '检查账户状态',
              action: () => {
                window.open('https://console.anthropic.com/settings/billing', '_blank');
              },
            },
          ],
        });

      case 404:
        return new ClaudeError({
          code: 'API_MODEL_NOT_FOUND',
          type: ErrorType.API_MODEL_NOT_FOUND,
          message: error.message,
          userMessage: '所请求的模型不存在或不可用',
          recoverable: true,
          retryable: false,
          context,
          originalError: error,
          actions: [
            {
              label: '选择其他模型',
              action: () => {
                window.dispatchEvent(new CustomEvent('show-model-selector'));
              },
              primary: true,
            },
          ],
        });

      case 429:
        return new ClaudeError({
          code: 'AUTH_RATE_LIMITED',
          type: ErrorType.AUTH_RATE_LIMITED,
          message: error.message,
          userMessage: '请求过于频繁，请稍后再试',
          recoverable: true,
          retryable: true,
          context,
          originalError: error,
          actions: [
            {
              label: '稍后重试',
              action: () => {
                // Auto-retry will be handled by caller
              },
              primary: true,
            },
          ],
        });

      case 500:
      case 502:
      case 503:
      case 504:
        return new ClaudeError({
          code: 'API_OVERLOADED',
          type: ErrorType.API_OVERLOADED,
          message: error.message,
          userMessage: 'Claude 服务暂时不可用，请稍后重试',
          recoverable: true,
          retryable: true,
          context,
          originalError: error,
          actions: [
            {
              label: '自动重试',
              action: () => {
                // Auto-retry will be handled by caller
              },
              primary: true,
            },
          ],
        });

      default:
        return new ClaudeError({
          code: 'API_UNKNOWN_ERROR',
          type: ErrorType.UNKNOWN_ERROR,
          message: error.message,
          userMessage: `API 错误 (${status}): ${error.message}`,
          recoverable: true,
          retryable: status >= 500,
          context,
          originalError: error,
        });
    }
  }

  /**
   * Handle generic JavaScript errors (includes CLI errors)
   */
  private handleGenericError(error: Error, context: ErrorContext): ClaudeError {
    const message = error.message;
    const lowerMessage = message.toLowerCase();

    // CLI not found
    if (lowerMessage.includes('claude cli not found') ||
        lowerMessage.includes('no such file or directory') ||
        lowerMessage.includes('command not found') ||
        lowerMessage.includes('not recognized as an internal or external command')) {
      return new ClaudeError({
        code: 'CLAUDE_NOT_FOUND',
        type: ErrorType.CLAUDE_NOT_FOUND,
        message: error.message,
        userMessage: 'Claude CLI is not installed or not found in your system PATH.',
        recoverable: true,
        retryable: false,
        context,
        originalError: error,
        actions: [
          {
            label: 'Install Claude CLI',
            action: () => { window.open('https://docs.anthropic.com/claude/docs/claude-cli', '_blank'); },
            primary: true
          },
          {
            label: 'Select Custom Path',
            action: () => {
              window.dispatchEvent(new CustomEvent('open-claude-settings'));
            }
          }
        ]
      });
    }

    // Permission denied
    if (lowerMessage.includes('permission denied') ||
        lowerMessage.includes('access is denied') ||
        lowerMessage.includes('eacces')) {
      return new ClaudeError({
        code: 'CLAUDE_PERMISSION_DENIED',
        type: ErrorType.CLAUDE_PERMISSION_DENIED,
        message: error.message,
        userMessage: 'Permission denied when trying to execute Claude CLI. Please check file permissions.',
        recoverable: true,
        retryable: true,
        context,
        originalError: error,
        actions: [
          {
            label: 'Run as Administrator',
            action: () => {
              console.log('Please try running the application as Administrator');
            }
          }
        ]
      });
    }

    // Process execution errors
    if (lowerMessage.includes('spawning') ||
        lowerMessage.includes('process') ||
        lowerMessage.includes('exit code')) {
      return new ClaudeError({
        code: 'CLAUDE_PROCESS_ERROR',
        type: ErrorType.CLAUDE_PROCESS_ERROR,
        message: error.message,
        userMessage: 'Failed to start or communicate with Claude CLI process.',
        recoverable: true,
        retryable: true,
        context,
        originalError: error,
        actions: [
          {
            label: 'Check Claude Installation',
            action: () => {
              window.dispatchEvent(new CustomEvent('validate-claude-installation'));
            }
          }
        ]
      });
    }

    // Network/connection errors
    if (lowerMessage.includes('network') ||
        lowerMessage.includes('connection') ||
        lowerMessage.includes('enotfound') ||
        lowerMessage.includes('econnrefused') ||
        lowerMessage.includes('fetch')) {
      return new ClaudeError({
        code: lowerMessage.includes('claude') ? 'CLAUDE_NETWORK_ERROR' : 'NETWORK_CONNECTION_FAILED',
        type: lowerMessage.includes('claude') ? ErrorType.CLAUDE_NETWORK_ERROR : ErrorType.NETWORK_CONNECTION_FAILED,
        message: error.message,
        userMessage: 'Network connection error. Please check your internet connection and try again.',
        recoverable: true,
        retryable: true,
        context,
        originalError: error,
        actions: [
          {
            label: '检查网络连接',
            action: () => {
              window.open('https://www.google.com', '_blank');
            },
          },
          {
            label: '重试',
            action: () => {
              // Auto-retry will be handled by caller
            },
            primary: true,
          },
        ],
      });
    }

    // Timeout errors
    if (lowerMessage.includes('timeout') || lowerMessage.includes('aborted')) {
      return new ClaudeError({
        code: lowerMessage.includes('claude') ? 'CLAUDE_TIMEOUT' : 'NETWORK_TIMEOUT',
        type: lowerMessage.includes('claude') ? ErrorType.CLAUDE_TIMEOUT : ErrorType.NETWORK_TIMEOUT,
        message: error.message,
        userMessage: '请求超时，请重试或检查网络状况',
        recoverable: true,
        retryable: true,
        context,
        originalError: error,
      });
    }

    // Configuration errors
    if (lowerMessage.includes('config') ||
        lowerMessage.includes('settings') ||
        lowerMessage.includes('invalid') ||
        lowerMessage.includes('malformed') ||
        lowerMessage.includes('initialization')) {
      return new ClaudeError({
        code: lowerMessage.includes('claude') ? 'CLAUDE_CONFIG_ERROR' : 'SDK_CONFIGURATION_ERROR',
        type: lowerMessage.includes('claude') ? ErrorType.CLAUDE_CONFIG_ERROR : ErrorType.SDK_CONFIGURATION_ERROR,
        message: error.message,
        userMessage: '配置错误，请检查设置',
        recoverable: true,
        retryable: false,
        context,
        originalError: error,
        actions: [
          {
            label: '检查配置',
            action: () => {
              window.dispatchEvent(new CustomEvent('open-settings'));
            },
            primary: true,
          },
        ],
      });
    }

    // PATH related errors
    if (lowerMessage.includes('path') &&
        (lowerMessage.includes('not found') || lowerMessage.includes('invalid'))) {
      return new ClaudeError({
        code: 'SYSTEM_PATH_ERROR',
        type: ErrorType.SYSTEM_PATH_ERROR,
        message: error.message,
        userMessage: 'System PATH configuration issue. Claude CLI may not be properly installed.',
        recoverable: true,
        retryable: false,
        context,
        originalError: error,
        actions: [
          {
            label: 'Check Installation Guide',
            action: () => { window.open('https://docs.anthropic.com/claude/docs/claude-cli#installation', '_blank'); }
          }
        ]
      });
    }

    // Storage errors
    if (lowerMessage.includes('quota') || lowerMessage.includes('storage')) {
      return new ClaudeError({
        code: 'STORAGE_QUOTA_EXCEEDED',
        type: ErrorType.STORAGE_QUOTA_EXCEEDED,
        message: error.message,
        userMessage: '存储空间不足，请清理缓存或释放空间',
        recoverable: true,
        retryable: false,
        context,
        originalError: error,
        actions: [
          {
            label: '清理缓存',
            action: () => {
              window.dispatchEvent(new CustomEvent('clear-cache'));
            },
            primary: true,
          },
        ],
      });
    }

    // Generic error
    return new ClaudeError({
      code: 'UNKNOWN_ERROR',
      type: ErrorType.UNKNOWN_ERROR,
      message: error.message,
      userMessage: `发生未知错误: ${error.message}`,
      recoverable: true,
      retryable: false,
      context,
      originalError: error,
    });
  }

  /**
   * Handle completely unknown errors
   */
  private handleUnknownError(error: unknown, context: ErrorContext): ClaudeError {
    return new ClaudeError({
      code: 'UNKNOWN_ERROR',
      type: ErrorType.UNKNOWN_ERROR,
      message: String(error),
      userMessage: '发生未知错误，请重试或联系支持',
      recoverable: true,
      retryable: true,
      context,
      originalError: error instanceof Error ? error : new Error(String(error)),
    });
  }

  /**
   * Add error to history
   */
  private addToHistory(error: ClaudeError): void {
    this.errorHistory.unshift(error);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByType: Record<ErrorType, number>;
    recentErrors: ClaudeError[];
    mostCommonError: ErrorType | null;
  } {
    const errorsByType = this.errorHistory.reduce((acc, error) => {
      acc[error.type] = (acc[error.type] || 0) + 1;
      return acc;
    }, {} as Record<ErrorType, number>);

    const entries = Object.entries(errorsByType);
    const mostCommonError = entries.length > 0
      ? entries.reduce((a, b) => (errorsByType[a[0] as ErrorType] > errorsByType[b[0] as ErrorType] ? a : b))[0] as ErrorType
      : null;

    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      recentErrors: this.errorHistory.slice(0, 10),
      mostCommonError,
    };
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Check if error is retryable with exponential backoff
   */
  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: ClaudeError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.handleError(error, {
          operation: operation.name || 'retry_operation',
          retryCount: attempt,
        });

        if (attempt === maxRetries || !lastError.retryable) {
          throw lastError;
        }

        // Exponential backoff with jitter
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          baseDelay * 32
        );
        console.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

// ============================================================================
// Singleton Instance and Utility Functions
// ============================================================================

// Export singleton instance
export const errorHandler = new ErrorHandler();

/**
 * Parse error messages and categorize them (legacy API for backward compatibility)
 */
export function parseClaudeError(error: unknown): ClaudeError {
  return errorHandler.handleError(error);
}

/**
 * Get user-friendly error message for display
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ClaudeError) {
    return error.userMessage;
  }

  const claudeError = parseClaudeError(error);
  return claudeError.userMessage;
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof ClaudeError) {
    return error.recoverable;
  }

  const claudeError = parseClaudeError(error);
  return claudeError.recoverable;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ClaudeError) {
    return error.retryable;
  }

  const claudeError = parseClaudeError(error);
  return claudeError.retryable;
}

/**
 * Get available actions for an error
 */
export function getErrorActions(error: unknown): RecoveryAction[] {
  if (error instanceof ClaudeError) {
    return error.actions;
  }

  const claudeError = parseClaudeError(error);
  return claudeError.actions;
}

/**
 * Utility function to handle errors in async operations
 */
export async function handleAsync<T>(
  promise: Promise<T>,
  context?: Partial<ErrorContext>
): Promise<[T | null, ClaudeError | null]> {
  try {
    const result = await promise;
    return [result, null];
  } catch (error) {
    const claudeError = errorHandler.handleError(error, context);
    return [null, claudeError];
  }
}

/**
 * Decorator for error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: {
    context?: Partial<ErrorContext>;
    retryable?: boolean;
    retryHandler?: RetryHandler;
    fallback?: T;
  }
): T {
  const wrappedFn = async (...args: Parameters<T>) => {
    try {
      if (options?.retryable && options?.retryHandler) {
        return await options.retryHandler.execute(() => fn(...args), (error) => {
          const claudeError = parseClaudeError(error);
          return claudeError.retryable;
        });
      } else if (options?.retryable) {
        return await errorHandler.retryWithBackoff(() => fn(...args));
      } else {
        return await fn(...args);
      }
    } catch (error) {
      const claudeError = errorHandler.handleError(error, {
        operation: fn.name,
        ...options?.context,
      });

      // Try fallback if available
      if (options?.fallback && claudeError.recoverable) {
        try {
          console.warn('Primary operation failed, trying fallback:', claudeError.message);
          return await options.fallback(...args);
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
        }
      }

      throw claudeError;
    }
  };

  return wrappedFn as T;
}

/**
 * Retry mechanism with exponential backoff (legacy API for backward compatibility)
 */
export class RetryHandler {
  private maxRetries: number;
  private baseDelay: number;
  private maxDelay: number;

  constructor(maxRetries = 3, baseDelay = 1000, maxDelay = 10000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
  }

  async execute<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean = () => true
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry on the last attempt or if error is not retryable
        if (attempt === this.maxRetries || !shouldRetry(error)) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          this.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          this.maxDelay
        );

        console.warn(`Operation failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
