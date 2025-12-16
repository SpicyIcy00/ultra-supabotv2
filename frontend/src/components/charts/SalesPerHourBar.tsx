import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download } from 'lucide-react';
import { THEME_COLORS } from '../../constants/colors';
import { formatCurrency, formatHourLabel } from '../../utils/dateCalculations';
import { exportChartAsImage } from '../../utils/chartExport';

interface HourlyData {
  hour: number;
  hour_label: string;
  total_sales: number;
}

interface SalesPerHourBarProps {
  data: HourlyData[];
  isLoading?: boolean;
}

export const SalesPerHourBar: React.FC<SalesPerHourBarProps> = ({
  data,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
        <h3 className="text-lg font-bold text-white mb-4">Sales per Hour</h3>
        <div className="flex items-center justify-center h-[280px]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  // Validate data is an array
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
        <h3 className="text-lg font-bold text-white mb-4">Sales per Hour</h3>
        <div className="flex items-center justify-center h-[280px] text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Only show hours 8 AM (8) to 11 PM (23) - 16 hours total
  const businessHours = Array.from({ length: 16 }, (_, i) => i + 8); // 8 to 23
  const chartData = businessHours.map((hour) => {
    const existingData = Array.isArray(data) ? data.find((d) => d.hour === hour) : null;
    return {
      hour,
      hour_label: formatHourLabel(hour),
      total_sales: existingData?.total_sales || 0,
    };
  });

  // Find peak hour
  const peakHour = chartData.reduce((max, item) =>
    item.total_sales > max.total_sales ? item : max
  , chartData[0]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isPeak = data.hour === peakHour.hour;
      return (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold">{data.hour_label}</p>
          <p className="text-[#00d2ff] font-bold">{formatCurrency(data.total_sales)}</p>
          {isPeak && (
            <p className="text-yellow-400 text-xs mt-1">🔥 Peak Hour</p>
          )}
        </div>
      );
    }
    return null;
  };

  const handleExport = () => {
    exportChartAsImage('sales-per-hour-chart', 'sales-per-hour');
  };

  return (
    <div id="sales-per-hour-chart" className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 h-[350px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Sales per Hour</h3>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-400">
            Peak: <span className="text-yellow-400 font-semibold">{peakHour.hour_label}</span>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#2e303d] hover:bg-[#3a3c4a] text-white rounded-lg transition-colors text-sm"
            title="Export as image"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 20, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.gridLines} />
          <XAxis
            dataKey="hour_label"
            stroke={THEME_COLORS.primaryText}
            tick={{ fill: THEME_COLORS.primaryText, fontSize: 9 }}
            angle={-45}
            textAnchor="end"
            height={60}
            interval={1} // Show every hour label
          />
          <YAxis
            stroke={THEME_COLORS.primaryText}
            tick={{ fill: THEME_COLORS.primaryText, fontSize: 10 }}
            tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
          <Bar
            dataKey="total_sales"
            radius={[8, 8, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.hour === peakHour.hour ? '#FFD93D' : THEME_COLORS.primaryAccent}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
