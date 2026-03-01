/**
 * Types for Product Sales Report
 */

export interface ComparisonStoreData {
  quantity_sold: number;
  inventory: number;
  revenue: number;
  qty_variance: number;
  qty_variance_percent: number;
}

export interface ReportRow {
  category: string | null;
  product_name: string;
  sku: string | null;
  product_id: string;
  quantity_sold: number;
  revenue: number;
  inventory_sales_store: number;
  unit_price?: number | null;
  cost?: number | null;
  profit_margin?: number | null;
  comparison_stores: Record<string, ComparisonStoreData>;
}

export interface ReportMeta {
  sales_store_id: string;
  compare_store_ids: string[];
  start: string;
  end: string;
  timezone: string;
  generated_at: string;
}

export interface ProductSalesReportResponse {
  meta: ReportMeta;
  rows: ReportRow[];
}

export interface Store {
  id: string;
  name: string;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  created_at: string;
  updated_at: string;
}
