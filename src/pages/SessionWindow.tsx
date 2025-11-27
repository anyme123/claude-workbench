/**
 * SessionWindow - Detached Session Window Page
 *
 * This component renders a standalone session view for detached windows.
 * It initializes based on URL parameters passed when the window was created.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { parseSessionWindowParams, onWindowSyncEvent, emitWindowSyncEvent } from '@/lib/windowManager';
import { ClaudeCodeSession } from '@/components/ClaudeCodeSession';
import { MessagesProvider } from '@/contexts/MessagesContext';
import { PlanModeProvider } from '@/contexts/PlanModeContext';
import type { Session } from '@/lib/api';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { X, Minimize2, Square, Copy, Merge } from 'lucide-react';

interface SessionWindowState {
  isLoading: boolean;
  error: string | null;
  session: Session | null;
  projectPath: string | null;
  tabId: string | null;
}

/**
 * SessionWindow Component
 *
 * Renders a complete session interface in a detached window.
 * Handles session loading, error states, and window management.
 */
export const SessionWindow: React.FC = () => {
  const [state, setState] = useState<SessionWindowState>({
    isLoading: true,
    error: null,
    session: null,
    projectPath: null,
    tabId: null,
  });

  // Parse URL parameters on mount
  const windowParams = useMemo(() => parseSessionWindowParams(), []);

  // Initialize session from URL parameters
  useEffect(() => {
    const initializeSession = async () => {
      if (!windowParams.isSessionWindow) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Invalid window type',
        }));
        return;
      }

      try {
        // Set basic params
        setState(prev => ({
          ...prev,
          tabId: windowParams.tabId || null,
          projectPath: windowParams.projectPath || null,
        }));

        // Create session object if sessionId is provided
        if (windowParams.sessionId && windowParams.projectPath) {
          // Create session object - ClaudeCodeSession will handle loading the history
          const session: Session = {
            id: windowParams.sessionId,
            project_id: windowParams.projectPath.replace(/[^a-zA-Z0-9]/g, '-'),
            project_path: windowParams.projectPath,
            created_at: Date.now() / 1000,
          };

          console.log('[SessionWindow] Session prepared:', session.id);

          setState(prev => ({
            ...prev,
            session,
            isLoading: false,
          }));
        } else {
          // No session ID - start fresh with just project path
          setState(prev => ({
            ...prev,
            isLoading: false,
          }));
        }
      } catch (error) {
        console.error('[SessionWindow] Initialization error:', error);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to initialize session window',
        }));
      }
    };

    initializeSession();
  }, [windowParams]);

  // Listen for window sync events
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      unlisten = await onWindowSyncEvent((event) => {
        console.log('[SessionWindow] Received sync event:', event);

        // Handle relevant events
        if (event.tabId === state.tabId) {
          switch (event.type) {
            case 'tab_closed':
              // Main window closed this tab, close the window
              handleCloseWindow();
              break;
            case 'session_update':
              // Update session data if needed
              break;
          }
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [state.tabId]);

  // Window control handlers
  const handleCloseWindow = async () => {
    try {
      // Emit event to notify main window
      if (state.tabId) {
        await emitWindowSyncEvent({
          type: 'tab_closed',
          tabId: state.tabId,
          sessionId: state.session?.id,
        });
      }

      const window = getCurrentWindow();
      await window.close();
    } catch (error) {
      console.error('[SessionWindow] Failed to close window:', error);
    }
  };

  const handleMinimizeWindow = async () => {
    try {
      const window = getCurrentWindow();
      await window.minimize();
    } catch (error) {
      console.error('[SessionWindow] Failed to minimize window:', error);
    }
  };

  const handleMaximizeWindow = async () => {
    try {
      const window = getCurrentWindow();
      const isMaximized = await window.isMaximized();
      if (isMaximized) {
        await window.unmaximize();
      } else {
        await window.maximize();
      }
    } catch (error) {
      console.error('[SessionWindow] Failed to toggle maximize:', error);
    }
  };

  // Merge session back to main window
  const handleMergeToMainWindow = async () => {
    try {
      // Emit attach event to notify main window to create a tab
      if (state.tabId) {
        await emitWindowSyncEvent({
          type: 'tab_attached',
          tabId: state.tabId,
          sessionId: state.session?.id,
          projectPath: state.projectPath || undefined,
          data: {
            session: state.session,
          },
        });

        console.log('[SessionWindow] Emitted tab_attached event, closing window');

        // Close this window after a short delay to ensure event is processed
        setTimeout(async () => {
          const window = getCurrentWindow();
          await window.close();
        }, 100);
      }
    } catch (error) {
      console.error('[SessionWindow] Failed to merge to main window:', error);
    }
  };

  // Loading state
  if (state.isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="text-destructive text-4xl mb-4">!</div>
          <h2 className="text-lg font-semibold mb-2">Error</h2>
          <p className="text-muted-foreground mb-4">{state.error}</p>
          <Button onClick={handleCloseWindow}>Close Window</Button>
        </div>
      </div>
    );
  }

  // No project path
  if (!state.projectPath) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <h2 className="text-lg font-semibold mb-2">No Project Selected</h2>
          <p className="text-muted-foreground mb-4">
            This session window requires a project path to be specified.
          </p>
          <Button onClick={handleCloseWindow}>Close Window</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background" style={{ '--sidebar-width': '0px' } as React.CSSProperties}>
      {/* Custom title bar for detached windows */}
      <div
        className="flex-shrink-0 h-10 flex items-center justify-between px-3 border-b border-border bg-muted/30"
        data-tauri-drag-region
      >
        {/* Left: Window title */}
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <Copy className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate max-w-[300px]">
            {state.session?.id ? `Session: ${state.session.id.slice(0, 8)}...` : 'New Session'}
          </span>
          {state.projectPath && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              ({state.projectPath.split(/[/\\]/).pop()})
            </span>
          )}
        </div>

        {/* Right: Window controls */}
        <TooltipProvider>
          <div className="flex items-center gap-1">
            {/* Merge to main window button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleMergeToMainWindow}
                >
                  <Merge className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="text-xs">合并回主窗口</span>
              </TooltipContent>
            </Tooltip>

            <div className="h-4 w-px bg-border mx-1" />

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleMinimizeWindow}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleMaximizeWindow}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleCloseWindow}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TooltipProvider>
      </div>

      {/* Session content */}
      <div className="flex-1 overflow-hidden">
        <MessagesProvider>
          <PlanModeProvider>
            <ClaudeCodeSession
              key={state.tabId || 'detached-session'}
              initialProjectPath={state.projectPath || undefined}
              session={state.session || undefined}
              isActive={true}
            />
          </PlanModeProvider>
        </MessagesProvider>
      </div>
    </div>
  );
};

export default SessionWindow;
