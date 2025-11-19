import React, { ReactNode, useState } from 'react';
import { Sidebar } from "@/components/layout/Sidebar";
import { AppBreadcrumbs } from "@/components/layout/AppBreadcrumbs";
import { useNavigation } from '@/contexts/NavigationContext';
import { UpdateDialog } from '@/components/dialogs/UpdateDialog';
import { AboutDialog } from '@/components/dialogs/AboutDialog';
import { ClaudeStatusIndicator } from "@/components/ClaudeStatusIndicator";
import { UpdateBadge } from "@/components/common/UpdateBadge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { currentView, navigateTo } = useNavigation();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background flex text-foreground selection:bg-primary/20 selection:text-primary relative">
      {/* ✨ Subtle background pattern mesh - Global Background */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03] dark:opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={navigateTo}
        className="z-50 flex-shrink-0"
      />

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden z-10">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-border/40 bg-background/40 backdrop-blur-md sticky top-0 z-40 h-14">
            {/* Left: Breadcrumbs */}
            <div className="flex items-center gap-4">
                <AppBreadcrumbs /> 
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
                <ClaudeStatusIndicator 
                    onSettingsClick={() => navigateTo("settings")} 
                    onAboutClick={() => setShowAboutDialog(true)} 
                />
                
                <div className="h-4 w-px bg-border/50 mx-2" />

                <UpdateBadge onClick={() => setShowUpdateDialog(true)} />
                
                <ThemeToggle variant="ghost" size="icon" className="w-8 h-8" />
                
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setShowAboutDialog(true)}
                    className="w-8 h-8 text-muted-foreground"
                >
                    <HelpCircle className="w-4 h-4" />
                </Button>
            </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth">
             {children}
        </div>
      </main>

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
