import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Download } from 'lucide-react';
import { getCategoryColor } from '../../constants/colors';
import { formatCurrency } from '../../utils/dateCalculations';
import { exportChartAsImage } from '../../utils/chartExport';
import { useChartDimensions } from '../../hooks/useChartDimensions';

interface CategoryData {
  category: string;
  total_sales: number;
  color?: string;
}

interface SalesByCategoryPieProps {
  data: CategoryData[];
  isLoading?: boolean;
}

export const SalesByCategoryPie: React.FC<SalesByCategoryPieProps> = ({
  data,
  isLoading = false,
}) => {
  const dims = useChartDimensions();

  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4 sm:p-6 h-[280px] sm:h-[320px] lg:h-[350px]">
        <h3 className="text-lg font-bold text-white mb-4">Sales by Category</h3>
        <div className="flex items-center justify-center h-[280px]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4 sm:p-6 h-[280px] sm:h-[320px] lg:h-[350px]">
        <h3 className="text-lg font-bold text-white mb-4">Sales by Category</h3>
        <div className="flex items-center justify-center h-[280px] text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Calculate total and percentages
  const total = data.reduce((sum, item) => sum + item.total_sales, 0);
  const chartData = data.map((item) => ({
    name: item.category,
    value: item.total_sales,
    percentage: ((item.total_sales / total) * 100).toFixed(1),
    color: getCategoryColor(item.category),
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold">{data.name}</p>
          <p className="text-[#00d2ff] font-bold">{formatCurrency(data.value)}</p>
          <p className="text-gray-400 text-sm">{data.percentage}%</p>
        </div>
      );
    }
    return null;
  };

  const handleExport = () => {
    exportChartAsImage('sales-by-category-chart', 'sales-by-category');
  };

  const renderPieLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, index } = props;
    if (percent < 0.02) return null;

    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 30;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    const entry = chartData[index];
    const displayName = entry?.name || `Item ${index + 1}`;
    const shortName = displayName.length > 18 ? `${displayName.slice(0, 15)}...` : displayName;
    const percentText = `${(percent * 100).toFixed(1)}%`;

    return (
      <g>
        <text
          x={x}
          y={y - 8}
          fill="#f3f4f6"
          textAnchor={x > cx ? 'start' : 'end'}
          dominantBaseline="central"
          fontSize={11}
          fontWeight={600}
        >
          {shortName}
        </text>
        <text
          x={x}
          y={y + 8}
          fill="#9ca3af"
          textAnchor={x > cx ? 'start' : 'end'}
          dominantBaseline="central"
          fontSize={10}
        >
          {formatCurrency(entry.value)} ({percentText})
        </text>
      </g>
    );
  };

  return (
    <div id="sales-by-category-chart" className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4 sm:p-6 h-[280px] sm:h-[350px] lg:h-[420px]">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold text-white">Sales by Category</h3>
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
        <PieChart margin={dims.pieMargin}>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            outerRadius={dims.outerRadius}
            innerRadius={dims.innerRadius}
            label={dims.showPieLabels ? renderPieLabel : false}
            labelLine={dims.showPieLabels ? { stroke: '#6b7280', strokeWidth: 1 } : false}
            dataKey="value"
            isAnimationActive={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
