import React, { useState, useEffect } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import {
  getCategoryMultipliers,
  bulkUpdateCategoryMultipliers,
  autoPopulateCategoryMultipliers,
} from '../../services/replenishmentApi';
import type { CategoryMultiplier } from '../../types/replenishment';

export const CategoryMultiplierConfig: React.FC = () => {
  const [categories, setCategories] = useState<CategoryMultiplier[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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
      setCategories(data);
      const initial: Record<string, string> = {};
      data.forEach(c => { initial[c.category] = String(c.multiplier); });
      setDrafts(initial);
    } catch {
      setError('Failed to load category multipliers.');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoPopulate = async () => {
    setPopulating(true);
    setError(null);
    try {
      const result = await autoPopulateCategoryMultipliers();
      await load();
      setSuccess(`Auto-populated. Total categories: ${result.total_categories}.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to auto-populate.');
    } finally {
      setPopulating(false);
    }
  };

  const isDirty = categories.some(c => {
    const draft = drafts[c.category];
    if (draft === undefined) return false;
    return parseFloat(draft) !== c.multiplier;
  });

  const handleSave = async () => {
    const items: { category: string; multiplier: number }[] = [];
    for (const cat of categories) {
      const val = parseFloat(drafts[cat.category] ?? '1');
      if (isNaN(val) || val <= 0) {
        setError(`Invalid multiplier for "${cat.category}". Must be a positive number.`);
        return;
      }
      items.push({ category: cat.category, multiplier: val });
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
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Category Multipliers</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Applied per product category during replenishment. 1.0 = no change. Changes take effect on the next run.
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
          <div className="px-5 py-3 border-b border-[#2e303d] grid grid-cols-[1fr_auto] gap-4">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Category</span>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider w-28 text-right">Multiplier</span>
          </div>
          <div className="divide-y divide-[#2e303d]">
            {categories.map(cat => {
              const draftVal = drafts[cat.category] ?? String(cat.multiplier);
              const numVal = parseFloat(draftVal);
              const changed = numVal !== cat.multiplier;
              const isAboveOne = numVal > 1.0;

              return (
                <div key={cat.category} className="px-5 py-2.5 grid grid-cols-[1fr_auto] gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-200">{cat.category}</span>
                    {changed && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400">modified</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.001"
                      step="0.01"
                      value={draftVal}
                      onChange={e => setDrafts(prev => ({ ...prev, [cat.category]: e.target.value }))}
                      className={`w-24 bg-[#0e1117] border text-sm rounded-lg px-3 py-1.5 focus:outline-none tabular-nums text-right ${
                        changed ? 'border-blue-500/50 focus:border-blue-400' : 'border-[#2e303d] focus:border-blue-500'
                      } ${isAboveOne ? 'text-green-400' : 'text-gray-200'}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-600">
        {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} configured.
        Use "Sync from Products" to add any newly created product categories.
      </p>
    </div>
  );
};

export default CategoryMultiplierConfig;
