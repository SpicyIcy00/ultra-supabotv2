import React, { useState, useEffect } from 'react';
import { getPicklist } from '../../services/replenishmentApi';
import type { PicklistResponse } from '../../types/replenishment';

export const WarehousePicklist: React.FC = () => {
  const [picklist, setPicklist] = useState<PicklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getPicklist();
      setPicklist(data);
    } catch {
      // no data
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!picklist?.items.length) return;

    const headers = ['SKU ID', 'Product', 'Category', 'Total Qty'];
    const rows = picklist.items.map(i => [
      i.sku_id,
      i.product_name || '',
      i.category || '',
      i.total_allocated_qty,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `picklist-${picklist.run_date || 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!picklist?.run_date) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-8 text-center">
        <p className="text-gray-400">No picklist data. Run the replenishment calculation first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Warehouse Picklist</h3>
            <p className="text-xs text-gray-400 mt-1">
              Run: {picklist.run_date} | {picklist.items.length} SKUs | {picklist.total_units.toLocaleString()} total units
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors print:hidden"
            >
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Picklist Table */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2e303d]">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Category</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Total Qty</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-400">Stores</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2e303d]">
            {picklist.items.map(item => (
              <React.Fragment key={item.sku_id}>
                <tr
                  className="hover:bg-gray-700/20 cursor-pointer"
                  onClick={() =>
                    setExpandedSku(expandedSku === item.sku_id ? null : item.sku_id)
                  }
                >
                  <td className="px-4 py-3 text-sm text-white">
                    <div>{item.product_name || item.sku_id}</div>
                    <div className="text-xs text-gray-500">{item.sku_id}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{item.category || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-white">
                    {item.total_allocated_qty}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      {item.store_breakdown.length}
                      <svg
                        className={`w-3 h-3 transition-transform ${
                          expandedSku === item.sku_id ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </td>
                </tr>
                {expandedSku === item.sku_id && (
                  <tr>
                    <td colSpan={4} className="bg-[#0e1117] px-4 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {item.store_breakdown.map(sb => (
                          <div
                            key={sb.store_id}
                            className="flex items-center justify-between bg-[#1c1e26] rounded px-3 py-2"
                          >
                            <span className="text-xs text-gray-300">{sb.store_name || sb.store_id}</span>
                            <span className="text-xs font-medium text-white">{sb.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WarehousePicklist;
