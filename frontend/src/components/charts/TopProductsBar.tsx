import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { Download } from 'lucide-react';
import { THEME_COLORS } from '../../constants/colors';
import { formatCurrency, formatPercentage, calculatePercentageChange } from '../../utils/dateCalculations';
import { exportToCSV } from '../../utils/csvExport';

interface ProductData {
  product_name: string;
  current_sales: number;
  previous_sales: number;
}

interface TopProductsBarProps {
  data: ProductData[];
  isLoading?: boolean;
}

export const TopProductsBar: React.FC<TopProductsBarProps> = ({
  data,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
        <h3 className="text-lg font-bold text-white mb-4">📊 Top 10 Products by Sales</h3>
        <div className="flex items-center justify-center h-[280px]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
        <h3 className="text-lg font-bold text-white mb-4">📊 Top 10 Products by Sales</h3>
        <div className="flex items-center justify-center h-[280px] text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Sort by current sales and take top 10
  const chartData = [...data]
    .sort((a, b) => b.current_sales - a.current_sales)
    .slice(0, 10)
    .reverse() // Reverse for horizontal chart (highest at top)
    .map((item) => ({
      ...item,
      percentageChange: calculatePercentageChange(item.current_sales, item.previous_sales),
      // Truncate long product names
      displayName: item.product_name.length > 25
        ? item.product_name.substring(0, 22) + '...'
        : item.product_name,
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 shadow-lg max-w-xs">
          <p className="text-white font-semibold text-sm">{data.product_name}</p>
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

  const handleExport = () => {
    // Prepare CSV data
    const csvData = [...data]
      .sort((a, b) => b.current_sales - a.current_sales)
      .slice(0, 10)
      .map((item, index) => ({
        Rank: index + 1,
        'Product Name': item.product_name,
        'Current Sales': item.current_sales,
        'Previous Sales': item.previous_sales,
        'Change %': calculatePercentageChange(item.current_sales, item.previous_sales),
      }));

    exportToCSV(csvData, 'top-10-products-by-sales');
  };

  return (
    <div id="top-products-chart" className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white">📊 Top 10 Products by Sales</h3>
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
            dataKey="displayName"
            stroke={THEME_COLORS.primaryText}
            tick={{ fill: THEME_COLORS.primaryText, fontSize: 10 }}
            width={120}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
          <Bar
            dataKey="current_sales"
            fill={THEME_COLORS.primaryAccent}
            radius={[0, 4, 4, 0]}
          >
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
