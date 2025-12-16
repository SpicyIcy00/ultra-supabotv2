import React, { useState, useMemo } from 'react';
import { StoreHeatmapCompact } from './StoreHeatmapCompact';
import { StoreDrilldownPanel } from './StoreDrilldownPanel';
import { CategoryPerformanceMatrix } from './CategoryPerformanceMatrix';
import { StoreWeeklyTrends } from './StoreWeeklyTrends';
import { TopMovers } from './TopMovers';
import { useStoreComparisonV2 } from '../../hooks/useStoreComparisonV2';
import { useDashboardStore } from '../../stores/dashboardStore';

type TimePeriod = 'wtd' | 'mtd' | 'ytd';
type StoreFilter = 'all' | 'top-3' | 'bottom-3' | 'custom';

export const StoreComparisonV2: React.FC = () => {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('mtd');
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('all');
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  const { stores, selectedStores, setStores } = useDashboardStore();

  const { data, isLoading, error } = useStoreComparisonV2(timePeriod, selectedStores);

  // Calculate date ranges based on selected period
  const { currentStart, currentEnd, previousStart, previousEnd, dateRangeLabel } = useMemo(() => {
    const now = new Date();
    let currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date;
    let dateRangeLabel: string;

    switch (timePeriod) {
      case 'wtd': {
        // Week-to-Date
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

        currentStart = new Date(now);
        currentStart.setDate(now.getDate() - diffToMonday);
        currentStart.setHours(0, 0, 0, 0);

        currentEnd = new Date(now);
        currentEnd.setHours(23, 59, 59, 999);

        // Previous week
        previousStart = new Date(currentStart);
        previousStart.setDate(currentStart.getDate() - 7);

        previousEnd = new Date(currentEnd);
        previousEnd.setDate(currentEnd.getDate() - 7);

        const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
        dateRangeLabel = `${formatDate(currentStart)}-${formatDate(currentEnd)} vs ${formatDate(previousStart)}-${formatDate(previousEnd)}`;
        break;
      }
      case 'mtd': {
        // Month-to-Date
        const dayOfMonth = now.getDate();

        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentStart.setHours(0, 0, 0, 0);

        currentEnd = new Date(now);
        currentEnd.setHours(23, 59, 59, 999);

        // Previous month
        const prevMonth = now.getMonth() - 1;
        const prevYear = prevMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const actualPrevMonth = prevMonth < 0 ? 11 : prevMonth;

        previousStart = new Date(prevYear, actualPrevMonth, 1);
        previousStart.setHours(0, 0, 0, 0);

        previousEnd = new Date(prevYear, actualPrevMonth, Math.min(dayOfMonth, new Date(prevYear, actualPrevMonth + 1, 0).getDate()));
        previousEnd.setHours(23, 59, 59, 999);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        dateRangeLabel = `${monthNames[now.getMonth()]} 1-${dayOfMonth} vs ${monthNames[actualPrevMonth]} 1-${previousEnd.getDate()}`;
        break;
      }
      case 'ytd': {
        // Year-to-Date
        currentStart = new Date(now.getFullYear(), 0, 1);
        currentStart.setHours(0, 0, 0, 0);

        currentEnd = new Date(now);
        currentEnd.setHours(23, 59, 59, 999);

        // Previous year
        const dayOfYear = Math.floor((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        previousStart = new Date(now.getFullYear() - 1, 0, 1);
        previousStart.setHours(0, 0, 0, 0);

        previousEnd = new Date(previousStart);
        previousEnd.setDate(previousStart.getDate() + dayOfYear - 1);
        previousEnd.setHours(23, 59, 59, 999);

        dateRangeLabel = `YTD ${now.getFullYear()} (${dayOfYear} days) vs YTD ${now.getFullYear() - 1} (${dayOfYear} days)`;
        break;
      }
    }

    return { currentStart, currentEnd, previousStart, previousEnd, dateRangeLabel };
  }, [timePeriod]);

  // Handle store filter changes
  const handleStoreFilterChange = (filter: StoreFilter) => {
    setStoreFilter(filter);

    if (filter === 'all') {
      setStores(stores.map(s => s.id));
    } else if (filter === 'top-3' && data?.stores) {
      // Top 3 by revenue
      const sorted = [...data.stores].sort((a, b) => b.current.revenue - a.current.revenue);
      setStores(sorted.slice(0, 3).map(s => s.store_id || ''));
    } else if (filter === 'bottom-3' && data?.stores) {
      // Bottom 3 by revenue
      const sorted = [...data.stores].sort((a, b) => a.current.revenue - b.current.revenue);
      setStores(sorted.slice(0, 3).map(s => s.store_id || ''));
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!data?.stores) return;

    const headers = ['Store', 'Revenue', 'Transactions', 'Avg Ticket', 'Margin %', 'vs Previous Period'];
    const rows = data.stores.map(store => {
      const revenueChange = store.previous.revenue > 0
        ? ((store.current.revenue - store.previous.revenue) / store.previous.revenue * 100).toFixed(2)
        : 'N/A';

      return [
        store.store_name,
        store.current.revenue.toFixed(2),
        store.current.transaction_count.toString(),
        store.current.avg_ticket.toFixed(2),
        store.current.margin_pct.toFixed(2),
        `${revenueChange}%`
      ];
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `store-comparison-${timePeriod}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && stores.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
        Error loading store comparison data: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex items-center gap-4">
            {/* Time Period Selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Time Period:</label>
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
                className="bg-[#252833] border border-[#2e303d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="wtd">Week-to-Date</option>
                <option value="mtd">Month-to-Date</option>
                <option value="ytd">Year-to-Date</option>
              </select>
            </div>

            {/* Store Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Show:</label>
              <select
                value={storeFilter}
                onChange={(e) => handleStoreFilterChange(e.target.value as StoreFilter)}
                className="bg-[#252833] border border-[#2e303d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Stores</option>
                <option value="top-3">Top 3 Performers</option>
                <option value="bottom-3">Bottom 3 Performers</option>
                <option value="custom">Custom Selection</option>
              </select>
            </div>
          </div>

          {/* Date Range Label */}
          <div className="text-sm text-blue-400 font-medium">
            Comparing: {dateRangeLabel}
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Custom Store Selection */}
      {storeFilter === 'custom' && (
        <div className="bg-[#252833] border border-[#2e303d] rounded-lg p-4">
          <div className="flex flex-wrap gap-2">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => {
                  const newSelection = selectedStores.includes(store.id)
                    ? selectedStores.filter(id => id !== store.id)
                    : [...selectedStores, store.id];
                  setStores(newSelection);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedStores.includes(store.id)
                  ? 'bg-blue-500 text-white'
                  : 'bg-[#1c1e26] text-gray-400 hover:text-white'
                  }`}
              >
                {store.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 1. OVERVIEW HEATMAP */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Store Performance Heatmap</h2>
        <StoreHeatmapCompact
          stores={data?.stores || []}
          onStoreClick={(storeId) => setSelectedStore(storeId)}
        />
      </div>

      {/* 2. DRILL-DOWN ANALYSIS */}
      {selectedStore && (
        <StoreDrilldownPanel
          storeId={selectedStore}
          startDate={currentStart}
          endDate={currentEnd}
          onClose={() => setSelectedStore(null)}
        />
      )}

      {/* 3. TOP MOVERS */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Top Movers: Products & Categories</h2>
        <TopMovers
          startDate={currentStart}
          endDate={currentEnd}
          compareStartDate={previousStart}
          compareEndDate={previousEnd}
          storeIds={selectedStores}
        />
      </div>

      {/* 4. CATEGORY PERFORMANCE MATRIX */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Category Performance Matrix</h2>
        <CategoryPerformanceMatrix
          startDate={currentStart}
          endDate={currentEnd}
          storeIds={selectedStores}
        />
      </div>

      {/* 5. TIME TREND COMPARISON */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">8-Week Sales Trends</h2>
        <StoreWeeklyTrends storeIds={selectedStores} />
      </div>
    </div>
  );
};
