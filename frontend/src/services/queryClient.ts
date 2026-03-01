import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 min cache for offline resilience
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 2,
      networkMode: 'offlineFirst',
    },
  },
});

export const queryKeys = {
  analytics: {
    salesByHour: (params: any) => ['analytics', 'salesByHour', params],
    storePerformance: (params: any) => ['analytics', 'storePerformance', params],
    dailyTrend: (params: any) => ['analytics', 'dailyTrend', params],
    kpiMetrics: () => ['analytics', 'kpiMetrics'],
    productPerformance: (params: any) => ['analytics', 'productPerformance', params],
  },
};
