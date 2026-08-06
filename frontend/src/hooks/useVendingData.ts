import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useDashboardStore } from '../stores/dashboardStore';
import { useVendingStore } from '../stores/vendingStore';
import {
  formatDateForAPI,
  getGranularityForPeriod,
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
}

export interface VendingProductData {
  product_name: string;
  current_sales: number;
  previous_sales: number;
  current_units: number;
  previous_units: number;
  missing_cost: boolean;
}

interface TrendDataPoint {
  date: string;
  sales: number;
}

interface TrendResponse {
  current: TrendDataPoint[];
  previous: TrendDataPoint[];
}

export interface VendingStockData {
  device_code: string;
  device_name: string;
  aisle_code: string | null;
  goods_name: string | null;
  curr_stock: number;
  max_stock: number;
  price: number;
  measurement: string | null;
  status: number | null;
  updated_at: string | null;
}

export interface FailedVendData {
  device_code: string;
  device_name: string;
  goods_name: string | null;
  aisle_code: string | null;
  failed_count: number;
  failed_value: number;
  last_failure_at: string | null;
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

// Hook to get the vending sales trend
export const useVendingSalesTrend = () => {
  const { dateRanges, selectedDevices, comparisonParams } = useVendingParams();
  const selectedPeriod = useDashboardStore((state) => state.selectedPeriod);
  const granularity = getGranularityForPeriod(selectedPeriod);

  return useQuery({
    queryKey: ['vending-sales-trend', dateRanges, selectedDevices, granularity],
    queryFn: async () => {
      const response = await api.get<TrendResponse>('/vending/sales-trend', {
        params: { ...comparisonParams, granularity },
      });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get current stock levels per machine
export const useVendingStockLevels = () => {
  const selectedDevices = useVendingStore((state) => state.selectedDevices);

  return useQuery({
    queryKey: ['vending-stock-levels', selectedDevices],
    queryFn: async () => {
      const response = await api.get<VendingStockData[]>('/vending/stock-levels', {
        params: { device_codes: selectedDevices },
      });
      return response.data;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes (stock changes less frequently)
  });
};

// Hook to get failed vends
export const useFailedVends = () => {
  const { dateRanges, selectedDevices } = useVendingParams();

  return useQuery({
    queryKey: ['vending-failed-vends', dateRanges, selectedDevices],
    queryFn: async () => {
      const params = {
        start_date: formatDateForAPI(dateRanges.current.start),
        end_date: formatDateForAPI(dateRanges.current.end),
        device_codes: selectedDevices,
        limit: 25,
      };

      const response = await api.get<FailedVendData[]>('/vending/failed-vends', { params });
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// Hook to get all vending dashboard data
export const useVendingData = () => {
  const selectedPeriod = useDashboardStore((state) => state.selectedPeriod);

  const kpiData = useVendingKPIs();
  const salesByMachine = useSalesByMachine();
  const topProducts = useVendingTopProducts();
  const salesTrend = useVendingSalesTrend();
  const stockLevels = useVendingStockLevels();
  const failedVends = useFailedVends();

  return {
    // Data
    kpiData: kpiData.data,
    salesByMachine: salesByMachine.data,
    topProducts: topProducts.data,
    salesTrend: salesTrend.data,
    stockLevels: stockLevels.data,
    failedVends: failedVends.data,

    // Loading states
    isLoading:
      kpiData.isLoading ||
      salesByMachine.isLoading ||
      topProducts.isLoading ||
      salesTrend.isLoading ||
      stockLevels.isLoading ||
      failedVends.isLoading,

    // Error states
    error:
      kpiData.error ||
      salesByMachine.error ||
      topProducts.error ||
      salesTrend.error ||
      stockLevels.error ||
      failedVends.error,

    // Refetch all
    refetchAll: () => {
      kpiData.refetch();
      salesByMachine.refetch();
      topProducts.refetch();
      salesTrend.refetch();
      stockLevels.refetch();
      failedVends.refetch();
    },

    // Labels
    periodLabel: getPeriodLabel(selectedPeriod),
    comparisonLabel: getComparisonLabel(selectedPeriod),
  };
};
