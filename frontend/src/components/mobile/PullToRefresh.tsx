import React, { useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface PullToRefreshProps {
  children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children }) => {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const threshold = 60;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isRefreshing || !startY.current) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    if (diff > 0 && containerRef.current && containerRef.current.scrollTop === 0) {
      setPullDistance(Math.min(diff * 0.5, 100));
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      await queryClient.invalidateQueries();
      setIsRefreshing(false);
    }
    setPullDistance(0);
    startY.current = 0;
  }, [pullDistance, isRefreshing, queryClient]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {/* Pull indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="flex items-center justify-center transition-all duration-200"
          style={{ height: isRefreshing ? 40 : pullDistance }}
        >
          <div
            className={`w-6 h-6 border-2 border-[#00d2ff] border-t-transparent rounded-full ${
              isRefreshing || pullDistance >= threshold ? 'animate-spin' : ''
            }`}
            style={{
              opacity: Math.min(pullDistance / threshold, 1),
              transform: `rotate(${pullDistance * 3}deg)`,
            }}
          />
        </div>
      )}
      {children}
    </div>
  );
};
