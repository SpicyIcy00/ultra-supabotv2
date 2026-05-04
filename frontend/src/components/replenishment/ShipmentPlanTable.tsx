import React, { useState, useEffect, useMemo } from 'react';
import { getLatestPlan } from '../../services/replenishmentApi';
import { fetchStores } from '../../services/reportApi';
import type { ShipmentPlanItem, ShipmentPlanResponse } from '../../types/replenishment';
import { useDashboardStore } from '../../stores/dashboardStore';

type SortColumn = keyof ShipmentPlanItem;
type SortDirection = 'asc' | 'desc';

// Column definitions — add/remove here to change the table
interface ColDef {
  key: SortColumn;
  label: string;
  align?: 'left' | 'right';
  defaultHidden?: boolean;
}

const COLUMNS: ColDef[] = [
  { key: 'store_name',                 label: 'Store',          align: 'left' },
  { key: 'product_name',               label: 'Product',        align: 'left' },
  { key: 'total_sold_qty',             label: 'Total Sold',                    },
  { key: 'avg_daily_sales',            label: 'Avg Sales/Day',                 },
  { key: 'on_hand',                    label: 'On Hand',                       },
  { key: 'final_max',                  label: 'Final Max',      defaultHidden: true },
  { key: 'requested_ship_qty',         label: 'Requested',                     },
  { key: 'allocated_ship_qty',         label: 'Allocated',                     },
  { key: 'days_of_stock',              label: 'Days Stock',                    },
  { key: 'priority_score',             label: 'Priority',       defaultHidden: true },
  { key: 'velocity_multiplier',        label: 'Velocity ×',     defaultHidden: true },
  { key: 'category_multiplier',        label: 'Category ×',     defaultHidden: true },
  { key: 'effective_multiplier',       label: 'Effective ×',    defaultHidden: true },
];

const DEFAULT_HIDDEN = new Set(
  COLUMNS.filter(c => c.defaultHidden).map(c => c.key)
);

export const ShipmentPlanTable: React.FC = () => {
  const [plan, setPlan] = useState<ShipmentPlanResponse | null>(null);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const getStoreName = useDashboardStore((state) => state.getStoreName);
  const getStoreNameByDbName = useDashboardStore((state) => state.getStoreNameByDbName);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('priority_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [loading, setLoading] = useState(true);
  const [hiddenCols, setHiddenCols] = useState<Set<SortColumn>>(DEFAULT_HIDDEN);

  useEffect(() => { loadData(); }, []);

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

  const toggleCol = (key: SortColumn) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const visibleCols = COLUMNS.filter(c => !hiddenCols.has(c.key));

  const filteredAndSorted = useMemo(() => {
    if (!plan?.items) return [];
    let items = [...plan.items];
    if (selectedStore) items = items.filter(i => i.store_id === selectedStore);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        i => i.product_name?.toLowerCase().includes(q) ||
             i.sku_id.toLowerCase().includes(q) ||
             i.category?.toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => {
      const aVal = a[sortColumn] ?? 0;
      const bVal = b[sortColumn] ?? 0;
      if (typeof aVal === 'string' && typeof bVal === 'string')
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      const diff = Number(aVal) - Number(bVal);
      return sortDirection === 'asc' ? diff : -diff;
    });
    return items;
  }, [plan, selectedStore, search, sortColumn, sortDirection]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDirection('desc'); }
  };

  const exportToCSV = () => {
    if (!filteredAndSorted.length) return;
    const headers = [
      'Store', 'SKU ID', 'Product', 'Category', 'Total Sold',
      'Avg Daily Sales', 'Season Adj Sales', 'Safety Stock', 'Min', 'Max',
      'Final Max', 'On Hand', 'On Order', 'Inv Position', 'Requested Qty',
      'Allocated Qty', 'Priority', 'Days of Stock',
      'Velocity ×', 'Category ×', 'Effective ×',
    ];
    const rows = filteredAndSorted.map(i => [
      i.store_name ? getStoreNameByDbName(i.store_name) : i.store_id,
      i.sku_id, i.product_name || '', i.category || '',
      i.total_sold_qty ?? 0,
      i.avg_daily_sales.toFixed(2), i.season_adjusted_daily_sales.toFixed(2),
      i.safety_stock.toFixed(1), i.min_level.toFixed(1), i.max_level.toFixed(1),
      i.final_max.toFixed(1), i.on_hand, i.on_order, i.inventory_position,
      i.requested_ship_qty, i.allocated_ship_qty,
      i.priority_score.toFixed(4), i.days_of_stock.toFixed(1),
      (i.velocity_multiplier ?? 1).toFixed(3),
      (i.category_multiplier ?? 1).toFixed(3),
      (i.effective_multiplier ?? 1).toFixed(3),
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `shipment-plan-${plan?.run_date || 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Eye icon
  const EyeIcon = ({ visible }: { visible: boolean }) => (
    <svg
      className={`w-3.5 h-3.5 transition-colors ${visible ? 'text-gray-500 hover:text-gray-300' : 'text-gray-700 hover:text-gray-500'}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      {visible ? (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </>
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      )}
    </svg>
  );

  const ColHeader: React.FC<{ col: ColDef }> = ({ col }) => {
    const visible = !hiddenCols.has(col.key);
    return (
      <th
        className={`px-3 py-3 text-xs font-medium text-gray-400 ${
          col.align === 'left' ? 'text-left' : 'text-right'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          <button
            onClick={() => handleSort(col.key)}
            className="hover:text-white transition-colors"
          >
            {col.label}
            {sortColumn === col.key && (
              <span className="ml-0.5 text-blue-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
            )}
          </button>
          <button
            onClick={() => toggleCol(col.key)}
            title={visible ? 'Hide column' : 'Show column'}
            className="flex-shrink-0"
          >
            <EyeIcon visible={visible} />
          </button>
        </span>
      </th>
    );
  };

  const cellValue = (item: ShipmentPlanItem, key: SortColumn): React.ReactNode => {
    const isShortage = item.allocated_ship_qty < item.requested_ship_qty;
    switch (key) {
      case 'store_name':
        return <td key={key} className="px-3 py-2.5 text-sm text-white whitespace-nowrap">{item.store_name ? getStoreNameByDbName(item.store_name) : item.store_id}</td>;
      case 'product_name':
        return (
          <td key={key} className="px-3 py-2.5 text-sm text-white">
            <div>{item.product_name || item.sku_id}</div>
            {item.category && <div className="text-xs text-gray-500">{item.category}</div>}
          </td>
        );
      case 'total_sold_qty':
        return <td key={key} className="px-3 py-2.5 text-sm text-right text-blue-300 tabular-nums">{(item.total_sold_qty ?? 0).toLocaleString()}</td>;
      case 'avg_daily_sales':
        return <td key={key} className="px-3 py-2.5 text-sm text-right text-gray-300 tabular-nums">{item.avg_daily_sales.toFixed(2)}</td>;
      case 'on_hand':
        return <td key={key} className={`px-3 py-2.5 text-sm text-right tabular-nums ${item.on_hand < 0 ? 'text-red-400' : 'text-gray-300'}`}>{item.on_hand}</td>;
      case 'final_max':
        return <td key={key} className="px-3 py-2.5 text-sm text-right text-gray-300 tabular-nums">{item.final_max.toFixed(0)}</td>;
      case 'requested_ship_qty':
        return <td key={key} className="px-3 py-2.5 text-sm text-right text-gray-300 tabular-nums">{item.requested_ship_qty}</td>;
      case 'allocated_ship_qty':
        return <td key={key} className={`px-3 py-2.5 text-sm text-right tabular-nums font-medium ${isShortage ? 'text-red-400' : 'text-green-400'}`}>{item.allocated_ship_qty}</td>;
      case 'days_of_stock':
        return <td key={key} className={`px-3 py-2.5 text-sm text-right tabular-nums ${item.days_of_stock < 7 ? 'text-red-400' : item.days_of_stock > 60 ? 'text-yellow-400' : 'text-gray-300'}`}>{item.days_of_stock.toFixed(1)}</td>;
      case 'priority_score':
        return <td key={key} className="px-3 py-2.5 text-sm text-right text-gray-400 tabular-nums">{item.priority_score.toFixed(2)}</td>;
      case 'velocity_multiplier':
        return <td key={key} className={`px-3 py-2.5 text-sm text-right tabular-nums ${(item.velocity_multiplier ?? 1) > 1 ? 'text-green-400' : 'text-gray-500'}`}>×{(item.velocity_multiplier ?? 1).toFixed(3)}</td>;
      case 'category_multiplier':
        return <td key={key} className={`px-3 py-2.5 text-sm text-right tabular-nums ${(item.category_multiplier ?? 1) > 1 ? 'text-green-400' : 'text-gray-500'}`}>×{(item.category_multiplier ?? 1).toFixed(3)}</td>;
      case 'effective_multiplier':
        return <td key={key} className={`px-3 py-2.5 text-sm text-right tabular-nums font-medium ${(item.effective_multiplier ?? 1) > 1 ? 'text-green-400' : 'text-gray-500'}`}>×{(item.effective_multiplier ?? 1).toFixed(3)}</td>;
      default:
        return <td key={key} className="px-3 py-2.5 text-sm text-right text-gray-300">{String(item[key] ?? '')}</td>;
    }
  };

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
                <option key={s.id} value={s.id}>{getStoreName(s.id)}</option>
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
          <span className="ml-3 text-gray-600">Click the eye icon beside any column header to hide it</span>
        </p>
      </div>

      {/* Table */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2e303d]">
                {visibleCols.map(col => <ColHeader key={col.key} col={col} />)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2e303d]">
              {filteredAndSorted.map((item, idx) => (
                <tr key={`${item.store_id}-${item.sku_id}-${idx}`} className="hover:bg-gray-700/20">
                  {visibleCols.map(col => cellValue(item, col.key))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ShipmentPlanTable;
