import React, { useState, useMemo } from 'react';
import { StoreHeatmapCompact } from './StoreHeatmapCompact';
import { StoreDrilldownPanel } from './StoreDrilldownPanel';
import { CategoryPerformanceMatrix } from './CategoryPerformanceMatrix';
import { StoreWeeklyTrends } from './StoreWeeklyTrends';
import { TopMovers } from './TopMovers';
import { useStoreComparisonV2 } from '../../hooks/useStoreComparisonV2';
import { useDashboardStore } from '../../stores/dashboardStore';
import { format } from 'date-fns';

type StoreFilter = 'all' | 'top-3' | 'bottom-3' | 'custom';

export const StoreComparisonV2: React.FC = () => {
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('all');
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  const { stores, selectedStores, setStores, dateRanges } = useDashboardStore();

  const { currentStart, currentEnd, previousStart, previousEnd, dateRangeLabel } = useMemo(() => {
    const formatDate = (d: Date) => format(d, 'MMM d');
    const formatDateFull = (d: Date) => format(d, 'MMM d, yyyy');

    let dateRangeLabel = `${formatDate(dateRanges.current.start)} - ${formatDateFull(dateRanges.current.end)}`;

    if (dateRanges.comparison) {
      dateRangeLabel += ` vs ${formatDate(dateRanges.comparison.start)} - ${formatDateFull(dateRanges.comparison.end)}`;
    }

    return {
      currentStart: dateRanges.current.start,
      currentEnd: dateRanges.current.end,
      previousStart: dateRanges.comparison?.start || dateRanges.current.start,
      previousEnd: dateRanges.comparison?.end || dateRanges.current.end,
      dateRangeLabel,
    };
  }, [dateRanges]);

  const { data, isLoading, error } = useStoreComparisonV2(
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    selectedStores
  );

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
    link.download = `store-comparison-${new Date().toISOString().split('T')[0]}.csv`;
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

        {/* Export Button */}
        <div className="flex items-center gap-4">
          <div className="text-sm text-blue-400 font-medium hidden sm:block">
            Comparing: {dateRangeLabel}
          </div>
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
