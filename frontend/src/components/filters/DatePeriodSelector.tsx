import React, { useState } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { PeriodType } from '../../utils/dateCalculations';
import { getPeriodLabel, formatDateRangeLabel, calculatePeriodDateRanges } from '../../utils/dateCalculations';
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

export const DatePeriodSelector: React.FC = () => {
  const selectedPeriod = useDashboardStore((state) => state.selectedPeriod);
  const customDateRange = useDashboardStore((state) => state.customDateRange);
  const dateRanges = useDashboardStore((state) => state.dateRanges);
  const setPeriod = useDashboardStore((state) => state.setPeriod);
  const setCustomDates = useDashboardStore((state) => state.setCustomDates);

  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date | null>(null);
  const [tempEndDate, setTempEndDate] = useState<Date | null>(null);
  const [selectedInput, setSelectedInput] = useState<'start' | 'end'>('start');

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

  const handleDateSelect = (dateStr: string) => {
    const selectedDate = new Date(dateStr);

    if (selectedInput === 'start') {
      setTempStartDate(selectedDate);
      // If end date is before start date, clear end date
      if (tempEndDate && selectedDate > tempEndDate) {
        setTempEndDate(null);
      }
      // Auto-switch to end date selection
      setSelectedInput('end');
    } else {
      // Only allow selecting end date if it's after start date
      if (tempStartDate && selectedDate >= tempStartDate) {
        setTempEndDate(selectedDate);
      } else if (!tempStartDate) {
        setTempStartDate(selectedDate);
        setSelectedInput('end');
      }
    }
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
    setSelectedInput('start');
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-400 mr-2">Period:</span>
      <div className="flex flex-wrap gap-2 items-center relative">
        {PERIODS.map((period) => {
          const dateRangeText = getDateRangeText(period.value);
          return (
            <button
              key={period.value}
              onClick={() => handlePeriodClick(period.value)}
              className={`
                px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200
                ${
                  selectedPeriod === period.value
                    ? 'bg-gradient-to-r from-[#00d2ff] to-[#3a47d5] text-white shadow-lg'
                    : 'bg-[#1c1e26] text-white hover:bg-[#2e303d]'
                }
              `}
              title={getPeriodLabel(period.value)}
            >
              <div className="flex flex-col items-center gap-0.5">
                <span>{period.label}</span>
                {dateRangeText && selectedPeriod === period.value && (
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
        )}
      </div>
    </div>
  );
};
