/**
 * Daily Trend Line Chart with Cumulative Area
 */
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { DailyTrendItem } from '../../types/analytics';

interface DailyTrendChartProps {
  data: DailyTrendItem[];
  isLoading?: boolean;
  showCumulative?: boolean;
}

export function DailyTrendChart({
  data,
  isLoading,
  showCumulative = true,
}: DailyTrendChartProps) {
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

  const Chart = showCumulative ? AreaChart : LineChart;

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <Chart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <defs>
            <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00d2ff" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#3a47d5" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#667eea" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#764ba2" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            tickFormatter={(date) => {
              const d = new Date(date);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
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
            formatter={(value: number, name: string) => {
              const label =
                name === 'daily_sales'
                  ? 'Daily Sales'
                  : name === 'cumulative_sales'
                  ? 'Cumulative'
                  : 'Transactions';
              return [
                name.includes('sales')
                  ? `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                  : value.toLocaleString(),
                label,
              ];
            }}
            labelFormatter={(label) => {
              const d = new Date(label);
              return d.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
            }}
          />
          <Legend wrapperStyle={{ color: '#9CA3AF' }} iconType="line" />

          {showCumulative ? (
            <>
              <Area
                type="monotone"
                dataKey="daily_sales"
                stroke="#00d2ff"
                strokeWidth={2}
                fill="url(#dailyGradient)"
                name="Daily Sales"
              />
              <Area
                type="monotone"
                dataKey="cumulative_sales"
                stroke="#667eea"
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="url(#cumulativeGradient)"
                name="Cumulative Sales"
              />
            </>
          ) : (
            <Line
              type="monotone"
              dataKey="daily_sales"
              stroke="#00d2ff"
              strokeWidth={3}
              dot={{ fill: '#00d2ff', r: 4 }}
              activeDot={{ r: 6 }}
              name="Daily Sales"
            />
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
