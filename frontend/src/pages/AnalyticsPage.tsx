import React, { useState } from 'react';
import { DayOfWeekPatterns } from '../components/charts/DayOfWeekPatterns';
import { ProductCombosTable } from '../components/tables/ProductCombosTable';
import { SalesAnomaliesList } from '../components/lists/SalesAnomaliesList';
import { StoreDrilldown } from '../components/analytics/StoreDrilldown';
import { StoreComparisonV2 } from '../components/analytics/StoreComparisonV2';
import { DatePeriodSelector } from '../components/filters/DatePeriodSelector';
import {
  useStoreComparison,
  useDayOfWeekPatterns,
  useProductCombos,
  useSalesAnomalies,
} from '../hooks/useDashboardData';

type TabType = 'store-comparison' | 'store-drilldown' | 'day-patterns' | 'product-combos' | 'anomalies';

export const AnalyticsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('store-comparison');

  const storeComparison = useStoreComparison();
  const dayOfWeekPatterns = useDayOfWeekPatterns();
  const productCombos = useProductCombos();
  const salesAnomalies = useSalesAnomalies();

  // Extract unique stores from store comparison data
  const stores = React.useMemo(() => {
    if (!storeComparison.data) return [];
    return storeComparison.data
      .map((store, index) => ({ id: index + 1, name: store.store_name }))
      .filter(store => !['Aji Ichiban Food Products', 'AJI Disposal', 'Aji Packing', 'Test stoee', 'AJI PINA', 'Digital Store', 'AJI CMG', 'AJI BARN', 'AJI ONLINE'].includes(store.name));
  }, [storeComparison.data]);

  const tabs = [
    {
      id: 'store-comparison' as TabType,
      label: 'Store Comparison',
      description: 'Compare performance across all stores',
    },
    {
      id: 'store-drilldown' as TabType,
      label: 'Store Drilldown',
      description: 'Deep dive into store performance',
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
      case 'store-comparison':
        return storeComparison.isLoading;
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
    <div className="min-h-screen bg-[#0e1117] p-6">
      <div className="max-w-[1920px] mx-auto space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Advanced Analytics</h1>
          <p className="text-gray-400">
            Deep dive into your business metrics and insights
          </p>
        </div>

        {/* Date Filter for applicable tabs */}
        {(activeTab === 'store-drilldown' || activeTab === 'product-combos') && (
          <div className="flex items-center gap-4 bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4">
            <DatePeriodSelector />
          </div>
        )}

        {/* Tabs */}
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[200px] px-6 py-4 text-left border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:bg-[#252833]'
                }`}
              >
                <div className="font-semibold text-sm">{tab.label}</div>
                <div className="text-xs mt-1 opacity-75">{tab.description}</div>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
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

            {activeTab === 'store-drilldown' && (
              <StoreDrilldown stores={stores} />
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
