import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Download } from 'lucide-react';
import { getCategoryColor, THEME_COLORS } from '../../constants/colors';
import { formatCurrency, formatPercentage, calculatePercentageChange } from '../../utils/dateCalculations';
import { exportToCSV } from '../../utils/csvExport';

interface CategoryData {
  category: string;
  current_sales: number;
  previous_sales: number;
  color?: string;
}

interface TopCategoriesBarProps {
  data: CategoryData[];
  isLoading?: boolean;
}

export const TopCategoriesBar: React.FC<TopCategoriesBarProps> = ({
  data,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
        <h3 className="text-lg font-bold text-white mb-4">📑 Top Categories by Sales</h3>
        <div className="flex items-center justify-center h-[280px]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
        <h3 className="text-lg font-bold text-white mb-4">📑 Top Categories by Sales</h3>
        <div className="flex items-center justify-center h-[280px] text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Sort by current sales and reverse for horizontal chart
  const chartData = [...data]
    .sort((a, b) => b.current_sales - a.current_sales)
    .reverse()
    .map((item) => ({
      ...item,
      color: getCategoryColor(item.category),
      percentageChange: calculatePercentageChange(item.current_sales, item.previous_sales),
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: data.color }}
            />
            <p className="text-white font-semibold">{data.category}</p>
          </div>
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

  const renderCustomLabel = (props: any) => {
    const { x, y, width, percentageChange } = props;
    const isPositive = percentageChange >= 0;

    return (
      <g>
        <text
          x={x + width + 50}
          y={y + 10}
          fill={isPositive ? THEME_COLORS.positiveChange : THEME_COLORS.negativeChange}
          fontSize={11}
          fontWeight="bold"
        >
          {formatPercentage(percentageChange)}
        </text>
      </g>
    );
  };

  const CustomYAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const categoryData = chartData.find((d) => d.category === payload.value);
    const color = categoryData?.color || THEME_COLORS.secondaryText;

    return (
      <g transform={`translate(${x},${y})`}>
        <circle cx={-5} cy={0} r={4} fill={color} />
        <text
          x={-15}
          y={0}
          dy={4}
          textAnchor="end"
          fill={THEME_COLORS.primaryText}
          fontSize={10}
        >
          {payload.value}
        </text>
      </g>
    );
  };

  const handleExport = () => {
    // Prepare CSV data
    const csvData = [...data]
      .sort((a, b) => b.current_sales - a.current_sales)
      .map((item) => ({
        Category: item.category,
        'Current Sales': item.current_sales,
        'Previous Sales': item.previous_sales,
        'Change %': calculatePercentageChange(item.current_sales, item.previous_sales),
      }));

    exportToCSV(csvData, 'top-categories-by-sales');
  };

  return (
    <div id="top-categories-chart" className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white">📑 Top Categories by Sales</h3>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#2e303d] hover:bg-[#3a3c4a] text-white rounded-lg transition-colors text-sm"
          title="Export as CSV"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          layout="horizontal"
          margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.gridLines} />
          <XAxis
            type="number"
            stroke={THEME_COLORS.primaryText}
            tick={{ fill: THEME_COLORS.primaryText, fontSize: 10 }}
            tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`}
          />
          <YAxis
            type="category"
            dataKey="category"
            stroke={THEME_COLORS.primaryText}
            tick={<CustomYAxisTick />}
            width={100}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
          <Bar
            dataKey="current_sales"
            radius={[0, 4, 4, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey="percentageChange"
              content={renderCustomLabel}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
