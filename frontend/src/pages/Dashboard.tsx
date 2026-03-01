import React from 'react';
import { PullToRefresh } from '../components/mobile/PullToRefresh';
import { DatePeriodSelector } from '../components/filters/DatePeriodSelector';
import { StoreSelector } from '../components/filters/StoreSelector';
import { KPICard } from '../components/KPICard';
import { SalesByCategoryPie } from '../components/charts/SalesByCategoryPie';
import { InventoryByCategoryPie } from '../components/charts/InventoryByCategoryPie';
import { SalesPerStoreBar } from '../components/charts/SalesPerStoreBar';
import { TopProductsTable } from '../components/tables/TopProductsTable';
import { SalesTrendLine } from '../components/charts/SalesTrendLine';
import { TopCategoriesTable } from '../components/tables/TopCategoriesTable';
import { SalesPerHourBar } from '../components/charts/SalesPerHourBar';
import { useDashboardData } from '../hooks/useDashboardData';
import { useDashboardStore } from '../stores/dashboardStore';
import { formatCurrency, formatNumber, getGranularityForPeriod } from '../utils/dateCalculations';

export const Dashboard: React.FC = () => {
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
    comparisonLabel,
  } = useDashboardData();

  const granularity = getGranularityForPeriod(selectedPeriod);

  return (
    <PullToRefresh>
    <div className="min-h-screen bg-[#0e1117]">
      <div className="max-w-[1920px] mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1 sm:mb-2">Business Intelligence Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-400">Real-time analytics and performance metrics</p>
        </div>

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
            icon=""
            title="Total Sales"
            value={kpiData ? formatCurrency(kpiData.current.total_sales) : '₱0'}
            currentValue={kpiData?.current.total_sales || 0}
            previousValue={kpiData?.previous.total_sales || 0}
            comparisonLabel={comparisonLabel}
            isLoading={isLoading}
          />
          <KPICard
            icon=""
            title="Total Profit"
            value={kpiData ? formatCurrency(kpiData.current.total_profit) : '₱0'}
            currentValue={kpiData?.current.total_profit || 0}
            previousValue={kpiData?.previous.total_profit || 0}
            comparisonLabel={comparisonLabel}
            isLoading={isLoading}
          />
          <KPICard
            icon=""
            title="Transactions"
            value={kpiData ? formatNumber(kpiData.current.transactions) : '0'}
            currentValue={kpiData?.current.transactions || 0}
            previousValue={kpiData?.previous.transactions || 0}
            comparisonLabel={comparisonLabel}
            isLoading={isLoading}
          />
          <KPICard
            icon=""
            title="Avg Transaction Value"
            value={kpiData ? formatCurrency(kpiData.current.avg_transaction_value) : '₱0'}
            currentValue={kpiData?.current.avg_transaction_value || 0}
            previousValue={kpiData?.previous.avg_transaction_value || 0}
            comparisonLabel={comparisonLabel}
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
            comparisonLabel={`Same Period Last ${selectedPeriod === '1D' ? 'Week' : selectedPeriod === 'WTD' ? 'Week' : 'Month'}`}
            granularity={granularity}
            isLoading={isLoading}
          />
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm py-4">
          <p>Last updated: {new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
    </PullToRefresh>
  );
};

export default Dashboard;
