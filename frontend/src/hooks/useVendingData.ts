import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useDashboardStore } from '../stores/dashboardStore';
import { useVendingStore } from '../stores/vendingStore';
import {
  formatDateForAPI,
  getPeriodLabel,
  getComparisonLabel,
} from '../utils/dateCalculations';

// Use relative URL to leverage Vercel rewrite proxy (avoids CORS)
const API_BASE_URL = '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  paramsSerializer: {
    indexes: null, // serialize arrays as `param=a&param=b`
  },
});

// Types — all money fields are PESOS (the API converts the raw cents columns)
export interface VendingKPIData {
  total_sales: number;
  total_profit: number;
  units_sold: number;
  orders: number;
  failed_vends: number;
  missing_cost_units: number;
  avg_order_value: number;
}

interface VendingKPIResponse {
  current: VendingKPIData;
  previous: VendingKPIData;
}

export interface MachineSalesData {
  device_code: string;
  device_name: string;
  current_sales: number;
  previous_sales: number;
  current_units: number;
  previous_units: number;
  /** Days the machine actually sold something — the per-day divisor */
  current_days: number;
  previous_days: number;
  current_avg_daily_sales: number;
  previous_avg_daily_sales: number;
  current_avg_daily_units: number;
}

export interface VendingProductData {
  product_name: string;
  current_sales: number;
  previous_sales: number;
  current_units: number;
  previous_units: number;
  missing_cost: boolean;
  category: string;
}

export interface VendingCategoryData {
  category: string;
  current_sales: number;
  previous_sales: number;
  current_units: number;
  product_count: number;
}

export interface VendingHourlyData {
  hour: number;
  avg_sales: number;
  total_sales: number;
  avg_units: number;
  active_days: number;
}

// Shared query params: dashboard period + selected machines
const useVendingParams = () => {
  const { dateRanges } = useDashboardStore();
  const selectedDevices = useVendingStore((state) => state.selectedDevices);

  return {
    dateRanges,
    selectedDevices,
    comparisonParams: {
      start_date: formatDateForAPI(dateRanges.current.start),
      end_date: formatDateForAPI(dateRanges.current.end),
      compare_start_date: formatDateForAPI(dateRanges.comparison.start),
      compare_end_date: formatDateForAPI(dateRanges.comparison.end),
      device_codes: selectedDevices,
    },
  };
};

// Hook to get vending KPI data
export const useVendingKPIs = () => {
  const { dateRanges, selectedDevices, comparisonParams } = useVendingParams();

  return useQuery({
    queryKey: ['vending-kpis', dateRanges, selectedDevices],
    queryFn: async () => {
      const response = await api.get<VendingKPIResponse>('/vending/dashboard-kpis', {
        params: comparisonParams,
      });
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Hook to get sales per machine
export const useSalesByMachine = () => {
  const { dateRanges, selectedDevices, comparisonParams } = useVendingParams();

  return useQuery({
    queryKey: ['vending-sales-by-machine', dateRanges, selectedDevices],
    queryFn: async () => {
      const response = await api.get<MachineSalesData[]>('/vending/sales-by-machine', {
        params: comparisonParams,
      });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get top vending products
export const useVendingTopProducts = () => {
  const { dateRanges, selectedDevices, comparisonParams } = useVendingParams();

  return useQuery({
    queryKey: ['vending-top-products', dateRanges, selectedDevices],
    queryFn: async () => {
      const response = await api.get<VendingProductData[]>('/vending/top-products', {
        params: { ...comparisonParams, limit: 10 },
      });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get vending categories ranked by revenue
export const useVendingTopCategories = () => {
  const { dateRanges, selectedDevices, comparisonParams } = useVendingParams();

  return useQuery({
    queryKey: ['vending-top-categories', dateRanges, selectedDevices],
    queryFn: async () => {
      const response = await api.get<VendingCategoryData[]>('/vending/top-categories', {
        params: comparisonParams,
      });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get average sales per hour of day
export const useVendingSalesByHour = () => {
  const { dateRanges, selectedDevices } = useVendingParams();

  return useQuery({
    queryKey: ['vending-sales-by-hour', dateRanges, selectedDevices],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        device_codes: selectedDevices,
      };

      const response = await api.get<VendingHourlyData[]>('/vending/sales-by-hour', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get all vending dashboard data
export const useVendingData = () => {
  const selectedPeriod = useDashboardStore((state) => state.selectedPeriod);
  const customDateRange = useDashboardStore((state) => state.customDateRange);

  const kpiData = useVendingKPIs();
  const salesByMachine = useSalesByMachine();
  const topProducts = useVendingTopProducts();
  const topCategories = useVendingTopCategories();
  const salesByHour = useVendingSalesByHour();

  return {
    // Data
    kpiData: kpiData.data,
    salesByMachine: salesByMachine.data,
    topProducts: topProducts.data,
    topCategories: topCategories.data,
    salesByHour: salesByHour.data,

    // Loading states
    isLoading:
      kpiData.isLoading ||
      salesByMachine.isLoading ||
      topProducts.isLoading ||
      topCategories.isLoading ||
      salesByHour.isLoading,

    // Error states
    error:
      kpiData.error ||
      salesByMachine.error ||
      topProducts.error ||
      topCategories.error ||
      salesByHour.error,

    // Refetch all
    refetchAll: () => {
      kpiData.refetch();
      salesByMachine.refetch();
      topProducts.refetch();
      topCategories.refetch();
      salesByHour.refetch();
    },

    // Labels
    periodLabel: getPeriodLabel(selectedPeriod),
    comparisonLabel: getComparisonLabel(
      selectedPeriod,
      customDateRange?.start,
      customDateRange?.end
    ),
  };
};
