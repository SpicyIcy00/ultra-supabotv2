import React from 'react';
import { DatePeriodSelector } from '../filters/DatePeriodSelector';
import { MachineSelector } from '../filters/MachineSelector';
import { KPICard } from '../KPICard';
import { SalesPerMachineBar } from '../charts/SalesPerMachineBar';
import { SalesPerHourBar } from '../charts/SalesPerHourBar';
import { VendingTopProductsTable } from '../tables/VendingTopProductsTable';
import { VendingTopCategoriesTable } from '../tables/VendingTopCategoriesTable';
import { useVendingData } from '../../hooks/useVendingData';
import { formatCurrency, formatNumber, formatHourLabel } from '../../utils/dateCalculations';

/**
 * Weimi vending dashboard ("Hello Aji") — the "Vending" tab.
 *
 * No profit KPI here: goods_purchase_cost is missing for most vending products,
 * so any profit figure would be badly overstated.
 */
export const VendingDashboard: React.FC = () => {
  const {
    kpiData,
    salesByMachine,
    topProducts,
    topCategories,
    salesByHour,
    isLoading,
    error,
    refetchAll,
  } = useVendingData();

  // The hourly chart takes {hour, hour_label, total_sales}; feed it the
  // per-hour AVERAGE so the bars mean "a typical hour" over the range.
  const hourlyData = (salesByHour || []).map((row) => ({
    hour: row.hour,
    hour_label: formatHourLabel(row.hour),
    total_sales: row.avg_sales,
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
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
          title="Units Sold"
          value={kpiData ? formatNumber(kpiData.current.units_sold) : '0'}
          currentValue={kpiData?.current.units_sold || 0}
          previousValue={kpiData?.previous.units_sold || 0}
          isLoading={isLoading}
        />
        <KPICard
          title="Orders"
          value={kpiData ? formatNumber(kpiData.current.orders) : '0'}
          currentValue={kpiData?.current.orders || 0}
          previousValue={kpiData?.previous.orders || 0}
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

      {/* ROW 3: Sales per Machine, Avg Sales per Hour */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SalesPerMachineBar
          data={salesByMachine || []}
          isLoading={isLoading}
        />
        <SalesPerHourBar
          data={hourlyData}
          title="Avg Sales per Hour"
          allHours
          isLoading={isLoading}
        />
      </div>

      {/* ROW 4: Top products, categories ranked */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VendingTopProductsTable
          data={topProducts || []}
          isLoading={isLoading}
        />
        <VendingTopCategoriesTable
          data={topCategories || []}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
