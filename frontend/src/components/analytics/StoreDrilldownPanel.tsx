import React from 'react';
import { formatCurrency, formatNumber } from '../../utils/dateCalculations';
import { useStoreDrilldownV2 } from '../../hooks/useStoreComparisonV2';
import { useDashboardStore } from '../../stores/dashboardStore';

interface StoreDrilldownPanelProps {
  storeId: string;
  startDate: Date;
  endDate: Date;
  onClose: () => void;
}

export const StoreDrilldownPanel: React.FC<StoreDrilldownPanelProps> = ({
  storeId,
  startDate,
  endDate,
  onClose,
}) => {
  const { data, isLoading, error } = useStoreDrilldownV2(storeId, startDate, endDate);
  const storesList = useDashboardStore((state) => state.stores);

  const storeName = storesList.find(s => s.id === storeId)?.name || storeId;

  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Store Drill-Down: {storeName}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Store Drill-Down: {storeName}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="text-red-400">Error loading drill-down data</div>
      </div>
    );
  }

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Store Drill-Down: {storeName}</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Root Cause Breakdown - Variance Waterfall */}
      {data.revenue_gap_amount > 0 && (
        <div className="mb-6 bg-[#252833] rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4">Root Cause Breakdown: Revenue Gap Analysis</h3>
          <div className="space-y-4">
            {/* Transaction Count Impact */}
            <div className="bg-[#1c1e26] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300 font-medium">Transaction Count Impact</span>
                <span className={`font-semibold ${(data.transaction_count - data.best_performer_transaction_count) * data.best_performer_avg_ticket < 0
                    ? 'text-red-400'
                    : 'text-green-400'
                  }`}>
                  {((data.transaction_count - data.best_performer_transaction_count) * data.best_performer_avg_ticket) < 0 ? '' : '+'}
                  {formatCurrency((data.transaction_count - data.best_performer_transaction_count) * data.best_performer_avg_ticket)}
                </span>
              </div>
              <div className="text-xs text-gray-400 font-mono">
                = (Your Txns: {formatNumber(data.transaction_count)} - Best Txns: {formatNumber(data.best_performer_transaction_count)}) × Best Avg Ticket: {formatCurrency(data.best_performer_avg_ticket)}
              </div>
            </div>

            {/* Avg Ticket Impact */}
            <div className="bg-[#1c1e26] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300 font-medium">Avg Ticket Impact</span>
                <span className={`font-semibold ${(data.avg_ticket - data.best_performer_avg_ticket) * data.transaction_count < 0
                    ? 'text-red-400'
                    : 'text-green-400'
                  }`}>
                  {((data.avg_ticket - data.best_performer_avg_ticket) * data.transaction_count) < 0 ? '' : '+'}
                  {formatCurrency((data.avg_ticket - data.best_performer_avg_ticket) * data.transaction_count)}
                </span>
              </div>
              <div className="text-xs text-gray-400 font-mono">
                = (Your Avg: {formatCurrency(data.avg_ticket)} - Best Avg: {formatCurrency(data.best_performer_avg_ticket)}) × Your Txns: {formatNumber(data.transaction_count)}
              </div>
            </div>

            {/* Category Mix Impact (Residual) */}
            <div className="bg-[#1c1e26] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300 font-medium">Category Mix Impact (Residual)</span>
                <span className={`font-semibold ${data.revenue_gap_amount -
                    ((data.transaction_count - data.best_performer_transaction_count) * data.best_performer_avg_ticket +
                      (data.avg_ticket - data.best_performer_avg_ticket) * data.transaction_count) < 0
                    ? 'text-red-400'
                    : 'text-green-400'
                  }`}>
                  {(data.revenue_gap_amount -
                    ((data.transaction_count - data.best_performer_transaction_count) * data.best_performer_avg_ticket +
                      (data.avg_ticket - data.best_performer_avg_ticket) * data.transaction_count)) < 0 ? '' : '+'}
                  {formatCurrency(
                    data.revenue_gap_amount -
                    ((data.transaction_count - data.best_performer_transaction_count) * data.best_performer_avg_ticket +
                      (data.avg_ticket - data.best_performer_avg_ticket) * data.transaction_count)
                  )}
                </span>
              </div>
              <div className="text-xs text-gray-400 font-mono">
                = Total Gap - Txn Impact - Avg Ticket Impact
              </div>
            </div>

            {/* Total Gap Validation */}
            <div className="border-t border-[#2e303d] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold">Total Revenue Gap</span>
                <span className="text-red-400 font-bold">
                  -{formatCurrency(data.revenue_gap_amount)}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1 text-right">
                ({data.revenue_gap_pct.toFixed(1)}% below best performer)
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance vs Best */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">Performance vs Best Performer</h3>

          <div className="bg-[#252833] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Store Revenue</span>
              <span className="text-white font-semibold">{formatCurrency(data.revenue)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-400">Transaction Count</span>
              <span className="text-white font-semibold">{formatNumber(data.transaction_count)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-400">Avg Ticket Size</span>
              <span className="text-white font-semibold">{formatCurrency(data.avg_ticket)}</span>
            </div>

            <div className="border-t border-[#2e303d] pt-3 mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400">Revenue Gap (Amount)</span>
                <span className={`font-semibold ${data.revenue_gap_amount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {data.revenue_gap_amount > 0 ? '-' : '+'}{formatCurrency(Math.abs(data.revenue_gap_amount))}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">Revenue Gap (%)</span>
                <span className={`font-semibold ${data.revenue_gap_pct > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {data.revenue_gap_pct > 0 ? '-' : '+'}{Math.abs(data.revenue_gap_pct).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Visual Gap Indicator */}
            {data.revenue_gap_pct > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-400 mb-2">Gap to Best Performer</div>
                <div className="relative h-6 bg-[#1c1e26] rounded-full overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full bg-blue-500 flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${100 - data.revenue_gap_pct}%` }}
                  >
                    {(100 - data.revenue_gap_pct).toFixed(0)}%
                  </div>
                  <div
                    className="absolute right-0 top-0 h-full bg-red-500/30 flex items-center justify-center text-xs text-red-400 font-medium"
                    style={{ width: `${data.revenue_gap_pct}%` }}
                  >
                    {data.revenue_gap_pct.toFixed(0)}% gap
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Categories */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">Top 5 Categories vs Store Average</h3>

          {data.top_categories && data.top_categories.length > 0 ? (
            <div className="space-y-3">
              {data.top_categories.map((category, index) => (
                <div
                  key={index}
                  className="bg-[#252833] rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">{category.category}</span>
                    <span className={`text-sm font-semibold ${category.vs_avg_pct >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                      {category.vs_avg_pct >= 0 ? '+' : ''}{category.vs_avg_pct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400 text-xs">This Store</div>
                      <div className="text-white font-medium">{formatCurrency(category.revenue)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs">Store Average</div>
                      <div className="text-white font-medium">{formatCurrency(category.avg_revenue)}</div>
                    </div>
                  </div>

                  {/* Performance Bar */}
                  <div className="mt-3">
                    <div className="relative h-2 bg-[#1c1e26] rounded-full overflow-hidden">
                      <div
                        className={`absolute left-0 top-0 h-full rounded-full transition-all ${category.vs_avg_pct >= 0 ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        style={{
                          width: `${Math.min(100, Math.max(0, ((category.revenue / Math.max(category.revenue, category.avg_revenue)) * 100)))}%`
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#252833] rounded-lg p-4 text-center text-gray-400">
              No category data available
            </div>
          )}
        </div>
      </div>

      {/* Insights & Recommendations */}
      <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <h3 className="text-blue-400 font-medium mb-2 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Key Insights
        </h3>
        <div className="text-gray-300 text-sm space-y-1">
          {data.revenue_gap_pct > 10 && (
            <div>• Revenue is {data.revenue_gap_pct.toFixed(1)}% below the best performer. Focus on increasing transaction volume and average ticket size.</div>
          )}
          {data.top_categories && data.top_categories.filter(c => c.vs_avg_pct < -15).length > 0 && (
            <div>• Some categories are significantly underperforming vs store average. Consider inventory optimization or promotional strategies.</div>
          )}
          {data.top_categories && data.top_categories.filter(c => c.vs_avg_pct > 15).length > 0 && (
            <div>• Strong performance in {data.top_categories.filter(c => c.vs_avg_pct > 15).map(c => c.category).join(', ')}. Consider expanding these product lines.</div>
          )}
        </div>
      </div>
    </div>
  );
};
