import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download } from 'lucide-react';
import { THEME_COLORS } from '../../constants/colors';
import { formatCurrency, formatHourLabel } from '../../utils/dateCalculations';
import { exportChartAsImage } from '../../utils/chartExport';
import { useChartDimensions } from '../../hooks/useChartDimensions';

interface HourlyData {
  hour: number;
  hour_label: string;
  total_sales: number;
}

interface SalesPerHourBarProps {
  data: HourlyData[];
  isLoading?: boolean;
  /** Heading + export filename. Vending passes "Avg Sales per Hour". */
  title?: string;
  /** Stores open 8am-11pm; vending machines run 24/7. */
  allHours?: boolean;
}

// Vending sits beside SalesPerMachineBar, so both cards must be the same height.
const cardClass = (allHours: boolean) =>
  `bg-[#1c1e26] border border-[#2e303d] rounded-lg p-4 sm:p-6 flex flex-col ${
    allHours ? 'h-[280px] sm:h-[350px] lg:h-[420px]' : 'h-[320px] sm:h-[360px] lg:h-[400px]'
  }`;

export const SalesPerHourBar: React.FC<SalesPerHourBarProps> = ({
  data,
  isLoading = false,
  title = 'Sales per Hour',
  allHours = false,
}) => {
  const dims = useChartDimensions();
  const CARD_CLASS = cardClass(allHours);

  if (isLoading) {
    return (
      <div className={CARD_CLASS}>
        <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  // Validate data is an array
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className={CARD_CLASS}>
        <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
        <div className="flex-1 flex items-center justify-center text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Stores: 8 AM to 11 PM. Vending: all 24 hours — machines never close, and
  // clipping the overnight hours would hide half their volume.
  const hours = allHours
    ? Array.from({ length: 24 }, (_, i) => i)
    : Array.from({ length: 16 }, (_, i) => i + 8);
  const chartData = hours.map((hour) => {
    const existingData = Array.isArray(data) ? data.find((d) => d.hour === hour) : null;
    return {
      hour,
      hour_label: formatHourLabel(hour),
      // 24 bars can't carry "10:00 PM" labels — "10p" keeps the axis flat and
      // frees the gutter the angled labels were eating.
      short_label: `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'a' : 'p'}`,
      total_sales: existingData?.total_sales || 0,
    };
  });

  // Find peak hour
  const peakHour = chartData.reduce((max, item) =>
    item.total_sales > max.total_sales ? item : max
  , chartData[0]);

  // Hourly averages land in the hundreds, where a "₱0k" axis is useless —
  // only switch to thousands once the numbers are actually that big.
  const useThousands = peakHour.total_sales >= 10000;
  const formatAxis = (value: number) =>
    useThousands ? `₱${(value / 1000).toFixed(0)}k` : `₱${Math.round(value)}`;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isPeak = data.hour === peakHour.hour;
      return (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold">{data.hour_label}</p>
          <p className="text-white font-bold">{formatCurrency(data.total_sales)}</p>
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
    <div id="sales-per-hour-chart" className={CARD_CLASS}>
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h3 className="text-lg font-bold text-white">{title}</h3>
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
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 20, right: dims.margin.right, left: dims.margin.left, bottom: allHours ? 10 : (dims.isMobile ? 50 : 70) }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={THEME_COLORS.gridLines} />
          <XAxis
            dataKey={allHours ? 'short_label' : 'hour_label'}
            stroke={THEME_COLORS.primaryText}
            tick={{ fill: THEME_COLORS.primaryText, fontSize: dims.fontSize.axis }}
            angle={allHours ? 0 : -45}
            textAnchor={allHours ? 'middle' : 'end'}
            height={allHours ? 30 : (dims.isMobile ? 50 : 70)}
            interval={allHours ? (dims.isMobile ? 3 : 1) : (dims.isMobile ? 2 : 1)}
          />
          <YAxis
            stroke={THEME_COLORS.primaryText}
            tick={{ fill: THEME_COLORS.primaryText, fontSize: dims.fontSize.axis }}
            tickFormatter={formatAxis}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
          <Bar
            dataKey="total_sales"
            radius={[8, 8, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.hour === peakHour.hour ? '#FFD93D' : '#3b82f6'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
};
