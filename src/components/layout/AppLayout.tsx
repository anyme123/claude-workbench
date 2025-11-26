import React, { ReactNode, useState, useRef } from 'react';
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

/** Header 高度常量 - 符合 8px 网格 (48px) */
const HEADER_HEIGHT = "3rem";

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { currentView, navigateTo } = useNavigation();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  const sidebarWidth = isSidebarOpen ? "4rem" : "0px";

  // Auto-hide header on session pages
  const isSessionPage = currentView === 'claude-code-session' || currentView === 'claude-tab-manager';

  // 用于追踪 Header 可见性状态的 ref（避免闭包问题）
  const headerVisibilityRef = useRef(isHeaderVisible);
  headerVisibilityRef.current = isHeaderVisible;

  // 优化的 Header 自动隐藏逻辑（带 RAF 节流）
  React.useEffect(() => {
    if (!isSessionPage) {
      setIsHeaderVisible(true);
      return;
    }

    let rafId: number;
    let lastY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      // 位移阈值过滤，减少不必要的处理
      if (Math.abs(e.clientY - lastY) < 10) return;
      lastY = e.clientY;

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const shouldShow = e.clientY < 80;
        const shouldHide = e.clientY > 150;

        if (shouldShow && !headerVisibilityRef.current) {
          setIsHeaderVisible(true);
        } else if (shouldHide && headerVisibilityRef.current) {
          setIsHeaderVisible(false);
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
    };
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
      <div
        id="app-sidebar"
        className={cn(
          "z-50 flex-shrink-0 transition-all duration-250 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden",
          isSidebarOpen
            ? "w-16 opacity-100 translate-x-0"
            : "w-0 opacity-0 -translate-x-full"
        )}
      >
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
            // 基础样式
            "flex items-center justify-between px-6 py-3",
            "border-b border-border/50 bg-background/50 backdrop-blur-md",
            "transition-all duration-250 ease-[cubic-bezier(0.2,0,0,1)]",
            "z-40",
            // 条件样式（使用对象语法提高可读性）
            {
              "absolute inset-x-0 top-0": isSessionPage,
              "relative": !isSessionPage,
              "-translate-y-full opacity-0 pointer-events-none": isSessionPage && !isHeaderVisible,
            }
          )}
          style={{
            height: isSessionPage && !isHeaderVisible ? '0' : HEADER_HEIGHT
          }}
        >
            {/* Left: Toggle & Breadcrumbs */}
            <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={isSidebarOpen ? "收起侧边栏" : "展开侧边栏"}
                  aria-expanded={isSidebarOpen}
                  aria-controls="app-sidebar"
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

                <div className="h-4 w-px bg-border/50 mx-2" aria-hidden="true" />

                <UpdateBadge onClick={() => setShowUpdateDialog(true)} />

                <ThemeToggle size="sm" className="w-8 h-8" />

                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowAboutDialog(true)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="关于"
                >
                    <HelpCircle className="w-4 h-4" />
                </Button>
            </div>
        </header>

        {/* Content */}
        <div
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden scroll-smooth",
            "transition-all duration-250 ease-[cubic-bezier(0.2,0,0,1)]",
            isSessionPage && "pt-0"
          )}
          style={{
            paddingTop: isSessionPage && isHeaderVisible ? HEADER_HEIGHT : undefined
          }}
        >
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
