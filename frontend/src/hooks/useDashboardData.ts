import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useDashboardStore } from '../stores/dashboardStore';
import {
  formatDateForAPI,
  getGranularityForPeriod,
  getPeriodLabel,
  getComparisonLabel,
} from '../utils/dateCalculations';

const getBaseUrl = () => {
  let url = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'https://ultra-supabotv2-production.up.railway.app';
  // Remove trailing slash if present
  url = url.replace(/\/$/, '');
  // Append /api/v1 if not present
  if (!url.endsWith('/api/v1')) {
    url = `${url}/api/v1`;
  }
  return url;
};

const API_BASE_URL = getBaseUrl();

console.log('Dashboard API Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  paramsSerializer: {
    indexes: null, // This makes axios serialize arrays as `param=value1&param=value2` instead of `param[]=value1`
  },
});

// Types
interface KPIData {
  total_sales: number;
  total_profit: number;
  transactions: number;
  avg_transaction_value: number;
}

interface KPIResponse {
  current: KPIData;
  previous: KPIData;
}

interface CategorySalesData {
  category: string;
  total_sales: number;
  color?: string;
}

interface InventoryData {
  category: string;
  inventory_value: number;
  color?: string;
}

interface StoreData {
  store_name: string;
  current_sales: number;
  previous_sales: number;
  color?: string;
}

interface ProductData {
  product_name: string;
  current_sales: number;
  previous_sales: number;
}

interface TrendDataPoint {
  date: string;
  sales: number;
}

interface TrendResponse {
  current: TrendDataPoint[];
  previous: TrendDataPoint[];
}

interface HourlyData {
  hour: number;
  hour_label: string;
  total_sales: number;
}

// Hook to get KPI data
export const useKPIData = () => {
  const { dateRanges, selectedStores } = useDashboardStore();

  return useQuery({
    queryKey: ['dashboard-kpis', dateRanges, selectedStores],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        compare_start_date: formatDateForAPI(dateRanges.comparison.start),
        compare_end_date: formatDateForAPI(dateRanges.comparison.end),
        store_ids: selectedStores,
      };

      const response = await api.get<KPIResponse>('/analytics/dashboard-kpis', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Hook to get sales by category
export const useSalesByCategory = () => {
  const { dateRanges, selectedStores } = useDashboardStore();

  return useQuery({
    queryKey: ['sales-by-category', dateRanges, selectedStores],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        store_ids: selectedStores,
      };

      const response = await api.get<CategorySalesData[]>('/analytics/sales-by-category', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get inventory by category
export const useInventoryByCategory = () => {
  const { selectedStores } = useDashboardStore();

  return useQuery({
    queryKey: ['inventory-by-category', selectedStores],
    queryFn: async () => {
      const params = {
        store_ids: selectedStores,
      };

      const response = await api.get<InventoryData[]>('/analytics/inventory-by-category', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes (inventory changes less frequently)
  });
};

// Hook to get sales by store
export const useSalesByStore = () => {
  const { dateRanges, selectedStores } = useDashboardStore();

  return useQuery({
    queryKey: ['sales-by-store', dateRanges, selectedStores],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        compare_start_date: formatDateForAPI(dateRanges.comparison.start),
        compare_end_date: formatDateForAPI(dateRanges.comparison.end),
        store_ids: selectedStores,
      };

      const response = await api.get<StoreData[]>('/analytics/sales-by-store', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get top products
export const useTopProducts = () => {
  const { dateRanges, selectedStores } = useDashboardStore();

  return useQuery({
    queryKey: ['top-products', dateRanges, selectedStores],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        compare_start_date: formatDateForAPI(dateRanges.comparison.start),
        compare_end_date: formatDateForAPI(dateRanges.comparison.end),
        store_ids: selectedStores,
        limit: 10,
      };

      const response = await api.get<ProductData[]>('/analytics/top-products', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get sales trend
export const useSalesTrend = () => {
  const { dateRanges, selectedStores, selectedPeriod } = useDashboardStore();
  const granularity = getGranularityForPeriod(selectedPeriod);

  return useQuery({
    queryKey: ['sales-trend', dateRanges, selectedStores, granularity],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        compare_start_date: formatDateForAPI(dateRanges.comparison.start),
        compare_end_date: formatDateForAPI(dateRanges.comparison.end),
        store_ids: selectedStores,
        granularity,
      };

      const response = await api.get<TrendResponse>('/analytics/sales-trend', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get top categories
interface CategoryData {
  category: string;
  current_sales: number;
  previous_sales: number;
}

export const useTopCategories = () => {
  const { dateRanges, selectedStores } = useDashboardStore();

  return useQuery({
    queryKey: ['top-categories', dateRanges, selectedStores],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        compare_start_date: formatDateForAPI(dateRanges.comparison.start),
        compare_end_date: formatDateForAPI(dateRanges.comparison.end),
        store_ids: selectedStores,
      };

      const response = await api.get<CategoryData[]>('/analytics/top-categories', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get sales by hour
export const useSalesByHour = () => {
  const { dateRanges, selectedStores } = useDashboardStore();

  return useQuery({
    queryKey: ['sales-by-hour', dateRanges, selectedStores],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        store_ids: selectedStores,
      };

      const response = await api.get<{ data: HourlyData[] } | HourlyData[]>('/analytics/sales-by-hour', { params });
      // Handle both response formats: direct array or object with data property
      if (Array.isArray(response.data)) {
        return response.data;
      } else if (response.data && typeof response.data === 'object' && 'data' in response.data) {
        return (response.data as { data: HourlyData[] }).data;
      }
      return [];
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get store comparison
interface StoreComparisonData {
  store_name: string;
  total_sales: number;
  total_profit: number;
  transaction_count: number;
  avg_transaction_value: number;
  avg_weekday_sales: number;
  avg_weekend_sales: number;
  avg_weekday_transaction_value: number;
  avg_weekend_transaction_value: number;
}

export const useStoreComparison = () => {
  const { dateRanges } = useDashboardStore();

  return useQuery({
    queryKey: ['store-comparison', dateRanges],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
      };

      const response = await api.get<StoreComparisonData[]>('/analytics/store-comparison', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get day of week patterns
interface DayOfWeekData {
  day_of_week: number;
  day_name: string;
  total_sales: number;
  total_profit: number;
  transaction_count: number;
  avg_transaction_value: number;
}

interface DayOfWeekResponse {
  data: DayOfWeekData[];
  weeks: number;
  start_date: string;
  end_date: string;
}

export const useDayOfWeekPatterns = () => {
  return useQuery({
    queryKey: ['day-of-week-patterns'],
    queryFn: async () => {
      const response = await api.get<DayOfWeekResponse>('/analytics/day-of-week-patterns');
      return response.data;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes - this data changes less frequently
  });
};

// Hook to get product combos
interface ProductComboData {
  product1: string;
  product2: string;
  frequency: number;
  combined_sales: number;
  pct_of_transactions: number;
}

export const useProductCombos = () => {
  const { dateRanges } = useDashboardStore();

  return useQuery({
    queryKey: ['product-combos', dateRanges],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        limit: 15,
      };

      const response = await api.get<ProductComboData[]>('/analytics/product-combos', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 10,
  });
};

// Hook to get sales anomalies
interface SalesAnomalyData {
  product_name: string;
  store_name: string;
  avg_7_day_sales: number;
  avg_30_day_sales: number;
  pct_change: number;
  severity: 'Critical' | 'Warning';
}

export const useSalesAnomalies = () => {
  return useQuery({
    queryKey: ['sales-anomalies'],
    queryFn: async () => {
      const response = await api.get<SalesAnomalyData[]>('/analytics/sales-anomalies');
      return response.data;
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
  });
};

// Hook to get all dashboard data
export const useDashboardData = () => {
  const selectedPeriod = useDashboardStore((state) => state.selectedPeriod);

  const kpiData = useKPIData();
  const salesByCategory = useSalesByCategory();
  const inventoryByCategory = useInventoryByCategory();
  const salesByStore = useSalesByStore();
  const topProducts = useTopProducts();
  const salesTrend = useSalesTrend();
  const topCategories = useTopCategories();
  const salesByHour = useSalesByHour();

  return {
    // Data
    kpiData: kpiData.data,
    salesByCategory: salesByCategory.data,
    inventoryByCategory: inventoryByCategory.data,
    salesByStore: salesByStore.data,
    topProducts: topProducts.data,
    salesTrend: salesTrend.data,
    topCategories: topCategories.data,
    salesByHour: salesByHour.data,

    // Loading states
    isLoading:
      kpiData.isLoading ||
      salesByCategory.isLoading ||
      inventoryByCategory.isLoading ||
      salesByStore.isLoading ||
      topProducts.isLoading ||
      salesTrend.isLoading ||
      topCategories.isLoading ||
      salesByHour.isLoading,

    // Error states
    error:
      kpiData.error ||
      salesByCategory.error ||
      inventoryByCategory.error ||
      salesByStore.error ||
      topProducts.error ||
      salesTrend.error ||
      topCategories.error ||
      salesByHour.error,

    // Refetch all
    refetchAll: () => {
      kpiData.refetch();
      salesByCategory.refetch();
      inventoryByCategory.refetch();
      salesByStore.refetch();
      topProducts.refetch();
      salesTrend.refetch();
      topCategories.refetch();
      salesByHour.refetch();
    },

    // Labels
    periodLabel: getPeriodLabel(selectedPeriod),
    comparisonLabel: getComparisonLabel(selectedPeriod),
  };
};

// Hook to get store categories
interface StoreCategoryData {
  category: string;
  total_sales: number;
  transaction_count: number;
}

export const useStoreCategories = (storeId: string | null) => {
  const { dateRanges } = useDashboardStore();

  return useQuery({
    queryKey: ['store-categories', storeId, dateRanges],
    queryFn: async () => {
      if (!storeId) return [];
      const params = {
        store_id: storeId,
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
      };

      const response = await api.get<StoreCategoryData[]>('/analytics/store-categories', { params });
      return response.data;
    },
    enabled: !!storeId,
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get store top products
interface StoreTopProductData {
  product_name: string;
  category: string;
  total_sales: number;
  quantity_sold: number;
  transaction_count: number;
}

export const useStoreTopProducts = (storeId: string | null) => {
  const { dateRanges } = useDashboardStore();

  return useQuery({
    queryKey: ['store-top-products', storeId, dateRanges],
    queryFn: async () => {
      if (!storeId) return [];
      const params = {
        store_id: storeId,
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        limit: 10,
      };

      const response = await api.get<StoreTopProductData[]>('/analytics/store-top-products', { params });
      return response.data;
    },
    enabled: !!storeId,
    staleTime: 1000 * 60 * 5,
  });
};
