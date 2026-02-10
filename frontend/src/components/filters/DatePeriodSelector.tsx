import React, { useState } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { PeriodType } from '../../utils/dateCalculations';
import { getPeriodLabel, calculatePeriodDateRanges } from '../../utils/dateCalculations';
import { DateRangePicker } from './DateRangePicker';
import { format } from 'date-fns';

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

interface DatePeriodSelectorProps {
  /** Controlled period value. If omitted, reads from dashboard store. */
  period?: PeriodType;
  /** Called when period changes. If omitted, writes to dashboard store. */
  onPeriodChange?: (period: PeriodType) => void;
  /** Controlled custom date range. If omitted, reads from dashboard store. */
  customDateRange?: { start: Date; end: Date } | null;
  /** Called when custom dates are applied. If omitted, writes to dashboard store. */
  onCustomDatesChange?: (start: Date, end: Date) => void;
}

export const DatePeriodSelector: React.FC<DatePeriodSelectorProps> = ({
  period: controlledPeriod,
  onPeriodChange,
  customDateRange: controlledCustomRange,
  onCustomDatesChange,
}) => {
  // Store values (used when not controlled)
  const storePeriod = useDashboardStore((state) => state.selectedPeriod);
  const storeCustomRange = useDashboardStore((state) => state.customDateRange);
  const storeSetPeriod = useDashboardStore((state) => state.setPeriod);
  const storeSetCustomDates = useDashboardStore((state) => state.setCustomDates);

  // Resolve controlled vs store
  const isControlled = controlledPeriod !== undefined;
  const selectedPeriod = isControlled ? controlledPeriod : storePeriod;
  const customDateRange = isControlled ? (controlledCustomRange ?? null) : storeCustomRange;
  const setPeriod = isControlled ? (onPeriodChange ?? (() => {})) : storeSetPeriod;
  const setCustomDates = isControlled
    ? (onCustomDatesChange ?? (() => {}))
    : storeSetCustomDates;

  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date | null>(null);
  const [tempEndDate, setTempEndDate] = useState<Date | null>(null);

  // Helper function to get formatted date range for a period
  const getDateRangeText = (period: PeriodType): string => {
    try {
      let dateRange;
      if (period === 'CUSTOM' && customDateRange) {
        dateRange = calculatePeriodDateRanges(period, customDateRange.start, customDateRange.end);
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

  const handlePeriodClick = (period: PeriodType) => {
    if (period === 'CUSTOM') {
      setShowCustomPicker(true);
      // Initialize with current custom range if exists
      if (customDateRange) {
        setTempStartDate(customDateRange.start);
        setTempEndDate(customDateRange.end);
      } else {
        setTempStartDate(null);
        setTempEndDate(null);
      }
    } else {
      setShowCustomPicker(false);
    }
    setPeriod(period);
  };


  const handleApplyCustomDates = () => {
    if (tempStartDate && tempEndDate) {
      setCustomDates(tempStartDate, tempEndDate);
      setShowCustomPicker(false);
    }
  };

  const handleCancelCustomDates = () => {
    setShowCustomPicker(false);
    setTempStartDate(null);
    setTempEndDate(null);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <span className="text-sm font-medium text-gray-400 sm:mr-2">Period:</span>
      <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center relative">
        {PERIODS.map((period) => {
          const dateRangeText = getDateRangeText(period.value);
          return (
            <button
              key={period.value}
              onClick={() => handlePeriodClick(period.value)}
              className={`
                px-3 py-2 sm:px-6 sm:py-3 rounded-lg font-semibold text-xs sm:text-sm transition-all duration-200
                ${selectedPeriod === period.value
                  ? 'bg-gradient-to-r from-[#00d2ff] to-[#3a47d5] text-white shadow-lg'
                  : 'bg-[#1c1e26] text-white hover:bg-[#2e303d]'
                }
              `}
              title={getPeriodLabel(period.value)}
            >
              <div className="flex flex-col items-center gap-0.5">
                <span>{period.label}</span>
                {dateRangeText && selectedPeriod === period.value && (
                  <span className="text-xs opacity-80 font-normal whitespace-nowrap hidden sm:block">
                    {dateRangeText}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {/* Custom Date Range Picker */}
        {showCustomPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:bg-transparent sm:absolute sm:inset-auto sm:top-full sm:left-0 sm:mt-2">
            <div className="sm:contents">
              <DateRangePicker
                startDate={tempStartDate}
                endDate={tempEndDate}
                onRangeSelect={(range) => {
                  setTempStartDate(range.start);
                  setTempEndDate(range.end);
                }}
                onClear={() => {
                  setTempStartDate(null);
                  setTempEndDate(null);
                }}
                onApply={handleApplyCustomDates}
                onCancel={handleCancelCustomDates}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
