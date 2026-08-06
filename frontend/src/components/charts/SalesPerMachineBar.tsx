import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download } from 'lucide-react';
import { THEME_COLORS } from '../../constants/colors';
import { formatCurrency, formatNumber, formatPercentage, calculatePercentageChange } from '../../utils/dateCalculations';
import { exportChartAsImage } from '../../utils/chartExport';
import { useChartDimensions } from '../../hooks/useChartDimensions';
import { useVendingStore } from '../../stores/vendingStore';
import type { MachineSalesData } from '../../hooks/useVendingData';

interface SalesPerMachineBarProps {
  data: MachineSalesData[];
  isLoading?: boolean;
}

type ViewMode = 'total' | 'daily';

const CARD_CLASS = 'bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4 sm:p-6 flex flex-col h-[280px] sm:h-[350px] lg:h-[420px]';

export const SalesPerMachineBar: React.FC<SalesPerMachineBarProps> = ({
  data,
  isLoading = false,
}) => {
  const dims = useChartDimensions();
  const getDeviceColor = useVendingStore((state) => state.getDeviceColor);
  const [view, setView] = useState<ViewMode>('total');

  const isDaily = view === 'daily';
  const heading = isDaily ? 'Avg Daily Sales per Machine' : 'Sales per Machine';

  const viewToggle = (
    <div className="flex items-center rounded-lg bg-[#0e1117] border border-[#2e303d] p-0.5">
      {([
        { id: 'total' as ViewMode, label: 'Total' },
        { id: 'daily' as ViewMode, label: 'Avg/day' },
      ]).map((option) => (
        <button
          key={option.id}
          onClick={() => setView(option.id)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            view === option.id
              ? 'bg-[#2e303d] text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className={CARD_CLASS}>
        <h3 className="text-lg font-bold text-white mb-4">{heading}</h3>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={CARD_CLASS}>
        <h3 className="text-lg font-bold text-white mb-4">{heading}</h3>
        <div className="flex-1 flex items-center justify-center text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Filter out machines with no data, sort by the active measure and add colors
  const chartData = [...data]
    .filter((item) => item.current_sales > 0 || item.previous_sales > 0)
    .map((item) => {
      const current = isDaily ? item.current_avg_daily_sales : item.current_sales;
      const previous = isDaily ? item.previous_avg_daily_sales : item.previous_sales;
      const units = isDaily ? item.current_avg_daily_units : item.current_units;

      return {
        ...item,
        value: current,
        previousValue: previous,
        units,
        color: getDeviceColor(item.device_code),
        percentageChange: calculatePercentageChange(current, previous),
      };
    })
    .sort((a, b) => b.value - a.value);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold">{data.device_name}</p>
          <p className="text-[#00d2ff] font-bold">
            {formatCurrency(data.value)}{isDaily ? ' / day' : ''}
          </p>
          <p className="text-gray-400 text-sm">
            {isDaily
              ? `${data.units.toFixed(1)} units/day over ${formatNumber(data.current_days)} active days`
              : `${formatNumber(data.units)} units`}
          </p>
          <p
            className="text-sm font-semibold"
            style={{
              color: data.percentageChange >= 0
                ? THEME_COLORS.positiveChange
                : THEME_COLORS.negativeChange,
            }}
          >
            {formatPercentage(data.percentageChange)} vs previous period
          </p>
        </div>
      );
    }
    return null;
  };

  // Label above each bar: colored percentage text (no box)
  const CustomLabel = (props: any) => {
    const { x, y, width, index } = props;
    const item = chartData[index];
    if (!item) return null;

    const pctChange = item.percentageChange;
    const isPositive = pctChange >= 0;
    const color = isPositive ? THEME_COLORS.positiveChange : THEME_COLORS.negativeChange;

    return (
      <text
        x={x + width / 2}
        y={y - 8}
        fill={color}
        textAnchor="middle"
        fontSize={dims.fontSize.label}
        fontWeight="bold"
      >
        {formatPercentage(pctChange)}
      </text>
    );
  };

  // Daily averages are far smaller than period totals — a "₱0k" axis is useless
  const peak = chartData.length ? chartData[0].value : 0;
  const formatAxis = (value: number) =>
    peak >= 10000 ? `₱${(value / 1000).toFixed(0)}k` : `₱${Math.round(value)}`;

  const handleExport = () => {
    exportChartAsImage('sales-per-machine-chart', isDaily ? 'avg-daily-sales-per-machine' : 'sales-per-machine');
  };

  return (
    <div id="sales-per-machine-chart" className={CARD_CLASS}>
      <div className="flex justify-between items-center mb-2 shrink-0 gap-2">
        <h3 className="text-lg font-bold text-white truncate">{heading}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {viewToggle}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#2e303d] hover:bg-[#3a3c4a] text-white rounded-lg transition-colors text-sm"
            title="Export as image"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 20, right: dims.margin.right, left: dims.margin.left, bottom: dims.isMobile ? 50 : 10 }}
        >
          <CartesianGrid vertical={true} horizontal={false} stroke={THEME_COLORS.gridLines} />
          <XAxis
            dataKey="device_name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#f3f4f6', fontSize: dims.fontSize.axis, fontWeight: 500 }}
            interval={0}
            angle={dims.isMobile ? -45 : 0}
            textAnchor={dims.isMobile ? 'end' : 'middle'}
            height={dims.isMobile ? 60 : 30}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={dims.isMobile ? 40 : 55}
            tick={{ fill: '#9ca3af', fontSize: dims.fontSize.axis }}
            tickFormatter={formatAxis}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
          <Bar
            dataKey="value"
            label={<CustomLabel />}
            radius={[6, 6, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
};
