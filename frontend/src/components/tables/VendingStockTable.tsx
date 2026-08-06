import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/dateCalculations';
import { exportToCSV } from '../../utils/csvExport';
import type { VendingStockData } from '../../hooks/useVendingData';

interface VendingStockTableProps {
  data: VendingStockData[];
  isLoading?: boolean;
}

// Fill level drives the row accent: empty slots first, then low, then healthy
const fillPct = (item: VendingStockData): number => {
  if (!item.max_stock) return item.curr_stock > 0 ? 100 : 0;
  return Math.round((item.curr_stock / item.max_stock) * 100);
};

const stockColor = (pct: number, curr: number): string => {
  if (curr <= 0) return 'text-red-400';
  if (pct <= 25) return 'text-amber-400';
  return 'text-green-400';
};

export const VendingStockTable: React.FC<VendingStockTableProps> = ({
  data,
  isLoading = false,
}) => {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Current Stock by Machine</h3>
        <div className="flex items-center justify-center h-[300px]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Current Stock by Machine</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Emptiest slots first — that is what needs restocking
  const sortedData = [...data]
    .map((item) => ({ ...item, pct: fillPct(item) }))
    .sort((a, b) => a.pct - b.pct || a.device_name.localeCompare(b.device_name));

  const emptyCount = sortedData.filter((item) => item.curr_stock <= 0).length;

  const handleExport = () => {
    const csvData = sortedData.map((item) => ({
      Machine: item.device_name,
      Aisle: item.aisle_code ?? '',
      Product: item.goods_name ?? '',
      Stock: item.curr_stock,
      Capacity: item.max_stock,
      'Fill %': item.pct,
      Price: item.price,
    }));
    exportToCSV(csvData, 'vending-stock-levels');
  };

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">Current Stock by Machine</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatNumber(sortedData.length)} slots · {formatNumber(emptyCount)} empty
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#2e303d] hover:bg-[#3a3c4a] text-white rounded-lg transition-colors text-sm"
          title="Export as CSV"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {isMobile ? (
        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {sortedData.map((item, index) => {
            const bgColor = index % 2 === 0 ? 'bg-[#0e1117]' : 'bg-[#1c1e26]';
            return (
              <div key={`${item.device_code}-${item.aisle_code}-${index}`} className={`${bgColor} rounded-lg p-3`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">{item.goods_name || '—'}</span>
                  <span className={`text-xs font-bold shrink-0 ml-2 ${stockColor(item.pct, item.curr_stock)}`}>
                    {item.curr_stock}/{item.max_stock || '?'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {item.device_name} · aisle {item.aisle_code || '—'}
                  </span>
                  <span className="text-xs text-gray-400">{formatCurrency(item.price)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-[#1c1e26]">
              <tr className="border-b border-[#2e303d]">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Machine</th>
                <th className="text-left py-3 px-2 text-xs font-semibold text-gray-400 uppercase">Aisle</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Product</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Stock</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Capacity</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Price</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((item, index) => {
                const bgColor = index % 2 === 0 ? 'bg-[#0e1117]' : 'bg-[#1c1e26]';

                return (
                  <tr
                    key={`${item.device_code}-${item.aisle_code}-${index}`}
                    className={`${bgColor} hover:bg-[#2e303d] transition-colors`}
                  >
                    <td className="py-3 px-4 text-sm font-medium text-white">{item.device_name}</td>
                    <td className="py-3 px-2 text-sm text-gray-400">{item.aisle_code || '—'}</td>
                    <td className="py-3 px-4 text-sm text-white">{item.goods_name || '—'}</td>
                    <td className={`py-3 px-4 text-right text-sm font-bold ${stockColor(item.pct, item.curr_stock)}`}>
                      {formatNumber(item.curr_stock)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-400">
                      {item.max_stock ? formatNumber(item.max_stock) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-300">
                      {formatCurrency(item.price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
