import React, { useState, useMemo } from 'react';
import { formatCurrency, formatNumber } from '../../utils/dateCalculations';

interface ProductComboData {
  product1: string;
  product2: string;
  frequency: number;
  combined_sales: number;
  pct_of_transactions: number;
}

interface ProductCombosTableProps {
  data: ProductComboData[];
  isLoading?: boolean;
}

type SortColumn = 'frequency' | 'combined_sales' | 'pct_of_transactions';
type SortDirection = 'asc' | 'desc';

export const ProductCombosTable: React.FC<ProductCombosTableProps> = ({
  data,
  isLoading = false,
}) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>('frequency');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortColumn, sortDirection]);

  const SortIcon: React.FC<{ column: SortColumn }> = ({ column }) => {
    if (sortColumn !== column) {
      return <span className="text-gray-600">⇅</span>;
    }
    return (
      <span className="text-blue-400">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div>

      {!data || data.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-400">
          No product combination data available
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2e303d]">
                <th className="text-left py-3 px-4 text-gray-300 font-medium">
                  Product 1
                </th>
                <th className="text-left py-3 px-4 text-gray-300 font-medium">
                  Product 2
                </th>
                <th
                  className="text-right py-3 px-4 text-gray-300 font-medium cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('frequency')}
                >
                  <div className="flex items-center justify-end gap-2">
                    Frequency
                    <SortIcon column="frequency" />
                  </div>
                </th>
                <th
                  className="text-right py-3 px-4 text-gray-300 font-medium cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('combined_sales')}
                >
                  <div className="flex items-center justify-end gap-2">
                    Combined Sales
                    <SortIcon column="combined_sales" />
                  </div>
                </th>
                <th
                  className="text-right py-3 px-4 text-gray-300 font-medium cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('pct_of_transactions')}
                >
                  <div className="flex items-center justify-end gap-2">
                    % of Transactions
                    <SortIcon column="pct_of_transactions" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((combo, index) => (
                <tr
                  key={`${combo.product1}-${combo.product2}-${index}`}
                  className={`border-b border-[#2e303d] hover:bg-[#252833] transition-colors ${
                    index === 0 ? 'bg-blue-500/5' : ''
                  }`}
                >
                  <td className="py-3 px-4 text-white max-w-xs truncate">
                    {combo.product1}
                  </td>
                  <td className="py-3 px-4 text-white max-w-xs truncate">
                    {combo.product2}
                  </td>
                  <td className="py-3 px-4 text-right text-white">
                    {formatNumber(combo.frequency)}
                  </td>
                  <td className="py-3 px-4 text-right text-green-400">
                    {formatCurrency(combo.combined_sales)}
                  </td>
                  <td className="py-3 px-4 text-right text-blue-400">
                    {combo.pct_of_transactions.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
