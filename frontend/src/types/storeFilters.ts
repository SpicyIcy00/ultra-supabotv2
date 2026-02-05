/**
 * Store Filters Types
 *
 * Types for the store filter configuration API.
 */

export interface StoreFilterConfig {
  sales_stores: string[];
  inventory_stores: string[];
}

export interface AvailableStoresResponse {
  stores: string[];
}
