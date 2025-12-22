import React, { useMemo } from 'react';
import { formatCurrency, formatNumber } from '../../utils/dateCalculations';

interface StoreData {
  store_name: string;
  current: {
    revenue: number;
    transaction_count: number;
    avg_ticket: number;
    margin_pct: number;
  };
  previous: {
    revenue: number;
    transaction_count: number;
    avg_ticket: number;
    margin_pct: number;
  };
}

interface StoreHeatmapProps {
  stores: StoreData[];
  onStoreClick: (storeName: string) => void;
}


export const StoreHeatmap: React.FC<StoreHeatmapProps> = ({ stores, onStoreClick }) => {
  // Calculate percentiles for color coding
  const getPercentileRank = (value: number, values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const index = sorted.findIndex(v => v >= value);
    return (index / sorted.length) * 100;
  };

  // Get color based on percentile (0-100)
  const getHeatColor = (percentile: number, change: number): string => {
    // If significant negative change, show red regardless of percentile
    if (change < -10) {
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    }

    // Color based on percentile
    if (percentile >= 80) {
      return 'bg-green-500/20 text-green-400 border-green-500/30'; // Top performer
    } else if (percentile <= 20) {
      return 'bg-red-500/20 text-red-400 border-red-500/30'; // Underperformer
    } else {
      return 'bg-gray-500/10 text-gray-300 border-gray-500/20'; // Middle
    }
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    if (!stores || stores.length === 0) return null;

    const revenueValues = stores.map(s => s.current.revenue);
    const transactionValues = stores.map(s => s.current.transaction_count);
    const avgTicketValues = stores.map(s => s.current.avg_ticket);
    const marginValues = stores.map(s => s.current.margin_pct);

    return {
      revenueValues,
      transactionValues,
      avgTicketValues,
      marginValues,
    };
  }, [stores]);

  if (!stores || stores.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        No store data available
      </div>
    );
  }

  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#2e303d]">
            <th className="text-left py-3 px-4 text-gray-300 font-medium sticky left-0 bg-[#1c1e26] z-10">
              Store
            </th>
            <th className="text-right py-3 px-4 text-gray-300 font-medium">
              Revenue
            </th>
            <th className="text-right py-3 px-4 text-gray-300 font-medium">
              Transactions
            </th>
            <th className="text-right py-3 px-4 text-gray-300 font-medium">
              Avg Ticket
            </th>
            <th className="text-right py-3 px-4 text-gray-300 font-medium">
              Margin %
            </th>
            <th className="text-right py-3 px-4 text-gray-300 font-medium">
              vs Previous
            </th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store) => {
            if (!metrics) return null;

            const revenuePercentile = getPercentileRank(store.current.revenue, metrics.revenueValues);
            const transactionPercentile = getPercentileRank(store.current.transaction_count, metrics.transactionValues);
            const avgTicketPercentile = getPercentileRank(store.current.avg_ticket, metrics.avgTicketValues);
            const marginPercentile = getPercentileRank(store.current.margin_pct, metrics.marginValues);

            const revenueChange = calculateChange(store.current.revenue, store.previous.revenue);
            const transactionChange = calculateChange(store.current.transaction_count, store.previous.transaction_count);
            const avgTicketChange = calculateChange(store.current.avg_ticket, store.previous.avg_ticket);
            const marginChange = store.current.margin_pct - store.previous.margin_pct;

            return (
              <tr
                key={store.store_name}
                className="border-b border-[#2e303d] hover:bg-[#252833] transition-colors cursor-pointer"
                onClick={() => onStoreClick(store.store_name)}
              >
                <td className="py-3 px-4 text-white font-medium sticky left-0 bg-[#1c1e26] group-hover:bg-[#252833]">
                  {store.store_name}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className={`inline-block px-3 py-2 rounded-lg border ${getHeatColor(revenuePercentile, revenueChange)}`}>
                    <div className="font-semibold">{formatCurrency(store.current.revenue)}</div>
                    <div className="text-xs opacity-75">
                      {revenueChange >= 0 ? '↑' : '↓'} {Math.abs(revenueChange).toFixed(1)}%
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className={`inline-block px-3 py-2 rounded-lg border ${getHeatColor(transactionPercentile, transactionChange)}`}>
                    <div className="font-semibold">{formatNumber(store.current.transaction_count)}</div>
                    <div className="text-xs opacity-75">
                      {transactionChange >= 0 ? '↑' : '↓'} {Math.abs(transactionChange).toFixed(1)}%
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className={`inline-block px-3 py-2 rounded-lg border ${getHeatColor(avgTicketPercentile, avgTicketChange)}`}>
                    <div className="font-semibold">{formatCurrency(store.current.avg_ticket)}</div>
                    <div className="text-xs opacity-75">
                      {avgTicketChange >= 0 ? '↑' : '↓'} {Math.abs(avgTicketChange).toFixed(1)}%
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className={`inline-block px-3 py-2 rounded-lg border ${getHeatColor(marginPercentile, marginChange)}`}>
                    <div className="font-semibold">{store.current.margin_pct.toFixed(2)}%</div>
                    <div className="text-xs opacity-75">
                      {marginChange >= 0 ? '↑' : '↓'} {Math.abs(marginChange).toFixed(2)}pp
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className={`inline-block px-3 py-2 rounded-lg ${revenueChange >= 10 ? 'bg-green-500/20 text-green-400' :
                      revenueChange <= -10 ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/10 text-gray-300'
                    }`}>
                    <div className="font-semibold">
                      {revenueChange >= 0 ? '+' : ''}{revenueChange.toFixed(1)}%
                    </div>
                    <div className="text-xs opacity-75">
                      {formatCurrency(store.current.revenue - store.previous.revenue)}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex items-center justify-center gap-6 text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border bg-green-500/20 border-green-500/30"></div>
          <span>Top Performer</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border bg-gray-500/10 border-gray-500/20"></div>
          <span>Average</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border bg-red-500/20 border-red-500/30"></div>
          <span>Underperformer</span>
        </div>
      </div>

      <div className="mt-2 text-center text-xs text-gray-500">
        Click on any store to view detailed drill-down analysis
      </div>
    </div>
  );
};
