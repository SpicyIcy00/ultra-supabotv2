import React, { useState } from 'react';
import { DayOfWeekPatterns } from '../components/charts/DayOfWeekPatterns';
import { ProductCombosTable } from '../components/tables/ProductCombosTable';
import { SalesAnomaliesList } from '../components/lists/SalesAnomaliesList';
import { StoreComparisonV2 } from '../components/analytics/StoreComparisonV2';
import { DatePeriodSelector } from '../components/filters/DatePeriodSelector';
import {
  useDayOfWeekPatterns,
  useProductCombos,
  useSalesAnomalies,
} from '../hooks/useDashboardData';
import { useDashboardStore } from '../stores/dashboardStore';

type TabType = 'store-comparison' | 'day-patterns' | 'product-combos' | 'anomalies';

export const AnalyticsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('store-comparison');

  const dateRanges = useDashboardStore((state) => state.dateRanges);

  const dayOfWeekPatterns = useDayOfWeekPatterns(dateRanges.current.start, dateRanges.current.end);
  const productCombos = useProductCombos(dateRanges.current.start, dateRanges.current.end);
  const salesAnomalies = useSalesAnomalies();

  const tabs = [
    {
      id: 'store-comparison' as TabType,
      label: 'Store Comparison',
      description: 'Compare performance across all stores',
    },
    {
      id: 'day-patterns' as TabType,
      label: 'Day of Week Patterns',
      description: 'Sales patterns by day of week',
    },
    {
      id: 'product-combos' as TabType,
      label: 'Product Combinations',
      description: 'Products frequently bought together',
    },
    {
      id: 'anomalies' as TabType,
      label: 'Anomalies & Alerts',
      description: 'Detect unusual sales patterns',
    },
  ];

  const getLoadingState = () => {
    switch (activeTab) {
      case 'day-patterns':
        return dayOfWeekPatterns.isLoading;
      case 'product-combos':
        return productCombos.isLoading;
      case 'anomalies':
        return salesAnomalies.isLoading;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-[#0e1117]">
      <div className="max-w-[1920px] mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1 sm:mb-2">Advanced Analytics</h1>
          <p className="text-sm sm:text-base text-gray-400">
            Deep dive into your business metrics and insights
          </p>
        </div>

        {/* Filters - same layout as Dashboard */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 sm:p-4">
          <DatePeriodSelector />
        </div>

        {/* Tabs */}
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-0 sm:min-w-[160px] px-3 py-3 sm:px-6 sm:py-4 text-left border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:bg-[#252833]'
                }`}
              >
                <div className="font-semibold text-xs sm:text-sm">{tab.label}</div>
                <div className="text-xs mt-1 opacity-75 hidden sm:block">{tab.description}</div>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-3 sm:p-4 lg:p-6">
            {activeTab === 'store-comparison' && (
              <StoreComparisonV2 />
            )}

            {activeTab === 'day-patterns' && (
              <DayOfWeekPatterns
                data={dayOfWeekPatterns.data?.data || []}
                isLoading={getLoadingState()}
              />
            )}

            {activeTab === 'product-combos' && (
              <ProductCombosTable
                data={productCombos.data || []}
                isLoading={getLoadingState()}
              />
            )}

            {activeTab === 'anomalies' && (
              <SalesAnomaliesList
                data={salesAnomalies.data || []}
                isLoading={getLoadingState()}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm py-4">
          <p>Last updated: {new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
