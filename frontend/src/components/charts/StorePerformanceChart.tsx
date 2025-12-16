/**
 * Store Performance Horizontal Bar Chart
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import type { StorePerformanceItem } from '../../types/analytics';

interface StorePerformanceChartProps {
  data: StorePerformanceItem[];
  isLoading?: boolean;
}

const COLORS = [
  '#00d2ff',
  '#3a47d5',
  '#667eea',
  '#764ba2',
  '#f093fb',
  '#4facfe',
];

export function StorePerformanceChart({
  data,
  isLoading,
}: StorePerformanceChartProps) {
  if (isLoading) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gray-800/50 rounded-lg animate-pulse">
        <div className="text-gray-400">Loading chart...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gray-800/50 rounded-lg">
        <div className="text-gray-400">No data available</div>
      </div>
    );
  }

  // Sort by total_sales descending
  const sortedData = [...data].sort((a, b) => b.total_sales - a.total_sales);

  return (
    <div className="w-full h-96">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            type="number"
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}K`}
          />
          <YAxis
            type="category"
            dataKey="store_name"
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            width={90}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#F3F4F6',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'total_sales') {
                return [
                  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                  'Total Sales',
                ];
              }
              if (name === 'transaction_count') {
                return [value.toLocaleString(), 'Transactions'];
              }
              if (name === 'percentage_of_total') {
                return [`${value.toFixed(1)}%`, '% of Total'];
              }
              return [value, name];
            }}
            labelFormatter={(label) => `Store: ${label}`}
          />
          <Legend
            wrapperStyle={{ color: '#9CA3AF' }}
            iconType="square"
          />
          <Bar
            dataKey="total_sales"
            radius={[0, 8, 8, 0]}
            name="Total Sales"
          >
            {sortedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
