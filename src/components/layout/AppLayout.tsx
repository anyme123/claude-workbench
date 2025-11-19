import React, { ReactNode, useState } from 'react';
import { Topbar } from "@/components/layout/Topbar";
import { AppBreadcrumbs } from "@/components/layout/AppBreadcrumbs";
import { useNavigation } from '@/contexts/NavigationContext';
import { useTabs } from '@/hooks/useTabs';
import { UpdateDialog } from '@/components/dialogs/UpdateDialog';
import { AboutDialog } from '@/components/dialogs/AboutDialog';

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { currentView, navigateTo } = useNavigation();
  const { getTabStats } = useTabs();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);

  return (
    <div className="h-screen bg-background flex flex-col relative selection:bg-primary/20 selection:text-primary">
      {/* ✨ Subtle background pattern mesh */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03] dark:opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* ✨ Topbar with Glassmorphism */}
      {currentView !== "claude-tab-manager" && (
        <div className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50 supports-[backdrop-filter]:bg-background/60">
          <Topbar
            onClaudeClick={() => navigateTo("editor")}
            onSettingsClick={() => navigateTo("settings")}
            onUsageClick={() => navigateTo("usage-dashboard")}
            onMCPClick={() => navigateTo("mcp")}
            onExtensionsClick={() => navigateTo("claude-extensions")}
            onTabsClick={() => navigateTo("claude-tab-manager")}
            onUpdateClick={() => setShowUpdateDialog(true)}
            onAboutClick={() => setShowAboutDialog(true)}
            tabsCount={getTabStats().total}
          />
          {/* Breadcrumb Navigation integrated into header area */}
          <AppBreadcrumbs />
        </div>
      )}

      {/* Main Content - Z-index ensures it sits above background pattern */}
      <div className="flex-1 overflow-y-auto relative z-10">
        {children}
      </div>

      {/* Global Dialogs */}
      <UpdateDialog
        open={showUpdateDialog}
        onClose={() => setShowUpdateDialog(false)}
      />

      <AboutDialog
        open={showAboutDialog}
        onClose={() => setShowAboutDialog(false)}
        onCheckUpdate={() => {
          setShowAboutDialog(false);
          setShowUpdateDialog(true);
        }}
      />
    </div>
  );
};
