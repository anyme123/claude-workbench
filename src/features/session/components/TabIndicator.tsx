import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Clock, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTabs } from '@/hooks/useTabs';
import { cn } from '@/lib/utils';

interface TabIndicatorProps {
  onViewTabs: () => void;
  className?: string;
}

/**
 * TabIndicator - 标签页状态指示器
 * 显示当前打开的标签页数量和状态，提供快速跳转功能
 */
export const TabIndicator: React.FC<TabIndicatorProps> = ({
  onViewTabs,
  className,
}) => {
  const { getTabStats } = useTabs();
  const stats = getTabStats();

  // 如果没有标签页，不显示指示器
  if (stats.total === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className={cn("flex items-center gap-2", className)}
        >
          {/* 标签页统计信息 */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className={cn(
                    "flex items-center gap-1 text-xs cursor-pointer transition-colors",
                    stats.total > 0 && "hover:bg-primary/10"
                  )}
                  onClick={onViewTabs}
                >
                  <MessageSquare className="h-3 w-3" />
                  <span>{stats.total}</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{stats.total} 个会话已打开</p>
              </TooltipContent>
            </Tooltip>

            {/* 活跃会话指示器 */}
            {stats.active > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 text-xs border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                  >
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    <span>{stats.active}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{stats.active} 个会话正在处理中</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* 未保存更改指示器 */}
            {stats.hasChanges > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 text-xs border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  >
                    <Clock className="h-3 w-3" />
                    <span>{stats.hasChanges}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{stats.hasChanges} 个会话有未保存更改</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* 查看标签页按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onViewTabs}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                查看会话
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>查看所有已打开的会话</p>
            </TooltipContent>
          </Tooltip>
        </motion.div>
      </AnimatePresence>
    </TooltipProvider>
  );
};