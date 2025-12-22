import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Download } from 'lucide-react';
import { getCategoryColor } from '../../constants/colors';
import { formatCurrency } from '../../utils/dateCalculations';
import { exportChartAsImage } from '../../utils/chartExport';

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
  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
        <h3 className="text-lg font-bold text-white mb-4">Sales by Category</h3>
        <div className="flex items-center justify-center h-[280px]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
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

  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={`legend-${index}`} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs text-gray-300">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const handleExport = () => {
    exportChartAsImage('sales-by-category-chart', 'sales-by-category');
  };

  return (
    <div id="sales-by-category-chart" className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white">Sales by Category</h3>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#2e303d] hover:bg-[#3a3c4a] text-white rounded-lg transition-colors text-sm"
          title="Export as image"
        >
          <Download size={16} />
          Export
        </button>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            labelLine={false}
            label={({ percentage }) => `${percentage}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={renderLegend} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
