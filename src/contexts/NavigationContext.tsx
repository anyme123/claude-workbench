import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { View } from '@/types/navigation';

interface NavigationContextType {
  currentView: View;
  viewParams: Record<string, any>;
  previousView: View | null;
  history: View[];
  navigateTo: (view: View, params?: Record<string, any>) => void;
  goBack: () => void;
  canGoBack: boolean;
  setNavigationInterceptor: (interceptor: ((nextView: View) => boolean) | null) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentView, setCurrentView] = useState<View>("projects");
  const [viewParams, setViewParams] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<View[]>(["projects"]);
  const [previousView, setPreviousView] = useState<View | null>(null);
  const [navigationInterceptor, setNavigationInterceptor] = useState<((nextView: View) => boolean) | null>(null);

  const navigateTo = useCallback((newView: View, params?: Record<string, any>) => {
    // Check interceptor
    if (navigationInterceptor) {
      const shouldProceed = navigationInterceptor(newView);
      if (!shouldProceed) return;
    }

    // If staying on same view but params change, we still update
    if (newView === currentView && JSON.stringify(params) === JSON.stringify(viewParams)) return;

    setPreviousView(currentView);
    setCurrentView(newView);
    if (params) {
      setViewParams(params);
    } else if (newView !== currentView) {
      // Clear params if navigating to a new view without params
      // But if staying on same view (e.g. refresh), maybe keep them? 
      // For now, assume clean slate if not provided on view change
      setViewParams({});
    }
    
    setHistory(prev => {
      // Avoid duplicate consecutive entries
      if (prev[prev.length - 1] !== newView) {
        return [...prev, newView];
      }
      return prev;
    });
  }, [currentView, viewParams]);

  const goBack = useCallback(() => {
    if (history.length > 1) {
      const newHistory = [...history];
      const prevView = newHistory[newHistory.length - 2]; // Target view
      
      if (navigationInterceptor) {
        const shouldProceed = navigationInterceptor(prevView || "projects");
        if (!shouldProceed) return;
      }

      newHistory.pop(); // Remove current
      
      setHistory(newHistory);
      setCurrentView(prevView);
      setPreviousView(newHistory[newHistory.length - 2] || null);
      // Note: goBack doesn't restore params perfectly unless we store them in history. 
      // For now, we reset params on back.
      setViewParams({}); 
    } else {
      if (navigationInterceptor) {
        const shouldProceed = navigationInterceptor("projects");
        if (!shouldProceed) return;
      }
      // Fallback
      setCurrentView("projects");
      setViewParams({});
    }
  }, [history, navigationInterceptor]);

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
