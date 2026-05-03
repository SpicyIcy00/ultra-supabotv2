import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import {
  getCategoryMultipliers,
  bulkUpdateCategoryMultipliers,
  autoPopulateCategoryMultipliers,
} from '../../services/replenishmentApi';
import type { CategoryMultiplier } from '../../types/replenishment';
import { useDashboardStore } from '../../stores/dashboardStore';

// draft key: `${category}||${store_id}`
type DraftMap = Record<string, string>;

export const CategoryMultiplierConfig: React.FC = () => {
  const getStoreName = useDashboardStore(s => s.getStoreName);
  const [rows, setRows] = useState<CategoryMultiplier[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getCategoryMultipliers();
      setRows(data);
      const initial: DraftMap = {};
      data.forEach(r => { initial[`${r.category}||${r.store_id}`] = String(r.multiplier); });
      setDrafts(initial);
    } catch {
      setError('Failed to load category multipliers.');
    } finally {
      setLoading(false);
    }
  };

  // Derive sorted unique categories and stores from data
  const categories = useMemo(() => [...new Set(rows.map(r => r.category))].sort(), [rows]);
  const storeIds = useMemo(() => [...new Set(rows.map(r => r.store_id))], [rows]);
  // Keep store order stable: sort by display name
  const sortedStores = useMemo(() =>
    [...storeIds].sort((a, b) => getStoreName(a).localeCompare(getStoreName(b))),
    [storeIds, getStoreName]
  );

  const isDirty = rows.some(r => {
    const key = `${r.category}||${r.store_id}`;
    return parseFloat(drafts[key] ?? '1') !== r.multiplier;
  });

  const handleAutoPopulate = async () => {
    setPopulating(true);
    setError(null);
    try {
      const result = await autoPopulateCategoryMultipliers();
      await load();
      setSuccess(`Synced. ${result.total_categories} category × store combinations.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to sync.');
    } finally {
      setPopulating(false);
    }
  };

  const handleSave = async () => {
    const items: { category: string; store_id: string; multiplier: number }[] = [];
    for (const r of rows) {
      const key = `${r.category}||${r.store_id}`;
      const val = parseFloat(drafts[key] ?? '1');
      if (isNaN(val) || val <= 0) {
        setError(`Invalid multiplier for "${r.category}" @ ${getStoreName(r.store_id)}. Must be a positive number.`);
        return;
      }
      items.push({ category: r.category, store_id: r.store_id, multiplier: val });
    }
    setSaving(true);
    setError(null);
    try {
      await bulkUpdateCategoryMultipliers(items);
      await load();
      setSuccess('Category multipliers saved.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to save.');
    } finally {
      setSaving(false);
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
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Category Multipliers</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Per-store multiplier applied to adjusted sales before computing order quantities.
            1.0 = no change. Takes effect on the next run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoPopulate}
            disabled={populating || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#2e303d] text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-50 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${populating ? 'animate-spin' : ''}`} />
            Sync from Products
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-[#2e303d] disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600/50 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-600/50 rounded-lg px-4 py-3">
          <p className="text-green-400 text-sm">{success}</p>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-8 text-center">
          <p className="text-gray-400 text-sm mb-3">No categories found.</p>
          <button
            onClick={handleAutoPopulate}
            disabled={populating}
            className="flex items-center gap-1.5 mx-auto px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${populating ? 'animate-spin' : ''}`} />
            Sync from Products
          </button>
        </div>
      ) : (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2e303d] bg-[#1a1c24]">
                  <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    Category
                  </th>
                  {sortedStores.map(sid => (
                    <th key={sid} className="px-3 py-3 text-right font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {getStoreName(sid)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2e303d]">
                {categories.map(cat => (
                  <tr key={cat} className="hover:bg-gray-700/10">
                    <td className="px-4 py-2.5 text-sm text-gray-200 whitespace-nowrap font-medium">
                      {cat}
                    </td>
                    {sortedStores.map(sid => {
                      const key = `${cat}||${sid}`;
                      const draftVal = drafts[key];
                      const original = rows.find(r => r.category === cat && r.store_id === sid)?.multiplier ?? 1;
                      const numVal = parseFloat(draftVal ?? '1');
                      const changed = draftVal !== undefined && numVal !== original;
                      const isAboveOne = numVal > 1.0;
                      // Cell is missing if this category×store combo doesn't exist yet
                      const exists = draftVal !== undefined;

                      return (
                        <td key={sid} className="px-3 py-2 text-right">
                          {exists ? (
                            <input
                              type="number"
                              min="0.001"
                              step="0.01"
                              value={draftVal}
                              onChange={e => setDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                              className={`w-20 bg-[#0e1117] border text-xs rounded-lg px-2 py-1.5 focus:outline-none tabular-nums text-right ${
                                changed ? 'border-blue-500/50 focus:border-blue-400' : 'border-[#2e303d] focus:border-blue-500'
                              } ${isAboveOne ? 'text-green-400' : 'text-gray-300'}`}
                            />
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-600">
        {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} × {sortedStores.length} store{sortedStores.length !== 1 ? 's' : ''}.
        Use "Sync from Products" to add newly created categories across all stores.
      </p>
    </div>
  );
};

export default CategoryMultiplierConfig;
