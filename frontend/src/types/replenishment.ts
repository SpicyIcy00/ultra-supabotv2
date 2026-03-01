// --- Store Tier ---
export interface StoreTier {
  store_id: string;
  store_name?: string;
  tier: 'A' | 'B';
  safety_days: number;
  target_cover_days: number;
  expiry_window_days: number;
  created_at?: string;
  updated_at?: string;
}

// --- Seasonality ---
export interface SeasonalityPeriod {
  id: number;
  start_date: string;
  end_date: string;
  multiplier: number;
  label: string;
  created_at?: string;
  updated_at?: string;
}

// --- Warehouse Inventory ---
export interface WarehouseInventoryItem {
  sku_id: string;
  product_name?: string;
  category?: string;
  wh_on_hand_units: number;
  updated_at?: string;
}

// --- Pipeline ---
export interface PipelineItem {
  store_id: string;
  store_name?: string;
  sku_id: string;
  product_name?: string;
  on_order_units: number;
  updated_at?: string;
}

// --- Shipment Plan ---
export interface ShipmentPlanItem {
  store_id: string;
  store_name?: string;
  sku_id: string;
  product_name?: string;
  category?: string;
  avg_daily_sales: number;
  season_adjusted_daily_sales: number;
  safety_stock: number;
  min_level: number;
  max_level: number;
  expiry_cap: number;
  final_max: number;
  on_hand: number;
  on_order: number;
  inventory_position: number;
  requested_ship_qty: number;
  allocated_ship_qty: number;
  priority_score: number;
  days_of_stock: number;
  wh_on_hand: number;
  product_sku?: string;
}

export interface ShipmentPlanSummary {
  total_stores: number;
  total_skus: number;
  total_requested_units: number;
  total_allocated_units: number;
}

export interface ShipmentPlanResponse {
  run_date: string | null;
  calculation_mode: string;
  snapshot_days_available: number;
  items: ShipmentPlanItem[];
  summary: ShipmentPlanSummary;
}

// --- Run Response ---
export interface ReplenishmentRunResponse {
  run_date: string;
  calculation_mode: string;
  snapshot_days_available: number;
  total_items: number;
  stores_processed: number;
  warehouse_allocations: number;
  exceptions_count: number;
  summary: ShipmentPlanSummary;
}

// --- Picklist ---
export interface PicklistStoreBreakdown {
  store_id: string;
  store_name?: string;
  quantity: number;
}

export interface PicklistItem {
  sku_id: string;
  product_name?: string;
  category?: string;
  total_allocated_qty: number;
  store_breakdown: PicklistStoreBreakdown[];
}

export interface PicklistResponse {
  run_date: string | null;
  items: PicklistItem[];
  total_units: number;
}

// --- Exceptions ---
export interface ExceptionItem {
  store_id: string;
  store_name?: string;
  sku_id: string;
  product_name?: string;
  exception_type: string;
  detail: string;
  requested_qty: number;
  allocated_qty: number;
  days_of_stock: number;
  priority_score: number;
}

export interface ExceptionsResponse {
  run_date: string | null;
  items: ExceptionItem[];
  total_exceptions: number;
}

// --- Data Readiness ---
export interface DataReadiness {
  snapshot_days_available: number;
  days_until_full_accuracy: number;
  full_accuracy_date: string;
  calculation_mode: string;
  stores_with_snapshots: string[];
  message: string;
}
