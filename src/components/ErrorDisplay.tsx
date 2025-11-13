import React from 'react';
import { motion } from 'framer-motion';
import { 
  AlertCircle, 
  RefreshCw, 
  ExternalLink,
  X,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ClaudeError,
  getErrorMessage,
  getErrorActions,
  isRetryableError
} from '@/lib/errorHandling';

interface ErrorDisplayProps {
  error: unknown;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
  variant?: 'toast' | 'inline' | 'modal';
  showActions?: boolean;
}

/**
 * Enhanced error display component with user-friendly messages and actions
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  className,
  variant = 'inline',
  showActions = true
}) => {
  const errorMessage = getErrorMessage(error);
  const errorActions = getErrorActions(error);
  const isRetryable = isRetryableError(error);
  
  const claudeError = error instanceof ClaudeError ? error : null;
  
  const getErrorIcon = () => {
    if (!claudeError) return <AlertCircle className="h-4 w-4 text-destructive" />;

    switch (claudeError.code) {
      case 'CLAUDE_NOT_FOUND':
        return <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
      case 'CLAUDE_NETWORK_ERROR':
        return <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case 'CLAUDE_PERMISSION_DENIED':
        return <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getErrorColor = () => {
    if (!claudeError) return 'bg-destructive/10 border-destructive/20';
    
    switch (claudeError.code) {
      case 'CLAUDE_NOT_FOUND':
        return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800';
      case 'CLAUDE_NETWORK_ERROR':
        return 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800';
      case 'CLAUDE_PERMISSION_DENIED':
        return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
      default:
        return 'bg-destructive/10 border-destructive/20';
    }
  };

  const getErrorTitle = () => {
    if (!claudeError) return 'Error';
    
    switch (claudeError.code) {
      case 'CLAUDE_NOT_FOUND':
        return 'Claude CLI Not Found';
      case 'CLAUDE_NOT_EXECUTABLE':
        return 'Claude CLI Not Executable';
      case 'CLAUDE_VERSION_MISMATCH':
        return 'Version Mismatch';
      case 'CLAUDE_PERMISSION_DENIED':
        return 'Permission Denied';
      case 'CLAUDE_NETWORK_ERROR':
        return 'Network Error';
      case 'CLAUDE_TIMEOUT':
        return 'Connection Timeout';
      case 'CLAUDE_PROCESS_ERROR':
        return 'Process Error';
      case 'CLAUDE_CONFIG_ERROR':
        return 'Configuration Error';
      case 'SYSTEM_PATH_ERROR':
        return 'PATH Error';
      default:
        return 'Unexpected Error';
    }
  };

  if (variant === 'toast') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className={cn(
          "fixed top-4 right-4 z-50 max-w-md rounded-lg border p-4 shadow-lg",
          getErrorColor(),
          className
        )}
      >
        <div className="flex items-start gap-3">
          {getErrorIcon()}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">{getErrorTitle()}</h4>
              {onDismiss && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                  className="h-5 w-5 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{errorMessage}</p>
            {showActions && (errorActions.length > 0 || (isRetryable && onRetry)) && (
              <div className="flex flex-wrap gap-2 pt-2">
                {isRetryable && onRetry && (
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Retry
                  </Button>
                )}
                {errorActions.map((action, index) => (
                  <Button
                    key={index}
                    size="sm"
                    variant={action.primary ? "default" : "outline"}
                    onClick={action.action}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (variant === 'modal') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className={cn(
            "mx-4 max-w-md rounded-lg border bg-background p-6 shadow-xl",
            className
          )}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {getErrorIcon()}
              <h2 className="text-lg font-semibold">{getErrorTitle()}</h2>
            </div>
            
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            
            {claudeError?.code && (
              <Badge variant="outline" className="text-xs">
                Error Code: {claudeError.code}
              </Badge>
            )}
            
            {showActions && (
              <div className="flex flex-col gap-2">
                {errorActions.map((action, index) => (
                  <Button
                    key={index}
                    variant={action.primary ? "default" : "outline"}
                    onClick={action.action}
                    className="w-full justify-start"
                  >
                    {action.label}
                  </Button>
                ))}
                
                <div className="flex gap-2 pt-2">
                  {isRetryable && onRetry && (
                    <Button variant="outline" onClick={onRetry} className="flex-1">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Retry
                    </Button>
                  )}
                  {onDismiss && (
                    <Button variant="secondary" onClick={onDismiss} className="flex-1">
                      Close
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // Default inline variant
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "rounded-lg border p-4",
        getErrorColor(),
        className
      )}
    >
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          {getErrorIcon()}
          <div className="flex-1 space-y-1">
            <h4 className="text-sm font-medium">{getErrorTitle()}</h4>
            <p className="text-xs text-muted-foreground">{errorMessage}</p>
            
            {claudeError?.code && (
              <Badge variant="outline" className="text-xs">
                {claudeError.code}
              </Badge>
            )}
          </div>
          
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        {showActions && (errorActions.length > 0 || (isRetryable && onRetry)) && (
          <div className="flex flex-wrap gap-2">
            {isRetryable && onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RefreshCw className="mr-1 h-3 w-3" />
                Retry
              </Button>
            )}
            {errorActions.map((action, index) => (
              <Button
                key={index}
                size="sm"
                variant={action.primary ? "default" : "outline"}
                onClick={action.action}
              >
                {action.label}
                {action.action.toString().includes('window.open') && (
                  <ExternalLink className="ml-1 h-3 w-3" />
                )}
              </Button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

/**
 * ✅ REMOVED: ClaudeErrorBoundary was a duplicate implementation
 *
 * Use ErrorBoundary from './ErrorBoundary' instead, which now includes
 * all the features of ClaudeErrorBoundary (onError callback, etc.)
 *
 * Migration:
 * - import { ErrorBoundary } from './ErrorBoundary'
 * - ErrorBoundary now supports onError callback and custom fallback
 */

/**
 * Hook for handling errors in components
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<unknown>(null);

  const handleError = React.useCallback((error: unknown) => {
    console.error('Error handled by useErrorHandler:', error);
    setError(error);
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  const retry = React.useCallback(() => {
    setError(null);
    // Return a promise that resolves after clearing the error
    return new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    });
  }, []);

  return {
    error,
    handleError,
    clearError,
    retry,
    hasError: !!error
  };
}