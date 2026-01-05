import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/analyticsApi';

type TimePeriod = 'wtd' | 'mtd' | 'ytd';

interface StoreComparisonData {
  stores: Array<{
    store_id: string;
    store_name: string;
    current: {
      revenue: number;
      transaction_count: number;
      avg_ticket: number;
      margin_pct: number;
    };
    previous: {
      revenue: number;
      transaction_count: number;
      avg_ticket: number;
      margin_pct: number;
    };
  }>;
}

const calculateDateRanges = (period: TimePeriod) => {
  const now = new Date();
  let currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date;

  switch (period) {
    case 'wtd': {
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      currentStart = new Date(now);
      currentStart.setDate(now.getDate() - diffToMonday);
      currentStart.setHours(0, 0, 0, 0);

      currentEnd = new Date(now);
      currentEnd.setHours(23, 59, 59, 999);

      previousStart = new Date(currentStart);
      previousStart.setDate(currentStart.getDate() - 7);

      previousEnd = new Date(currentEnd);
      previousEnd.setDate(currentEnd.getDate() - 7);
      break;
    }
    case 'mtd': {
      const dayOfMonth = now.getDate();

      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentStart.setHours(0, 0, 0, 0);

      currentEnd = new Date(now);
      currentEnd.setHours(23, 59, 59, 999);

      const prevMonth = now.getMonth() - 1;
      const prevYear = prevMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const actualPrevMonth = prevMonth < 0 ? 11 : prevMonth;

      previousStart = new Date(prevYear, actualPrevMonth, 1);
      previousStart.setHours(0, 0, 0, 0);

      previousEnd = new Date(prevYear, actualPrevMonth, Math.min(dayOfMonth, new Date(prevYear, actualPrevMonth + 1, 0).getDate()));
      previousEnd.setHours(23, 59, 59, 999);
      break;
    }
    case 'ytd': {
      currentStart = new Date(now.getFullYear(), 0, 1);
      currentStart.setHours(0, 0, 0, 0);

      currentEnd = new Date(now);
      currentEnd.setHours(23, 59, 59, 999);

      const dayOfYear = Math.floor((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      previousStart = new Date(now.getFullYear() - 1, 0, 1);
      previousStart.setHours(0, 0, 0, 0);

      previousEnd = new Date(previousStart);
      previousEnd.setDate(previousStart.getDate() + dayOfYear - 1);
      previousEnd.setHours(23, 59, 59, 999);
      break;
    }
  }

  return { currentStart, currentEnd, previousStart, previousEnd };
};

export const useStoreComparisonV2 = (
  currentStart: Date,
  currentEnd: Date,
  previousStart: Date,
  previousEnd: Date,
  storeIds: string[] = []
) => {
  return useQuery<StoreComparisonData, Error>({
    queryKey: ['store-comparison-v2', currentStart, currentEnd, previousStart, previousEnd, storeIds],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: currentStart.toISOString(),
        end_date: currentEnd.toISOString(),
        compare_start_date: previousStart.toISOString(),
        compare_end_date: previousEnd.toISOString(),
      });

      storeIds.forEach(id => params.append('store_ids', id));

      const response = await apiClient.get(`/analytics/store-comparison-v2?${params.toString()}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useStoreDrilldownV2 = (storeId: string, startDate: Date, endDate: Date) => {
  return useQuery({
    queryKey: ['store-drilldown-v2', storeId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        store_id: storeId,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      });

      const response = await apiClient.get(`/analytics/store-drilldown-v2?${params.toString()}`);
      return response.data;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useCategoryPerformanceMatrix = (startDate: Date, endDate: Date, storeIds: string[] = []) => {
  return useQuery({
    queryKey: ['category-performance-matrix', startDate, endDate, storeIds],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      });

      storeIds.forEach(id => params.append('store_ids', id));

      const response = await apiClient.get(`/analytics/category-performance-matrix?${params.toString()}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useStoreWeeklyTrends = (storeIds: string[] = []) => {
  return useQuery({
    queryKey: ['store-weekly-trends', storeIds],
    queryFn: async () => {
      const params = new URLSearchParams();
      storeIds.forEach(id => params.append('store_ids', id));

      const response = await apiClient.get(`/analytics/store-weekly-trends?${params.toString()}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useTopMovers = (
  startDate: Date,
  endDate: Date,
  compareStartDate: Date,
  compareEndDate: Date,
  storeIds: string[] = []
) => {
  return useQuery({
    queryKey: ['top-movers', startDate, endDate, compareStartDate, compareEndDate, storeIds],
    queryFn: async () => {
      const params = new URLSearchParams({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        compare_start_date: compareStartDate.toISOString(),
        compare_end_date: compareEndDate.toISOString(),
      });

      storeIds.forEach(id => params.append('store_ids', id));

      const response = await apiClient.get(`/analytics/top-movers?${params.toString()}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
};
