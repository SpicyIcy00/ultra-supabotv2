import React, { useState, useEffect } from 'react';
import { getSeasonality, createSeasonality, updateSeasonality, deleteSeasonality } from '../../services/replenishmentApi';
import type { SeasonalityPeriod } from '../../types/replenishment';

export const SeasonalityCalendar: React.FC = () => {
  const [periods, setPeriods] = useState<SeasonalityPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState({
    start_date: '',
    end_date: '',
    multiplier: 1.0,
    label: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getSeasonality();
      setPeriods(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const handleEdit = (p: SeasonalityPeriod) => {
    setEditingId(p.id);
    setForm({
      start_date: p.start_date,
      end_date: p.end_date,
      multiplier: p.multiplier,
      label: p.label,
    });
  };

  const handleAdd = () => {
    setEditingId('new');
    setForm({ start_date: '', end_date: '', multiplier: 1.0, label: '' });
  };

  const handleSave = async () => {
    if (!form.label || !form.start_date || !form.end_date) return;
    setSaving(true);
    try {
      if (editingId === 'new') {
        await createSeasonality(form);
      } else if (typeof editingId === 'number') {
        await updateSeasonality(editingId, form);
      }
      await loadData();
      setEditingId(null);
    } catch { /* error */ } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this seasonality period?')) return;
    try {
      await deleteSeasonality(id);
      await loadData();
    } catch { /* error */ }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Seasonality Calendar</h3>
        <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          Add Period
        </button>
      </div>

      {editingId !== null && (
        <div className="bg-[#1c1e26] border border-blue-600/30 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Label</label>
              <input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. CNY Ramp"
                className="w-full bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Multiplier</label>
              <input type="number" step="0.1" min="0" max="10" value={form.multiplier}
                onChange={e => setForm(f => ({ ...f, multiplier: parseFloat(e.target.value) || 1.0 }))}
                className="w-full bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">End Date</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-gray-700 text-white text-sm rounded-lg">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.label}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2e303d]">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Label</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Start</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">End</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Multiplier</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2e303d]">
            {periods.map(p => (
              <tr key={p.id} className="hover:bg-gray-700/20">
                <td className="px-4 py-3 text-sm text-white">{p.label}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{p.start_date}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{p.end_date}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <span className={`font-medium ${p.multiplier > 1 ? 'text-green-400' : p.multiplier < 1 ? 'text-red-400' : 'text-gray-300'}`}>
                    {p.multiplier.toFixed(2)}x
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleEdit(p)} className="text-xs text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                </td>
              </tr>
            ))}
            {periods.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">No seasonality periods configured</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SeasonalityCalendar;
