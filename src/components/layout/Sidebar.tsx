import React from 'react';
import {
  FolderOpen,
  Settings,
  BarChart2,
  Terminal,
  Layers,
  Zap,
  FileText,
  Package,
  FileCode
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { View } from '@/types/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  className?: string;
}

interface NavItem {
  view: View;
  icon: React.ElementType;
  label: string;
  shortcut?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onNavigate,
  className 
}) => {
  const { t } = useTranslation();

  const mainNavItems: NavItem[] = [
    { view: 'projects', icon: FolderOpen, label: t('common.ccProjectsTitle') },
    { view: 'claude-tab-manager', icon: Terminal, label: '会话管理' },
    { view: 'editor', icon: FileText, label: 'Claude 提示词' },
    { view: 'codex-editor', icon: FileCode, label: 'Codex 提示词' },
    { view: 'usage-dashboard', icon: BarChart2, label: '使用统计' },
    { view: 'mcp', icon: Layers, label: 'MCP 工具' },
    { view: 'claude-extensions', icon: Package, label: '扩展' },
  ];

  const bottomNavItems: NavItem[] = [
    { view: 'settings', icon: Settings, label: t('navigation.settings') },
  ];

  const NavButton = ({ item }: { item: NavItem }) => {
    const isActive = currentView === item.view;
    
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              size="icon"
              className={cn(
                "w-10 h-10 rounded-xl mb-2 transition-all duration-200",
                isActive 
                  ? "bg-primary/15 text-primary hover:bg-primary/20 shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              onClick={() => onNavigate(item.view)}
            >
              <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="sr-only">{item.label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2 px-3 py-1.5">
            <span className="font-medium">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-muted-foreground bg-muted px-1 rounded border">
                {item.shortcut}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className={cn(
      "flex flex-col items-center py-4 w-16 h-full",
      "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] border-r border-[var(--glass-border)]",
      className
    )}>
      <div className="mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-white/10">
          <Zap className="w-6 h-6 text-primary-foreground" fill="currentColor" />
        </div>
      </div>

      <div className="flex-1 flex flex-col w-full items-center space-y-2">
        {mainNavItems.map((item) => (
          <NavButton key={item.view} item={item} />
        ))}
      </div>

      <div className="flex flex-col w-full items-center mt-auto pt-4 border-t border-[var(--glass-border)]">
        {bottomNavItems.map((item) => (
          <NavButton key={item.view} item={item} />
        ))}
      </div>
    </div>
  );
};
