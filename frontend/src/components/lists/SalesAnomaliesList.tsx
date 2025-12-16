import React from 'react';
import { formatCurrency } from '../../utils/dateCalculations';

interface SalesAnomalyData {
  product_name: string;
  store_name: string;
  avg_7_day_sales: number;
  avg_30_day_sales: number;
  pct_change: number;
  severity: 'Critical' | 'Warning';
}

interface SalesAnomaliesListProps {
  data: SalesAnomalyData[];
  isLoading?: boolean;
}

export const SalesAnomaliesList: React.FC<SalesAnomaliesListProps> = ({
  data,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div>

      {!data || data.length === 0 ? (
        <div className="bg-green-900/20 border border-green-500 rounded-lg p-4 flex items-center gap-3">
          <span className="text-green-400 text-xl">✓</span>
          <div>
            <p className="text-green-400 font-medium">No anomalies detected</p>
            <p className="text-green-300 text-sm">
              All products are performing within normal ranges
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((anomaly, index) => (
            <div
              key={`${anomaly.product_name}-${anomaly.store_name}-${index}`}
              className={`border rounded-lg p-4 ${
                anomaly.severity === 'Critical'
                  ? 'bg-red-900/20 border-red-500'
                  : 'bg-yellow-900/20 border-yellow-500'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        anomaly.severity === 'Critical'
                          ? 'bg-red-500 text-white'
                          : 'bg-yellow-500 text-gray-900'
                      }`}
                    >
                      {anomaly.severity}
                    </span>
                    <h4 className="text-white font-medium truncate">
                      {anomaly.product_name}
                    </h4>
                  </div>
                  <p className="text-gray-400 text-sm">
                    Store: {anomaly.store_name}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-xl font-bold ${
                      anomaly.severity === 'Critical'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                    }`}
                  >
                    {anomaly.pct_change.toFixed(1)}%
                  </p>
                  <p className="text-gray-400 text-xs">change</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-700">
                <div>
                  <p className="text-gray-400 text-xs">7-Day Avg</p>
                  <p className="text-white font-medium">
                    {formatCurrency(anomaly.avg_7_day_sales)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">30-Day Baseline</p>
                  <p className="text-white font-medium">
                    {formatCurrency(anomaly.avg_30_day_sales)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
