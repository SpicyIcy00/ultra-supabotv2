import React from 'react';
import { usePresetStore } from '../stores/presetStore';
import { COLUMN_LABELS, type ColumnConfig } from '../types/preset';

export const ColumnVisibilityPanel: React.FC = () => {
  const { currentConfig, updateCurrentConfig } = usePresetStore();

  const toggleColumn = (column: keyof ColumnConfig) => {
    updateCurrentConfig({
      columns: {
        ...currentConfig.columns,
        [column]: !currentConfig.columns[column],
      },
    });
  };

  const showAll = () => {
    const allVisible: ColumnConfig = {
      category: true,
      product_name: true,
      sku: true,
      product_id: true,
      quantity_sold: true,
      revenue: true,
      inventory_sales_store: true,
      comparison_qty_sold: true,
      comparison_inventory: true,
      comparison_revenue: true,
      comparison_variance: true,
    };
    updateCurrentConfig({ columns: allVisible });
  };

  const hideAll = () => {
    const allHidden: ColumnConfig = {
      category: false,
      product_name: false,
      sku: false,
      product_id: false,
      quantity_sold: false,
      revenue: false,
      inventory_sales_store: false,
      comparison_qty_sold: false,
      comparison_inventory: false,
      comparison_revenue: false,
      comparison_variance: false,
    };
    updateCurrentConfig({ columns: allHidden });
  };

  const columns: Array<keyof ColumnConfig> = [
    'category',
    'product_name',
    'sku',
    'product_id',
    'quantity_sold',
    'revenue',
    'inventory_sales_store',
    'comparison_qty_sold',
    'comparison_inventory',
    'comparison_revenue',
    'comparison_variance',
  ];

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200">Column Visibility</h3>
        <div className="flex gap-2">
          <button
            onClick={showAll}
            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Show All
          </button>
          <button
            onClick={hideAll}
            className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
          >
            Hide All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {columns.map((column) => (
          <label
            key={column}
            className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors"
          >
            <input
              type="checkbox"
              checked={currentConfig.columns[column]}
              onChange={() => toggleColumn(column)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800 cursor-pointer"
            />
            <span>{COLUMN_LABELS[column]}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
