import { useRef, useCallback } from 'react';

interface UseSwipeNavigationOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
}: UseSwipeNavigationOptions) {
  const startX = useRef(0);
  const startY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - startX.current;
    const diffY = endY - startY.current;

    // Only trigger if horizontal movement is dominant (>30deg angle)
    if (Math.abs(diffX) > threshold && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX < 0 && onSwipeLeft) {
        onSwipeLeft();
      } else if (diffX > 0 && onSwipeRight) {
        onSwipeRight();
      }
    }
  }, [onSwipeLeft, onSwipeRight, threshold]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}
