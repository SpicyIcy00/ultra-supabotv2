import React, { useState, useEffect } from 'react';
import {
  runReplenishment,
  getLatestPlan,
  getExceptions,
  getDataReadiness,
  getStoreTiers,
} from '../../services/replenishmentApi';
import type {
  ReplenishmentRunResponse,
  ShipmentPlanResponse,
  ExceptionsResponse,
  DataReadiness,
  StoreTier,
} from '../../types/replenishment';

interface Props {
  onRunComplete?: () => void;
}

export const ReplenishmentDashboard: React.FC<Props> = ({ onRunComplete }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<ReplenishmentRunResponse | null>(null);
  const [latestPlan, setLatestPlan] = useState<ShipmentPlanResponse | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionsResponse | null>(null);
  const [dataReadiness, setDataReadiness] = useState<DataReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [stores, setStores] = useState<StoreTier[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [hideZeroSales, setHideZeroSales] = useState(false);
  const [showIds, setShowIds] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [readiness, plan, exc, tiers] = await Promise.all([
        getDataReadiness(),
        getLatestPlan(),
        getExceptions(),
        getStoreTiers(),
      ]);
      setDataReadiness(readiness);
      setLatestPlan(plan);
      setExceptions(exc);
      setStores(tiers);
    } catch {
      // Data may not exist yet
    } finally {
      setLoading(false);
    }
  };

  const loadPlanData = async () => {
    try {
      const storeFilter = selectedStoreId ? [selectedStoreId] : undefined;
      const [plan, exc] = await Promise.all([
        getLatestPlan(storeFilter),
        getExceptions(),
      ]);
      setLatestPlan(plan);
      setExceptions(exc);
    } catch {
      // ignore
    }
  };

  const handleRun = async () => {
    if (!selectedStoreId) {
      setError('Please select a store before running.');
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const result = await runReplenishment(undefined, selectedStoreId);
      setRunResult(result);
      await loadPlanData();
      onRunComplete?.();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to run replenishment calculation');
    } finally {
      setIsRunning(false);
    }
  };

  const filteredAndSorted = (items: ShipmentPlanResponse['items']) => {
    let filtered = items;
    if (hideZeroSales) {
      filtered = filtered.filter((i) => i.avg_daily_sales > 0);
    }
    return [...filtered].sort((a, b) => {
      const catA = (a.category ?? '').toLowerCase();
      const catB = (b.category ?? '').toLowerCase();
      if (catA !== catB) return catA.localeCompare(catB);
      return b.allocated_ship_qty - a.allocated_ship_qty;
    });
  };

  const handleDownloadCsv = () => {
    if (!latestPlan || !latestPlan.items.length) return;

    const headers = [
      'Store',
      ...(showIds ? ['Product ID', 'SKU'] : []),
      'Product', 'Category', 'Avg Daily Sales',
      'Safety Stock', 'Min Level',
      'Store Inv', 'Warehouse Inv', 'Requested Qty', 'Allocated Qty', 'Days of Stock',
    ];

    const sorted = filteredAndSorted(latestPlan.items);
    const rows = sorted.map((item) => [
      item.store_name ?? item.store_id,
      ...(showIds ? [item.sku_id, item.product_sku ?? ''] : []),
      item.product_name ?? item.sku_id,
      item.category ?? '',
      item.avg_daily_sales.toFixed(2),
      item.safety_stock.toFixed(2),
      item.min_level.toFixed(2),
      item.on_hand,
      item.wh_on_hand ?? 0,
      item.requested_ship_qty,
      item.allocated_ship_qty,
      item.days_of_stock.toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((r) =>
        r.map((v) => {
          const s = String(v);
          return s.includes(',') ? `"${s}"` : s;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const storeName = stores.find((s) => s.store_id === selectedStoreId)?.store_name ?? 'all';
    link.download = `replenishment_${storeName}_${latestPlan.run_date ?? 'latest'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Data Readiness Banner */}
      {dataReadiness && dataReadiness.calculation_mode === 'fallback' && (
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-yellow-400 font-medium text-sm">Using Simplified Calculation</p>
              <p className="text-yellow-500/80 text-xs mt-1">
                Snapshot history: {dataReadiness.snapshot_days_available}/28 days.
                Full accuracy available on {dataReadiness.full_accuracy_date}.
                Current calculations use transaction-based fallback (may under-forecast for stockout-prone items).
              </p>
            </div>
          </div>
        </div>
      )}

      {dataReadiness && dataReadiness.calculation_mode === 'snapshot' && (
        <div className="bg-green-900/30 border border-green-600/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-green-400 text-sm">Full accuracy mode active. Using 28+ days of inventory snapshot data.</p>
          </div>
        </div>
      )}

      {/* Run Controls */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Weekly Replenishment</h3>
            {latestPlan?.run_date && (
              <p className="text-sm text-gray-400 mt-1">
                Last run: {latestPlan.run_date}
                {latestPlan.calculation_mode && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                    {latestPlan.calculation_mode} mode
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Store Dropdown */}
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select a store...</option>
              {stores.map((s) => (
                <option key={s.store_id} value={s.store_id}>
                  {s.store_name ?? s.store_id} (Tier {s.tier})
                </option>
              ))}
            </select>
            <button
              onClick={handleRun}
              disabled={isRunning || !selectedStoreId}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
            >
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Running...
                </span>
              ) : (
                'Run Replenishment'
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-900/30 border border-red-600/50 rounded-lg p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {runResult && !error && (
          <div className="mt-4 bg-blue-900/20 border border-blue-600/30 rounded-lg p-3">
            <p className="text-blue-400 text-sm">
              Calculation complete: {runResult.total_items} items across {runResult.stores_processed} store(s).
              {runResult.exceptions_count > 0 && (
                <span className="text-yellow-400 ml-1">
                  {runResult.exceptions_count} exceptions flagged.
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {latestPlan && latestPlan.run_date && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Total SKUs"
            value={latestPlan.summary.total_skus}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            }
          />
          <SummaryCard
            label="Units to Ship"
            value={latestPlan.summary.total_allocated_units.toLocaleString()}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
              </svg>
            }
          />
          <SummaryCard
            label="Stores Affected"
            value={latestPlan.summary.total_stores}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
              </svg>
            }
          />
          <SummaryCard
            label="Exceptions"
            value={exceptions?.total_exceptions ?? 0}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            }
            highlight={!!(exceptions && exceptions.total_exceptions > 0)}
          />
        </div>
      )}

      {/* Shipment Plan Table */}
      {latestPlan && latestPlan.items.length > 0 && (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-300">
              Shipment Plan ({latestPlan.items.length} items)
            </h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideZeroSales}
                  onChange={(e) => setHideZeroSales(e.target.checked)}
                  className="rounded border-[#2e303d] bg-[#0e1117] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                />
                Hide 0 daily sales
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showIds}
                  onChange={(e) => setShowIds(e.target.checked)}
                  className="rounded border-[#2e303d] bg-[#0e1117] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                />
                Show IDs
              </label>
            </div>
            <button
              onClick={handleDownloadCsv}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#0e1117] border border-[#2e303d] text-gray-300 text-xs rounded-lg hover:border-blue-500/50 hover:text-white transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#2e303d] text-gray-400">
                  {showIds && <th className="py-2 pr-3 font-medium whitespace-nowrap">Product ID</th>}
                  {showIds && <th className="py-2 px-3 font-medium whitespace-nowrap">SKU</th>}
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">Product</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap text-right">Avg Daily</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap text-right">Store Inv</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap text-right">Warehouse Inv</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap text-right">Min</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap text-right">Requested</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap text-right">Allocated</th>
                  <th className="py-2 pl-3 font-medium whitespace-nowrap text-right">Days of Stock</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sorted = filteredAndSorted(latestPlan.items);
                  let lastCategory = '';
                  return sorted.map((item, idx) => {
                    const cat = item.category ?? '-';
                    const showCategoryHeader = cat !== lastCategory;
                    lastCategory = cat;
                    const isShort = item.allocated_ship_qty < item.requested_ship_qty;
                    const isOverstock = item.days_of_stock > 120;
                    const isNegative = item.on_hand < 0;
                    const rowHighlight = isNegative
                      ? 'bg-red-900/10'
                      : isShort
                      ? 'bg-yellow-900/10'
                      : isOverstock
                      ? 'bg-orange-900/10'
                      : idx % 2 === 0
                      ? 'bg-[#0e1117]'
                      : '';
                    return (
                      <React.Fragment key={`${item.store_id}-${item.sku_id}`}>
                        {showCategoryHeader && (
                          <tr className="border-b border-[#2e303d]">
                            <td colSpan={showIds ? 10 : 8} className="py-2 pt-4 text-xs font-semibold text-blue-400 uppercase tracking-wider">
                              {cat}
                            </td>
                          </tr>
                        )}
                        <tr className={`border-b border-[#2e303d]/50 ${rowHighlight}`}>
                          {showIds && (
                            <td className="py-2 pr-3 text-gray-500 whitespace-nowrap text-[10px] font-mono max-w-[120px] truncate">
                              {item.sku_id}
                            </td>
                          )}
                          {showIds && (
                            <td className="py-2 px-3 text-gray-500 whitespace-nowrap text-[10px] font-mono max-w-[100px] truncate">
                              {item.product_sku ?? ''}
                            </td>
                          )}
                          <td className="py-2 pr-3 text-white whitespace-nowrap max-w-[200px] truncate">
                            {item.product_name ?? item.sku_id}
                          </td>
                          <td className="py-2 px-3 text-gray-300 text-right tabular-nums">{item.avg_daily_sales.toFixed(1)}</td>
                          <td className={`py-2 px-3 text-right tabular-nums ${item.on_hand < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                            {item.on_hand}
                          </td>
                          <td className="py-2 px-3 text-gray-300 text-right tabular-nums">
                            {item.wh_on_hand ?? 0}
                          </td>
                          <td className="py-2 px-3 text-gray-400 text-right tabular-nums">{item.min_level.toFixed(0)}</td>
                          <td className="py-2 px-3 text-gray-300 text-right tabular-nums">{item.requested_ship_qty}</td>
                          <td className={`py-2 px-3 text-right tabular-nums font-medium ${
                            isShort ? 'text-yellow-400' : item.allocated_ship_qty > 0 ? 'text-green-400' : 'text-gray-500'
                          }`}>
                            {item.allocated_ship_qty}
                          </td>
                          <td className={`py-2 pl-3 text-right tabular-nums ${
                            item.days_of_stock > 120 ? 'text-orange-400' : item.days_of_stock < 3 ? 'text-red-400' : 'text-gray-300'
                          }`}>
                            {item.days_of_stock.toFixed(1)}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Exception Alerts */}
      {exceptions && exceptions.items.length > 0 && (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Exception Alerts</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {exceptions.items.slice(0, 20).map((item, idx) => (
              <div
                key={`${item.store_id}-${item.sku_id}-${idx}`}
                className="flex items-center justify-between bg-[#0e1117] rounded-lg px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <ExceptionBadge type={item.exception_type} />
                  <div>
                    <p className="text-sm text-white">
                      {item.product_name} <span className="text-gray-500">@</span> {item.store_name}
                    </p>
                    <p className="text-xs text-gray-400">{item.detail}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-500">
                  Priority: {item.priority_score.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Helper Components ---

const SummaryCard: React.FC<{
  label: string;
  value: number | string;
  icon: React.ReactNode;
  highlight?: boolean;
}> = ({ label, value, icon, highlight }) => (
  <div className={`bg-[#1c1e26] border rounded-lg p-5 ${
    highlight ? 'border-yellow-600/50' : 'border-[#2e303d]'
  }`}>
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${highlight ? 'bg-yellow-900/30 text-yellow-400' : 'bg-blue-900/30 text-blue-400'}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  </div>
);

const ExceptionBadge: React.FC<{ type: string }> = ({ type }) => {
  const config: Record<string, { label: string; color: string }> = {
    warehouse_shortage: { label: 'Shortage', color: 'bg-red-900/50 text-red-400' },
    negative_stock: { label: 'Negative', color: 'bg-red-900/50 text-red-400' },
    overstock: { label: 'Overstock', color: 'bg-yellow-900/50 text-yellow-400' },
    critical_stock: { label: 'Critical', color: 'bg-orange-900/50 text-orange-400' },
    low_data: { label: 'Low Data', color: 'bg-gray-700 text-gray-300' },
  };
  const c = config[type] || { label: type, color: 'bg-gray-700 text-gray-300' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${c.color}`}>{c.label}</span>
  );
};

export default ReplenishmentDashboard;
