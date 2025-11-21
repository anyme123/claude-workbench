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
import { HelpCircle, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { currentView, navigateTo } = useNavigation();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  const sidebarWidth = isSidebarOpen ? "4rem" : "0px";

  // Auto-hide header on session pages
  const isSessionPage = currentView === 'claude-code-session' || currentView === 'claude-tab-manager';

  React.useEffect(() => {
    if (!isSessionPage) {
      setIsHeaderVisible(true);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Show header when mouse is near the top (within 80px)
      if (e.clientY < 80) {
        setIsHeaderVisible(true);
      } else if (e.clientY > 150) {
        // Hide header when mouse moves away from top
        setIsHeaderVisible(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isSessionPage]);

  return (
    <div 
      className="h-screen w-screen overflow-hidden bg-background flex text-foreground selection:bg-primary/20 selection:text-primary relative"
      style={{ "--sidebar-width": sidebarWidth } as React.CSSProperties}
    >
      {/* ✨ Subtle background pattern mesh - Global Background */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03] dark:opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Sidebar */}
      <div className={cn(
        "z-50 flex-shrink-0 transition-all duration-300 overflow-hidden",
        isSidebarOpen ? "w-16 opacity-100 translate-x-0" : "w-0 opacity-0 -translate-x-full"
      )}>
        <Sidebar
          currentView={currentView}
          onNavigate={navigateTo}
          className="w-16"
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden z-10 transition-all duration-300">
        {/* Header */}
        <header
          className={cn(
            "flex items-center justify-between px-6 py-3 border-b border-border/40 bg-background/40 backdrop-blur-md sticky z-40 h-14",
            "transition-all duration-300 ease-in-out",
            isSessionPage && !isHeaderVisible ? "-top-14 opacity-0" : "top-0 opacity-100"
          )}
        >
            {/* Left: Toggle & Breadcrumbs */}
            <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title={isSidebarOpen ? "收起侧边栏" : "展开侧边栏"}
                >
                  <Menu className="h-4 w-4" />
                </Button>
                <AppBreadcrumbs /> 
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
                <ClaudeStatusIndicator 
                    onSettingsClick={() => navigateTo("settings")} 
                />
                
                <div className="h-4 w-px bg-border/50 mx-2" />

                <UpdateBadge onClick={() => setShowUpdateDialog(true)} />
                
                <ThemeToggle size="sm" className="w-8 h-8" />
                
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
