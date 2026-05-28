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
 * Transforms replenishment shipment plan items to Google Sheets format.
 * Column mapping:
 *   A: product_name, B: sku, C: product_id,
 *   D: requested_ship_qty → "Ordered Qty",
 *   E: on_hand → "Store Inventory",
 *   F: wh_on_hand → "Warehouse Inventory"
 */
export function transformReplenishmentForSheets(items: any[]) {
  return items.map(item => ({
    product_name: item.product_name || '',
    sku: item.product_sku || item.sku_id || '',
    product_id: item.sku_id || '',
    quantity_sold: item.requested_ship_qty ?? 0,
    inventory_store_a: item.on_hand ?? 0,
    inventory_store_b: item.wh_on_hand ?? 0,
  }));
}

/**
 * Transforms replenishment items to a full backup format with ALL fields.
 * Column order mirrors the dashboard: Total Sold, Dead Days, Avg Daily,
 * Store Inv, WH Inv, Min, Requested, Allocated, Days Stock, multipliers,
 * plus extra fields only in the backup (SKU, season-adj, safety stock, etc.).
 */
export function transformReplenishmentForBackup(items: any[]) {
  return items.map(item => ({
    store_name:              item.store_name || item.store_id || '',
    product_name:            item.product_name || '',
    sku:                     item.product_sku || item.sku_id || '',
    product_id:              item.sku_id || '',
    category:                item.category || '',
    total_sold_qty:          item.total_sold_qty ?? 0,
    dead_days:               item.dead_days ?? 0,
    avg_daily_sales:         item.avg_daily_sales ?? 0,
    season_adj_daily_sales:  item.season_adjusted_daily_sales ?? 0,
    safety_stock:            item.safety_stock ?? 0,
    min_level:               item.min_level ?? 0,
    max_level:               item.max_level ?? 0,
    expiry_cap:              item.expiry_cap ?? 0,
    final_max:               item.final_max ?? 0,
    store_inv:               item.on_hand ?? 0,
    on_order:                item.on_order ?? 0,
    inv_position:            item.inventory_position ?? 0,
    wh_on_hand:              item.wh_on_hand ?? 0,
    ordered_qty:             item.requested_ship_qty ?? 0,
    allocated_qty:           item.allocated_ship_qty ?? 0,
    days_of_stock:           item.days_of_stock ?? 0,
    priority_score:          item.priority_score ?? 0,
    velocity_mult:           item.velocity_multiplier ?? 0,
    category_mult:           item.category_multiplier ?? 0,
    effective_mult:          item.effective_multiplier ?? 0,
  }));
}

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
