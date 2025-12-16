/**
 * Hourly Sales Bar Chart
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
} from 'recharts';
import type { SalesByHour } from '../../types/analytics';

interface HourlySalesChartProps {
  data: SalesByHour[];
  isLoading?: boolean;
}

export function HourlySalesChart({ data, isLoading }: HourlySalesChartProps) {
  if (isLoading) {
    return (
      <div className="w-full h-80 flex items-center justify-center bg-gray-800/50 rounded-lg animate-pulse">
        <div className="text-gray-400">Loading chart...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center bg-gray-800/50 rounded-lg">
        <div className="text-gray-400">No data available</div>
      </div>
    );
  }

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00d2ff" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3a47d5" stopOpacity={0.8} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="hour_label"
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
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
            }}
            formatter={(value: number) => [
              `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
              'Sales',
            ]}
            labelFormatter={(label) => `Hour: ${label}`}
          />
          <Legend
            wrapperStyle={{ color: '#9CA3AF' }}
            iconType="square"
          />
          <Bar
            dataKey="total_sales"
            fill="url(#salesGradient)"
            radius={[8, 8, 0, 0]}
            name="Total Sales"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
