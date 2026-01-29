import axios from 'axios';
import type {
  ShipmentPlanResponse,
  ReplenishmentRunResponse,
  PicklistResponse,
  ExceptionsResponse,
  DataReadiness,
  StoreTier,
  SeasonalityPeriod,
  WarehouseInventoryItem,
  PipelineItem,
} from '../types/replenishment';

const API_BASE = '/api/v1/replenishment';

// --- Main Operations ---

export const runReplenishment = async (
  runDate?: string,
  storeId?: string
): Promise<ReplenishmentRunResponse> => {
  const params: Record<string, string> = {};
  if (runDate) params.run_date = runDate;
  if (storeId) params.store_id = storeId;
  const response = await axios.post<ReplenishmentRunResponse>(`${API_BASE}/run`, null, { params });
  return response.data;
};

export const getLatestPlan = async (
  storeIds?: string[],
  skuIds?: string[]
): Promise<ShipmentPlanResponse> => {
  const params: Record<string, string[]> = {};
  if (storeIds?.length) params.store_ids = storeIds;
  if (skuIds?.length) params.sku_ids = skuIds;
  const response = await axios.get<ShipmentPlanResponse>(`${API_BASE}/latest`, {
    params,
    paramsSerializer: { indexes: null },
  });
  return response.data;
};

export const getPicklist = async (runDate?: string): Promise<PicklistResponse> => {
  const params = runDate ? { run_date: runDate } : {};
  const response = await axios.get<PicklistResponse>(`${API_BASE}/picklist`, { params });
  return response.data;
};

export const getExceptions = async (runDate?: string): Promise<ExceptionsResponse> => {
  const params = runDate ? { run_date: runDate } : {};
  const response = await axios.get<ExceptionsResponse>(`${API_BASE}/exceptions`, { params });
  return response.data;
};

export const getDataReadiness = async (): Promise<DataReadiness> => {
  const response = await axios.get<DataReadiness>(`${API_BASE}/data-readiness`);
  return response.data;
};

// --- Warehouse Inventory ---

export const getWarehouseInventory = async (
  skuIds?: string[]
): Promise<WarehouseInventoryItem[]> => {
  const params = skuIds?.length ? { sku_ids: skuIds } : {};
  const response = await axios.get<WarehouseInventoryItem[]>(`${API_BASE}/warehouse-inventory`, {
    params,
    paramsSerializer: { indexes: null },
  });
  return response.data;
};

export const updateWarehouseInventory = async (
  items: { sku_id: string; wh_on_hand_units: number }[]
): Promise<{ updated: number; created: number }> => {
  const response = await axios.post(`${API_BASE}/warehouse-inventory`, { items });
  return response.data;
};

// --- Pipeline ---

export const getPipeline = async (
  storeIds?: string[]
): Promise<PipelineItem[]> => {
  const params = storeIds?.length ? { store_ids: storeIds } : {};
  const response = await axios.get<PipelineItem[]>(`${API_BASE}/pipeline`, {
    params,
    paramsSerializer: { indexes: null },
  });
  return response.data;
};

export const updatePipeline = async (
  items: { store_id: string; sku_id: string; on_order_units: number }[]
): Promise<{ updated: number; created: number }> => {
  const response = await axios.post(`${API_BASE}/pipeline`, { items });
  return response.data;
};

// --- Store Tiers ---

export const getStoreTiers = async (): Promise<StoreTier[]> => {
  const response = await axios.get<StoreTier[]>(`${API_BASE}/store-tiers`);
  return response.data;
};

export const upsertStoreTier = async (tier: {
  store_id: string;
  tier: 'A' | 'B';
  safety_days: number;
  target_cover_days: number;
  expiry_window_days: number;
}): Promise<{ store_id: string; tier: string; status: string }> => {
  const response = await axios.post(`${API_BASE}/store-tiers`, tier);
  return response.data;
};

export const deleteStoreTier = async (storeId: string): Promise<void> => {
  await axios.delete(`${API_BASE}/store-tiers/${storeId}`);
};

// --- Seasonality ---

export const getSeasonality = async (): Promise<SeasonalityPeriod[]> => {
  const response = await axios.get<SeasonalityPeriod[]>(`${API_BASE}/seasonality`);
  return response.data;
};

export const createSeasonality = async (period: {
  start_date: string;
  end_date: string;
  multiplier: number;
  label: string;
}): Promise<{ id: number; label: string; status: string }> => {
  const response = await axios.post(`${API_BASE}/seasonality`, period);
  return response.data;
};

export const updateSeasonality = async (
  id: number,
  period: Partial<{
    start_date: string;
    end_date: string;
    multiplier: number;
    label: string;
  }>
): Promise<{ id: number; label: string; status: string }> => {
  const response = await axios.put(`${API_BASE}/seasonality/${id}`, period);
  return response.data;
};

export const deleteSeasonality = async (id: number): Promise<void> => {
  await axios.delete(`${API_BASE}/seasonality/${id}`);
};
