/**
 * Analytics API Types
 * Matches backend Pydantic schemas exactly
 */

// Sales by Hour
export interface SalesByHour {
  hour: number;
  hour_label: string;
  total_sales: number;
  transaction_count: number;
}

export interface SalesByHourResponse {
  data: SalesByHour[];
  start_date: string;
  end_date: string;
  store_id: string | null;
  total_sales: number;
  total_transactions: number;
}

// Store Performance
export interface StorePerformanceItem {
  store_id: string;  // MongoDB ObjectID
  store_name: string;
  total_sales: number;
  transaction_count: number;
  percentage_of_total: number;
  avg_transaction_value: number;
}

export interface StorePerformanceResponse {
  data: StorePerformanceItem[];
  start_date: string;
  end_date: string;
  total_sales: number;
  total_stores: number;
}

// Daily Trend
export interface DailyTrendItem {
  date: string;
  daily_sales: number;
  cumulative_sales: number;
  transaction_count: number;
}

export interface DailyTrendResponse {
  data: DailyTrendItem[];
  days: number;
  total_sales: number;
  avg_daily_sales: number;
}

// KPI Metrics
export interface KPIMetrics {
  latest_date: string;
  previous_date: string;
  latest_sales: number;
  previous_sales: number;
  sales_growth_pct: number;
  latest_transactions: number;
  previous_transactions: number;
  transactions_growth_pct: number;
  latest_avg_transaction_value: number;
  previous_avg_transaction_value: number;
  avg_transaction_value_growth_pct: number;
}

// Product Performance
export interface ProductPerformanceItem {
  product_id: string;  // MongoDB ObjectID
  product_name: string;
  category: string | null;
  sku: string | null;
  total_revenue: number;
  quantity_sold: number;
  avg_price: number;
  transaction_count: number;
}

export interface ProductPerformanceResponse {
  data: ProductPerformanceItem[];
  start_date: string;
  end_date: string;
  category: string | null;
  total_revenue: number;
  total_quantity: number;
}

// Query Parameters
export interface DateRangeParams {
  start_date: string;  // ISO format
  end_date: string;    // ISO format
}

export interface SalesByHourParams extends DateRangeParams {
  store_id?: string;
}

export interface StorePerformanceParams extends DateRangeParams {
  limit?: number;
}

export interface ProductPerformanceParams extends DateRangeParams {
  category?: string;
  limit?: number;
}

export interface DailyTrendParams {
  days?: number;
}

// Filter State
export interface DashboardFilters {
  dateRange: {
    start: Date;
    end: Date;
  };
  selectedStores: string[];
  selectedCategories: string[];
}
