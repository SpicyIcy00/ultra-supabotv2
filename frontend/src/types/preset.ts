/**
 * Report Preset Types
 *
 * TypeScript interfaces for report preset functionality
 */

export interface ColumnConfig {
  category: boolean;
  product_name: boolean;
  sku: boolean;
  product_id: boolean;
  quantity_sold: boolean;
  revenue: boolean;
  inventory_sales_store: boolean;
  comparison_qty_sold: boolean;  // Show comparison store quantity sold
  comparison_inventory: boolean; // Show comparison store inventory
  comparison_revenue: boolean;   // Show comparison store revenue
  comparison_variance: boolean;  // Show comparison store variance
}

export interface FilterConfig {
  categories?: string[];
  min_quantity?: number;
  max_quantity?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  search?: string;
  // New filters (client-side filtering)
  min_price?: number;
  max_price?: number;
  min_profit_margin?: number;
  max_profit_margin?: number;
  days_of_week?: string[]; // ['monday', 'tuesday', etc] or ['weekday', 'weekend']
}

export interface PresetConfig {
  columns: ColumnConfig;
  filters: FilterConfig;
  group_by_category?: boolean;
  save_stores?: boolean;
  save_dates?: boolean;
  sales_store_id?: string;
  compare_store_ids?: string[];
  start_date?: string;
  end_date?: string;
}

export interface ReportPreset {
  id: number;
  name: string;
  report_type: string;
  config: PresetConfig;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PresetCreateRequest {
  name: string;
  report_type: string;
  config: PresetConfig;
  is_default?: boolean;
}

export interface PresetUpdateRequest {
  name?: string;
  config?: PresetConfig;
  is_default?: boolean;
}

export interface PresetListResponse {
  presets: ReportPreset[];
  total: number;
  default_preset_id: number | null;
}

// Default configurations
export const DEFAULT_COLUMN_CONFIG: ColumnConfig = {
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

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  categories: undefined,
  min_quantity: undefined,
  max_quantity: undefined,
  limit: undefined,
  sort_by: 'quantity_sold',
  sort_order: 'desc',
  search: undefined,
  min_price: undefined,
  max_price: undefined,
  min_profit_margin: undefined,
  max_profit_margin: undefined,
  days_of_week: undefined,
};

export const DEFAULT_PRESET_CONFIG: PresetConfig = {
  columns: DEFAULT_COLUMN_CONFIG,
  filters: DEFAULT_FILTER_CONFIG,
  group_by_category: true,
  save_stores: false,
  save_dates: false,
};

// Column display labels
export const COLUMN_LABELS: Record<keyof ColumnConfig, string> = {
  category: 'Category',
  product_name: 'Product Name',
  sku: 'SKU',
  product_id: 'Product ID',
  quantity_sold: 'Qty Sold',
  revenue: 'Revenue',
  inventory_sales_store: 'Sales Store Inv',
  comparison_qty_sold: 'Comparison - Qty Sold',
  comparison_inventory: 'Comparison - Inventory',
  comparison_revenue: 'Comparison - Revenue',
  comparison_variance: 'Comparison - Variance',
};

// Sort field options
export const SORT_FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'category', label: 'Category' },
  { value: 'product_name', label: 'Product Name' },
  { value: 'sku', label: 'SKU' },
  { value: 'product_id', label: 'Product ID' },
  { value: 'quantity_sold', label: 'Qty Sold' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'inventory_sales_store', label: 'Sales Store Inv' },
];
