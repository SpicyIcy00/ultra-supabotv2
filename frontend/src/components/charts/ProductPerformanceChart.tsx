/**
 * Product Performance Bar Chart
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
import type { ProductPerformanceItem } from '../../types/analytics';

interface ProductPerformanceChartProps {
  data: ProductPerformanceItem[];
  isLoading?: boolean;
  limit?: number;
}

const COLORS = [
  '#00d2ff',
  '#3a47d5',
  '#667eea',
  '#764ba2',
  '#f093fb',
  '#4facfe',
  '#00f2fe',
  '#4481eb',
  '#04befe',
  '#08e1ae',
];

export function ProductPerformanceChart({
  data,
  isLoading,
  limit = 10,
}: ProductPerformanceChartProps) {
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

  // Get top products by revenue
  const topProducts = [...data]
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      // Truncate long product names
      display_name:
        item.product_name.length > 25
          ? item.product_name.substring(0, 22) + '...'
          : item.product_name,
    }));

  return (
    <div className="w-full h-96">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={topProducts}
          margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="display_name"
            stroke="#9CA3AF"
            style={{ fontSize: '11px' }}
            angle={-45}
            textAnchor="end"
            height={100}
          />
          <YAxis
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}K`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#F3F4F6',
              maxWidth: '300px',
            }}
            formatter={(value: number, name: string, props: any) => {
              if (name === 'total_revenue') {
                return [
                  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
                  'Revenue',
                ];
              }
              return [value, name];
            }}
            labelFormatter={(label, payload) => {
              if (payload && payload[0]) {
                const item = payload[0].payload as ProductPerformanceItem & {
                  display_name: string;
                };
                return (
                  <div className="space-y-1">
                    <div className="font-semibold">{item.product_name}</div>
                    <div className="text-xs text-gray-400">
                      {item.sku && `SKU: ${item.sku}`}
                      {item.category && ` | ${item.category}`}
                    </div>
                    <div className="text-xs text-gray-400">
                      Qty: {item.quantity_sold.toLocaleString()} | Avg: ₱
                      {item.avg_price.toFixed(2)}
                    </div>
                  </div>
                );
              }
              return label;
            }}
          />
          <Legend
            wrapperStyle={{ color: '#9CA3AF' }}
            iconType="square"
          />
          <Bar
            dataKey="total_revenue"
            radius={[8, 8, 0, 0]}
            name="Total Revenue"
          >
            {topProducts.map((entry, index) => (
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
