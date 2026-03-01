import axios from 'axios';
import type { StoreFilterConfig, AvailableStoresResponse } from '../types/storeFilters';

const API_BASE = '/api/v1/store-filters';

export const getStoreFilters = async (): Promise<StoreFilterConfig> => {
  const response = await axios.get<StoreFilterConfig>(API_BASE);
  return response.data;
};

export const updateStoreFilters = async (config: StoreFilterConfig): Promise<StoreFilterConfig> => {
  const response = await axios.put<StoreFilterConfig>(API_BASE, config);
  return response.data;
};

export const getAvailableStores = async (): Promise<AvailableStoresResponse> => {
  const response = await axios.get<AvailableStoresResponse>(`${API_BASE}/available-stores`);
  return response.data;
};

export const initializeDefaultFilters = async (): Promise<{ message: string; initialized: boolean }> => {
  const response = await axios.post<{ message: string; initialized: boolean }>(`${API_BASE}/initialize`);
  return response.data;
};
