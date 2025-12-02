import React, { useState, useEffect, useRef, useCallback } from "react";
import { BrainCircuit, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTypewriter } from "@/hooks/useTypewriter";

interface ThinkingBlockProps {
  /** 思考内容 */
  content: string;
  /** 是否正在流式输出 */
  isStreaming?: boolean;
  /** 自动收起延迟（毫秒），默认 2500ms */
  autoCollapseDelay?: number;
  /** 打字机速度（毫秒/字符） */
  typewriterSpeed?: number;
}

/**
 * 思考块组件
 *
 * 功能：
 * - 打字机效果逐字显示思考内容
 * - 默认展开状态
 * - 思考输出结束后自动收起（可配置延迟）
 * - 支持手动展开/收起
 */
export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  content,
  isStreaming = false,
  autoCollapseDelay = 2500,
  typewriterSpeed = 5 // 思考内容通常较长，稍快一些
}) => {
  // 展开/收起状态 - 默认展开
  const [isOpen, setIsOpen] = useState(true);

  // 是否已经完成过自动收起（避免重复触发）
  const hasAutoCollapsedRef = useRef(false);

  // 是否用户手动操作过（手动操作后不再自动收起）
  const userInteractedRef = useRef(false);

  // 打字机效果完成回调
  const handleTypewriterComplete = useCallback(() => {
    // 如果用户已手动操作，不自动收起
    if (userInteractedRef.current) return;

    // 如果已经自动收起过，不重复
    if (hasAutoCollapsedRef.current) return;

    // 延迟后自动收起
    const timer = setTimeout(() => {
      if (!userInteractedRef.current) {
        setIsOpen(false);
        hasAutoCollapsedRef.current = true;
      }
    }, autoCollapseDelay);

    return () => clearTimeout(timer);
  }, [autoCollapseDelay]);

  // 使用打字机效果
  const {
    displayedText,
    isTyping,
    skipToEnd
  } = useTypewriter(content, {
    enabled: isStreaming,
    speed: typewriterSpeed,
    isStreaming,
    onComplete: handleTypewriterComplete
  });

  // 显示的文本内容
  const textToDisplay = isStreaming ? displayedText : content;

  // 如果不是流式输出且内容已经存在（历史消息），直接标记为已完成
  useEffect(() => {
    if (!isStreaming && content && !hasAutoCollapsedRef.current) {
      // 历史消息，默认收起
      setIsOpen(false);
      hasAutoCollapsedRef.current = true;
    }
  }, [isStreaming, content]);

  // 用户点击切换展开/收起
  const handleToggle = () => {
    userInteractedRef.current = true;
    setIsOpen(prev => !prev);
  };

  // 双击跳过打字效果
  const handleDoubleClick = useCallback(() => {
    if (isTyping) {
      skipToEnd();
    }
  }, [isTyping, skipToEnd]);

  if (!content) return null;

  return (
    <div className="border-l-2 border-amber-500/30 bg-amber-500/5 rounded-md overflow-hidden my-2">
      {/* Header - 可点击切换 */}
      <button
        onClick={handleToggle}
        className="w-full cursor-pointer px-3 py-2 text-xs text-amber-700 dark:text-amber-300 font-medium hover:bg-amber-500/10 transition-colors select-none flex items-center gap-2 outline-none text-left"
      >
        <BrainCircuit className="w-3.5 h-3.5 opacity-70" />
        <span>Thinking Process</span>

        {/* 打字中指示器 */}
        {isTyping && (
          <span className="inline-block w-1.5 h-3 bg-amber-500 animate-pulse rounded-full" />
        )}

        <span className="ml-auto flex items-center gap-2">
          <span className="text-[10px] opacity-60">
            {content.length} chars
          </span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 opacity-60 transition-transform duration-200",
              isOpen ? "rotate-180" : ""
            )}
          />
        </span>
      </button>

      {/* Content - 可展开/收起 */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div
          className="px-3 pb-3 pt-1"
          onDoubleClick={handleDoubleClick}
          title={isTyping ? "双击跳过打字效果" : undefined}
        >
          <div className="text-xs text-muted-foreground/80 whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
            {textToDisplay}

            {/* 打字中光标 */}
            {isTyping && (
              <span className="inline-block w-1 h-3 ml-0.5 bg-amber-500 animate-pulse rounded-sm" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThinkingBlock;
