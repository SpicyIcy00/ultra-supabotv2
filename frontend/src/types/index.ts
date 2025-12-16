export interface Product {
  id: number;
  sku: string;
  name: string;
  category?: string;
  brand?: string;
  price: number;
  cost?: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: number;
  code: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  email?: string;
  manager?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  transaction_number: string;
  store_id: number;
  transaction_date: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  payment_method?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionItem {
  id: number;
  transaction_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  discount: number;
  subtotal: number;
  created_at: string;
}

export interface SalesMetrics {
  total_sales: number;
  total_transactions: number;
  average_transaction_value: number;
  total_items_sold: number;
  period_start: string;
  period_end: string;
}

export interface ProductPerformance {
  product_id: number;
  product_name: string;
  sku: string;
  total_quantity_sold: number;
  total_revenue: number;
  average_price: number;
  category?: string;
}

export interface StorePerformance {
  store_id: number;
  store_name: string;
  store_code: string;
  total_sales: number;
  total_transactions: number;
  average_transaction_value: number;
}
