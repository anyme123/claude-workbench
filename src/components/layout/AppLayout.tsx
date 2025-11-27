import React, { ReactNode, useState } from 'react';
import { Sidebar } from "@/components/layout/Sidebar";
import { useNavigation } from '@/contexts/NavigationContext';
import { UpdateDialog } from '@/components/dialogs/UpdateDialog';
import { AboutDialog } from '@/components/dialogs/AboutDialog';

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { currentView, navigateTo } = useNavigation();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background flex text-foreground selection:bg-primary/20 selection:text-primary relative">
      {/* ✨ Neo-Modern Fluid Background */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {/* Noise Texture */}
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
        {/* Subtle Gradient Mesh */}
        <div className="absolute inset-0 opacity-30 dark:opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      </div>

      {/* Sidebar */}
      <div id="app-sidebar" className="z-50 flex-shrink-0">
        <Sidebar
          currentView={currentView}
          onNavigate={navigateTo}
          onAboutClick={() => setShowAboutDialog(true)}
          onUpdateClick={() => setShowUpdateDialog(true)}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden z-10">
        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth">
          {children}
        </div>
      </main>

      {/* Global Dialogs */}
      <UpdateDialog open={showUpdateDialog} onClose={() => setShowUpdateDialog(false)} />

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
