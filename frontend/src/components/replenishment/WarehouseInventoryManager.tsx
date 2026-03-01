import React, { useState, useEffect } from 'react';
import { getWarehouseInventory, updateWarehouseInventory } from '../../services/replenishmentApi';
import type { WarehouseInventoryItem } from '../../types/replenishment';

export const WarehouseInventoryManager: React.FC = () => {
  const [items, setItems] = useState<WarehouseInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getWarehouseInventory();
      setItems(data);
      setEdits({});
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const handleChange = (skuId: string, value: number) => {
    setEdits(prev => ({ ...prev, [skuId]: value }));
  };

  const handleSave = async () => {
    const updates = Object.entries(edits).map(([sku_id, wh_on_hand_units]) => ({
      sku_id,
      wh_on_hand_units,
    }));
    if (updates.length === 0) return;

    setSaving(true);
    try {
      await updateWarehouseInventory(updates);
      await loadData();
    } catch { /* error */ } finally { setSaving(false); }
  };

  const filtered = items.filter(i =>
    !search || i.product_name?.toLowerCase().includes(search.toLowerCase()) || i.sku_id.toLowerCase().includes(search.toLowerCase())
  );

  const hasEdits = Object.keys(edits).length > 0;

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Warehouse Inventory</h3>
        <div className="flex gap-2">
          <input
            type="text" placeholder="Search..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 w-48" />
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Category</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">On Hand (WH)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2e303d]">
            {filtered.map(item => (
              <tr key={item.sku_id} className="hover:bg-gray-700/20">
                <td className="px-4 py-3 text-sm text-white">
                  <div>{item.product_name || item.sku_id}</div>
                  <div className="text-xs text-gray-500">{item.sku_id}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{item.category || '-'}</td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="number" min={0}
                    value={edits[item.sku_id] ?? item.wh_on_hand_units}
                    onChange={e => handleChange(item.sku_id, parseInt(e.target.value) || 0)}
                    className={`w-24 text-right bg-[#0e1117] border rounded px-2 py-1 text-sm text-white ${
                      edits[item.sku_id] !== undefined ? 'border-blue-500' : 'border-[#2e303d]'
                    }`} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500 text-sm">No warehouse inventory data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WarehouseInventoryManager;
