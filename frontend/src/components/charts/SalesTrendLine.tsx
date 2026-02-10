import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Download } from 'lucide-react';
import { THEME_COLORS } from '../../constants/colors';
import { formatCurrency, formatHourLabel } from '../../utils/dateCalculations';
import { exportChartAsImage } from '../../utils/chartExport';
import { useChartDimensions } from '../../hooks/useChartDimensions';

interface TrendData {
  date: string;
  sales: number;
}

interface SalesTrendLineProps {
  currentData: TrendData[];
  previousData: TrendData[];
  periodLabel: string;
  comparisonLabel: string;
  granularity: 'hour' | 'day';
  isLoading?: boolean;
}

export const SalesTrendLine: React.FC<SalesTrendLineProps> = ({
  currentData,
  previousData,
  periodLabel,
  comparisonLabel,
  granularity,
  isLoading = false,
}) => {
  const dims = useChartDimensions();

  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4 sm:p-6 h-[280px] sm:h-[320px] lg:h-[350px]">
        <h3 className="text-sm sm:text-lg font-bold text-white mb-4">Sales Trend - Current vs Previous Period</h3>
        <div className="flex items-center justify-center h-[280px]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!currentData || currentData.length === 0) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4 sm:p-6 h-[280px] sm:h-[320px] lg:h-[350px]">
        <h3 className="text-sm sm:text-lg font-bold text-white mb-4">Sales Trend - Current vs Previous Period</h3>
        <div className="flex items-center justify-center h-[280px] text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Combine current and previous data by index/time bucket
  const chartData = currentData.map((item, index) => {
    const previousItem = previousData[index] || { sales: 0 };

    // Format label based on granularity
    let label = item.date;
    if (granularity === 'hour') {
      // Extract hour from date string or use index as hour
      const hour = new Date(item.date).getHours();
      label = formatHourLabel(hour);
    } else {
      // For daily, format as short date (MM/DD)
      const date = new Date(item.date);
      label = `${date.getMonth() + 1}/${date.getDate()}`;
    }

    return {
      label,
      current: item.sales,
      previous: previousItem.sales,
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-400 text-sm">{entry.name}:</span>
              <span className="text-white font-bold text-sm">
                {formatCurrency(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const handleExport = () => {
    exportChartAsImage('sales-trend-chart', 'sales-trend');
  };

  return (
    <div id="sales-trend-chart" className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4 sm:p-6 h-[280px] sm:h-[320px] lg:h-[350px]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm sm:text-lg font-bold text-white">Sales Trend - Current vs Previous Period</h3>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#2e303d] hover:bg-[#3a3c4a] text-white rounded-lg transition-colors text-sm"
          title="Export as image"
        >
          <Download size={16} />
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>
      <ResponsiveContainer width="100%" height={dims.chartHeight}>
        <LineChart
          data={chartData}
          margin={dims.margin}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.gridLines} />
          <XAxis
            dataKey="label"
            stroke={THEME_COLORS.primaryText}
            tick={{ fill: THEME_COLORS.primaryText, fontSize: dims.fontSize.axis }}
            angle={granularity === 'hour' ? -45 : 0}
            textAnchor={granularity === 'hour' ? 'end' : 'middle'}
            height={granularity === 'hour' ? 60 : 30}
          />
          <YAxis
            stroke={THEME_COLORS.primaryText}
            tick={{ fill: THEME_COLORS.primaryText, fontSize: dims.fontSize.axis }}
            tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '10px' }}
            iconType="line"
            formatter={(value) => (
              <span style={{ color: THEME_COLORS.primaryText, fontSize: dims.isMobile ? '10px' : '12px' }}>
                {value}
              </span>
            )}
          />
          <Line
            type="monotone"
            dataKey="current"
            name={periodLabel}
            stroke={THEME_COLORS.primaryAccent}
            strokeWidth={2}
            dot={{ fill: THEME_COLORS.primaryAccent, r: dims.isMobile ? 2 : 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="previous"
            name={comparisonLabel}
            stroke={THEME_COLORS.negativeChange}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: THEME_COLORS.negativeChange, r: dims.isMobile ? 2 : 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
