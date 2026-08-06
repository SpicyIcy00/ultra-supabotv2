import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/dateCalculations';
import { exportToCSV } from '../../utils/csvExport';
import type { FailedVendData } from '../../hooks/useVendingData';

interface FailedVendsTableProps {
  data: FailedVendData[];
  isLoading?: boolean;
}

const formatWhen = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const FailedVendsTable: React.FC<FailedVendsTableProps> = ({
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
        <h3 className="text-lg font-bold text-white mb-4">Failed Vends</h3>
        <div className="flex items-center justify-center h-[300px]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Failed Vends</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-400">
          No failed vends in this period
        </div>
      </div>
    );
  }

  const totalFailures = data.reduce((sum, item) => sum + item.failed_count, 0);

  const handleExport = () => {
    const csvData = data.map((item) => ({
      Machine: item.device_name,
      Aisle: item.aisle_code ?? '',
      Product: item.goods_name ?? '',
      'Failed Vends': item.failed_count,
      'Value At Risk': item.failed_value,
      'Last Failure': item.last_failure_at ?? '',
    }));
    exportToCSV(csvData, 'vending-failed-vends');
  };

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">Failed Vends</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatNumber(totalFailures)} items paid for but never dispensed
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
          {data.map((item, index) => {
            const bgColor = index % 2 === 0 ? 'bg-[#0e1117]' : 'bg-[#1c1e26]';
            return (
              <div key={`${item.device_code}-${item.goods_name}-${index}`} className={`${bgColor} rounded-lg p-3`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">{item.goods_name || '—'}</span>
                  <span className="text-xs font-bold text-red-400 shrink-0 ml-2">
                    {formatNumber(item.failed_count)}x
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {item.device_name} · aisle {item.aisle_code || '—'}
                  </span>
                  <span className="text-xs text-gray-400">{formatCurrency(item.failed_value)}</span>
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
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Failures</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Value</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Last</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => {
                const bgColor = index % 2 === 0 ? 'bg-[#0e1117]' : 'bg-[#1c1e26]';

                return (
                  <tr
                    key={`${item.device_code}-${item.goods_name}-${index}`}
                    className={`${bgColor} hover:bg-[#2e303d] transition-colors`}
                  >
                    <td className="py-3 px-4 text-sm font-medium text-white">{item.device_name}</td>
                    <td className="py-3 px-2 text-sm text-gray-400">{item.aisle_code || '—'}</td>
                    <td className="py-3 px-4 text-sm text-white">{item.goods_name || '—'}</td>
                    <td className="py-3 px-4 text-right text-sm font-bold text-red-400">
                      {formatNumber(item.failed_count)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-300">
                      {formatCurrency(item.failed_value)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-400 whitespace-nowrap">
                      {formatWhen(item.last_failure_at)}
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
