import React, { useState, useEffect } from 'react';
import {
  runReplenishment,
  getLatestPlan,
  getExceptions,
  getDataReadiness,
} from '../../services/replenishmentApi';
import type {
  ReplenishmentRunResponse,
  ShipmentPlanResponse,
  ExceptionsResponse,
  DataReadiness,
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [readiness, plan, exc] = await Promise.all([
        getDataReadiness(),
        getLatestPlan(),
        getExceptions(),
      ]);
      setDataReadiness(readiness);
      setLatestPlan(plan);
      setExceptions(exc);
    } catch {
      // Data may not exist yet
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const result = await runReplenishment();
      setRunResult(result);
      await loadData();
      onRunComplete?.();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to run replenishment calculation');
    } finally {
      setIsRunning(false);
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
        <div className="flex items-center justify-between">
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
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isRunning ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Running...
              </span>
            ) : (
              'Run Weekly Replenishment'
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 bg-red-900/30 border border-red-600/50 rounded-lg p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {runResult && !error && (
          <div className="mt-4 bg-blue-900/20 border border-blue-600/30 rounded-lg p-3">
            <p className="text-blue-400 text-sm">
              Calculation complete: {runResult.total_items} items across {runResult.stores_processed} stores.
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
            highlight={exceptions && exceptions.total_exceptions > 0}
          />
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
