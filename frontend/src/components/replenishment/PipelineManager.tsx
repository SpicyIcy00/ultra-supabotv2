import React, { useState, useEffect } from 'react';
import { getPipeline, updatePipeline } from '../../services/replenishmentApi';
import { fetchStores } from '../../services/reportApi';
import type { PipelineItem } from '../../types/replenishment';

export const PipelineManager: React.FC = () => {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pipelineData, storesData] = await Promise.all([
        getPipeline(),
        fetchStores(),
      ]);
      setItems(pipelineData);
      setStores(storesData.map(s => ({ id: s.id, name: s.name })));
      setEdits({});
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const handleChange = (storeId: string, skuId: string, value: number) => {
    const key = `${storeId}:${skuId}`;
    setEdits(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const updates = Object.entries(edits).map(([key, on_order_units]) => {
      const [store_id, sku_id] = key.split(':');
      return { store_id, sku_id, on_order_units };
    });
    if (updates.length === 0) return;

    setSaving(true);
    try {
      await updatePipeline(updates);
      await loadData();
    } catch { /* error */ } finally { setSaving(false); }
  };

  const filtered = items.filter(i => !selectedStore || i.store_id === selectedStore);
  const hasEdits = Object.keys(edits).length > 0;

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Pipeline (On-Order)</h3>
        <div className="flex gap-2">
          <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}
            className="bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-1.5 text-sm text-white">
            <option value="">All Stores</option>
            {stores.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
          {hasEdits && (
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : `Save (${Object.keys(edits).length})`}
            </button>
          )}
        </div>
      </div>

      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2e303d]">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Store</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Product</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">On Order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2e303d]">
            {filtered.map(item => {
              const key = `${item.store_id}:${item.sku_id}`;
              return (
                <tr key={key} className="hover:bg-gray-700/20">
                  <td className="px-4 py-3 text-sm text-white">{item.store_name || item.store_id}</td>
                  <td className="px-4 py-3 text-sm text-white">
                    <div>{item.product_name || item.sku_id}</div>
                    <div className="text-xs text-gray-500">{item.sku_id}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input type="number" min={0}
                      value={edits[key] ?? item.on_order_units}
                      onChange={e => handleChange(item.store_id, item.sku_id, parseInt(e.target.value) || 0)}
                      className={`w-24 text-right bg-[#0e1117] border rounded px-2 py-1 text-sm text-white ${
                        edits[key] !== undefined ? 'border-blue-500' : 'border-[#2e303d]'
                      }`} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500 text-sm">No pipeline data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PipelineManager;
