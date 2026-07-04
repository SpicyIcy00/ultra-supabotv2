import React, { useState, useEffect, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { SingleDatePicker } from '../filters/SingleDatePicker';
import { useDashboardStore } from '../../stores/dashboardStore';
import {
  runReplenishment,
  getLatestPlan,
  getExceptions,
  getDataReadiness,
  getStoreTiers,
  getAIReasoning,
  getCompare,
} from '../../services/replenishmentApi';
import { postReplenishmentToSheets, postReplenishmentBackupToSheets } from '../../services/reportApi';
import type {
  ReplenishmentRunResponse,
  ShipmentPlanResponse,
  ExceptionsResponse,
  DataReadiness,
  StoreTier,
  AIReasoningItem,
  CompareResponse,
} from '../../types/replenishment';

interface Props {
  onRunComplete?: () => void;
}

export const ReplenishmentDashboard: React.FC<Props> = ({ onRunComplete }) => {
  const getStoreNameByDbName = useDashboardStore((state) => state.getStoreNameByDbName);
  const getStoreName = useDashboardStore((state) => state.getStoreName);
  const fetchStores = useDashboardStore((state) => state.fetchStores);
  const dashboardStores = useDashboardStore((state) => state.stores);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<ReplenishmentRunResponse | null>(null);
  const [latestPlan, setLatestPlan] = useState<ShipmentPlanResponse | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionsResponse | null>(null);
  const [dataReadiness, setDataReadiness] = useState<DataReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tiers, setTiers] = useState<StoreTier[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [calcMode, setCalcMode] = useState<'snapshot' | 'fallback' | 'auto'>('snapshot');
  const [applyStockoutBuffer, setApplyStockoutBuffer] = useState(false);
  const [asOfEnabled, setAsOfEnabled] = useState(false);
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [postingToSheets, setPostingToSheets] = useState(false);
  const [sheetsSuccess, setSheetsSuccess] = useState<string | null>(null);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showZeroRequested, setShowZeroRequested] = useState(false);

  // Algorithm selector (affects Run button)
  const [algorithmType, setAlgorithmType] = useState<'legacy' | 'percentile'>('legacy');

  // Compare view
  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // AI Reasoning Mode
  const [dashMode, setDashMode] = useState<'standard' | 'ai-reasoning' | 'compare'>('standard');
  const [aiReasoning, setAiReasoning] = useState<Map<string, AIReasoningItem>>(new Map());
  const [aiReasoningLoading, setAiReasoningLoading] = useState(false);
  const [aiReasoningError, setAiReasoningError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Dashboard table column visibility
  type DashCol = 'total_sold' | 'dead_days' | 'avg_daily' | 'store_inv' | 'wh_inv' | 'min' | 'requested' | 'allocated' | 'days_stock' | 'vel' | 'cat' | 'eff';
  const [hiddenDashCols, setHiddenDashCols] = useState<Set<DashCol>>(new Set<DashCol>(['vel', 'cat']));
  const toggleDashCol = (col: DashCol) =>
    setHiddenDashCols(prev => { const n = new Set(prev); n.has(col) ? n.delete(col) : n.add(col); return n; });

  useEffect(() => {
    loadInitialData();
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    if (showDatePicker) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDatePicker]);

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
      setTiers(tiers);
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
    if (algorithmType === 'legacy' && !selectedStoreId) {
      setError('Please select a store before running.');
      return;
    }
    if (algorithmType === 'legacy' && asOfEnabled && !asOfDate) {
      setError('Please pick a date to run as of, or uncheck it.');
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const result = await runReplenishment(
        undefined,
        algorithmType === 'legacy' ? selectedStoreId : undefined,
        applyStockoutBuffer,
        asOfEnabled && asOfDate ? asOfDate : undefined,
        algorithmType === 'legacy' ? calcMode : undefined,
        algorithmType,
      );
      setRunResult(result);
      await loadPlanData();
      onRunComplete?.();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to run replenishment calculation');
    } finally {
      setIsRunning(false);
    }
  };

  const handleAIReasoning = async () => {
    if (!selectedStoreId) {
      setAiReasoningError('Select a store first.');
      return;
    }
    setAiReasoningLoading(true);
    setAiReasoningError(null);
    setExpandedRows(new Set());
    try {
      const result = await getAIReasoning(selectedStoreId);
      const map = new Map<string, AIReasoningItem>();
      for (const item of result.items) {
        map.set(`${item.store_id}-${item.sku_id}`, item);
      }
      setAiReasoning(map);
    } catch (err: any) {
      setAiReasoningError(err?.response?.data?.detail || 'AI Reasoning analysis failed');
    } finally {
      setAiReasoningLoading(false);
    }
  };

  const handleCompare = async () => {
    setCompareLoading(true);
    setCompareError(null);
    try {
      const result = await getCompare();
      setCompareData(result);
      setDashMode('compare');
    } catch (err: any) {
      setCompareError(err?.response?.data?.detail || 'Failed to load comparison data');
    } finally {
      setCompareLoading(false);
    }
  };

  const toggleExpanded = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const filteredAndSorted = (items: ShipmentPlanResponse['items']) => {
    let filtered = items;

    // Default: only items that need shipping. Checkbox: also show items with sales but 0 ordered.
    if (!showZeroRequested) {
      filtered = filtered.filter(item => item.requested_ship_qty > 0);
    } else {
      filtered = filtered.filter(item =>
        item.requested_ship_qty > 0 || (item.total_sold_qty ?? 0) > 0 || item.avg_daily_sales > 0
      );
    }

    // Search filter — works on already-loaded items, no API call needed
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(item =>
        (item.product_name ?? '').toLowerCase().includes(q)
      );
    }

    return [...filtered].sort((a, b) => {
      const catA = (a.category ?? '').toLowerCase();
      const catB = (b.category ?? '').toLowerCase();
      if (catA !== catB) return catA.localeCompare(catB);
      return b.requested_ship_qty - a.requested_ship_qty;
    });
  };

  const handleDownloadCsv = () => {
    if (!latestPlan || !latestPlan.items.length) return;

    const headers = [
      'Store', 'Product',
      'Category', 'Avg Daily Sales',
      'Safety Stock', 'Min Level',
      'Store Inv', 'Warehouse Inv', 'Requested Qty', 'Allocated Qty', 'Days of Stock',
      'Velocity ×', 'Category ×', 'Effective ×',
    ];

    const sorted = filteredAndSorted(latestPlan.items);
    const rows = sorted.map((item) => [
      item.store_name ? getStoreNameByDbName(item.store_name) : item.store_id,
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
      (item.velocity_multiplier ?? 1).toFixed(3),
      (item.category_multiplier ?? 1).toFixed(3),
      (item.effective_multiplier ?? 1).toFixed(3),
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
    const storeName = selectedStoreId ? getStoreName(selectedStoreId) : 'all';
    link.download = `replenishment_${storeName}_${latestPlan.run_date ?? 'latest'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePostToSheets = async () => {
    if (!latestPlan || !latestPlan.items.length) return;
    const visibleItems = filteredAndSorted(latestPlan.items);
    const storeName = selectedStoreId ? getStoreName(selectedStoreId) : 'Replenishment';
    setPostingToSheets(true);
    setSheetsSuccess(null);
    setSheetsError(null);
    try {
      const result = await postReplenishmentToSheets(visibleItems, storeName);
      setSheetsSuccess(result.message);
      setTimeout(() => setSheetsSuccess(null), 5000);
      // Fire backup with all fields — silent, non-blocking
      postReplenishmentBackupToSheets(latestPlan.items, storeName).catch(() => {});
    } catch (err: any) {
      setSheetsError(err.message || 'Failed to post to Google Sheets');
      setTimeout(() => setSheetsError(null), 8000);
    } finally {
      setPostingToSheets(false);
    }
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
      {/* Mode / Snapshot Quality Banner */}
      {dataReadiness && dataReadiness.calculation_mode === 'fallback' && (
        <div className="bg-gray-800/60 border border-gray-600/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-400 text-sm">
              Fallback mode — velocity = total units sold ÷ 28 days. Snapshot disabled in Configuration.
            </p>
          </div>
        </div>
      )}

      {dataReadiness && dataReadiness.snapshot_quality === 'building' && (
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-yellow-400 font-medium text-sm">
                Building snapshot history — {dataReadiness.snapshot_days_available}/28 days collected
              </p>
              <p className="text-yellow-500/80 text-xs mt-1">
                Velocity uses active days (stock &gt; 0 or sale occurred). Full coverage by {dataReadiness.full_accuracy_date}.
              </p>
            </div>
          </div>
        </div>
      )}

      {dataReadiness && dataReadiness.snapshot_quality === 'good' && (
        <div className="bg-green-900/30 border border-green-600/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-green-400 text-sm">
              {dataReadiness.snapshot_days_available} days of snapshot data — velocity = active days (stock &gt; 0 or sale occurred).
            </p>
          </div>
        </div>
      )}

      {/* Run Controls */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        {/* Mode toggle */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wider mr-1">View</span>
          <button
            onClick={() => setDashMode('standard')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dashMode === 'standard'
                ? 'bg-blue-600 text-white'
                : 'bg-[#0e1117] border border-[#2e303d] text-gray-400 hover:text-white'
            }`}
          >
            Standard
          </button>
          <button
            onClick={() => setDashMode('ai-reasoning')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dashMode === 'ai-reasoning'
                ? 'bg-violet-600 text-white'
                : 'bg-[#0e1117] border border-[#2e303d] text-gray-400 hover:text-white'
            }`}
          >
            ✦ AI Reasoning
          </button>
          <button
            onClick={handleCompare}
            disabled={compareLoading}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dashMode === 'compare'
                ? 'bg-emerald-600 text-white'
                : 'bg-[#0e1117] border border-[#2e303d] text-gray-400 hover:text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {compareLoading ? 'Loading…' : '⇆ Compare'}
          </button>
          {dashMode === 'ai-reasoning' && (
            <span className="text-xs text-violet-400 bg-violet-900/30 border border-violet-700/40 px-2 py-0.5 rounded">
              Read-only · Claude reasons from raw snapshots only
            </span>
          )}
          {compareError && (
            <span className="text-xs text-red-400">{compareError}</span>
          )}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Weekly Replenishment</h3>
            {latestPlan?.run_date && (
              <p className="text-sm text-gray-400 mt-1">
                Last run: {latestPlan.run_date}
                {dataReadiness && (
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded font-medium ${
                    dataReadiness.snapshot_quality === 'good'
                      ? 'bg-green-900/40 text-green-400 border border-green-700/50'
                      : 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/50'
                  }`}>
                    {dataReadiness.snapshot_days_available} snapshot days
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Stockout buffer toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyStockoutBuffer}
                onChange={(e) => setApplyStockoutBuffer(e.target.checked)}
                className="rounded border-[#2e303d] bg-[#0e1117] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
              Stockout buffer
              <span className="text-xs text-gray-500">(+20% Mon–Fri, +10% Sat–Sun)</span>
            </label>
            {/* Show products with sales but 0 ordered */}
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showZeroRequested}
                onChange={(e) => setShowZeroRequested(e.target.checked)}
                className="rounded border-[#2e303d] bg-[#0e1117] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
              Show sold (0 ordered)
            </label>
            {/* Custom sales window start date */}
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={asOfEnabled}
                onChange={(e) => {
                  setAsOfEnabled(e.target.checked);
                  if (!e.target.checked) setAsOfDate('');
                }}
                className="rounded border-[#2e303d] bg-[#0e1117] text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
              Run as of date
            </label>
            {asOfEnabled && (
              <div className="relative flex items-center gap-2" ref={datePickerRef}>
                <button
                  type="button"
                  onClick={() => setShowDatePicker((v) => !v)}
                  className="bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white hover:border-blue-500/50 transition-colors"
                >
                  {asOfDate
                    ? new Date(asOfDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Pick date'}
                </button>
                <span className="text-xs text-gray-500">sales: −28 days → this date</span>
                {showDatePicker && (
                  <div className="absolute top-full left-0 mt-2 z-50">
                    <SingleDatePicker
                      selected={pendingDate}
                      maxDate={new Date()}
                      onSelect={(d) => setPendingDate(d)}
                      onClear={() => {
                        setPendingDate(null);
                        setAsOfDate('');
                      }}
                      onCancel={() => setShowDatePicker(false)}
                      onApply={() => {
                        if (pendingDate) {
                          setAsOfDate(pendingDate.toISOString().split('T')[0]);
                        }
                        setShowDatePicker(false);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            {/* Algorithm selector */}
            <select
              value={algorithmType}
              onChange={e => setAlgorithmType(e.target.value as 'legacy' | 'percentile')}
              className="bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:border-blue-500 focus:outline-none"
            >
              <option value="legacy">Legacy</option>
              <option value="percentile">Percentile (v2)</option>
            </select>
            {/* Snapshot mode — right of checkboxes, left of store (hidden for percentile) */}
            {algorithmType === 'legacy' && (
              <select
                value={calcMode}
                onChange={e => setCalcMode(e.target.value as 'snapshot' | 'fallback' | 'auto')}
                className="bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:border-blue-500 focus:outline-none"
              >
                <option value="auto">Auto</option>
                <option value="snapshot">Snapshot</option>
                <option value="fallback">Fallback</option>
              </select>
            )}
            {/* Store Dropdown — hidden for percentile (all 7 stores run together) */}
            {algorithmType === 'legacy' && (
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select a store...</option>
                {dashboardStores
                  .filter((s) => tiers.some((t) => t.store_id === s.id))
                  .map((s) => {
                    const tier = tiers.find((t) => t.store_id === s.id)!;
                    return (
                      <option key={s.id} value={s.id}>
                        {getStoreName(s.id)} (Tier {tier.tier})
                      </option>
                    );
                  })}
              </select>
            )}
            {algorithmType === 'percentile' && (
              <span className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-700/40 px-2 py-1.5 rounded-lg">
                All 7 retail stores
              </span>
            )}
            <button
              onClick={handleRun}
              disabled={isRunning || (algorithmType === 'legacy' && (!selectedStoreId || (asOfEnabled && !asOfDate)))}
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
            {dashMode === 'ai-reasoning' && (
              <button
                onClick={handleAIReasoning}
                disabled={aiReasoningLoading || !selectedStoreId || !latestPlan?.run_date}
                className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 text-white font-medium rounded-lg hover:from-violet-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
              >
                {aiReasoningLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Analysing {aiReasoning.size > 0 ? `(${aiReasoning.size} done)` : '...'}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span>✦</span>
                    {aiReasoning.size > 0 ? 'Re-run AI Analysis' : 'Run AI Analysis'}
                  </span>
                )}
              </button>
            )}
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
        {aiReasoningError && (
          <div className="mt-4 bg-red-900/30 border border-red-600/50 rounded-lg p-3">
            <p className="text-red-400 text-sm">AI Reasoning: {aiReasoningError}</p>
          </div>
        )}
        {dashMode === 'ai-reasoning' && aiReasoning.size > 0 && !aiReasoningLoading && (
          <div className="mt-4 bg-violet-900/20 border border-violet-600/30 rounded-lg p-3">
            <p className="text-violet-300 text-sm">
              ✦ AI Reasoning complete — {aiReasoning.size} items analysed from raw snapshot data.
              This is a read-only comparison. No quantities have been applied.
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
          {/* Row 1: title + action buttons */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300">
              Shipment Plan
              <span className="ml-1.5 text-gray-500 font-normal">
                ({filteredAndSorted(latestPlan.items).length}
                {filteredAndSorted(latestPlan.items).length !== latestPlan.items.length && (
                  <span className="text-gray-600"> of {latestPlan.items.length}</span>
                )}
                {' '}items)
              </span>
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleDownloadCsv}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#0e1117] border border-[#2e303d] text-gray-300 text-xs rounded-lg hover:border-blue-500/50 hover:text-white transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download CSV
              </button>
              <button
                onClick={handlePostToSheets}
                disabled={postingToSheets}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-all"
              >
                {postingToSheets ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    Post to Sheets
                  </>
                )}
              </button>
            </div>
          </div>
          {/* Search bar */}
          <div className="relative mb-4 max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#0e1117] border border-[#2e303d] text-gray-300 text-xs rounded-lg focus:outline-none focus:border-blue-500/50 placeholder-gray-600"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          {sheetsSuccess && (
            <p className="text-xs text-green-400 mb-3">{sheetsSuccess}</p>
          )}
          {sheetsError && (
            <p className="text-xs text-red-400 mb-3">{sheetsError}</p>
          )}
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            {/* Shared eye icons */}
            {(() => {
              const EyeOpen = () => (
                <svg className="inline w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              );
              const EyeShut = () => (
                <svg className="inline w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              );
              const DashTh = ({ col, label, first }: { col: DashCol; label: string; first?: boolean }) => {
                const hidden = hiddenDashCols.has(col);
                return (
                  <th className={`py-2 font-medium whitespace-nowrap text-right ${first ? 'px-3' : hidden ? 'px-0.5' : 'px-3'}`}>
                    <span className="inline-flex items-center gap-1 justify-end">
                      {hidden
                        ? <span className="line-through text-gray-600 text-[10px]">{label}</span>
                        : <span className="text-gray-400">{label}</span>
                      }
                      <button onClick={() => toggleDashCol(col)} className={hidden ? 'text-gray-600 hover:text-gray-400' : 'text-gray-500 hover:text-gray-300'}>
                        {hidden ? <EyeShut /> : <EyeOpen />}
                      </button>
                    </span>
                  </th>
                );
              };
              const dc = (col: DashCol, content: React.ReactNode, className = '') =>
                hiddenDashCols.has(col)
                  ? <td className="p-0 w-0 max-w-0 overflow-hidden" />
                  : <td className={`py-2 px-3 text-right tabular-nums ${className}`}>{content}</td>;

              const sorted = filteredAndSorted(latestPlan.items);
              let lastCategory = '';
              const hasReasoning = dashMode === 'ai-reasoning' && aiReasoning.size > 0;
              const totalCols = 11 + (hasReasoning ? 2 : 0);

              return (
                <table className="w-full text-xs text-left">
                  <thead className="sticky top-0 z-10 bg-[#1c1e26]">
                    <tr className="border-b border-[#2e303d]">
                      <th className="py-2 pr-3 font-medium whitespace-nowrap text-gray-400">Product</th>
                      <DashTh col="total_sold" label="Total Sold" />
                      <DashTh col="dead_days"  label="Dead Days" />
                      <DashTh col="avg_daily"  label="Avg Daily" />
                      <DashTh col="store_inv"  label="Store Inv" />
                      <DashTh col="wh_inv"     label="WH Inv" />
                      <DashTh col="min"        label="Min" />
                      <DashTh col="requested"  label="Requested" />
                      <DashTh col="allocated"  label="Allocated" />
                      <DashTh col="days_stock" label="Days Stock" />
                      <DashTh col="vel"        label="Vel ×" />
                      <DashTh col="cat"        label="Cat ×" />
                      <DashTh col="eff"        label="Eff ×" />
                      {hasReasoning && <th className="py-2 px-3 font-medium whitespace-nowrap text-right text-violet-300 border-l border-violet-800/40">✦ AI Min</th>}
                      {hasReasoning && <th className="py-2 px-3 font-medium whitespace-nowrap text-right text-violet-300"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((item, idx) => {
                      const cat = item.category ?? '-';
                      const showCategoryHeader = cat !== lastCategory;
                      lastCategory = cat;
                      const isShort = item.allocated_ship_qty < item.requested_ship_qty;
                      const isOverstock = item.days_of_stock > 120;
                      const isNegative = item.on_hand < 0;
                      const rowKey = `${item.store_id}-${item.sku_id}`;
                      const reasoningItem = hasReasoning ? aiReasoning.get(rowKey) : undefined;
                      const isExpanded = expandedRows.has(rowKey);
                      const rowHighlight = isNegative ? 'bg-red-900/10' : isShort ? 'bg-yellow-900/10' : isOverstock ? 'bg-orange-900/10' : idx % 2 === 0 ? 'bg-[#0e1117]' : '';
                      return (
                        <React.Fragment key={`${item.store_id}-${item.sku_id}`}>
                          {showCategoryHeader && (
                            <tr className="border-b border-[#2e303d]">
                              <td colSpan={totalCols} className="py-2 pt-4 text-xs font-semibold text-blue-400 uppercase tracking-wider">{cat}</td>
                            </tr>
                          )}
                          <tr className={`border-b border-[#2e303d]/50 ${rowHighlight}`}>
                            <td className="py-2 pr-3 text-white whitespace-nowrap max-w-[200px] truncate">{item.product_name ?? item.sku_id}</td>
                            {dc('total_sold', (item.total_sold_qty ?? 0).toLocaleString(), 'text-blue-300')}
                            {dc('dead_days',  item.dead_days ?? 0, (item.dead_days ?? 0) > 7 ? 'text-red-400' : (item.dead_days ?? 0) > 0 ? 'text-yellow-400' : 'text-gray-500')}
                            {dc('avg_daily',  item.avg_daily_sales.toFixed(1), 'text-gray-300')}
                            {dc('store_inv',  item.on_hand, item.on_hand < 0 ? 'text-red-400' : 'text-gray-300')}
                            {dc('wh_inv',     item.wh_on_hand ?? 0, 'text-gray-300')}
                            {dc('min',        item.min_level.toFixed(0), 'text-gray-400')}
                            {dc('requested',  item.requested_ship_qty, 'text-gray-300')}
                            {dc('allocated',  item.allocated_ship_qty, isShort ? 'text-yellow-400 font-medium' : item.allocated_ship_qty > 0 ? 'text-green-400 font-medium' : 'text-gray-500')}
                            {dc('days_stock', item.days_of_stock.toFixed(1), item.days_of_stock > 120 ? 'text-orange-400' : item.days_of_stock < 3 ? 'text-red-400' : 'text-gray-300')}
                            {dc('vel',        `×${(item.velocity_multiplier ?? 1).toFixed(3)}`, (item.velocity_multiplier ?? 1) > 1 ? 'text-green-400' : 'text-gray-500')}
                            {dc('cat',        `×${(item.category_multiplier ?? 1).toFixed(3)}`, (item.category_multiplier ?? 1) > 1 ? 'text-green-400' : 'text-gray-500')}
                            {dc('eff',        `×${(item.effective_multiplier ?? 1).toFixed(3)}`, (item.effective_multiplier ?? 1) > 1 ? 'text-green-400 font-medium' : 'text-gray-500')}
                            {hasReasoning && (
                              <>
                                <td className="py-2 px-3 text-right tabular-nums border-l border-violet-800/40">
                                  {reasoningItem ? (
                                    <span className={`font-medium ${reasoningItem.error || reasoningItem.no_data ? 'text-gray-500' : 'text-violet-300'}`}>
                                      {reasoningItem.error || reasoningItem.no_data ? '—' : reasoningItem.recommended_min_qty}
                                    </span>
                                  ) : <span className="text-gray-600">—</span>}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {reasoningItem && !reasoningItem.error && !reasoningItem.no_data && (
                                    <button
                                      onClick={() => toggleExpanded(rowKey)}
                                      className="text-violet-400 hover:text-violet-200 transition-colors text-xs"
                                      title="Show Claude's reasoning"
                                    >
                                      {isExpanded ? '▼' : '▶'}
                                    </button>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                          {hasReasoning && isExpanded && reasoningItem && (
                            <tr className="bg-violet-950/30 border-b border-violet-800/30">
                              <td colSpan={totalCols} className="px-4 py-3">
                                <div className="flex gap-3 items-start">
                                  <span className="text-violet-400 text-xs font-semibold shrink-0 mt-0.5">✦ Claude</span>
                                  <div className="text-xs text-violet-200 leading-relaxed">
                                    {reasoningItem.true_velocity != null && (
                                      <span className="text-violet-400 mr-3">
                                        Velocity: {reasoningItem.true_velocity.toFixed(1)}/day
                                      </span>
                                    )}
                                    {reasoningItem.avg_restock_duration_days != null && (
                                      <span className="text-violet-400 mr-3">
                                        Avg restock lasts: {reasoningItem.avg_restock_duration_days.toFixed(1)} days
                                      </span>
                                    )}
                                    <p className="mt-1 text-gray-300">{reasoningItem.reasoning}</p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
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
                      {item.product_name} <span className="text-gray-500">@</span> {item.store_name ? getStoreNameByDbName(item.store_name) : item.store_id}
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

      {/* Compare Table: legacy vs percentile side by side */}
      {dashMode === 'compare' && compareData && compareData.items.length > 0 && (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-300">
                Algorithm Comparison
                <span className="ml-2 text-gray-500 font-normal">({compareData.items.length} items)</span>
              </h3>
              {compareData.run_date && (
                <p className="text-xs text-gray-500 mt-0.5">Run date: {compareData.run_date}</p>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>Legacy total: <strong className="text-white">{compareData.summary.total_legacy_units.toLocaleString()}</strong></span>
              <span>Percentile total: <strong className="text-emerald-400">{compareData.summary.total_percentile_units.toLocaleString()}</strong></span>
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 z-10 bg-[#1c1e26]">
                <tr className="border-b border-[#2e303d]">
                  <th className="py-2 pr-3 font-medium text-gray-400 whitespace-nowrap">Product</th>
                  <th className="py-2 px-3 font-medium text-gray-400 text-right whitespace-nowrap">On Hand</th>
                  <th className="py-2 px-3 font-medium text-blue-400 text-right whitespace-nowrap">Legacy Ship</th>
                  <th className="py-2 px-3 font-medium text-blue-400 text-right whitespace-nowrap">Legacy Target</th>
                  <th className="py-2 px-3 font-medium text-emerald-400 text-right whitespace-nowrap">Pct Ship</th>
                  <th className="py-2 px-3 font-medium text-emerald-400 text-right whitespace-nowrap">Pct Target</th>
                  <th className="py-2 px-3 font-medium text-gray-400 text-right whitespace-nowrap">Diff</th>
                  <th className="py-2 px-3 font-medium text-gray-400 text-right whitespace-nowrap">ABC</th>
                  <th className="py-2 px-3 font-medium text-gray-400 text-right whitespace-nowrap">Segment</th>
                  <th className="py-2 px-3 font-medium text-gray-400 text-right whitespace-nowrap">Flags</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let lastCat = '';
                  return compareData.items.map((item, idx) => {
                    const cat = (item.category ?? '').toLowerCase();
                    const isNewCat = cat !== lastCat;
                    if (isNewCat) lastCat = cat;
                    const diff = item.diff ?? null;
                    return (
                      <React.Fragment key={`${item.store_id}-${item.sku_id}`}>
                        {isNewCat && (
                          <tr>
                            <td colSpan={10} className="pt-4 pb-1 px-0">
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                                {item.category || 'Uncategorized'}
                              </span>
                            </td>
                          </tr>
                        )}
                        <tr className={`border-b border-[#2e303d]/40 hover:bg-white/[0.02] ${idx % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                          <td className="py-2 pr-3 text-gray-200">
                            <div>{item.product_name ?? item.sku_id}</div>
                            {item.store_name && (
                              <div className="text-[10px] text-gray-500">{item.store_name}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-400">{item.on_hand ?? '—'}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-blue-300">{item.legacy_ship_qty ?? '—'}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-500">{item.legacy_target?.toFixed(0) ?? '—'}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-emerald-300 font-medium">{item.percentile_ship_qty ?? '—'}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-500">{item.percentile_target?.toFixed(0) ?? '—'}</td>
                          <td className={`py-2 px-3 text-right tabular-nums font-medium ${
                            diff === null ? 'text-gray-600' :
                            diff > 0 ? 'text-emerald-400' :
                            diff < 0 ? 'text-red-400' : 'text-gray-500'
                          }`}>
                            {diff === null ? '—' : diff > 0 ? `+${diff}` : String(diff)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {item.abc_class && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                item.abc_class === 'A' ? 'bg-amber-900/50 text-amber-300' :
                                item.abc_class === 'B' ? 'bg-blue-900/50 text-blue-300' :
                                'bg-gray-700 text-gray-400'
                              }`}>{item.abc_class}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-500">{item.segment ?? '—'}</td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              {item.silent_stockout && (
                                <span title="Silent stockout" className="text-orange-400 text-[10px] bg-orange-900/30 px-1 rounded">OOS</span>
                              )}
                              {item.needs_count && (
                                <span title="Needs count" className="text-yellow-400 text-[10px] bg-yellow-900/30 px-1 rounded">CNT</span>
                              )}
                              {item.trusted_ledger === false && (
                                <span title="Untrusted ledger" className="text-gray-500 text-[10px] bg-gray-800 px-1 rounded">?</span>
                              )}
                            </div>
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
      {dashMode === 'compare' && compareData && compareData.items.length === 0 && (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-8 text-center">
          <p className="text-gray-400 text-sm">No comparison data found. Run both algorithms first.</p>
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
