/**
 * 智能自动滚动 Hook
 *
 * 从 ClaudeCodeSession 提取（原 166-170 状态，305-435 逻辑）
 * 提供智能滚动管理：用户手动滚动检测、自动滚动到底部、流式输出滚动
 */

import { useRef, useState, useEffect } from 'react';
import type { ClaudeStreamMessage } from '@/types/claude';

interface SmartAutoScrollConfig {
  /** 可显示的消息列表（用于触发滚动） */
  displayableMessages: ClaudeStreamMessage[];
  /** 是否正在加载（流式输出时） */
  isLoading: boolean;
}

interface SmartAutoScrollReturn {
  /** 滚动容器 ref */
  parentRef: React.RefObject<HTMLDivElement>;
  /** 用户是否手动滚动离开底部 */
  userScrolled: boolean;
  /** 设置用户滚动状态 */
  setUserScrolled: (scrolled: boolean) => void;
  /** 设置自动滚动状态 */
  setShouldAutoScroll: (should: boolean) => void;
}

/**
 * 智能自动滚动 Hook
 *
 * @param config - 配置对象
 * @returns 滚动管理对象
 *
 * @example
 * const { parentRef, userScrolled, setUserScrolled, shouldAutoScroll, setShouldAutoScroll } =
 *   useSmartAutoScroll({
 *     displayableMessages,
 *     isLoading
 *   });
 */
export function useSmartAutoScroll(config: SmartAutoScrollConfig): SmartAutoScrollReturn {
  const { displayableMessages, isLoading } = config;

  // Scroll state
  const [userScrolled, setUserScrolled] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Refs
  const parentRef = useRef<HTMLDivElement>(null);
  const lastScrollPositionRef = useRef(0);
  const isAutoScrollingRef = useRef(false); // 🆕 Track if scroll was initiated by code

  // Helper to perform auto-scroll safely
  const performAutoScroll = () => {
    if (parentRef.current) {
      const scrollElement = parentRef.current;
      // Check if we actually need to scroll to avoid unnecessary events
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const targetScrollTop = scrollHeight - clientHeight;
      
      if (Math.abs(scrollTop - targetScrollTop) > 1) { // Small tolerance
        isAutoScrollingRef.current = true;
        scrollElement.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      }
    }
  };

  // Smart scroll detection - detect when user manually scrolls
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      // 1. Check if this scroll event was triggered by our auto-scroll
      if (isAutoScrollingRef.current) {
        isAutoScrollingRef.current = false;
        // Update last position to current to prevent diff calculation errors next time
        lastScrollPositionRef.current = scrollElement.scrollTop;
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      
      // 2. Calculate distance from bottom
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isAtBottom = distanceFromBottom <= 50; // 50px threshold

      // 3. Determine user intent
      // If user is not at bottom, they are viewing history -> Stop auto scroll
      if (!isAtBottom) {
        setUserScrolled(true);
        setShouldAutoScroll(false);
      } else {
        // User is at bottom (or scrolled back to bottom) -> Resume auto scroll
        setUserScrolled(false);
        setShouldAutoScroll(true);
      }

      lastScrollPositionRef.current = scrollTop;
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, []); // Empty deps - event listener only needs to be registered once

  // Smart auto-scroll for new messages (initial load or update)
  useEffect(() => {
    if (displayableMessages.length > 0 && shouldAutoScroll && !userScrolled) {
      const timeoutId = setTimeout(() => {
        performAutoScroll();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [displayableMessages.length, shouldAutoScroll, userScrolled]);

  // Enhanced streaming scroll - only when user hasn't manually scrolled away
  useEffect(() => {
    if (isLoading && displayableMessages.length > 0 && shouldAutoScroll && !userScrolled) {
      // Immediate scroll on update
      performAutoScroll();

      // Frequent updates during streaming
      const intervalId = setInterval(performAutoScroll, 200);

      return () => clearInterval(intervalId);
    }
  }, [isLoading, displayableMessages.length, shouldAutoScroll, userScrolled]);

  return {
    parentRef,
    userScrolled,
    setUserScrolled,
    setShouldAutoScroll
  };
}
