/**
 * Google Sheets Column Mapping Configuration
 *
 * This file defines how the report data fields map to Google Sheets columns.
 * The data will be posted starting from row 2 (row 1 is skipped/preserved).
 */

export interface SheetsColumnMapping {
  product_name: string;
  sku: string;
  product_id: string;
  quantity_sold: string;
  inventory_store_a: string;
  inventory_store_b: string;
}

/**
 * Column mapping configuration
 * Maps internal field names to Google Sheets display names
 */
export const SHEETS_COLUMN_MAPPING: SheetsColumnMapping = {
  product_name: 'Product Name',
  sku: 'SKU',
  product_id: 'Product ID',
  quantity_sold: 'Ordered Qty',
  inventory_store_a: 'Store Inventory',
  inventory_store_b: 'Warehouse Inventory'
};

/**
 * Column order for Google Sheets (left to right)
 * Columns: A, B, C, D, E, F
 */
export const SHEETS_COLUMN_ORDER: (keyof SheetsColumnMapping)[] = [
  'product_name',       // Column A
  'sku',                // Column B
  'product_id',         // Column C
  'quantity_sold',      // Column D
  'inventory_store_a',  // Column E
  'inventory_store_b'   // Column F
];

/**
 * Transforms report data to match Google Sheets format
 * @param reportData Array of report rows
 * @returns Formatted data ready for Google Sheets
 */
export function transformDataForSheets(reportData: any[]) {
  return reportData.map(row => {
    // Extract inventory from comparison stores
    // Get the first two comparison store IDs (if they exist)
    const comparisonStoreIds = Object.keys(row.comparison_stores || {});
    const firstStoreInventory = comparisonStoreIds[0]
      ? (row.comparison_stores[comparisonStoreIds[0]]?.inventory || 0)
      : 0;
    const secondStoreInventory = comparisonStoreIds[1]
      ? (row.comparison_stores[comparisonStoreIds[1]]?.inventory || 0)
      : 0;

    return {
      product_name: row.product_name || '',
      sku: row.sku || '',
      product_id: row.product_id || '',
      quantity_sold: row.quantity_sold || 0,
      inventory_store_a: row.inventory_sales_store || 0,  // Sales store inventory
      inventory_store_b: firstStoreInventory  // First comparison store inventory
    };
  });
}
