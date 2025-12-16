import React from 'react';
import { Download } from 'lucide-react';
import { formatCurrency, formatPercentage, calculatePercentageChange } from '../../utils/dateCalculations';
import { getCategoryColor } from '../../constants/colors';
import { exportToCSV } from '../../utils/csvExport';

interface CategoryData {
  category: string;
  current_sales: number;
  previous_sales: number;
}

interface TopCategoriesTableProps {
  data: CategoryData[];
  isLoading?: boolean;
}

export const TopCategoriesTable: React.FC<TopCategoriesTableProps> = ({
  data,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Top Categories by Sales</h3>
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
        <h3 className="text-lg font-bold text-white mb-4">Top Categories by Sales</h3>
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
      color: getCategoryColor(item.category),
    }));

  const handleExport = () => {
    const csvData = sortedData.map((item) => ({
      Rank: item.rank,
      Category: item.category,
      'Current Sales': item.current_sales,
      'Previous Sales': item.previous_sales,
      'Change %': item.percentageChange,
    }));
    exportToCSV(csvData, 'top-categories-by-sales');
  };

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white">Top Categories by Sales</h3>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#2e303d] hover:bg-[#3a3c4a] text-white rounded-lg transition-colors text-sm"
          title="Export as CSV"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2e303d]">
              <th className="text-left py-3 px-2 text-xs font-semibold text-gray-400 uppercase">Rank</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Category</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Current Sales</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Previous Sales</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Change</th>
              <th className="text-center py-3 px-2 text-xs font-semibold text-gray-400 uppercase">Trend</th>
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
                  <td className="py-3 px-4 text-right text-sm font-semibold text-[#00d2ff]">
                    {formatCurrency(item.current_sales)}
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-gray-400">
                    {formatCurrency(item.previous_sales)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`text-sm font-bold ${
                        isPositive ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {formatPercentage(item.percentageChange)}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={`text-xl ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                      {isPositive ? '↑' : '↓'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
