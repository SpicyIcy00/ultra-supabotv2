// --- Store Tier ---
export interface StoreTier {
  store_id: string;
  store_name?: string;
  tier: 'A' | 'B';
  safety_days: number;
  target_cover_days: number;
  max_cover_days: number;
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

// --- Velocity Multiplier Rules ---
export interface VelocityMultiplierRule {
  id: number;
  threshold: number;
  multiplier: number;
  label: string;
  created_at?: string;
  updated_at?: string;
}

// --- Category Multipliers ---
export interface CategoryMultiplier {
  category: string;
  store_id: string;
  store_name?: string;
  multiplier: number;
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
  velocity_multiplier: number;
  category_multiplier: number;
  effective_multiplier: number;
  total_sold_qty: number;
  dead_days: number;
  // Percentile-specific (present only when the plan was run with algorithm=percentile)
  abc_class?: string | null;
  service_quantile?: number | null;
  segment?: string | null;
  needs_count?: boolean | null;
  silent_stockout?: boolean | null;
  days_since_last_sale?: number | null;
  trusted_ledger?: boolean | null;
  p_days_used?: number | null;
  quantile_used?: number | null;
  quantile_source?: 'store_config' | 'override' | 'fallback' | null;
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

// --- Algorithm Settings ---
export interface AlgorithmSettings {
  snapshot_enabled: boolean;
  snapshot_required_days: number;
  stockout_buffer_weekday_pct: number;
  stockout_buffer_weekend_pct: number;
  priority_velocity_weight: number;
  priority_stockout_weight: number;
  overstock_threshold_days: number;
  critical_stock_threshold_days: number;
  updated_at?: string | null;
}

// --- Percentile (v2) per-store config ---
export interface PercentileStoreConfig {
  store_id: string;
  store_name?: string | null;
  review_days: number;
  lead_days: number;
  protection_days: number;
  quantile_a: number;
  quantile_b: number;
  quantile_c: number;
  notes?: string | null;
  updated_at?: string | null;
}

// --- Percentile Algorithm ---

export interface PercentileShipmentItem {
  store_id: string;
  store_name?: string;
  sku_id: string;
  product_name?: string;
  category?: string;
  avg_daily_sales: number;
  total_sold_qty: number;
  target: number;
  on_hand: number;
  usable_on_hand: number;
  ship_qty: number;
  days_of_stock: number;
  priority_score: number;
  abc_class?: string | null;
  service_quantile?: number | null;
  segment?: string | null;
  needs_count?: boolean | null;
  silent_stockout?: boolean | null;
  days_since_last_sale?: number | null;
  trusted_ledger?: boolean | null;
  calculation_mode: string;
}

export interface CompareItem {
  store_id: string;
  store_name?: string;
  sku_id: string;
  product_name?: string;
  product_sku?: string;
  category?: string;
  on_hand?: number | null;
  legacy_ship_qty?: number | null;
  legacy_target?: number | null;
  legacy_days_of_stock?: number | null;
  percentile_ship_qty?: number | null;
  percentile_target?: number | null;
  percentile_days_of_stock?: number | null;
  abc_class?: string | null;
  service_quantile?: number | null;
  segment?: string | null;
  silent_stockout?: boolean | null;
  needs_count?: boolean | null;
  days_since_last_sale?: number | null;
  trusted_ledger?: boolean | null;
  diff?: number | null;
}

export interface CompareResponse {
  run_date?: string | null;
  legacy_run_date?: string | null;
  percentile_run_date?: string | null;
  items: CompareItem[];
  summary: {
    total_items: number;
    both_algorithms: number;
    legacy_only: number;
    percentile_only: number;
    total_percentile_units: number;
    total_legacy_units: number;
  };
}

// --- AI Reasoning Mode ---
export interface AIReasoningItem {
  sku_id: string;
  store_id: string;
  true_velocity: number | null;
  avg_restock_duration_days: number | null;
  recommended_min_qty: number;
  reasoning: string;
  error?: boolean;
  no_data?: boolean;
}

export interface AIReasoningResponse {
  run_date: string | null;
  store_id: string;
  items: AIReasoningItem[];
}


// --- Data Readiness ---
export interface DataReadiness {
  snapshot_days_available: number;
  days_until_full_accuracy: number;
  full_accuracy_date: string;
  calculation_mode: string;
  snapshot_quality: 'good' | 'building' | null;
  stores_with_snapshots: string[];
  message: string;
}
