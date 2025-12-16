/**
 * Analytics API Client
 * Typed axios client for analytics endpoints
 */
import axios, { type AxiosError } from 'axios';
import type {
  SalesByHourResponse,
  SalesByHourParams,
  StorePerformanceResponse,
  StorePerformanceParams,
  DailyTrendResponse,
  DailyTrendParams,
  KPIMetrics,
  ProductPerformanceResponse,
  ProductPerformanceParams,
} from '../types/analytics';

// Create axios instance
const api = axios.create({
  baseURL: '/api/v1',  // Use relative URL to go through Vite proxy
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  paramsSerializer: {
    indexes: null, // This makes axios serialize arrays as `param=value1&param=value2` instead of `param[]=value1`
  },
});

// Request interceptor for auth tokens
api.interceptors.request.use(
  (config) => {
    // Add JWT token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && originalRequest) {
      // Clear token and redirect to login
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Retry logic for network errors
    if (
      !error.response &&
      originalRequest &&
      !(originalRequest as any)._retry
    ) {
      (originalRequest as any)._retry = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

/**
 * Analytics API Service
 */
export const analyticsApi = {
  /**
   * Get hourly sales data
   */
  getSalesByHour: async (
    params: SalesByHourParams
  ): Promise<SalesByHourResponse> => {
    const response = await api.get<SalesByHourResponse>(
      '/analytics/sales-by-hour',
      { params }
    );
    return response.data;
  },

  /**
   * Get store performance data
   */
  getStorePerformance: async (
    params: StorePerformanceParams
  ): Promise<StorePerformanceResponse> => {
    const response = await api.get<StorePerformanceResponse>(
      '/analytics/store-performance',
      { params }
    );
    return response.data;
  },

  /**
   * Get daily trend data
   */
  getDailyTrend: async (
    params: DailyTrendParams = {}
  ): Promise<DailyTrendResponse> => {
    const response = await api.get<DailyTrendResponse>(
      '/analytics/daily-trend',
      { params }
    );
    return response.data;
  },

  /**
   * Get KPI metrics
   */
  getKPIMetrics: async (): Promise<KPIMetrics> => {
    const response = await api.get<KPIMetrics>('/analytics/kpi-metrics');
    return response.data;
  },

  /**
   * Get product performance data
   */
  getProductPerformance: async (
    params: ProductPerformanceParams
  ): Promise<ProductPerformanceResponse> => {
    const response = await api.get<ProductPerformanceResponse>(
      '/analytics/product-performance',
      { params }
    );
    return response.data;
  },

  /**
   * Get store comparison data
   */
  getStoreComparison: async (params: {
    start_date: string;
    end_date: string;
  }): Promise<Array<{
    store_name: string;
    total_sales: number;
    total_profit: number;
    transaction_count: number;
    avg_transaction_value: number;
  }>> => {
    const response = await api.get('/analytics/store-comparison', { params });
    return response.data;
  },
};

// Export axios instance for other uses
export default api;

// Export API client for new endpoints
export const apiClient = api;
