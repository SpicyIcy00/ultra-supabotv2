import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatNumber } from '../../utils/dateCalculations';

interface DayOfWeekData {
  day_of_week: number;
  day_name: string;
  total_sales: number;
  total_profit: number;
  transaction_count: number;
  avg_transaction_value: number;
}

interface DayOfWeekPatternsProps {
  data: DayOfWeekData[];
  isLoading?: boolean;
}

export const DayOfWeekPatterns: React.FC<DayOfWeekPatternsProps> = ({
  data,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-center h-96 text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label, valueFormatter }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#2e303d] border border-[#3e4150] rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium mb-1">{label}</p>
          <p className="text-blue-400 text-sm">
            {valueFormatter(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <div className="space-y-8">
        {/* Sales by Day */}
        <div>
          <h4 className="text-md font-medium text-gray-300 mb-3">Sales by Day</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e303d" />
              <XAxis
                dataKey="day_name"
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => formatCurrency(value)}
              />
              <Tooltip
                content={(props) => (
                  <CustomTooltip {...props} valueFormatter={formatCurrency} />
                )}
              />
              <Bar dataKey="total_sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Transaction Count by Day */}
        <div>
          <h4 className="text-md font-medium text-gray-300 mb-3">
            Transaction Count by Day
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e303d" />
              <XAxis
                dataKey="day_name"
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
              />
              <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
              <Tooltip
                content={(props) => (
                  <CustomTooltip {...props} valueFormatter={formatNumber} />
                )}
              />
              <Bar
                dataKey="transaction_count"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Avg Transaction Value by Day */}
        <div>
          <h4 className="text-md font-medium text-gray-300 mb-3">
            Avg Transaction Value by Day
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e303d" />
              <XAxis
                dataKey="day_name"
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => formatCurrency(value)}
              />
              <Tooltip
                content={(props) => (
                  <CustomTooltip {...props} valueFormatter={formatCurrency} />
                )}
              />
              <Bar
                dataKey="avg_transaction_value"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
