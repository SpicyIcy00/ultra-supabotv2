/**
 * KPI Metrics Cards
 */
import type { KPIMetrics } from '../types/analytics';

interface KPICardsProps {
  data: KPIMetrics | undefined;
  isLoading: boolean;
}

interface KPICardProps {
  title: string;
  value: string;
  previousValue: string;
  growthPct: number;
  isLoading: boolean;
  icon?: React.ReactNode;
}

function KPICard({
  title,
  value,
  previousValue,
  growthPct,
  isLoading,
  icon,
}: KPICardProps) {
  const isPositive = growthPct >= 0;
  const growthColor = isPositive ? 'text-green-400' : 'text-red-400';
  const bgGradient = isPositive
    ? 'from-green-500/10 to-blue-500/10'
    : 'from-red-500/10 to-orange-500/10';

  if (isLoading) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-1/2 mb-4"></div>
        <div className="h-8 bg-gray-700 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-700 rounded w-1/3"></div>
      </div>
    );
  }

  return (
    <div
      className={`bg-gradient-to-br ${bgGradient} rounded-lg p-6 border border-gray-700 hover:border-blue-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-400 text-sm font-medium">{title}</h3>
        {icon && <div className="text-blue-400">{icon}</div>}
      </div>

      <div className="space-y-2">
        <div className="text-3xl font-bold text-white">{value}</div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">from {previousValue}</span>
          <span
            className={`flex items-center gap-1 font-semibold ${growthColor}`}
          >
            {isPositive ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
                />
              </svg>
            )}
            {Math.abs(growthPct).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export function KPICards({ data, isLoading }: KPICardsProps) {
  const formatCurrency = (value: number) => {
    return `₱${value.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatNumber = (value: number) => {
    return value.toLocaleString('en-PH');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <KPICard
        title="Total Sales"
        value={data ? formatCurrency(data.latest_sales) : '₱0.00'}
        previousValue={
          data ? formatCurrency(data.previous_sales) : '₱0.00'
        }
        growthPct={data?.sales_growth_pct || 0}
        isLoading={isLoading}
        icon={
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
      />

      <KPICard
        title="Transactions"
        value={data ? formatNumber(data.latest_transactions) : '0'}
        previousValue={
          data ? formatNumber(data.previous_transactions) : '0'
        }
        growthPct={data?.transactions_growth_pct || 0}
        isLoading={isLoading}
        icon={
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
        }
      />

      <KPICard
        title="Avg Transaction Value"
        value={
          data
            ? formatCurrency(data.latest_avg_transaction_value)
            : '₱0.00'
        }
        previousValue={
          data
            ? formatCurrency(data.previous_avg_transaction_value)
            : '₱0.00'
        }
        growthPct={data?.avg_transaction_value_growth_pct || 0}
        isLoading={isLoading}
        icon={
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        }
      />

      <KPICard
        title="Growth Rate"
        value={data ? `${data.sales_growth_pct.toFixed(2)}%` : '0%'}
        previousValue="Day-over-Day"
        growthPct={data?.sales_growth_pct || 0}
        isLoading={isLoading}
        icon={
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
        }
      />
    </div>
  );
}
