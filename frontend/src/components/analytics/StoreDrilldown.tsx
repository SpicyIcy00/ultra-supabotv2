import React, { useState } from 'react';
import { formatCurrency, formatNumber } from '../../utils/dateCalculations';
import { useStoreCategories, useStoreTopProducts } from '../../hooks/useDashboardData';

interface StoreDrilldownProps {
  stores: Array<{ id: number; name: string }>;
}

export const StoreDrilldown: React.FC<StoreDrilldownProps> = ({ stores }) => {
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);

  const categories = useStoreCategories(selectedStoreId);
  const topProducts = useStoreTopProducts(selectedStoreId);

  const isLoading = categories.isLoading || topProducts.isLoading;

  return (
    <div className="space-y-6">
      {/* Store Selector */}
      <div>
        <label className="block text-gray-300 font-medium mb-2">
          Select Store
        </label>
        <select
          value={selectedStoreId || ''}
          onChange={(e) => setSelectedStoreId(e.target.value ? Number(e.target.value) : null)}
          className="w-full md:w-96 bg-[#252833] border border-[#3e4150] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">Choose a store...</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedStoreId && (
        <div className="flex items-center justify-center h-64 text-gray-400">
          Select a store to view its performance breakdown
        </div>
      )}

      {selectedStoreId && isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}

      {selectedStoreId && !isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Categories */}
          <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white mb-4">
              Product Categories by Sales
            </h3>
            {!categories.data || categories.data.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                No category data available
              </div>
            ) : (
              <div className="space-y-3">
                {categories.data.map((category, index) => (
                  <div
                    key={category.category}
                    className="flex items-center justify-between p-3 bg-[#252833] rounded-lg hover:bg-[#2e303d] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-blue-400 font-bold text-lg">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="text-white font-medium">{category.category}</p>
                        <p className="text-gray-400 text-sm">
                          {formatNumber(category.transaction_count)} transactions
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-green-400 font-semibold">
                        {formatCurrency(category.total_sales)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Products */}
          <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white mb-4">
              Top 10 Products by Sales
            </h3>
            {!topProducts.data || topProducts.data.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                No product data available
              </div>
            ) : (
              <div className="space-y-3">
                {topProducts.data.map((product, index) => (
                  <div
                    key={product.product_name}
                    className="flex items-center justify-between p-3 bg-[#252833] rounded-lg hover:bg-[#2e303d] transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span
                        className={`font-bold text-lg ${
                          index === 0
                            ? 'text-yellow-400'
                            : index === 1
                            ? 'text-gray-300'
                            : index === 2
                            ? 'text-orange-400'
                            : 'text-blue-400'
                        }`}
                      >
                        #{index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-medium truncate">
                          {product.product_name}
                        </p>
                        <p className="text-gray-400 text-sm">
                          {product.category} • {formatNumber(product.quantity_sold)} units
                        </p>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-green-400 font-semibold">
                        {formatCurrency(product.total_sales)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
