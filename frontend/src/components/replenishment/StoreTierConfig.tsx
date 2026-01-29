import React, { useState, useEffect } from 'react';
import { getStoreTiers, upsertStoreTier, deleteStoreTier } from '../../services/replenishmentApi';
import { fetchStores } from '../../services/reportApi';
import type { StoreTier } from '../../types/replenishment';

export const StoreTierConfig: React.FC = () => {
  const [tiers, setTiers] = useState<StoreTier[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    store_id: '',
    tier: 'B' as 'A' | 'B',
    safety_days: 3,
    target_cover_days: 7,
    expiry_window_days: 60,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tiersData, storesData] = await Promise.all([
        getStoreTiers(),
        fetchStores(),
      ]);
      setTiers(tiersData);
      setStores(storesData.map(s => ({ id: s.id, name: s.name })));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (tier: StoreTier) => {
    setEditingId(tier.store_id);
    setForm({
      store_id: tier.store_id,
      tier: tier.tier,
      safety_days: tier.safety_days,
      target_cover_days: tier.target_cover_days,
      expiry_window_days: tier.expiry_window_days,
    });
  };

  const handleAdd = () => {
    setEditingId('new');
    setForm({
      store_id: '',
      tier: 'B',
      safety_days: 3,
      target_cover_days: 7,
      expiry_window_days: 60,
    });
  };

  const handleSave = async () => {
    if (!form.store_id) return;
    setSaving(true);
    try {
      await upsertStoreTier(form);
      await loadData();
      setEditingId(null);
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (storeId: string) => {
    if (!confirm('Delete this store tier configuration?')) return;
    try {
      await deleteStoreTier(storeId);
      await loadData();
    } catch {
      // error
    }
  };

  const handleTierPreset = (tier: 'A' | 'B') => {
    if (tier === 'A') {
      setForm(f => ({ ...f, tier: 'A', safety_days: 4, target_cover_days: 10, expiry_window_days: 90 }));
    } else {
      setForm(f => ({ ...f, tier: 'B', safety_days: 3, target_cover_days: 7, expiry_window_days: 60 }));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Store Tiers</h3>
        <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          Add Store Tier
        </button>
      </div>

      {/* Edit Form */}
      {editingId && (
        <div className="bg-[#1c1e26] border border-blue-600/30 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Store</label>
              <select
                value={form.store_id}
                onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}
                disabled={editingId !== 'new'}
                className="w-full bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                <option value="">Select store...</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tier</label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleTierPreset('A')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.tier === 'A' ? 'bg-blue-600 text-white' : 'bg-[#0e1117] border border-[#2e303d] text-gray-400'
                  }`}
                >
                  Tier A (Flagship)
                </button>
                <button
                  onClick={() => handleTierPreset('B')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.tier === 'B' ? 'bg-blue-600 text-white' : 'bg-[#0e1117] border border-[#2e303d] text-gray-400'
                  }`}
                >
                  Tier B (Standard)
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Safety Days</label>
              <input type="number" min={1} value={form.safety_days}
                onChange={e => setForm(f => ({ ...f, safety_days: parseInt(e.target.value) || 1 }))}
                className="w-full bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Target Cover Days</label>
              <input type="number" min={1} value={form.target_cover_days}
                onChange={e => setForm(f => ({ ...f, target_cover_days: parseInt(e.target.value) || 1 }))}
                className="w-full bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Expiry Window Days</label>
              <input type="number" min={1} value={form.expiry_window_days}
                onChange={e => setForm(f => ({ ...f, expiry_window_days: parseInt(e.target.value) || 1 }))}
                className="w-full bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-gray-700 text-white text-sm rounded-lg">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !form.store_id}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Tier List */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2e303d]">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Store</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Tier</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Safety Days</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Cover Days</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Expiry Window</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2e303d]">
            {tiers.map(tier => (
              <tr key={tier.store_id} className="hover:bg-gray-700/20">
                <td className="px-4 py-3 text-sm text-white">{tier.store_name || tier.store_id}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    tier.tier === 'A' ? 'bg-blue-900/50 text-blue-400' : 'bg-gray-700 text-gray-300'
                  }`}>
                    Tier {tier.tier}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-300">{tier.safety_days}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-300">{tier.target_cover_days}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-300">{tier.expiry_window_days}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleEdit(tier)} className="text-xs text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                  <button onClick={() => handleDelete(tier.store_id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                </td>
              </tr>
            ))}
            {tiers.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">No store tiers configured</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StoreTierConfig;
