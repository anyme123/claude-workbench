import { useState, useCallback, useRef, useContext, createContext, ReactNode, useEffect } from 'react';
import type { Session } from '@/lib/api';

/**
 * ✨ REFACTORED: Simplified Tab interface (Phase 1 optimization)
 * - Single interface (no dual TabSessionData/TabSession)
 * - Simplified state enum (merged streamingStatus into state)
 * - Flattened error structure
 * - isActive computed on-the-fly from activeTabId
 */
export interface Tab {
  id: string;
  title: string;
  type: 'session' | 'new';
  
  // Session data
  projectPath?: string;
  session?: Session;
  
  // State management (simplified)
  state: 'idle' | 'streaming' | 'error';
  errorMessage?: string; // Flattened from error object
  hasUnsavedChanges: boolean;
  
  // Metadata
  createdAt: number;
  lastActiveAt: number;
}

// Backward compatibility: Keep old interfaces as type aliases
/** @deprecated Use Tab instead */
export type TabSessionData = Tab;
/** @deprecated Use Tab instead */
export type TabSession = Tab & { isActive: boolean };

/**
 * ✨ REFACTORED: Context value interface (Phase 1 optimization)
 * - Updated method signatures to use simplified Tab interface
 * - Simplified updateTabState (merged streaming/error updates)
 */
interface TabContextValue {
  tabs: TabSession[];
  activeTabId: string | null;
  createNewTab: (session?: Session, projectPath?: string, activate?: boolean) => string;
  switchToTab: (tabId: string) => void;
  closeTab: (tabId: string, force?: boolean) => Promise<{ needsConfirmation?: boolean; tabId?: string } | void>;
  updateTabState: (tabId: string, state: Tab['state'], errorMessage?: string) => void;
  updateTabChanges: (tabId: string, hasChanges: boolean) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  getTabById: (tabId: string) => TabSession | undefined;
  getActiveTab: () => TabSession | undefined;
  openSessionInBackground: (session: Session) => { tabId: string; isNew: boolean };
  getTabStats: () => { total: number; active: number; hasChanges: number };
  registerTabCleanup: (tabId: string, cleanup: () => Promise<void> | void) => void;
  canCloseTab: (tabId: string) => { canClose: boolean; hasUnsavedChanges: boolean };
  forceCloseTab: (tabId: string) => Promise<void>;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  
  // Backward compatibility aliases
  /** @deprecated Use updateTabState instead */
  updateTabStreamingStatus: (tabId: string, isStreaming: boolean, sessionId: string | null) => void;
  /** @deprecated Use updateTabState instead */
  clearTabError: (tabId: string) => void;
}

const TabContext = createContext<TabContextValue | null>(null);

interface TabProviderProps {
  children: ReactNode;
}

/**
 * ✨ REFACTORED: TabProvider - Simplified state management (Phase 1)
 * - Removed Map cache (direct array operations)
 * - Single Tab[] state (no dual data structures)
 * - Cleaner persistence logic
 */
export const TabProvider: React.FC<TabProviderProps> = ({ children }) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const nextTabId = useRef(1);
  
  // Cleanup callbacks stored separately (not in state)
  const cleanupCallbacksRef = useRef<Map<string, () => Promise<void> | void>>(new Map());

  const STORAGE_KEY = 'claude-workbench-tabs-state';

  // ✨ REFACTORED: Load persisted state on mount (simplified)
  useEffect(() => {
    try {
      const persistedState = localStorage.getItem(STORAGE_KEY);
      if (!persistedState) return;
      
      const { tabs: savedTabs, activeTabId: savedActiveTabId } = JSON.parse(persistedState);
      
      if (!Array.isArray(savedTabs)) return;
      
      // Validate and filter tabs
      const validTabs = savedTabs.filter((tab: any) => {
        if (!tab.id || !tab.title) {
          console.warn('[useTabs] Skipping invalid tab:', tab);
          return false;
        }
        return true;
      }).map((tab: any) => ({
        ...tab,
        type: tab.type || (tab.session ? 'session' : 'new'),
        state: tab.state || 'idle',
        hasUnsavedChanges: tab.hasUnsavedChanges ?? tab.hasChanges ?? false,
      }));
      
      // Validate activeTabId
      const validActiveTabId = validTabs.find(t => t.id === savedActiveTabId)
        ? savedActiveTabId
        : (validTabs[0]?.id || null);
      
      setTabs(validTabs);
      setActiveTabId(validActiveTabId);
      
      console.log(`[useTabs] Restored ${validTabs.length} tabs from storage`);
    } catch (error) {
      console.error('[useTabs] Failed to restore tabs:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // ✨ REFACTORED: Persist state when it changes (simplified)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
    } catch (error) {
      console.error('[useTabs] Failed to persist tabs:', error);
    }
  }, [tabs, activeTabId]);

  // ✨ REFACTORED: Compute TabSession with isActive (simplified)
  const tabsWithActive: TabSession[] = tabs.map(tab => ({
    ...tab,
    isActive: tab.id === activeTabId,
  }));

  // Generate unique tab ID
  const generateTabId = useCallback(() => {
    return `tab-${Date.now()}-${nextTabId.current++}`;
  }, []);

  // Generate smart tab title
  const generateTabTitle = useCallback((session?: Session, projectPath?: string) => {
    if (session) {
      const projectName = session.project_path
        ? (session.project_path.split('/').pop() || session.project_path.split('\\').pop())
        : '';
      const formattedName = projectName
        ? projectName.replace(/^(my-|test-|demo-)/, '').replace(/[-_]/g, ' ')
        : '';
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      return formattedName ? `${formattedName} (${timeStr})` : `会话 ${timeStr}`;
    }

    if (projectPath) {
      const projectName = projectPath.split('/').pop() || projectPath.split('\\').pop();
      const formattedName = projectName
        ? projectName.replace(/^(my-|test-|demo-)/, '').replace(/[-_]/g, ' ')
        : '';
      return formattedName ? `新会话 · ${formattedName}` : `新会话 ${nextTabId.current}`;
    }

    return `新会话 ${nextTabId.current}`;
  }, []);

  // ✨ REFACTORED: Create new tab (simplified)
  const createNewTab = useCallback((session?: Session, projectPath?: string, activate: boolean = true): string => {
    const newTabId = generateTabId();
    const newTab: Tab = {
      id: newTabId,
      title: generateTabTitle(session, projectPath),
      type: session ? 'session' : 'new',
      projectPath: projectPath || session?.project_path,
      session,
      state: 'idle',
      hasUnsavedChanges: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    setTabs(prev => [...prev, newTab]);
    
    if (activate) {
      setActiveTabId(newTabId);
    }

    return newTabId;
  }, [generateTabId, generateTabTitle]);

  // ✨ REFACTORED: Switch to tab (functional setState)
  const switchToTab = useCallback((tabId: string) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId
          ? { ...tab, lastActiveAt: Date.now() }
          : tab
      )
    );
    setActiveTabId(tabId);
  }, []);

  // Check if tab can be closed
  const canCloseTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    return {
      canClose: !tab?.hasUnsavedChanges,
      hasUnsavedChanges: Boolean(tab?.hasUnsavedChanges),
    };
  }, [tabs]);

  // ✨ REFACTORED: Force close tab (use cleanup callbacks ref)
  const forceCloseTab = useCallback(async (tabId: string) => {
    // Execute cleanup callback if present
    const cleanup = cleanupCallbacksRef.current.get(tabId);
    if (cleanup) {
      try {
        console.log(`[useTabs] Executing cleanup for tab ${tabId}`);
        await cleanup();
      } catch (error) {
        console.error(`[useTabs] Cleanup failed for tab ${tabId}:`, error);
        // Continue closing anyway
      }
      cleanupCallbacksRef.current.delete(tabId);
    }

    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId);

      // Switch to another tab if closing active tab
      if (activeTabId === tabId && remaining.length > 0) {
        const lastActiveTab = remaining.reduce((latest, current) =>
          current.lastActiveAt > latest.lastActiveAt ? current : latest
        );
        setActiveTabId(lastActiveTab.id);
      } else if (remaining.length === 0) {
        setActiveTabId(null);
      }

      return remaining;
    });
  }, [activeTabId]);

  // Close tab with UI confirmation
  const closeTab = useCallback(async (tabId: string, force = false): Promise<{ needsConfirmation?: boolean; tabId?: string } | void> => {
    if (force) {
      return forceCloseTab(tabId);
    }

    const { canClose, hasUnsavedChanges } = canCloseTab(tabId);

    if (!canClose && hasUnsavedChanges) {
      return { needsConfirmation: true, tabId };
    }

    return forceCloseTab(tabId);
  }, [canCloseTab, forceCloseTab]);

  // ✨ NEW: Unified state update method
  const updateTabState = useCallback((tabId: string, state: Tab['state'], errorMessage?: string) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId
          ? { ...tab, state, errorMessage, lastActiveAt: Date.now() }
          : tab
      )
    );
  }, []);

  // Update tab changes
  const updateTabChanges = useCallback((tabId: string, hasChanges: boolean) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId ? { ...tab, hasUnsavedChanges: hasChanges } : tab
      )
    );
  }, []);

  // Update tab title
  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId ? { ...tab, title } : tab
      )
    );
  }, []);

  // Get tab by ID
  const getTabById = useCallback((tabId: string): TabSession | undefined => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return undefined;

    return {
      ...tab,
      isActive: tab.id === activeTabId,
    };
  }, [tabs, activeTabId]);

  // Get active tab
  const getActiveTab = useCallback((): TabSession | undefined => {
    if (!activeTabId) return undefined;
    return getTabById(activeTabId);
  }, [activeTabId, getTabById]);

  // Open session in background
  const openSessionInBackground = useCallback((session: Session): { tabId: string; isNew: boolean } => {
    const existingTab = tabs.find(tab => tab.session?.id === session.id);
    if (existingTab) {
      console.log(`[useTabs] Session ${session.id} already exists`);
      return { tabId: existingTab.id, isNew: false };
    }

    const newTabId = createNewTab(session, undefined, false);
    return { tabId: newTabId, isNew: true };
  }, [tabs, createNewTab]);

  // Get tab stats
  const getTabStats = useCallback(() => {
    return {
      total: tabs.length,
      active: tabs.filter(tab => tab.state === 'streaming').length,
      hasChanges: tabs.filter(tab => tab.hasUnsavedChanges).length,
    };
  }, [tabs]);

  // Register cleanup callback
  const registerTabCleanup = useCallback((tabId: string, cleanup: () => Promise<void> | void) => {
    cleanupCallbacksRef.current.set(tabId, cleanup);
  }, []);

  // Reorder tabs (drag & drop)
  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    setTabs(prev => {
      const newTabs = [...prev];
      const [removed] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, removed);
      return newTabs;
    });
  }, []);

  // ✨ REFACTORED: Backward compatibility aliases
  const updateTabStreamingStatus = useCallback((tabId: string, isStreaming: boolean, _sessionId: string | null) => {
    updateTabState(tabId, isStreaming ? 'streaming' : 'idle');
  }, [updateTabState]);

  const clearTabError = useCallback((tabId: string) => {
    updateTabState(tabId, 'idle');
  }, [updateTabState]);

  const contextValue: TabContextValue = {
    tabs: tabsWithActive,
    activeTabId,
    createNewTab,
    switchToTab,
    closeTab,
    updateTabState,
    updateTabChanges,
    updateTabTitle,
    getTabById,
    getActiveTab,
    openSessionInBackground,
    getTabStats,
    registerTabCleanup,
    canCloseTab,
    forceCloseTab,
    reorderTabs,
    // Backward compatibility
    updateTabStreamingStatus,
    clearTabError,
  };

  return (
    <TabContext.Provider value={contextValue}>
      {children}
    </TabContext.Provider>
  );
};

/**
 * useTabs - 使用标签页状态管理
 */
export const useTabs = (): TabContextValue => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return context;
};

/**
 * useActiveTab - 获取当前活跃标签页
 */
export const useActiveTab = (): TabSession | undefined => {
  const { getActiveTab } = useTabs();
  return getActiveTab();
};

/**
 * useTabSession - 获取特定标签页的会话管理钩子
 */
export const useTabSession = (tabId: string) => {
  const { getTabById, updateTabChanges, updateTabStreamingStatus, updateTabTitle, registerTabCleanup } = useTabs();

  const tab = getTabById(tabId);

  const markAsChanged = useCallback(() => {
    updateTabChanges(tabId, true);
  }, [tabId, updateTabChanges]);

  const markAsUnchanged = useCallback(() => {
    updateTabChanges(tabId, false);
  }, [tabId, updateTabChanges]);

  const updateTitle = useCallback((title: string) => {
    updateTabTitle(tabId, title);
  }, [tabId, updateTabTitle]);

  const updateStreaming = useCallback((isStreaming: boolean, sessionId: string | null) => {
    updateTabStreamingStatus(tabId, isStreaming, sessionId);
  }, [tabId, updateTabStreamingStatus]);

  // 🔧 NEW: Register cleanup callback
  const setCleanup = useCallback((cleanup: () => Promise<void> | void) => {
    registerTabCleanup(tabId, cleanup);
  }, [tabId, registerTabCleanup]);

  return {
    tab,
    markAsChanged,
    markAsUnchanged,
    updateTitle,
    updateStreaming,
    setCleanup,
  };
};