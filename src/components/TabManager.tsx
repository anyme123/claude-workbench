import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, MoreHorizontal, MessageSquare, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { TabSessionWrapper } from './TabSessionWrapper';
import { useTabs } from '@/hooks/useTabs';
import { useSessionSync } from '@/hooks/useSessionSync'; // 🔧 NEW: 会话状态同步
import type { Session } from '@/lib/api';

interface TabManagerProps {
  onBack: () => void;
  onProjectSettings?: (projectPath: string) => void;
  className?: string;
  /**
   * 初始会话信息 - 从 SessionList 跳转时使用
   */
  initialSession?: Session;
  /**
   * 初始项目路径 - 创建新会话时使用
   */
  initialProjectPath?: string;
}

/**
 * TabManager - 多标签页会话管理器
 * 支持多个 Claude Code 会话同时运行，后台保持状态
 */
export const TabManager: React.FC<TabManagerProps> = ({
  onBack,
  onProjectSettings,
  className,
  initialSession,
  initialProjectPath,
}) => {
  const {
    tabs,
    createNewTab,
    switchToTab,
    closeTab,
    updateTabStreamingStatus,
    reorderTabs, // 🔧 NEW: 拖拽排序
  } = useTabs();

  // 🔧 NEW: 启用会话状态同步
  useSessionSync();

  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null); // 🔧 NEW: 拖拽悬停的位置
  const [tabToClose, setTabToClose] = useState<string | null>(null); // 🔧 NEW: 待关闭的标签页ID（需要确认）
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // ✨ Phase 3: Simple initialization flag (no complex state machine)
  const initializedRef = useRef(false);

  // 拖拽处理
  const handleTabDragStart = useCallback((tabId: string) => {
    setDraggedTab(tabId);
  }, []);

  const handleTabDragEnd = useCallback(() => {
    setDraggedTab(null);
    setDragOverIndex(null); // 🔧 NEW: 清除拖拽悬停状态
  }, []);

  // 🔧 NEW: 拖拽悬停处理 - 计算drop位置
  const handleTabDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault(); // 必须阻止默认行为以允许drop
    setDragOverIndex(index);
  }, []);

  // 🔧 NEW: 拖拽放置处理 - 执行重排序
  const handleTabDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();

    if (!draggedTab) return;

    // 查找被拖拽标签页的索���
    const fromIndex = tabs.findIndex(t => t.id === draggedTab);
    if (fromIndex === -1 || fromIndex === targetIndex) {
      setDraggedTab(null);
      setDragOverIndex(null);
      return;
    }

    // 执行重排序
    reorderTabs(fromIndex, targetIndex);
    setDraggedTab(null);
    setDragOverIndex(null);
  }, [draggedTab, tabs, reorderTabs]);

  // 🔧 NEW: 处理标签页关闭（支持确认Dialog）
  const handleCloseTab = useCallback(async (tabId: string, force = false) => {
    const result = await closeTab(tabId, force);

    // 如果需要确认，显示Dialog
    if (result && typeof result === 'object' && 'needsConfirmation' in result && result.needsConfirmation) {
      setTabToClose(result.tabId || null);
    }
  }, [closeTab]);

  // 🔧 NEW: 确认关闭标签页
  const confirmCloseTab = useCallback(async () => {
    if (tabToClose) {
      await closeTab(tabToClose, true); // force close
      setTabToClose(null);
    }
  }, [tabToClose, closeTab]);

  // ✨ Phase 3: Simplified initialization (single responsibility, no race conditions)
  useEffect(() => {
    // Only run once
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Priority 1: Tabs restored from localStorage
    if (tabs.length > 0) {
      console.log('[TabManager] Tabs restored from localStorage');
      return;
    }

    // Priority 2: Initial session provided
    if (initialSession) {
      console.log('[TabManager] Creating tab for initial session:', initialSession.id);
      createNewTab(initialSession);
      return;
    }

    // Priority 3: Initial project path provided
    if (initialProjectPath) {
      console.log('[TabManager] Creating tab for initial project:', initialProjectPath);
      createNewTab(undefined, initialProjectPath);
      return;
    }

    // Priority 4: No initial data - show empty state
    console.log('[TabManager] No initial data, showing empty state');
  }, []); // Empty deps - only run once on mount

  return (
    <TooltipProvider>
      <div className={cn("h-full flex flex-col bg-background", className)}>
        {/* 标签页栏 */}
        <div className="flex-shrink-0 border-b bg-muted/20">
          <div className="flex items-center h-12 px-4">
            {/* 返回按钮 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="mr-3 px-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回
            </Button>

            {/* 标签页容器 */}
            <div
              ref={tabsContainerRef}
              className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none"
            >
              <AnimatePresence mode="popLayout">
                {tabs.map((tab, index) => (
                  <motion.div
                    key={tab.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "group relative flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b-2 min-w-0 max-w-[200px] cursor-pointer",
                      "transition-colors duration-200",
                      tab.isActive
                        ? "bg-background border-primary text-foreground"
                        : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                      draggedTab === tab.id && "opacity-50",
                      dragOverIndex === index && draggedTab !== tab.id && "ring-2 ring-primary/50" // 🔧 NEW: 拖拽悬停高亮
                    )}
                    onClick={() => switchToTab(tab.id)}
                    draggable
                    onDragStart={() => handleTabDragStart(tab.id)}
                    onDragEnd={handleTabDragEnd}
                    onDragOver={(e) => handleTabDragOver(e, index)} // 🔧 NEW: 拖拽悬停
                    onDrop={(e) => handleTabDrop(e, index)} // 🔧 NEW: 拖拽放置
                  >
                    {/* 会话状态指示器 */}
                    <div className="flex-shrink-0">
                      {tab.state === 'streaming' ? (
                        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                      ) : tab.hasUnsavedChanges ? (
                        <div className="h-2 w-2 bg-orange-500 rounded-full" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5" />
                      )}
                    </div>

                    {/* 标签页标题 */}
                    <span className="flex-1 truncate text-sm font-medium">
                      {tab.title}
                    </span>

                    {/* 关闭按钮 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-shrink-0 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTab(tab.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* 新建标签页按钮 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-shrink-0 h-8 w-8 p-0 ml-1"
                    onClick={() => createNewTab()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>新建会话</TooltipContent>
              </Tooltip>
            </div>

            {/* 标签页菜单 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 ml-2">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => createNewTab()}>
                  <Plus className="h-4 w-4 mr-2" />
                  新建会话
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => tabs.forEach(tab => closeTab(tab.id, true))}
                  disabled={tabs.length === 0}
                >
                  关闭所有标签页
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => tabs.filter(tab => !tab.isActive).forEach(tab => closeTab(tab.id, true))}
                  disabled={tabs.length <= 1}
                >
                  关闭其他标签页
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 标签页内容区域 */}
        <div className="flex-1 relative overflow-hidden">
          {/* 🔧 PERFORMANCE FIX: 只渲染活跃标签页，而非所有标签页 */}
          {/* 这大幅减少内存使用和CPU开销 */}
          {tabs.map((tab) => {
            // 只渲染活跃标签页
            if (!tab.isActive) {
              return null;
            }

            return (
              <TabSessionWrapper
                key={tab.id}
                tabId={tab.id}
                session={tab.session}
                initialProjectPath={tab.projectPath}
                isActive={tab.isActive}
                onBack={() => {
                  // 如果只有一个标签页，直接返回
                  if (tabs.length === 1) {
                    onBack();
                  } else {
                    // 否则关闭当前标签页
                    handleCloseTab(tab.id);
                  }
                }}
                onProjectSettings={onProjectSettings}
                onStreamingChange={(isStreaming, sessionId) =>
                  updateTabStreamingStatus(tab.id, isStreaming, sessionId)
                }
              />
            );
          })}

          {/* 🔧 IMPROVED: 无标签页时的增强占位符 */}
          {tabs.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center space-y-4">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <div>
                  <p className="text-lg font-medium mb-2">暂无活跃会话</p>
                  <p className="text-sm mb-6">所有标签页已关闭</p>
                </div>

                {/* 🔧 NEW: Explicit actions for creating new sessions */}
                <div className="space-y-2">
                  <Button
                    onClick={() => createNewTab()}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    创建新会话
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onBack}
                    className="w-full"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    返回主界面
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 🔧 NEW: 自定义关闭确认Dialog */}
        <Dialog open={tabToClose !== null} onOpenChange={(open) => !open && setTabToClose(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认关闭标签页</DialogTitle>
              <DialogDescription>
                此会话有未保存的更改，确定要关闭吗？关闭后更改将丢失。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTabToClose(null)}>
                取消
              </Button>
              <Button variant="destructive" onClick={confirmCloseTab}>
                确认关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};