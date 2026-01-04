import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import axios from 'axios';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    setShowSuccess(false);
    setShowError(false);

    try {
      // First, clear backend Redis cache
      await axios.post('/api/v1/analytics/invalidate-cache');

      // Then invalidate frontend React Query cache
      await queryClient.invalidateQueries();

      // Show success message
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error refreshing data:', error);
      setShowError(true);
      setTimeout(() => setShowError(false), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e1117] p-6">
      <div className="max-w-[1200px] mx-auto space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">Manage your dashboard preferences and data</p>
        </div>

        {/* Data Management Section */}
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Data Management</h2>

          <div className="space-y-4">
            {/* Refresh Data */}
            <div className="flex items-start justify-between p-4 bg-[#0e1117] rounded-lg border border-[#2e303d]">
              <div className="flex-1">
                <h3 className="text-lg font-medium text-white mb-1">Refresh All Data</h3>
                <p className="text-sm text-gray-400">
                  Clears both backend (Redis) and frontend (React Query) caches to force a fresh fetch of all
                  dashboard data from the database. Use this if you've made changes to your data source and
                  want to see them immediately.
                </p>
                <div className="mt-3 text-xs text-gray-500">
                  <p>Data cache times:</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>Dashboard KPIs, Sales, Products: 5 minutes</li>
                    <li>Inventory data: 10 minutes</li>
                    <li>Sales anomalies: 15 minutes</li>
                    <li>Day of week patterns: 30 minutes</li>
                  </ul>
                </div>
              </div>

              <div className="ml-6 flex flex-col items-end gap-2">
                <button
                  onClick={handleRefreshData}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
                </button>

                {showSuccess && (
                  <div className="text-sm text-green-400 font-medium">
                    Data refreshed successfully!
                  </div>
                )}

                {showError && (
                  <div className="text-sm text-red-400 font-medium">
                    Error refreshing data. Please try again.
                  </div>
                )}
              </div>
            </div>

            {/* Info about cache */}
            <div className="p-4 bg-blue-950/20 border border-blue-900/50 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-blue-400 mt-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-blue-300 mb-1">About Data Caching</h4>
                  <p className="text-xs text-blue-200/70">
                    The dashboard uses smart caching to reduce server load and improve performance.
                    Data is automatically refreshed when you change filters or navigate between pages.
                    Use the manual refresh button above if you need to bypass the cache and fetch the latest data immediately.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Future Settings Sections */}
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Additional Settings</h2>
          <p className="text-gray-400 text-sm">More configuration options coming soon...</p>
        </div>
      </div>
    </div>
  );
};
