import { useState, useEffect, useRef } from 'react';

/**
 * Hook to manage header visibility based on mouse position
 * Optimized with Request Animation Frame (RAF) for performance
 * 
 * @param shouldAutoHide - Whether the auto-hide behavior should be active
 * @returns boolean - Whether the header should be visible
 */
export function useHeaderVisibility(shouldAutoHide: boolean) {
  const [isVisible, setIsVisible] = useState(true);
  
  // Use ref to track current state inside event listener without re-binding
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  useEffect(() => {
    // If auto-hide is disabled, always show header
    if (!shouldAutoHide) {
      setIsVisible(true);
      return;
    }

    let rafId: number;
    let lastY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      // Threshold filtering to reduce processing
      if (Math.abs(e.clientY - lastY) < 10) return;
      lastY = e.clientY;

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        // Show when near top (80px)
        const shouldShow = e.clientY < 80;
        // Hide when moved away (150px)
        const shouldHide = e.clientY > 150;

        if (shouldShow && !isVisibleRef.current) {
          setIsVisible(true);
        } else if (shouldHide && isVisibleRef.current) {
          setIsVisible(false);
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [shouldAutoHide]);

  return isVisible;
}