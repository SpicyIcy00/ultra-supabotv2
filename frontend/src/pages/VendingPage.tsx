import React from 'react';
import { PullToRefresh } from '../components/mobile/PullToRefresh';
import { DatePeriodSelector } from '../components/filters/DatePeriodSelector';
import { MachineSelector } from '../components/filters/MachineSelector';
import { KPICard } from '../components/KPICard';
import { SalesPerMachineBar } from '../components/charts/SalesPerMachineBar';
import { SalesTrendLine } from '../components/charts/SalesTrendLine';
import { VendingTopProductsTable } from '../components/tables/VendingTopProductsTable';
import { VendingStockTable } from '../components/tables/VendingStockTable';
import { FailedVendsTable } from '../components/tables/FailedVendsTable';
import { useVendingData } from '../hooks/useVendingData';
import { useDashboardStore } from '../stores/dashboardStore';
import { formatCurrency, formatNumber, getGranularityForPeriod } from '../utils/dateCalculations';

export const VendingPage: React.FC = () => {
  const selectedPeriod = useDashboardStore((state) => state.selectedPeriod);
  const {
    kpiData,
    salesByMachine,
    topProducts,
    salesTrend,
    stockLevels,
    failedVends,
    isLoading,
    error,
    refetchAll,
    periodLabel,
  } = useVendingData();

  const granularity = getGranularityForPeriod(selectedPeriod);
  const missingCostUnits = kpiData?.current.missing_cost_units || 0;

  return (
    <PullToRefresh>
    <div className="min-h-screen bg-[#0e1117]">
      <div className="max-w-[1920px] mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1 sm:mb-2">Vending Machines</h1>
          <p className="text-sm sm:text-base text-gray-400">Hello Aji vending performance and stock levels</p>
        </div>

        {/* ROW 1: FILTERS & SELECTORS */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 sm:p-4">
          <DatePeriodSelector />
          <div className="w-px h-8 bg-[#2e303d] hidden sm:block" /> {/* Divider - hidden on mobile */}
          <MachineSelector />
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-red-400 text-xl">⚠️</span>
              <div>
                <p className="text-red-400 font-semibold">Failed to load vending data</p>
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
            title="Units Sold"
            value={kpiData ? formatNumber(kpiData.current.units_sold) : '0'}
            currentValue={kpiData?.current.units_sold || 0}
            previousValue={kpiData?.previous.units_sold || 0}
            isLoading={isLoading}
          />
          <KPICard
            title="Avg Order Value"
            value={kpiData ? formatCurrency(kpiData.current.avg_order_value) : '₱0'}
            currentValue={kpiData?.current.avg_order_value || 0}
            previousValue={kpiData?.previous.avg_order_value || 0}
            isLoading={isLoading}
          />
        </div>

        {/* Missing-cost warning: profit is overstated when Weimi has no purchase cost */}
        {!isLoading && missingCostUnits > 0 && (
          <div className="bg-amber-900/20 border border-amber-500/60 rounded-lg p-3 sm:p-4 flex items-center gap-3">
            <span className="text-amber-400 text-xl">⚠️</span>
            <p className="text-sm text-amber-300">
              <span className="font-semibold text-amber-400">Profit is overstated.</span>{' '}
              {formatNumber(missingCostUnits)} units sold have no purchase cost entered in the Weimi
              backend, so their full price counts as profit.
            </p>
          </div>
        )}

        {/* ROW 3: SALES PER MACHINE + SALES TREND */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SalesPerMachineBar
            data={salesByMachine || []}
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

        {/* ROW 4: TOP PRODUCTS + FAILED VENDS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <VendingTopProductsTable
            data={topProducts || []}
            isLoading={isLoading}
          />
          <FailedVendsTable
            data={failedVends || []}
            isLoading={isLoading}
          />
        </div>

        {/* ROW 5: CURRENT STOCK */}
        <VendingStockTable
          data={stockLevels || []}
          isLoading={isLoading}
        />

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm py-4">
          <p>Last updated: {new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
    </PullToRefresh>
  );
};

export default VendingPage;
