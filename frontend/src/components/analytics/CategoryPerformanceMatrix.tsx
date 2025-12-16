import React, { useMemo } from 'react';
import { formatCurrency } from '../../utils/dateCalculations';
import { useCategoryPerformanceMatrix } from '../../hooks/useStoreComparisonV2';
import { useDashboardStore } from '../../stores/dashboardStore';

interface CategoryPerformanceMatrixProps {
  startDate: Date;
  endDate: Date;
  storeIds: string[];
}

export const CategoryPerformanceMatrix: React.FC<CategoryPerformanceMatrixProps> = ({
  startDate,
  endDate,
  storeIds,
}) => {
  const { data, isLoading, error } = useCategoryPerformanceMatrix(startDate, endDate, storeIds);
  const storesList = useDashboardStore((state) => state.stores);

  const processedData = useMemo(() => {
    if (!data?.matrix) return { categories: [], storeIds: [] };

    // Get unique store IDs from the data
    const storesSet = new Set<string>();
    data.matrix.forEach(item => {
      Object.keys(item.stores).forEach(storeId => storesSet.add(storeId));
    });
    // Filter to ensure we only include requested stores (though API should handle this)
    const storeIdsList = Array.from(storesSet).filter(id => storeIds.includes(id));

    // Calculate total revenue per category across all stores
    const categoriesWithTotals = data.matrix.map(item => ({
      category: item.category,
      stores: item.stores, // Keyed by store_id
      total: storeIdsList.reduce((sum, id) => sum + (item.stores[id] || 0), 0),
    }));

    // Sort by total revenue descending and take top 15
    const topCategories = categoriesWithTotals
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    return { categories: topCategories, storeIds: storeIdsList };
  }, [data, storeIds]);

  // Get color intensity based on value
  const getHeatColor = (value: number, maxValue: number): string => {
    if (value === 0) return 'bg-gray-800/50 text-gray-500';

    const intensity = (value / maxValue) * 100;

    if (intensity >= 80) return 'bg-green-500/30 text-green-300 border-green-500/40';
    if (intensity >= 60) return 'bg-blue-500/25 text-blue-300 border-blue-500/30';
    if (intensity >= 40) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/25';
    if (intensity >= 20) return 'bg-orange-500/15 text-orange-300 border-orange-500/20';
    return 'bg-red-500/10 text-red-300 border-red-500/15';
  };

  const getStoreName = (id: string) => {
    const store = storesList.find(s => s.id === id);
    return store ? store.name : id;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400">Error loading category matrix data</div>;
  }

  if (processedData.categories.length === 0) {
    return <div className="text-center text-gray-400 py-8">No category data available</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[#2e303d]">
            <th className="text-left py-3 px-4 text-gray-300 font-medium sticky left-0 bg-[#1c1e26] z-10">
              Category
            </th>
            {processedData.storeIds.map((id) => (
              <th
                key={id}
                className="text-right py-3 px-4 text-gray-300 font-medium min-w-[120px]"
              >
                {getStoreName(id)}
              </th>
            ))}
            <th className="text-right py-3 px-4 text-gray-300 font-medium bg-[#252833]">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {processedData.categories.map((category, idx) => {
            // Find max value in this row for color scaling
            const maxInRow = Math.max(...processedData.storeIds.map(id => category.stores[id] || 0));

            return (
              <tr
                key={idx}
                className="border-b border-[#2e303d] hover:bg-[#252833]/50 transition-colors"
              >
                <td className="py-3 px-4 text-white font-medium sticky left-0 bg-[#1c1e26] z-10">
                  {category.category}
                </td>
                {processedData.storeIds.map((id) => {
                  const value = category.stores[id] || 0;
                  const colorClass = getHeatColor(value, maxInRow);

                  return (
                    <td key={id} className="py-3 px-4 text-right">
                      <div className={`inline-block px-3 py-2 rounded-lg border ${colorClass} min-w-[100px]`}>
                        <div className="font-semibold">{formatCurrency(value)}</div>
                        {maxInRow > 0 && (
                          <div className="text-xs opacity-75">
                            {((value / maxInRow) * 100).toFixed(0)}%
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="py-3 px-4 text-right bg-[#252833]">
                  <div className="font-semibold text-white">
                    {formatCurrency(category.total)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#2e303d] bg-[#252833]">
            <td className="py-3 px-4 text-white font-semibold sticky left-0 bg-[#252833] z-10">
              Total by Store
            </td>
            {processedData.storeIds.map((id) => {
              const storeTotal = processedData.categories.reduce(
                (sum, cat) => sum + (cat.stores[id] || 0),
                0
              );
              return (
                <td key={id} className="py-3 px-4 text-right text-white font-semibold">
                  {formatCurrency(storeTotal)}
                </td>
              );
            })}
            <td className="py-3 px-4 text-right text-blue-400 font-semibold">
              {formatCurrency(processedData.categories.reduce((sum, cat) => sum + cat.total, 0))}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-4 flex items-center justify-center gap-6 text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border bg-green-500/30 border-green-500/40"></div>
          <span>Top performer (80-100%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border bg-blue-500/25 border-blue-500/30"></div>
          <span>Strong (60-80%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border bg-yellow-500/20 border-yellow-500/25"></div>
          <span>Average (40-60%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border bg-orange-500/15 border-orange-500/20"></div>
          <span>Below average (20-40%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border bg-red-500/10 border-red-500/15"></div>
          <span>Weak (0-20%)</span>
        </div>
      </div>

      <div className="mt-2 text-center text-xs text-gray-500">
        Showing top 15 categories by total revenue. Colors indicate relative performance within each category.
      </div>
    </div>
  );
};
