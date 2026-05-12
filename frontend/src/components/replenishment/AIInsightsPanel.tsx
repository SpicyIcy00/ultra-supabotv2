import React, { useState } from 'react';
import { Sparkles, Loader2, RefreshCw, AlertTriangle, TrendingUp, FileText } from 'lucide-react';
import { getAIInsights } from '../../services/replenishmentApi';
import { getStoreTiers } from '../../services/replenishmentApi';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { AIInsights, ExceptionAnalysis, DemandInsight } from '../../types/replenishment';

export const AIInsightsPanel: React.FC = () => {
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [tiers, setTiers] = useState<{ store_id: string; tier: string }[]>([]);
  const [tiersLoaded, setTiersLoaded] = useState(false);

  const dashboardStores = useDashboardStore((state) => state.stores);
  const getStoreName = useDashboardStore((state) => state.getStoreName);
  const fetchStores = useDashboardStore((state) => state.fetchStores);

  React.useEffect(() => {
    fetchStores();
    getStoreTiers()
      .then((t) => { setTiers(t); setTiersLoaded(true); })
      .catch(() => setTiersLoaded(true));
  }, [fetchStores]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const storeFilter = selectedStoreId ? [selectedStoreId] : undefined;
      const result = await getAIInsights(storeFilter);
      setInsights(result);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to generate AI insights');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-semibold text-white">AI Replenishment Insights</h3>
            </div>
            <p className="text-sm text-gray-400">
              Claude analyzes your latest replenishment run to generate an executive summary,
              explain exceptions, and surface demand pattern insights.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {tiersLoaded && (
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:border-purple-500 focus:outline-none"
              >
                <option value="">All stores</option>
                {dashboardStores
                  .filter((s) => tiers.some((t) => t.store_id === s.id))
                  .map((s) => {
                    const tier = tiers.find((t) => t.store_id === s.id);
                    return (
                      <option key={s.id} value={s.id}>
                        {getStoreName(s.id)} (Tier {tier?.tier})
                      </option>
                    );
                  })}
              </select>
            )}
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : insights ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Re-analyze
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Insights
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-900/30 border border-red-600/50 rounded-lg p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>

      {loading && (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Claude is analyzing your inventory data...</p>
          <p className="text-gray-600 text-xs mt-1">This usually takes 5–10 seconds</p>
        </div>
      )}

      {!loading && insights && (
        <>
          {/* Executive Narrative */}
          <NarrativeSection narrative={insights.narrative} runDate={insights.run_date} />

          {/* Exception Analyses */}
          {insights.exception_analyses.length > 0 && (
            <ExceptionSection items={insights.exception_analyses} />
          )}

          {/* Demand Insights */}
          {insights.demand_insights.length > 0 && (
            <DemandInsightsSection items={insights.demand_insights} />
          )}
        </>
      )}
    </div>
  );
};

// --- Sub-sections ---

const NarrativeSection: React.FC<{ narrative: string; runDate: string | null }> = ({ narrative, runDate }) => (
  <div className="bg-[#1c1e26] border border-purple-600/30 rounded-lg p-6">
    <div className="flex items-center gap-2 mb-4">
      <FileText className="w-4 h-4 text-purple-400" />
      <h3 className="text-sm font-semibold text-gray-300">Executive Summary</h3>
      {runDate && <span className="ml-auto text-xs text-gray-500">Based on run: {runDate}</span>}
    </div>
    <div className="prose prose-sm max-w-none">
      {narrative.split('\n').filter(Boolean).map((para, i) => (
        <p key={i} className="text-gray-300 text-sm leading-relaxed mb-3 last:mb-0">
          {para}
        </p>
      ))}
    </div>
  </div>
);

const ExceptionSection: React.FC<{ items: ExceptionAnalysis[] }> = ({ items }) => {
  const getStoreNameByDbName = useDashboardStore((state) => state.getStoreNameByDbName);

  const typeColors: Record<string, string> = {
    warehouse_shortage: 'border-l-red-500',
    negative_stock: 'border-l-red-500',
    overstock: 'border-l-yellow-500',
    critical_stock: 'border-l-orange-500',
    low_data: 'border-l-gray-500',
  };

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-yellow-400" />
        <h3 className="text-sm font-semibold text-gray-300">Exception Analysis ({items.length})</h3>
      </div>
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div
            key={`${item.store_id}-${item.sku_id}-${idx}`}
            className={`bg-[#0e1117] border border-[#2e303d] border-l-4 ${typeColors[item.exception_type] || 'border-l-gray-500'} rounded-lg p-4`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">
                  {item.product_name}{' '}
                  <span className="text-gray-500">@</span>{' '}
                  {item.store_name ? getStoreNameByDbName(item.store_name) : item.store_id}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{item.detail}</p>

                {item.ai_root_cause && (
                  <div className="mt-3 space-y-1.5">
                    <div>
                      <span className="text-xs font-medium text-gray-400">Root cause: </span>
                      <span className="text-xs text-gray-300">{item.ai_root_cause}</span>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-purple-400">Action: </span>
                      <span className="text-xs text-purple-300">{item.ai_recommended_action}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <ExceptionTypeBadge type={item.exception_type} />
                <p className="text-xs text-gray-500 mt-1">
                  {item.days_of_stock.toFixed(1)} days stock
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DemandInsightsSection: React.FC<{ items: DemandInsight[] }> = ({ items }) => (
  <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
    <div className="flex items-center gap-2 mb-4">
      <TrendingUp className="w-4 h-4 text-blue-400" />
      <h3 className="text-sm font-semibold text-gray-300">Demand Pattern Insights</h3>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((insight, idx) => (
        <div key={idx} className="bg-[#0e1117] border border-[#2e303d] rounded-lg p-4">
          <p className="text-sm font-medium text-blue-300 mb-2">{insight.title}</p>
          <p className="text-xs text-gray-400 mb-3 leading-relaxed">{insight.observation}</p>
          <div className="flex items-start gap-1.5">
            <span className="text-xs font-medium text-green-400 shrink-0">Recommend:</span>
            <span className="text-xs text-green-300">{insight.action}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ExceptionTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const config: Record<string, { label: string; color: string }> = {
    warehouse_shortage: { label: 'Shortage', color: 'bg-red-900/50 text-red-400' },
    negative_stock: { label: 'Negative', color: 'bg-red-900/50 text-red-400' },
    overstock: { label: 'Overstock', color: 'bg-yellow-900/50 text-yellow-400' },
    critical_stock: { label: 'Critical', color: 'bg-orange-900/50 text-orange-400' },
    low_data: { label: 'Low Data', color: 'bg-gray-700 text-gray-300' },
  };
  const c = config[type] || { label: type, color: 'bg-gray-700 text-gray-300' };
  return <span className={`text-xs px-2 py-0.5 rounded ${c.color}`}>{c.label}</span>;
};

export default AIInsightsPanel;
