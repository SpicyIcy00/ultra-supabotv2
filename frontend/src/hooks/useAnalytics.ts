/**
 * Analytics Custom Hooks
 * TanStack Query hooks for all analytics endpoints
 */
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../services/analyticsApi';
import { queryKeys } from '../lib/queryClient';
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

/**
 * Hook for hourly sales data
 */
export function useSalesByHour(params: SalesByHourParams) {
  return useQuery({
    queryKey: queryKeys.analytics.salesByHour(params),
    queryFn: () => analyticsApi.getSalesByHour(params),
    enabled: !!params.start_date && !!params.end_date,
  });
}

/**
 * Hook for store performance data
 */
export function useStorePerformance(params: StorePerformanceParams) {
  return useQuery({
    queryKey: queryKeys.analytics.storePerformance(params),
    queryFn: () => analyticsApi.getStorePerformance(params),
    enabled: !!params.start_date && !!params.end_date,
  });
}

/**
 * Hook for daily trend data
 */
export function useDailyTrend(params: DailyTrendParams = { days: 30 }) {
  return useQuery({
    queryKey: queryKeys.analytics.dailyTrend(params),
    queryFn: () => analyticsApi.getDailyTrend(params),
  });
}

/**
 * Hook for KPI metrics
 */
export function useKPIMetrics() {
  return useQuery({
    queryKey: queryKeys.analytics.kpiMetrics(),
    queryFn: () => analyticsApi.getKPIMetrics(),
  });
}

/**
 * Hook for product performance data
 */
export function useProductPerformance(params: ProductPerformanceParams) {
  return useQuery({
    queryKey: queryKeys.analytics.productPerformance(params),
    queryFn: () => analyticsApi.getProductPerformance(params),
    enabled: !!params.start_date && !!params.end_date,
  });
}
