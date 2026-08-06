import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercentage, calculatePercentageChange } from '../../utils/dateCalculations';
import { exportToCSV } from '../../utils/csvExport';
import type { VendingProductData } from '../../hooks/useVendingData';

interface VendingTopProductsTableProps {
  data: VendingProductData[];
  isLoading?: boolean;
}

export const VendingTopProductsTable: React.FC<VendingTopProductsTableProps> = ({
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
        <h3 className="text-lg font-bold text-white mb-4">Top 10 Vending Products</h3>
        <div className="flex items-center justify-center h-[300px]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  // Validate data is an array
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Top 10 Vending Products</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Sort by current sales descending and take top 10
  const sortedData = [...data]
    .sort((a, b) => b.current_sales - a.current_sales)
    .slice(0, 10)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      percentageChange: calculatePercentageChange(item.current_sales, item.previous_sales),
    }));

  const handleExport = () => {
    const csvData = sortedData.map((item) => ({
      Rank: item.rank,
      Product: item.product_name,
      Units: item.current_units,
      'Current Sales': item.current_sales,
      'Previous Sales': item.previous_sales,
      'Change %': item.percentageChange,
      'Cost Missing': item.missing_cost ? 'yes' : 'no',
    }));
    exportToCSV(csvData, 'top-10-vending-products');
  };

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white">Top 10 Vending Products</h3>
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
        <div className="space-y-2">
          {sortedData.map((item, index) => {
            const isPositive = item.percentageChange >= 0;
            const bgColor = index % 2 === 0 ? 'bg-[#0e1117]' : 'bg-[#1c1e26]';
            return (
              <div
                key={`${item.product_name}-${index}`}
                className={`${bgColor} rounded-lg p-3`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-gray-400 shrink-0">#{item.rank}</span>
                    <span className="text-sm font-medium text-white truncate">{item.product_name}</span>
                    {item.missing_cost && (
                      <span className="shrink-0 text-[10px] font-semibold text-amber-400" title="No purchase cost in Weimi — profit overstated">
                        no cost
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-bold shrink-0 ml-2 ${
                      isPositive ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {formatPercentage(item.percentageChange)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{formatCurrency(item.current_sales)}</span>
                  <span className="text-xs text-gray-400">{formatNumber(item.current_units)} units</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2e303d]">
                <th className="text-left py-3 px-2 text-xs font-semibold text-gray-400 uppercase">Rank</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Product</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Units</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Current Sales</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Previous Sales</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Change</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((item, index) => {
                const isPositive = item.percentageChange >= 0;
                const bgColor = index % 2 === 0 ? 'bg-[#0e1117]' : 'bg-[#1c1e26]';

                return (
                  <tr
                    key={`${item.product_name}-${index}`}
                    className={`${bgColor} hover:bg-[#2e303d] transition-colors`}
                  >
                    <td className="py-3 px-2 text-sm font-bold text-white">#{item.rank}</td>
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-white">{item.product_name}</span>
                      {item.missing_cost && (
                        <span
                          className="ml-2 text-[10px] font-semibold text-amber-400 uppercase"
                          title="No purchase cost entered in Weimi — profit is overstated for this product"
                        >
                          no cost
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-300">
                      {formatNumber(item.current_units)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-semibold text-white">
                      {formatCurrency(item.current_sales)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-400">
                      {formatCurrency(item.previous_sales)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span
                        className={`text-sm font-bold ${
                          isPositive ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {formatPercentage(item.percentageChange)}
                      </span>
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
