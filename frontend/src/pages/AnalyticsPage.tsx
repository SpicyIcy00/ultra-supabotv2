import React, { useState, useMemo } from 'react';
import { DayOfWeekPatterns } from '../components/charts/DayOfWeekPatterns';
import { ProductCombosTable } from '../components/tables/ProductCombosTable';
import { SalesAnomaliesList } from '../components/lists/SalesAnomaliesList';
import { StoreComparisonV2 } from '../components/analytics/StoreComparisonV2';
import { DateRangePicker } from '../components/filters/DateRangePicker';
import {
  useStoreComparison,
  useDayOfWeekPatterns,
  useProductCombos,
  useSalesAnomalies,
} from '../hooks/useDashboardData';
import type { PeriodType } from '../utils/dateCalculations';
import { calculatePeriodDateRanges, getPeriodLabel } from '../utils/dateCalculations';
import { format } from 'date-fns';

type TabType = 'store-comparison' | 'day-patterns' | 'product-combos' | 'anomalies';

const PERIODS: { value: PeriodType; label: string }[] = [
  { value: '1D', label: '1D' },
  { value: 'WTD', label: 'WTD' },
  { value: '7D', label: '7D' },
  { value: 'MTD', label: 'MTD' },
  { value: '30D', label: '30D' },
  { value: '3MTD', label: '3MTD' },
  { value: '90D', label: '90D' },
  { value: '6MTD', label: '6MTD' },
  { value: 'YTD', label: 'YTD' },
  { value: 'CUSTOM', label: 'Custom' },
];

export const AnalyticsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('store-comparison');
  const [dayPatternsPeriod, setDayPatternsPeriod] = useState<PeriodType>('30D');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);

  // Calculate date ranges for day patterns
  const { startDate, endDate, dateRangeLabel } = useMemo(() => {
    const ranges = calculatePeriodDateRanges(
      dayPatternsPeriod,
      customStartDate || undefined,
      customEndDate || undefined
    );

    const formatDate = (d: Date) => format(d, 'MMM d');
    const formatDateFull = (d: Date) => format(d, 'MMM d, yyyy');
    const dateRangeLabel = `${formatDate(ranges.current.start)} - ${formatDateFull(ranges.current.end)}`;

    return {
      startDate: ranges.current.start,
      endDate: ranges.current.end,
      dateRangeLabel,
    };
  }, [dayPatternsPeriod, customStartDate, customEndDate]);

  const storeComparison = useStoreComparison();
  const dayOfWeekPatterns = useDayOfWeekPatterns(startDate, endDate);
  const productCombos = useProductCombos();
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

        {/* Date Filter for day patterns */}
        {activeTab === 'day-patterns' && (
          <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-gray-400">Period:</label>
              <div className="flex flex-wrap gap-2 items-center relative">
                {PERIODS.map((period) => {
                  const getDateRangeText = (period: PeriodType): string => {
                    try {
                      let dateRange;
                      if (period === 'CUSTOM' && customStartDate && customEndDate) {
                        dateRange = calculatePeriodDateRanges(period, customStartDate, customEndDate);
                      } else if (period !== 'CUSTOM') {
                        dateRange = calculatePeriodDateRanges(period);
                      } else {
                        return '';
                      }
                      const startFormatted = format(dateRange.current.start, 'MMM d');
                      const endFormatted = format(dateRange.current.end, 'MMM d, yyyy');
                      return `${startFormatted} - ${endFormatted}`;
                    } catch (error) {
                      return '';
                    }
                  };

                  const dateRangeText = getDateRangeText(period.value);
                  return (
                    <button
                      key={period.value}
                      onClick={() => {
                        if (period.value === 'CUSTOM') {
                          setShowCustomPicker(true);
                        } else {
                          setShowCustomPicker(false);
                        }
                        setDayPatternsPeriod(period.value);
                      }}
                      className={`
                        px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200
                        ${dayPatternsPeriod === period.value
                          ? 'bg-gradient-to-r from-[#00d2ff] to-[#3a47d5] text-white shadow-lg'
                          : 'bg-[#1c1e26] text-white hover:bg-[#2e303d]'
                        }
                      `}
                      title={getPeriodLabel(period.value)}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{period.label}</span>
                        {dateRangeText && dayPatternsPeriod === period.value && (
                          <span className="text-xs opacity-80 font-normal whitespace-nowrap">
                            {dateRangeText}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Custom Date Range Picker */}
                {showCustomPicker && (
                  <div className="absolute top-full left-0 mt-2 z-50">
                    <DateRangePicker
                      startDate={customStartDate}
                      endDate={customEndDate}
                      onRangeSelect={(range) => {
                        setCustomStartDate(range.start);
                        setCustomEndDate(range.end);
                      }}
                      onClear={() => {
                        setCustomStartDate(null);
                        setCustomEndDate(null);
                      }}
                      onApply={() => {
                        if (customStartDate && customEndDate) {
                          setShowCustomPicker(false);
                        }
                      }}
                      onCancel={() => {
                        setShowCustomPicker(false);
                        setCustomStartDate(null);
                        setCustomEndDate(null);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
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
