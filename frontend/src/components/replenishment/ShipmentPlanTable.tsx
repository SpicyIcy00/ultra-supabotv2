import React, { useState, useEffect, useMemo } from 'react';
import { getLatestPlan } from '../../services/replenishmentApi';
import { fetchStores } from '../../services/reportApi';
import type { ShipmentPlanItem, ShipmentPlanResponse } from '../../types/replenishment';

type SortColumn = keyof ShipmentPlanItem;
type SortDirection = 'asc' | 'desc';

export const ShipmentPlanTable: React.FC = () => {
  const [plan, setPlan] = useState<ShipmentPlanResponse | null>(null);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('priority_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [planData, storesData] = await Promise.all([
        getLatestPlan(),
        fetchStores(),
      ]);
      setPlan(planData);
      setStores(storesData.map(s => ({ id: s.id, name: s.name })));
    } catch {
      // No data yet
    } finally {
      setLoading(false);
    }
  };

  const filteredAndSorted = useMemo(() => {
    if (!plan?.items) return [];

    let items = [...plan.items];

    // Filter by store
    if (selectedStore) {
      items = items.filter(i => i.store_id === selectedStore);
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        i =>
          i.product_name?.toLowerCase().includes(q) ||
          i.sku_id.toLowerCase().includes(q) ||
          i.category?.toLowerCase().includes(q)
      );
    }

    // Sort
    items.sort((a, b) => {
      const aVal = a[sortColumn] ?? 0;
      const bVal = b[sortColumn] ?? 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      const diff = Number(aVal) - Number(bVal);
      return sortDirection === 'asc' ? diff : -diff;
    });

    return items;
  }, [plan, selectedStore, search, sortColumn, sortDirection]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('desc');
    }
  };

  const exportToCSV = () => {
    if (!filteredAndSorted.length) return;

    const headers = [
      'Store', 'SKU ID', 'Product', 'Category', 'Avg Daily Sales',
      'Season Adj Sales', 'Safety Stock', 'Min', 'Max', 'Final Max',
      'On Hand', 'On Order', 'Inv Position', 'Requested Qty',
      'Allocated Qty', 'Priority', 'Days of Stock',
    ];

    const rows = filteredAndSorted.map(i => [
      i.store_name || i.store_id,
      i.sku_id,
      i.product_name || '',
      i.category || '',
      i.avg_daily_sales.toFixed(2),
      i.season_adjusted_daily_sales.toFixed(2),
      i.safety_stock.toFixed(1),
      i.min_level.toFixed(1),
      i.max_level.toFixed(1),
      i.final_max.toFixed(1),
      i.on_hand,
      i.on_order,
      i.inventory_position,
      i.requested_ship_qty,
      i.allocated_ship_qty,
      i.priority_score.toFixed(4),
      i.days_of_stock.toFixed(1),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `shipment-plan-${plan?.run_date || 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const SortHeader: React.FC<{ col: SortColumn; label: string; align?: string }> = ({
    col, label, align = 'right',
  }) => (
    <th
      className={`px-3 py-3 text-xs font-medium text-gray-400 cursor-pointer hover:text-white transition-colors ${
        align === 'left' ? 'text-left' : 'text-right'
      }`}
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortColumn === col && (
          <span className="text-blue-400">{sortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </span>
    </th>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!plan?.run_date) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-8 text-center">
        <p className="text-gray-400">No shipment plan data. Run the replenishment calculation first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <select
              value={selectedStore}
              onChange={e => setSelectedStore(e.target.value)}
              className="w-full bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">All Stores</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search product or SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            />
          </div>
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            Export CSV
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Showing {filteredAndSorted.length} of {plan.items.length} items | Run: {plan.run_date}
        </p>
      </div>

      {/* Table */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2e303d]">
                <SortHeader col="store_name" label="Store" align="left" />
                <SortHeader col="product_name" label="Product" align="left" />
                <SortHeader col="avg_daily_sales" label="Avg Sales/Day" />
                <SortHeader col="on_hand" label="On Hand" />
                <SortHeader col="final_max" label="Final Max" />
                <SortHeader col="requested_ship_qty" label="Requested" />
                <SortHeader col="allocated_ship_qty" label="Allocated" />
                <SortHeader col="days_of_stock" label="Days Stock" />
                <SortHeader col="priority_score" label="Priority" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2e303d]">
              {filteredAndSorted.map((item, idx) => {
                const isShortage = item.allocated_ship_qty < item.requested_ship_qty;
                return (
                  <tr
                    key={`${item.store_id}-${item.sku_id}-${idx}`}
                    className="hover:bg-gray-700/20"
                  >
                    <td className="px-3 py-2.5 text-sm text-white">{item.store_name || item.store_id}</td>
                    <td className="px-3 py-2.5 text-sm text-white">
                      <div>{item.product_name || item.sku_id}</div>
                      {item.category && (
                        <div className="text-xs text-gray-500">{item.category}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-right text-gray-300">
                      {item.avg_daily_sales.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-right text-gray-300">{item.on_hand}</td>
                    <td className="px-3 py-2.5 text-sm text-right text-gray-300">
                      {item.final_max.toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-right text-gray-300">
                      {item.requested_ship_qty}
                    </td>
                    <td className={`px-3 py-2.5 text-sm text-right font-medium ${
                      isShortage ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {item.allocated_ship_qty}
                    </td>
                    <td className={`px-3 py-2.5 text-sm text-right ${
                      item.days_of_stock < 7 ? 'text-red-400' : item.days_of_stock > 60 ? 'text-yellow-400' : 'text-gray-300'
                    }`}>
                      {item.days_of_stock.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-right text-gray-400">
                      {item.priority_score.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ShipmentPlanTable;
