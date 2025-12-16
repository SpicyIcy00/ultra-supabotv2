import React from 'react';
import { formatCurrency } from '../../utils/dateCalculations';
import { useTopMovers } from '../../hooks/useStoreComparisonV2';

interface TopMoversProps {
  startDate: Date;
  endDate: Date;
  compareStartDate: Date;
  compareEndDate: Date;
  storeIds: string[];
}

export const TopMovers: React.FC<TopMoversProps> = ({
  startDate,
  endDate,
  compareStartDate,
  compareEndDate,
  storeIds,
}) => {
  const { data, isLoading, error } = useTopMovers(
    startDate,
    endDate,
    compareStartDate,
    compareEndDate,
    storeIds
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400">Error loading top movers data</div>;
  }

  if (!data) {
    return <div className="text-center text-gray-400 py-8">No data available</div>;
  }

  const MoverItem = ({ item, isPositive }: { item: any; isPositive: boolean }) => (
    <div className="bg-[#1c1e26] rounded-lg p-3 border-l-4" style={{
      borderLeftColor: isPositive ? '#10b981' : '#ef4444'
    }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-medium text-sm">{item.name}</span>
        <span className={`font-bold text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {isPositive ? '+' : ''}{formatCurrency(item.revenue_change)}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {formatCurrency(item.previous_revenue)} → {formatCurrency(item.current_revenue)}
        </span>
        <span className={isPositive ? 'text-green-400' : 'text-red-400'}>
          {isPositive ? '+' : ''}{item.change_pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Products */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Top Product Movers</h3>

        {/* Products Up */}
        {data.products_up && data.products_up.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-green-400 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              Top Gainers ({data.products_up.length})
            </h4>
            <div className="space-y-2">
              {data.products_up.map((item, idx) => (
                <MoverItem key={idx} item={item} isPositive={true} />
              ))}
            </div>
          </div>
        )}

        {/* Products Down */}
        {data.products_down && data.products_down.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              Top Decliners ({data.products_down.length})
            </h4>
            <div className="space-y-2">
              {data.products_down.map((item, idx) => (
                <MoverItem key={idx} item={item} isPositive={false} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Categories */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Top Category Movers</h3>

        {/* Categories Up */}
        {data.categories_up && data.categories_up.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-green-400 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              Top Gainers ({data.categories_up.length})
            </h4>
            <div className="space-y-2">
              {data.categories_up.map((item, idx) => (
                <MoverItem key={idx} item={item} isPositive={true} />
              ))}
            </div>
          </div>
        )}

        {/* Categories Down */}
        {data.categories_down && data.categories_down.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              Top Decliners ({data.categories_down.length})
            </h4>
            <div className="space-y-2">
              {data.categories_down.map((item, idx) => (
                <MoverItem key={idx} item={item} isPositive={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
