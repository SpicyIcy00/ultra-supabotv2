import React from 'react';
import { THEME_COLORS } from '../constants/colors';
import { formatPercentage, isNewMetric } from '../utils/dateCalculations';

interface KPICardProps {
  icon: string;
  title: string;
  value: string;
  currentValue: number;
  previousValue: number;
  comparisonLabel: string;
  isLoading?: boolean;
}

export const KPICard: React.FC<KPICardProps> = ({
  icon,
  title,
  value,
  currentValue,
  previousValue,
  comparisonLabel,
  isLoading = false,
}) => {
  const percentageChange = previousValue === 0
    ? (currentValue > 0 ? 100 : 0)
    : ((currentValue - previousValue) / previousValue) * 100;

  const isPositive = percentageChange >= 0;
  const isNew = isNewMetric(previousValue);

  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4 sm:p-5 lg:p-6 min-h-[100px] sm:min-h-[120px] lg:min-h-[140px] animate-pulse">
        <div className="flex flex-col h-full justify-between gap-2">
          <div className="h-4 bg-[#2e303d] rounded w-1/3"></div>
          <div className="h-8 sm:h-10 bg-[#2e303d] rounded w-2/3"></div>
          <div className="h-3 bg-[#2e303d] rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4 sm:p-5 lg:p-6 min-h-[100px] sm:min-h-[120px] lg:min-h-[140px] shadow-md hover:shadow-lg transition-shadow">
      <div className="flex flex-col h-full justify-between gap-1">
        {/* Title */}
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h3 className="text-sm font-medium text-gray-400">{title}</h3>
        </div>

        {/* Main Value */}
        <div className="text-2xl sm:text-3xl lg:text-4xl font-bold truncate" style={{ color: THEME_COLORS.primaryAccent }}>
          {value}
        </div>

        {/* Comparison */}
        <div className="flex items-center gap-2">
          {isNew ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-400">
              New
            </span>
          ) : (
            <span
              className="text-sm font-bold whitespace-nowrap"
              style={{
                color: isPositive ? THEME_COLORS.positiveChange : THEME_COLORS.negativeChange,
              }}
            >
              {formatPercentage(percentageChange)}
            </span>
          )}
          <span className="text-xs text-gray-500">{comparisonLabel}</span>
        </div>
      </div>
    </div>
  );
};
