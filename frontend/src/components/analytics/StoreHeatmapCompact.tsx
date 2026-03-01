import React, { useMemo } from 'react';
import { formatCurrency, formatNumber } from '../../utils/dateCalculations';

interface StoreData {
  store_id: string;
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

interface StoreHeatmapCompactProps {
  stores: StoreData[];
  onStoreClick: (storeId: string) => void;
}

export const StoreHeatmapCompact: React.FC<StoreHeatmapCompactProps> = ({ stores, onStoreClick }) => {
  // Calculate percentiles for color coding
  const getPercentileRank = (value: number, values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const index = sorted.findIndex(v => v >= value);
    return (index / sorted.length) * 100;
  };

  // Get color based on change percentage
  const getChangeColor = (change: number): string => {
    if (change > 5) return 'text-green-400';
    if (change < -5) return 'text-red-400';
    return 'text-gray-400';
  };

  // Get background color based on percentile
  const getBgColor = (percentile: number, change: number): string => {
    if (change < -10) {
      return 'bg-red-500/15 border-red-500/30';
    }
    if (percentile >= 80) {
      return 'bg-green-500/15 border-green-500/30';
    } else if (percentile <= 20) {
      return 'bg-red-500/10 border-red-500/20';
    } else {
      return 'bg-gray-500/5 border-gray-500/15';
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
            <th className="text-left py-2 px-3 text-gray-300 font-medium text-sm sticky left-0 bg-[#1c1e26] z-10">
              Store
            </th>
            <th className="text-right py-2 px-3 text-gray-300 font-medium text-sm">
              Revenue
            </th>
            <th className="text-right py-2 px-3 text-gray-300 font-medium text-sm">
              Transactions
            </th>
            <th className="text-right py-2 px-3 text-gray-300 font-medium text-sm">
              Avg Ticket
            </th>
            <th className="text-right py-2 px-3 text-gray-300 font-medium text-sm">
              Margin %
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
                key={store.store_id || store.store_name}
                className="border-b border-[#2e303d] hover:bg-[#252833] transition-colors cursor-pointer"
                onClick={() => onStoreClick(store.store_id || store.store_name)}
              >
                <td className="py-2 px-3 text-white font-medium text-sm sticky left-0 bg-[#1c1e26] group-hover:bg-[#252833]">
                  {store.store_name}
                </td>
                <td className="py-2 px-3 text-right">
                  <div className={`inline-flex flex-col items-end px-2 py-1.5 rounded border ${getBgColor(revenuePercentile, revenueChange)}`}>
                    <div className="font-semibold text-white text-sm">{formatCurrency(store.current.revenue)}</div>
                    <div className={`text-xs font-medium ${getChangeColor(revenueChange)}`}>
                      {revenueChange >= 0 ? '+' : ''}{revenueChange.toFixed(1)}%
                    </div>
                  </div>
                </td>
                <td className="py-2 px-3 text-right">
                  <div className={`inline-flex flex-col items-end px-2 py-1.5 rounded border ${getBgColor(transactionPercentile, transactionChange)}`}>
                    <div className="font-semibold text-white text-sm">{formatNumber(store.current.transaction_count)}</div>
                    <div className={`text-xs font-medium ${getChangeColor(transactionChange)}`}>
                      {transactionChange >= 0 ? '+' : ''}{transactionChange.toFixed(1)}%
                    </div>
                  </div>
                </td>
                <td className="py-2 px-3 text-right">
                  <div className={`inline-flex flex-col items-end px-2 py-1.5 rounded border ${getBgColor(avgTicketPercentile, avgTicketChange)}`}>
                    <div className="font-semibold text-white text-sm">{formatCurrency(store.current.avg_ticket)}</div>
                    <div className={`text-xs font-medium ${getChangeColor(avgTicketChange)}`}>
                      {avgTicketChange >= 0 ? '+' : ''}{avgTicketChange.toFixed(1)}%
                    </div>
                  </div>
                </td>
                <td className="py-2 px-3 text-right">
                  <div className={`inline-flex flex-col items-end px-2 py-1.5 rounded border ${getBgColor(marginPercentile, marginChange)}`}>
                    <div className="font-semibold text-white text-sm">{store.current.margin_pct.toFixed(1)}%</div>
                    <div className={`text-xs font-medium ${getChangeColor(marginChange)}`}>
                      {marginChange >= 0 ? '+' : ''}{marginChange.toFixed(1)}pp
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded border bg-green-500/15 border-green-500/30"></div>
          <span>Top</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded border bg-gray-500/5 border-gray-500/15"></div>
          <span>Average</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded border bg-red-500/10 border-red-500/20"></div>
          <span>Below Average</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-400">+%</span>
          <span>Growth</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-red-400">-%</span>
          <span>Decline</span>
        </div>
      </div>

      <div className="mt-2 text-center text-xs text-gray-500">
        Click any store for detailed breakdown
      </div>
    </div>
  );
};
