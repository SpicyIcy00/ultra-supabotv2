import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, X, Pencil } from 'lucide-react';
import {
  getVelocityRules,
  createVelocityRule,
  updateVelocityRule,
  deleteVelocityRule,
} from '../../services/replenishmentApi';
import type { VelocityMultiplierRule } from '../../types/replenishment';

interface EditingRule {
  id?: number;
  threshold: string;
  multiplier: string;
  label: string;
}

export const VelocityMultiplierConfig: React.FC = () => {
  const [rules, setRules] = useState<VelocityMultiplierRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [editDraft, setEditDraft] = useState<EditingRule>({ threshold: '', multiplier: '', label: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      setRules(await getVelocityRules());
    } catch {
      setError('Failed to load velocity rules.');
    } finally {
      setLoading(false);
    }
  };

  const startNew = () => {
    setEditingId('new');
    setEditDraft({ threshold: '0', multiplier: '1.0', label: '' });
    setError(null);
  };

  const startEdit = (rule: VelocityMultiplierRule) => {
    setEditingId(rule.id);
    setEditDraft({
      id: rule.id,
      threshold: String(rule.threshold),
      multiplier: String(rule.multiplier),
      label: rule.label,
    });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const handleSave = async () => {
    const threshold = parseFloat(editDraft.threshold);
    const multiplier = parseFloat(editDraft.multiplier);
    if (isNaN(threshold) || threshold < 0) { setError('Threshold must be a non-negative number.'); return; }
    if (isNaN(multiplier) || multiplier <= 0) { setError('Multiplier must be a positive number.'); return; }
    if (!editDraft.label.trim()) { setError('Label is required.'); return; }

    setSaving(true);
    setError(null);
    try {
      if (editingId === 'new') {
        await createVelocityRule({ threshold, multiplier, label: editDraft.label.trim() });
      } else {
        await updateVelocityRule(editingId as number, { threshold, multiplier, label: editDraft.label.trim() });
      }
      setEditingId(null);
      await load();
      setSuccess('Saved successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    try {
      await deleteVelocityRule(id);
      await load();
      setSuccess('Rule deleted.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to delete.');
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
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Velocity Multiplier Rules</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Applied after avg daily sales is computed. The rule with the highest threshold the product meets is used.
            Formula: <span className="text-gray-300 font-mono">AdjSales = AvgDailySales × Seasonality × VelocityMultiplier × CategoryMultiplier</span>
          </p>
        </div>
        <button
          onClick={startNew}
          disabled={editingId !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-[#2e303d] disabled:text-gray-500 text-white rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Rule
        </button>
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

      <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg px-4 py-3">
        <p className="text-xs text-amber-300/80">
          Rules are checked from the highest threshold down. The first rule whose threshold is ≤ the product's avg daily sales wins.
          Always keep a rule at threshold <strong>0</strong> as the catch-all default.
        </p>
      </div>

      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2e303d] grid grid-cols-[1fr_1fr_2fr_auto] gap-4">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Min Avg Daily Sales</span>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Multiplier</span>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Label</span>
          <span className="w-16" />
        </div>

        {/* New row editor */}
        {editingId === 'new' && (
          <div className="px-5 py-3 border-b border-blue-500/30 bg-blue-900/10 grid grid-cols-[1fr_1fr_2fr_auto] gap-4 items-center">
            <input
              type="number" min="0" step="0.01"
              value={editDraft.threshold}
              onChange={e => setEditDraft(p => ({ ...p, threshold: e.target.value }))}
              className="bg-[#0e1117] border border-blue-500/50 text-white text-sm rounded-lg px-3 py-1.5 focus:border-blue-400 focus:outline-none"
              placeholder="0"
            />
            <input
              type="number" min="0.001" step="0.01"
              value={editDraft.multiplier}
              onChange={e => setEditDraft(p => ({ ...p, multiplier: e.target.value }))}
              className="bg-[#0e1117] border border-blue-500/50 text-white text-sm rounded-lg px-3 py-1.5 focus:border-blue-400 focus:outline-none"
              placeholder="1.0"
            />
            <input
              type="text"
              value={editDraft.label}
              onChange={e => setEditDraft(p => ({ ...p, label: e.target.value }))}
              className="bg-[#0e1117] border border-blue-500/50 text-white text-sm rounded-lg px-3 py-1.5 focus:border-blue-400 focus:outline-none"
              placeholder="e.g. Fast Mover"
            />
            <div className="flex items-center gap-1">
              <button onClick={handleSave} disabled={saving}
                className="p-1.5 text-green-400 hover:text-green-300 transition-colors" title="Save">
                <Save className="w-4 h-4" />
              </button>
              <button onClick={cancelEdit}
                className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors" title="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 && editingId !== 'new' && (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">
            No rules configured. Add a rule to enable velocity-based multipliers.
          </div>
        )}

        <div className="divide-y divide-[#2e303d]">
          {rules.map(rule => (
            <div key={rule.id} className="px-5 py-3 grid grid-cols-[1fr_1fr_2fr_auto] gap-4 items-center">
              {editingId === rule.id ? (
                <>
                  <input
                    type="number" min="0" step="0.01"
                    value={editDraft.threshold}
                    onChange={e => setEditDraft(p => ({ ...p, threshold: e.target.value }))}
                    className="bg-[#0e1117] border border-blue-500/50 text-white text-sm rounded-lg px-3 py-1.5 focus:border-blue-400 focus:outline-none"
                  />
                  <input
                    type="number" min="0.001" step="0.01"
                    value={editDraft.multiplier}
                    onChange={e => setEditDraft(p => ({ ...p, multiplier: e.target.value }))}
                    className="bg-[#0e1117] border border-blue-500/50 text-white text-sm rounded-lg px-3 py-1.5 focus:border-blue-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={editDraft.label}
                    onChange={e => setEditDraft(p => ({ ...p, label: e.target.value }))}
                    className="bg-[#0e1117] border border-blue-500/50 text-white text-sm rounded-lg px-3 py-1.5 focus:border-blue-400 focus:outline-none"
                  />
                  <div className="flex items-center gap-1">
                    <button onClick={handleSave} disabled={saving}
                      className="p-1.5 text-green-400 hover:text-green-300 transition-colors" title="Save">
                      <Save className="w-4 h-4" />
                    </button>
                    <button onClick={cancelEdit}
                      className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors" title="Cancel">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm text-gray-200 tabular-nums">≥ {rule.threshold.toFixed(1)}</span>
                  <span className={`text-sm font-medium tabular-nums ${rule.multiplier > 1 ? 'text-green-400' : 'text-gray-300'}`}>
                    ×{rule.multiplier.toFixed(3)}
                  </span>
                  <span className="text-sm text-gray-400">{rule.label}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(rule)} disabled={editingId !== null}
                      className="p-1.5 text-gray-500 hover:text-blue-400 disabled:opacity-30 transition-colors" title="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(rule.id)} disabled={editingId !== null}
                      className="p-1.5 text-gray-500 hover:text-red-400 disabled:opacity-30 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VelocityMultiplierConfig;
