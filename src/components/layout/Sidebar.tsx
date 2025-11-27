import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Settings,
  BarChart2,
  Terminal,
  Layers,
  Zap,
  FileText,
  Package,
  FileCode,
  ChevronLeft,
  ChevronRight,
  HelpCircle
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
import { ClaudeStatusIndicator } from '@/components/ClaudeStatusIndicator';
import { UpdateBadge } from '@/components/common/UpdateBadge';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  className?: string;
  onAboutClick?: () => void;
  onUpdateClick?: () => void;
}

interface NavItem {
  view: View;
  icon: React.ElementType;
  label: string;
  shortcut?: string;
}

const STORAGE_KEY = 'sidebar_expanded';

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  className,
  onAboutClick,
  onUpdateClick
}) => {
  const { t } = useTranslation();

  // 展开/收起状态，从 localStorage 读取
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : true; // 默认展开
  });

  // 持久化状态到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isExpanded));
  }, [isExpanded]);

  // 会话页面时自动收起
  useEffect(() => {
    if (currentView === 'claude-code-session' || currentView === 'claude-tab-manager') {
      setIsExpanded(false);
    }
  }, [currentView]);

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

    const buttonContent = (
      <Button
        variant={isActive ? "secondary" : "ghost"}
        className={cn(
          "rounded-xl mb-2 transition-all duration-200",
          isExpanded ? "w-full justify-start px-3 h-10" : "w-10 h-10",
          isActive
            ? "bg-primary/15 text-primary hover:bg-primary/20 shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}
        onClick={() => onNavigate(item.view)}
      >
        <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
        {isExpanded && (
          <span className="ml-3 text-sm font-medium">{item.label}</span>
        )}
        {!isExpanded && <span className="sr-only">{item.label}</span>}
      </Button>
    );

    // 收起模式显示 Tooltip
    if (!isExpanded) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
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
    }

    return buttonContent;
  };

  return (
    <div
      className={cn(
        "flex flex-col py-4 h-full transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
        "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] border-r border-[var(--glass-border)]",
        isExpanded ? "w-[12.5rem]" : "w-16",
        isExpanded ? "px-3" : "items-center",
        className
      )}
    >
      {/* Logo 区域 */}
      <div className={cn("mb-6", isExpanded ? "px-1" : "")}>
        <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-white/10">
          <Zap className="w-6 h-6 text-primary-foreground" fill="currentColor" />
        </div>
      </div>

      {/* 主导航区域 */}
      <div className={cn("flex-1 flex flex-col w-full", isExpanded ? "space-y-1" : "items-center space-y-2")}>
        {mainNavItems.map((item) => (
          <NavButton key={item.view} item={item} />
        ))}
      </div>

      {/* 底部状态区域 */}
      <div className={cn(
        "flex flex-col w-full mt-auto pt-4 border-t border-[var(--glass-border)]",
        isExpanded ? "space-y-3" : "items-center"
      )}>
        {/* Claude 状态指示器 */}
        <div className={cn(isExpanded ? "px-2" : "flex justify-center")}>
          <ClaudeStatusIndicator
            onSettingsClick={() => onNavigate('settings')}
            compact={!isExpanded}
          />
        </div>

        {/* 更新徽章（展开模式） */}
        {isExpanded && (
          <div className="px-2">
            <UpdateBadge onClick={onUpdateClick} />
          </div>
        )}

        {/* 操作按钮行 */}
        <div className={cn(
          "flex items-center gap-1",
          isExpanded ? "justify-around px-2" : "flex-col"
        )}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <ThemeToggle size="sm" className="w-8 h-8" />
                </div>
              </TooltipTrigger>
              {!isExpanded && (
                <TooltipContent side="right">
                  <p>主题切换</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {onAboutClick && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onAboutClick}
                    className="w-8 h-8 text-muted-foreground hover:text-foreground"
                    aria-label="关于"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                {!isExpanded && (
                  <TooltipContent side="right">
                    <p>关于</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* 设置和展开/收起按钮 */}
        <div className={cn(
          "flex items-center gap-1 pt-2 border-t border-[var(--glass-border)]",
          isExpanded ? "justify-between px-2" : "flex-col"
        )}>
          {bottomNavItems.map((item) => (
            <NavButton key={item.view} item={item} />
          ))}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="w-8 h-8 text-muted-foreground hover:text-foreground"
                  aria-label={isExpanded ? "收起侧边栏" : "展开侧边栏"}
                >
                  {isExpanded ? (
                    <ChevronLeft className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{isExpanded ? "收起侧边栏" : "展开侧边栏"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};
