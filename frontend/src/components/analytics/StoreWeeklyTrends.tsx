import React, { useMemo } from 'react';
import { formatCurrency } from '../../utils/dateCalculations';
import { useStoreWeeklyTrends } from '../../hooks/useStoreComparisonV2';
import { useDashboardStore } from '../../stores/dashboardStore';

interface StoreWeeklyTrendsProps {
  storeIds: string[];
}

export const StoreWeeklyTrends: React.FC<StoreWeeklyTrendsProps> = ({ storeIds }) => {
  const { data, isLoading, error } = useStoreWeeklyTrends(storeIds);
  const storesList = useDashboardStore((state) => state.stores);

  const getStoreName = (id: string) => {
    const store = storesList.find(s => s.id === id);
    return store ? store.name : id;
  };

  const processedData = useMemo(() => {
    if (!data?.trends) return [];

    return Object.entries(data.trends)
      .filter(([storeId]) => storeIds.includes(storeId))
      .map(([storeId, weeklyData]: [string, any[]]) => {
        // Ensure we have exactly 8 weeks of data
        const trend = weeklyData.slice(-8);

        // Calculate momentum
        const recentAvg = trend.slice(-3).reduce((sum, w) => sum + w.revenue, 0) / 3;
        const olderAvg = trend.slice(0, 3).reduce((sum, w) => sum + w.revenue, 0) / 3;
        const momentum = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

        // Determine trend direction
        let direction: 'up' | 'down' | 'flat' = 'flat';
        if (momentum > 5) direction = 'up';
        else if (momentum < -5) direction = 'down';

        return {
          storeName: getStoreName(storeId), // Use mapped name
          trend,
          momentum,
          direction,
          totalRevenue: trend.reduce((sum, w) => sum + w.revenue, 0),
        };
      });
  }, [data, storeIds, storesList]);

  // SVG sparkline generator
  const generateSparkline = (data: any[], width: number = 100, height: number = 40) => {
    if (!data || data.length === 0) return '';

    const values = data.map(d => d.revenue);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min;

    if (range === 0) {
      // Flat line
      const y = height / 2;
      return `M 0,${y} L ${width},${y}`;
    }

    const points = values.map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400">Error loading weekly trends data</div>;
  }

  if (processedData.length === 0) {
    return <div className="text-center text-gray-400 py-8">No weekly trends data available</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {processedData.map((store) => (
        <div
          key={store.storeName}
          className="bg-[#252833] border border-[#2e303d] rounded-lg p-4 hover:border-blue-500/30 transition-colors"
        >
          {/* Store Name and Trend Indicator */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">{store.storeName}</h3>
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${store.direction === 'up'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : store.direction === 'down'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                }`}
              title={`Trend: ${store.direction === 'up' ? 'Growing' : store.direction === 'down' ? 'Declining' : 'Stable'}`}
            >
              {store.direction === 'up' && (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              )}
              {store.direction === 'down' && (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
              {store.direction === 'flat' && (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" />
                </svg>
              )}
              <span>
                {store.momentum >= 0 ? '+' : ''}
                {store.momentum.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Sparkline */}
          <div className="mb-3">
            <svg
              width="100%"
              height="60"
              className="overflow-visible"
              preserveAspectRatio="none"
              viewBox="0 0 100 40"
            >
              {/* Grid lines */}
              <line x1="0" y1="0" x2="100" y2="0" stroke="#2e303d" strokeWidth="0.5" />
              <line x1="0" y1="20" x2="100" y2="20" stroke="#2e303d" strokeWidth="0.5" strokeDasharray="2,2" />
              <line x1="0" y1="40" x2="100" y2="40" stroke="#2e303d" strokeWidth="0.5" />

              {/* Sparkline path */}
              <path
                d={generateSparkline(store.trend, 100, 40)}
                fill="none"
                stroke={
                  store.direction === 'up'
                    ? '#10b981'
                    : store.direction === 'down'
                      ? '#ef4444'
                      : '#6b7280'
                }
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data points */}
              {store.trend.map((week, idx) => {
                const values = store.trend.map(d => d.revenue);
                const max = Math.max(...values);
                const min = Math.min(...values);
                const range = max - min;

                const x = (idx / (store.trend.length - 1)) * 100;
                const y = range > 0 ? 40 - ((week.revenue - min) / range) * 40 : 20;

                return (
                  <circle
                    key={idx}
                    cx={x}
                    cy={y}
                    r="2"
                    fill={
                      store.direction === 'up'
                        ? '#10b981'
                        : store.direction === 'down'
                          ? '#ef4444'
                          : '#6b7280'
                    }
                    className="hover:r-3 transition-all"
                  >
                    <title>
                      {new Date(week.week).toLocaleDateString()}: {formatCurrency(week.revenue)}
                    </title>
                  </circle>
                );
              })}
            </svg>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-400 text-xs mb-1">8-Week Total</div>
              <div className="text-white font-semibold">{formatCurrency(store.totalRevenue)}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs mb-1">Weekly Avg</div>
              <div className="text-white font-semibold">
                {formatCurrency(store.totalRevenue / store.trend.length)}
              </div>
            </div>
          </div>

          {/* Mini week labels */}
          <div className="flex justify-between mt-3 text-xs text-gray-500">
            <span>8w ago</span>
            <span>now</span>
          </div>
        </div>
      ))}
    </div>
  );
};
