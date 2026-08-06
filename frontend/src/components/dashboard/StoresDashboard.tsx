import React from 'react';
import { DatePeriodSelector } from '../filters/DatePeriodSelector';
import { StoreSelector } from '../filters/StoreSelector';
import { KPICard } from '../KPICard';
import { SalesByCategoryPie } from '../charts/SalesByCategoryPie';
import { InventoryByCategoryPie } from '../charts/InventoryByCategoryPie';
import { SalesPerStoreBar } from '../charts/SalesPerStoreBar';
import { TopProductsTable } from '../tables/TopProductsTable';
import { SalesTrendLine } from '../charts/SalesTrendLine';
import { TopCategoriesTable } from '../tables/TopCategoriesTable';
import { SalesPerHourBar } from '../charts/SalesPerHourBar';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useDashboardStore } from '../../stores/dashboardStore';
import { formatCurrency, formatNumber, getGranularityForPeriod } from '../../utils/dateCalculations';

/**
 * StoreHub retail-store dashboard — the "Stores" tab.
 */
export const StoresDashboard: React.FC = () => {
  const selectedPeriod = useDashboardStore((state) => state.selectedPeriod);
  const {
    kpiData,
    salesByCategory,
    inventoryByCategory,
    salesByStore,
    topProducts,
    salesTrend,
    topCategories,
    salesByHour,
    isLoading,
    error,
    refetchAll,
    periodLabel,
  } = useDashboardData();

  const granularity = getGranularityForPeriod(selectedPeriod);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ROW 1: FILTERS & SELECTORS */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 sm:p-4">
        <DatePeriodSelector />
        <div className="w-px h-8 bg-[#2e303d] hidden sm:block" /> {/* Divider - hidden on mobile */}
        <StoreSelector />
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-red-400 text-xl">⚠️</span>
            <div>
              <p className="text-red-400 font-semibold">Failed to load dashboard data</p>
              <p className="text-red-300 text-sm">Please check your connection and try again</p>
            </div>
          </div>
          <button
            onClick={refetchAll}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ROW 2: KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <KPICard
          title="Total Sales"
          value={kpiData ? formatCurrency(kpiData.current.total_sales) : '₱0'}
          currentValue={kpiData?.current.total_sales || 0}
          previousValue={kpiData?.previous.total_sales || 0}
          isLoading={isLoading}
        />
        <KPICard
          title="Total Profit"
          value={kpiData ? formatCurrency(kpiData.current.total_profit) : '₱0'}
          currentValue={kpiData?.current.total_profit || 0}
          previousValue={kpiData?.previous.total_profit || 0}
          isLoading={isLoading}
        />
        <KPICard
          title="Transactions"
          value={kpiData ? formatNumber(kpiData.current.transactions) : '0'}
          currentValue={kpiData?.current.transactions || 0}
          previousValue={kpiData?.previous.transactions || 0}
          isLoading={isLoading}
        />
        <KPICard
          title="Avg Transaction Value"
          value={kpiData ? formatCurrency(kpiData.current.avg_transaction_value) : '₱0'}
          currentValue={kpiData?.current.avg_transaction_value || 0}
          previousValue={kpiData?.previous.avg_transaction_value || 0}
          isLoading={isLoading}
        />
      </div>

      {/* ROW 3: THREE CHARTS - Sales by Category, Inventory by Category, Sales per Store */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SalesByCategoryPie
          data={salesByCategory || []}
          isLoading={isLoading}
        />
        <InventoryByCategoryPie
          data={inventoryByCategory || []}
          isLoading={isLoading}
        />
        <SalesPerStoreBar
          data={salesByStore || []}
          isLoading={isLoading}
        />
      </div>

      {/* ROW 4: TWO COMPONENTS - Top Products Table, Top Categories Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopProductsTable
          data={topProducts || []}
          isLoading={isLoading}
        />
        <TopCategoriesTable
          data={topCategories || []}
          isLoading={isLoading}
        />
      </div>

      {/* ROW 5: TWO COMPONENTS - Sales per Hour, Sales Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SalesPerHourBar
          data={salesByHour || []}
          isLoading={isLoading}
        />
        <SalesTrendLine
          currentData={salesTrend?.current || []}
          previousData={salesTrend?.previous || []}
          periodLabel={periodLabel}
          comparisonLabel={`Same Period Last ${selectedPeriod === 'TODAY' || selectedPeriod === 'YESTERDAY' || selectedPeriod === 'WTD' ? 'Week' : 'Month'}`}
          granularity={granularity}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
