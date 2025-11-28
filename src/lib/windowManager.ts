/**
 * Window Manager - Frontend API for multi-window management
 *
 * Provides functions to create, manage, and communicate with independent session windows.
 */

import { invoke } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';

// ============================================================================
// Types
// ============================================================================

export interface CreateSessionWindowParams {
  tabId: string;
  sessionId?: string;
  projectPath?: string;
  title: string;
  /** Execution engine: 'claude' | 'codex' */
  engine?: 'claude' | 'codex';
}

export interface WindowCreationResult {
  window_label: string;
  success: boolean;
}

// Event types for cross-window communication
export interface WindowSyncEvent {
  type: 'session_update' | 'session_complete' | 'tab_closed' | 'tab_detached' | 'tab_attached';
  tabId: string;
  sessionId?: string;
  projectPath?: string;
  data?: any;
}

// ============================================================================
// Window Management Functions
// ============================================================================

/**
 * Creates a new independent window for a session
 *
 * @param params - Window creation parameters
 * @returns The window label of the created window
 */
export async function createSessionWindow(params: CreateSessionWindowParams): Promise<string> {
  try {
    const result = await invoke<WindowCreationResult>('create_session_window', {
      params: {
        tab_id: params.tabId,
        session_id: params.sessionId || null,
        project_path: params.projectPath || null,
        title: params.title,
        engine: params.engine || null,
      },
    });

    if (!result.success) {
      throw new Error('Window creation failed');
    }

    console.log('[WindowManager] Created session window:', result.window_label);
    return result.window_label;
  } catch (error) {
    console.error('[WindowManager] Failed to create session window:', error);
    throw error;
  }
}

/**
 * Closes an independent session window
 *
 * @param windowLabel - The label of the window to close
 */
export async function closeSessionWindow(windowLabel: string): Promise<void> {
  try {
    await invoke('close_session_window', { windowLabel });
    console.log('[WindowManager] Closed session window:', windowLabel);
  } catch (error) {
    console.error('[WindowManager] Failed to close session window:', error);
    throw error;
  }
}

/**
 * Gets a list of all open session windows
 *
 * @returns Array of window labels
 */
export async function listSessionWindows(): Promise<string[]> {
  try {
    return await invoke<string[]>('list_session_windows');
  } catch (error) {
    console.error('[WindowManager] Failed to list session windows:', error);
    return [];
  }
}

/**
 * Focuses a specific session window
 *
 * @param windowLabel - The label of the window to focus
 */
export async function focusSessionWindow(windowLabel: string): Promise<void> {
  try {
    await invoke('focus_session_window', { windowLabel });
  } catch (error) {
    console.error('[WindowManager] Failed to focus session window:', error);
    throw error;
  }
}

// ============================================================================
// Cross-Window Communication
// ============================================================================

/**
 * Emits an event to a specific window
 *
 * @param windowLabel - Target window label
 * @param eventName - Event name
 * @param payload - Event payload
 */
export async function emitToWindow(
  windowLabel: string,
  eventName: string,
  payload: any
): Promise<void> {
  try {
    await invoke('emit_to_window', {
      windowLabel,
      eventName,
      payload: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('[WindowManager] Failed to emit to window:', error);
    throw error;
  }
}

/**
 * Broadcasts an event to all session windows
 *
 * @param eventName - Event name
 * @param payload - Event payload
 * @returns Number of windows that received the event
 */
export async function broadcastToSessionWindows(
  eventName: string,
  payload: any
): Promise<number> {
  try {
    return await invoke<number>('broadcast_to_session_windows', {
      eventName,
      payload: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('[WindowManager] Failed to broadcast:', error);
    return 0;
  }
}

// ============================================================================
// Window Sync Events
// ============================================================================

const WINDOW_SYNC_EVENT = 'window-sync';

/**
 * Emits a sync event to all windows
 *
 * @param event - The sync event to emit
 */
export async function emitWindowSyncEvent(event: WindowSyncEvent): Promise<void> {
  try {
    await emit(WINDOW_SYNC_EVENT, event);
    console.log('[WindowManager] Emitted sync event:', event.type, event.tabId);
  } catch (error) {
    console.error('[WindowManager] Failed to emit sync event:', error);
  }
}

/**
 * Listens for window sync events
 *
 * @param callback - Callback function to handle events
 * @returns Unlisten function
 */
export async function onWindowSyncEvent(
  callback: (event: WindowSyncEvent) => void
): Promise<UnlistenFn> {
  return listen<WindowSyncEvent>(WINDOW_SYNC_EVENT, (event) => {
    console.log('[WindowManager] Received sync event:', event.payload.type);
    callback(event.payload);
  });
}

// ============================================================================
// URL Parameter Utilities
// ============================================================================

/**
 * Parses URL parameters for session window initialization
 *
 * @returns Parsed parameters or null if not a session window
 */
export function parseSessionWindowParams(): {
  isSessionWindow: boolean;
  tabId?: string;
  sessionId?: string;
  projectPath?: string;
  engine?: 'claude' | 'codex';
} {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get('window');

  if (windowType !== 'session') {
    return { isSessionWindow: false };
  }

  const tabId = params.get('tab_id') || undefined;
  const sessionId = params.get('session_id') || undefined;
  const projectPath = params.get('project_path')
    ? decodeURIComponent(params.get('project_path')!)
    : undefined;
  const engineParam = params.get('engine');
  const engine = (engineParam === 'claude' || engineParam === 'codex') ? engineParam : undefined;

  console.log('[WindowManager] Parsed session window params:', {
    tabId,
    sessionId,
    projectPath,
    engine,
  });

  return {
    isSessionWindow: true,
    tabId,
    sessionId,
    projectPath,
    engine,
  };
}

/**
 * Checks if the current window is a detached session window
 *
 * @returns True if this is a session window
 */
export function isSessionWindow(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('window') === 'session';
}

// ============================================================================
// Window Label Utilities
// ============================================================================

/**
 * Generates a window label for a tab
 *
 * @param tabId - The tab ID
 * @returns The window label
 */
export function getWindowLabelForTab(tabId: string): string {
  return `session-window-${tabId}`;
}

/**
 * Extracts the tab ID from a window label
 *
 * @param windowLabel - The window label
 * @returns The tab ID or null
 */
export function getTabIdFromWindowLabel(windowLabel: string): string | null {
  const match = windowLabel.match(/^session-window-(.+)$/);
  return match ? match[1] : null;
}
