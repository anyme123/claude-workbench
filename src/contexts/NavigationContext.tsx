import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { View } from '@/types/navigation';

interface HistoryItem {
  view: View;
  params: Record<string, any>;
}

interface NavigationContextType {
  currentView: View;
  viewParams: Record<string, any>;
  previousView: View | null;
  history: HistoryItem[];
  navigateTo: (view: View, params?: Record<string, any>) => void;
  goBack: () => void;
  canGoBack: boolean;
  setNavigationInterceptor: (interceptor: ((nextView: View) => boolean) | null) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentView, setCurrentView] = useState<View>("projects");
  const [viewParams, setViewParams] = useState<Record<string, any>>({});
  // Initialize history with the default view and empty params
  const [history, setHistory] = useState<HistoryItem[]>([{ view: "projects", params: {} }]);
  const [previousView, setPreviousView] = useState<View | null>(null);
  const [navigationInterceptor, setNavigationInterceptor] = useState<((nextView: View) => boolean) | null>(null);

  const navigateTo = useCallback((newView: View, params?: Record<string, any>) => {
    // Check interceptor
    if (navigationInterceptor) {
      const shouldProceed = navigationInterceptor(newView);
      if (!shouldProceed) return;
    }

    const newParams = params || {};

    // If staying on same view but params change, we still update
    if (newView === currentView && JSON.stringify(newParams) === JSON.stringify(viewParams)) return;

    setPreviousView(currentView);
    setCurrentView(newView);
    setViewParams(newParams);
    
    setHistory(prev => {
      const lastItem = prev[prev.length - 1];
      // Avoid duplicate consecutive entries (check both view and params)
      if (lastItem.view !== newView || JSON.stringify(lastItem.params) !== JSON.stringify(newParams)) {
        return [...prev, { view: newView, params: newParams }];
      }
      return prev;
    });
  }, [currentView, viewParams, navigationInterceptor]);

  const goBack = useCallback(() => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop(); // Remove current
      
      const prevItem = newHistory[newHistory.length - 1]; // Target item
      
      if (navigationInterceptor) {
        const shouldProceed = navigationInterceptor(prevItem.view);
        if (!shouldProceed) return;
      }

      setHistory(newHistory);
      setCurrentView(prevItem.view);
      setViewParams(prevItem.params);
      
      // Update previous view reference (optional, effectively the one we just popped)
      // But conceptually 'previous' usually means 'where we just came from' before this action.
      // In a browser, 'back' moves you to previous state. 
      // Let's keep previousView as the one we are leaving (which was current).
      setPreviousView(currentView); 
    } else {
      // Fallback if history is empty (shouldn't happen with init state)
      if (navigationInterceptor) {
        const shouldProceed = navigationInterceptor("projects");
        if (!shouldProceed) return;
      }
      setCurrentView("projects");
      setViewParams({});
    }
  }, [history, navigationInterceptor, currentView]);

  return (
    <NavigationContext.Provider value={{
      currentView,
      viewParams,
      previousView,
      history,
      navigateTo,
      goBack,
      canGoBack: history.length > 1,
      setNavigationInterceptor
    }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
