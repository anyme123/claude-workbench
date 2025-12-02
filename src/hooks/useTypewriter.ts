import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTypewriterOptions {
  /** 是否启用打字机效果 */
  enabled?: boolean;
  /** 每个字符的打字速度（毫秒） */
  speed?: number;
  /** 是否正在流式输入新内容 */
  isStreaming?: boolean;
  /** 打字完成回调 */
  onComplete?: () => void;
}

interface UseTypewriterReturn {
  /** 当前显示的文本 */
  displayedText: string;
  /** 是否正在打字中 */
  isTyping: boolean;
  /** 是否已完成打字 */
  isComplete: boolean;
  /** 跳过打字动画，直接显示全部内容 */
  skipToEnd: () => void;
}

/**
 * 打字机效果 Hook
 *
 * 特性：
 * - 支持流式内容更新（新内容追加时继续打字）
 * - 可配置打字速度
 * - 支持跳过动画
 * - 智能处理 Markdown（避免在代码块中间断开）
 */
export function useTypewriter(
  fullText: string,
  options: UseTypewriterOptions = {}
): UseTypewriterReturn {
  const {
    enabled = true,
    speed = 10, // 默认每字符 10ms，较快的打字速度
    isStreaming = false,
    onComplete
  } = options;

  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // 使用 ref 跟踪当前打字位置和动画状态
  const currentIndexRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const previousTextLengthRef = useRef(0);
  const skipRef = useRef(false);

  // 跳过动画
  const skipToEnd = useCallback(() => {
    skipRef.current = true;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setDisplayedText(fullText);
    currentIndexRef.current = fullText.length;
    setIsTyping(false);
    setIsComplete(true);
  }, [fullText]);

  useEffect(() => {
    // 如果禁用打字机效果，直接显示全部内容
    if (!enabled) {
      setDisplayedText(fullText);
      setIsComplete(true);
      setIsTyping(false);
      return;
    }

    // 如果用户已跳过，且不是流式输入，保持跳过状态
    if (skipRef.current && !isStreaming) {
      setDisplayedText(fullText);
      return;
    }

    // 检测是否有新内容追加（流式场景）
    const hasNewContent = fullText.length > previousTextLengthRef.current;

    // 如果是流式输入且有新内容，重置跳过状态以继续打字
    if (isStreaming && hasNewContent) {
      skipRef.current = false;
    }

    previousTextLengthRef.current = fullText.length;

    // 如果当前索引已经达到目标，检查是否完成
    if (currentIndexRef.current >= fullText.length) {
      if (!isStreaming) {
        setIsComplete(true);
        setIsTyping(false);
        onComplete?.();
      }
      return;
    }

    // 开始打字动画
    setIsTyping(true);
    setIsComplete(false);

    const animate = (timestamp: number) => {
      if (skipRef.current) {
        return;
      }

      // 计算时间差
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastTimeRef.current;

      // 根据速度决定要显示多少字符
      if (elapsed >= speed) {
        // 计算这一帧应该显示多少字符
        const charsToAdd = Math.max(1, Math.floor(elapsed / speed));
        const newIndex = Math.min(currentIndexRef.current + charsToAdd, fullText.length);

        // 智能断点：避免在 Markdown 语法中间断开
        const adjustedIndex = findSafeBreakPoint(fullText, currentIndexRef.current, newIndex);

        currentIndexRef.current = adjustedIndex;
        setDisplayedText(fullText.slice(0, adjustedIndex));
        lastTimeRef.current = timestamp;
      }

      // 检查是否还需要继续
      if (currentIndexRef.current < fullText.length) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsTyping(false);
        if (!isStreaming) {
          setIsComplete(true);
          onComplete?.();
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [fullText, enabled, speed, isStreaming, onComplete]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    displayedText,
    isTyping,
    isComplete,
    skipToEnd
  };
}

/**
 * 查找安全的断点位置
 * 避免在以下情况中间断开：
 * - 代码块标记 (```)
 * - 链接 []()
 * - 粗体/斜体 **、__、*、_
 * - 行内代码 `
 */
function findSafeBreakPoint(text: string, start: number, end: number): number {
  // 如果距离很短，直接返回
  if (end - start <= 1) {
    return end;
  }

  const segment = text.slice(start, end);

  // 检查是否在代码块标记中间
  const codeBlockMatch = segment.match(/`+$/);
  if (codeBlockMatch) {
    // 回退到代码块标记开始之前
    return end - codeBlockMatch[0].length;
  }

  // 检查是否在 Markdown 链接语法中间 [...](...)
  // 如果最后一个字符是 [ 或 ]，继续到 ) 结束
  const lastChar = segment[segment.length - 1];
  if (lastChar === '[' || lastChar === '(') {
    return end - 1;
  }

  // 检查是否在粗体/斜体标记中间
  const emphasisMatch = segment.match(/[*_]+$/);
  if (emphasisMatch && emphasisMatch[0].length < 3) {
    return end - emphasisMatch[0].length;
  }

  return end;
}

export default useTypewriter;
