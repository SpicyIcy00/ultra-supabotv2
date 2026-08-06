import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercentage, calculatePercentageChange } from '../../utils/dateCalculations';
import { getVendingCategoryColor } from '../../constants/colors';
import { exportToCSV } from '../../utils/csvExport';
import type { VendingCategoryData } from '../../hooks/useVendingData';

interface VendingTopCategoriesTableProps {
  data: VendingCategoryData[];
  isLoading?: boolean;
}

export const VendingTopCategoriesTable: React.FC<VendingTopCategoriesTableProps> = ({
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
        <h3 className="text-lg font-bold text-white mb-4">Vending Categories by Sales</h3>
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
        <h3 className="text-lg font-bold text-white mb-4">Vending Categories by Sales</h3>
        <div className="flex items-center justify-center h-[300px] text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Sort by current sales descending
  const sortedData = [...data]
    .sort((a, b) => b.current_sales - a.current_sales)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      percentageChange: calculatePercentageChange(item.current_sales, item.previous_sales),
      color: getVendingCategoryColor(item.category, index),
    }));

  // Products Weimi hasn't tagged yet all land in one bucket — call it out
  const untagged = sortedData.find((item) => item.category === 'Uncategorized');

  const handleExport = () => {
    const csvData = sortedData.map((item) => ({
      Rank: item.rank,
      Category: item.category,
      Units: item.current_units,
      Products: item.product_count,
      'Current Sales': item.current_sales,
      'Previous Sales': item.previous_sales,
      'Change %': item.percentageChange,
    }));
    exportToCSV(csvData, 'vending-categories-by-sales');
  };

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">Vending Categories by Sales</h3>
          {untagged && (
            <p className="text-xs text-amber-400/80 mt-0.5">
              {formatNumber(untagged.product_count)} products not yet tagged in Weimi
            </p>
          )}
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
        <div className="space-y-2">
          {sortedData.map((item, index) => {
            const isPositive = item.percentageChange >= 0;
            const bgColor = index % 2 === 0 ? 'bg-[#0e1117]' : 'bg-[#1c1e26]';
            return (
              <div
                key={item.category}
                className={`${bgColor} rounded-lg p-3`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-gray-400 shrink-0">#{item.rank}</span>
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm font-medium text-white truncate">{item.category}</span>
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
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Category</th>
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
                    key={item.category}
                    className={`${bgColor} hover:bg-[#2e303d] transition-colors`}
                  >
                    <td className="py-3 px-2 text-sm font-bold text-white">#{item.rank}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm font-medium text-white">{item.category}</span>
                      </div>
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
