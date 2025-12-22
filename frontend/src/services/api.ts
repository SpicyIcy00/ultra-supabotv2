import axios from 'axios';
import type {
  Product,
  Store,
  SalesMetrics,
  ProductPerformance,
  StorePerformance,
} from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'https://ultra-supabotv2-production.up.railway.app/api/v1';

console.log('API Base URL:', API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Products
export const productsApi = {
  getAll: (params?: { skip?: number; limit?: number; category?: string }) =>
    api.get<Product[]>('/products', { params }),

  getById: (id: number) =>
    api.get<Product>(`/products/${id}`),

  create: (data: Omit<Product, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<Product>('/products', data),

  update: (id: number, data: Partial<Product>) =>
    api.patch<Product>(`/products/${id}`, data),

  delete: (id: number) =>
    api.delete(`/products/${id}`),
};

// Stores
export const storesApi = {
  getAll: (params?: { skip?: number; limit?: number; is_active?: boolean }) =>
    api.get<Store[]>('/stores', { params }),

  getById: (id: number) =>
    api.get<Store>(`/stores/${id}`),

  create: (data: Omit<Store, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<Store>('/stores', data),

  update: (id: number, data: Partial<Store>) =>
    api.patch<Store>(`/stores/${id}`, data),

  delete: (id: number) =>
    api.delete(`/stores/${id}`),
};

// Analytics
export const analyticsApi = {
  getSalesMetrics: (params?: {
    start_date?: string;
    end_date?: string;
    store_id?: number;
  }) =>
    api.get<SalesMetrics>('/analytics/sales-metrics', { params }),

  getProductPerformance: (params?: {
    start_date?: string;
    end_date?: string;
    limit?: number;
  }) =>
    api.get<ProductPerformance[]>('/analytics/product-performance', { params }),

  getStorePerformance: (params?: {
    start_date?: string;
    end_date?: string;
  }) =>
    api.get<StorePerformance[]>('/analytics/store-performance', { params }),
};

// AI Query
export const aiApi = {
  query: (query: string) =>
    api.post('/ai/query', { query }),

  streamQuery: (query: string) => {
    return new EventSource(`${API_BASE_URL}/ai/query/stream?query=${encodeURIComponent(query)}`);
  },
};
