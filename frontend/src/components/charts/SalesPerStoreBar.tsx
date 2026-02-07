import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download } from 'lucide-react';
import { getStoreColor, THEME_COLORS } from '../../constants/colors';
import { formatCurrency, formatPercentage, calculatePercentageChange } from '../../utils/dateCalculations';
import { exportChartAsImage } from '../../utils/chartExport';

interface StoreData {
  store_name: string;
  current_sales: number;
  previous_sales: number;
  color?: string;
}

interface SalesPerStoreBarProps {
  data: StoreData[];
  isLoading?: boolean;
}

export const SalesPerStoreBar: React.FC<SalesPerStoreBarProps> = ({
  data,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[420px]">
        <h3 className="text-lg font-bold text-white mb-4">Sales per Store</h3>
        <div className="flex items-center justify-center h-[280px]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[420px]">
        <h3 className="text-lg font-bold text-white mb-4">Sales per Store</h3>
        <div className="flex items-center justify-center h-[280px] text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Filter out stores with no data, sort by sales (highest to lowest) and add colors
  const chartData = [...data]
    .filter((item) => item.current_sales > 0 || item.previous_sales > 0)
    .sort((a, b) => b.current_sales - a.current_sales)
    .map((item) => ({
      ...item,
      color: getStoreColor(item.store_name),
      percentageChange: calculatePercentageChange(item.current_sales, item.previous_sales),
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold">{data.store_name}</p>
          <p className="text-[#00d2ff] font-bold">{formatCurrency(data.current_sales)}</p>
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

  // Label above each bar: colored arrow + percentage text (no box)
  const CustomLabel = (props: any) => {
    const { x, y, width, index } = props;
    const item = chartData[index];
    if (!item) return null;

    const pctChange = item.percentageChange;
    const isPositive = pctChange >= 0;
    const color = isPositive ? THEME_COLORS.positiveChange : THEME_COLORS.negativeChange;
    const arrow = isPositive ? '\u2191' : '\u2193';

    return (
      <text
        x={x + width / 2}
        y={y - 8}
        fill={color}
        textAnchor="middle"
        fontSize={11}
        fontWeight="bold"
      >
        {arrow} {formatPercentage(pctChange)}
      </text>
    );
  };

  const handleExport = () => {
    exportChartAsImage('sales-per-store-chart', 'sales-per-store');
  };

  return (
    <div id="sales-per-store-chart" className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[420px]">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold text-white">Sales per Store</h3>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#2e303d] hover:bg-[#3a3c4a] text-white rounded-lg transition-colors text-sm"
          title="Export as image"
        >
          <Download size={16} />
          Export
        </button>
      </div>
      <ResponsiveContainer width="100%" height={370}>
        <BarChart
          data={chartData}
          margin={{ top: 25, right: 30, left: 15, bottom: 10 }}
        >
          <CartesianGrid vertical={true} horizontal={false} stroke={THEME_COLORS.gridLines} />
          <XAxis
            dataKey="store_name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#f3f4f6', fontSize: 12, fontWeight: 500 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
          <Bar
            dataKey="current_sales"
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
  );
};
