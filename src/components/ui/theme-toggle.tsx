import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ThemeToggleProps {
  /**
   * 显示模式：icon-only（仅图标）或 with-text（带文字）
   */
  variant?: 'icon-only' | 'with-text';
  /**
   * 按钮尺寸
   */
  size?: 'sm' | 'default' | 'lg';
  /**
   * 自定义类名
   */
  className?: string;
}

/**
 * 主题切换组件
 * 支持亮色/暗色主题切换
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  variant = 'icon-only',
  size = 'sm',
  className = '',
}) => {
  const { theme, toggleTheme } = useTheme();

  const button = (
    <Button
      variant="ghost"
      size={size}
      onClick={toggleTheme}
      className={cn("transition-all duration-200 hover:scale-105 rounded-full", className)}
    >
      {theme === 'dark' ? (
        <>
          <Sun className="h-3.5 w-3.5" strokeWidth={2} />
          {variant === 'with-text' && <span className="ml-1.5">主题</span>}
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5" strokeWidth={2} />
          {variant === 'with-text' && <span className="ml-1.5">主题</span>}
        </>
      )}
    </Button>
  );

  // 仅图标模式时显示 tooltip
  if (variant === 'icon-only') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

