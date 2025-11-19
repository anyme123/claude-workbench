import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useProject } from '@/contexts/ProjectContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { useTabs } from '@/hooks/useTabs';

export const useGlobalEvents = () => {
  const { loadProjects, refreshSessions, selectedProject } = useProject();
  const { navigateTo, currentView } = useNavigation();
  const { openSessionInBackground, switchToTab } = useTabs();

  // Handle Claude Session Selection
  useEffect(() => {
    const handleSessionSelected = (event: CustomEvent) => {
      const { session } = event.detail;
      const result = openSessionInBackground(session);
      switchToTab(result.tabId);
      navigateTo("claude-tab-manager");
      
      // Toast notifications should be handled by a global toast context or event
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: {
          message: result.isNew 
            ? `会话 ${session.id.slice(-8)} 已打开` 
            : `已切换到会话 ${session.id.slice(-8)}`,
          type: result.isNew ? "success" : "info"
        }
      }));
    };

    const handleClaudeNotFound = () => {
      window.dispatchEvent(new CustomEvent('show-claude-binary-dialog'));
    };

    window.addEventListener('claude-session-selected', handleSessionSelected as EventListener);
    window.addEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    
    return () => {
      window.removeEventListener('claude-session-selected', handleSessionSelected as EventListener);
      window.removeEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    };
  }, [openSessionInBackground, switchToTab, navigateTo]);

  // Handle Claude Complete Event
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<boolean>('claude-complete', async (event) => {
          if (event.payload === true) {
            console.log('[GlobalEvents] Session completed, refreshing lists...');
            await loadProjects();
            if (selectedProject) {
              await refreshSessions();
            }
          }
        });
      } catch (err) {
        console.error('Failed to setup claude-complete listener:', err);
      }
    };

    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, [selectedProject, loadProjects, refreshSessions]);

  // Handle Prompt API Settings
  useEffect(() => {
    const handleOpenPromptAPISettings = () => {
      if (currentView !== "settings") {
        navigateTo("settings");
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('switch-to-prompt-api-tab'));
        }, 100);
      }
    };

    window.addEventListener('open-prompt-api-settings', handleOpenPromptAPISettings as EventListener);
    return () => window.removeEventListener('open-prompt-api-settings', handleOpenPromptAPISettings as EventListener);
  }, [currentView, navigateTo]);
};
