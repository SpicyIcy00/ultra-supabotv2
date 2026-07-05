import React, { useState, useEffect } from 'react';
import { getPercentileStoreConfig, upsertPercentileStoreConfig } from '../../services/replenishmentApi';
import type { PercentileStoreConfig } from '../../types/replenishment';
import { useDashboardStore } from '../../stores/dashboardStore';

type Draft = {
  review_days: number;
  lead_days: number;
  quantile_a: number;
  quantile_b: number;
  quantile_c: number;
};

// Validation bounds (mirror the backend schema).
const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
const validate = (d: Draft): string | null => {
  if (!inRange(d.review_days, 1, 14)) return 'Review days must be 1–14.';
  if (!inRange(d.lead_days, 0, 7)) return 'Lead days must be 0–7.';
  for (const q of [d.quantile_a, d.quantile_b, d.quantile_c]) {
    if (!inRange(q, 0.80, 0.99)) return 'Quantiles must be between 0.80 and 0.99.';
  }
  return null;
};

export const PercentileStoreConfigTable: React.FC = () => {
  const getStoreNameByDbName = useDashboardStore((state) => state.getStoreNameByDbName);
  const [rows, setRows] = useState<PercentileStoreConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      setRows(await getPercentileStoreConfig());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (r: PercentileStoreConfig) => {
    setError(null);
    setEditingId(r.store_id);
    setDraft({
      review_days: r.review_days,
      lead_days: r.lead_days,
      quantile_a: r.quantile_a,
      quantile_b: r.quantile_b,
      quantile_c: r.quantile_c,
    });
  };

  const cancel = () => { setEditingId(null); setDraft(null); setError(null); };

  const save = async (storeId: string) => {
    if (!draft) return;
    const err = validate(draft);
    if (err) { setError(err); return; }
    setSaving(true);
    setError(null);
    try {
      await upsertPercentileStoreConfig({ store_id: storeId, ...draft });
      await loadData();
      cancel();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const numInput = (value: number, onChange: (v: number) => void, step: number, min: number, max: number) => (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="w-20 bg-[#0e1117] border border-[#2e303d] rounded px-2 py-1 text-sm text-white text-right focus:border-blue-500 focus:outline-none"
    />
  );

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-300">Percentile (v2) Store Config</h3>
        <p className="text-xs text-gray-500 mt-1">
          Per-store tuning for the percentile algorithm only — independent of legacy Store Tiers.
          Protection window = review + lead days. Changes take effect on the next run.
        </p>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2e303d]">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Store</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Review Days</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Lead Days</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-emerald-400" title="Rolling window = review + lead">Protection Days</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400" title="Service quantile for A-class">Quantile A</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400" title="Service quantile for B-class">Quantile B</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400" title="Service quantile for C-class">Quantile C</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2e303d]">
            {rows.map(r => {
              const isEditing = editingId === r.store_id;
              const protDays = isEditing && draft
                ? (draft.review_days || 0) + (draft.lead_days || 0)
                : r.protection_days;
              return (
                <tr key={r.store_id} className="hover:bg-gray-700/20">
                  <td className="px-4 py-3 text-sm text-white">
                    {r.store_name ? getStoreNameByDbName(r.store_name) : r.store_id}
                  </td>
                  {isEditing && draft ? (
                    <>
                      <td className="px-4 py-3 text-right">{numInput(draft.review_days, v => setDraft(d => d && ({ ...d, review_days: v })), 1, 1, 14)}</td>
                      <td className="px-4 py-3 text-right">{numInput(draft.lead_days, v => setDraft(d => d && ({ ...d, lead_days: v })), 1, 0, 7)}</td>
                      <td className="px-4 py-3 text-right text-sm text-emerald-400 font-medium tabular-nums">{protDays}d</td>
                      <td className="px-4 py-3 text-right">{numInput(draft.quantile_a, v => setDraft(d => d && ({ ...d, quantile_a: v })), 0.01, 0.80, 0.99)}</td>
                      <td className="px-4 py-3 text-right">{numInput(draft.quantile_b, v => setDraft(d => d && ({ ...d, quantile_b: v })), 0.01, 0.80, 0.99)}</td>
                      <td className="px-4 py-3 text-right">{numInput(draft.quantile_c, v => setDraft(d => d && ({ ...d, quantile_c: v })), 0.01, 0.80, 0.99)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => save(r.store_id)} disabled={saving}
                          className="text-xs text-emerald-400 hover:text-emerald-300 mr-3 disabled:opacity-50">
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={cancel} className="text-xs text-gray-400 hover:text-gray-200">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm text-right text-gray-300 tabular-nums">{r.review_days}d</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-300 tabular-nums">{r.lead_days}d</td>
                      <td className="px-4 py-3 text-sm text-right text-emerald-400 font-medium tabular-nums">{r.protection_days}d</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-300 tabular-nums">{r.quantile_a.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-300 tabular-nums">{r.quantile_b.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-300 tabular-nums">{r.quantile_c.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => startEdit(r)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500 text-sm">No percentile store config found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PercentileStoreConfigTable;
