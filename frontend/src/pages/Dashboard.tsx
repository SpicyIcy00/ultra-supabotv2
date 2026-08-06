import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PullToRefresh } from '../components/mobile/PullToRefresh';
import { StoresDashboard } from '../components/dashboard/StoresDashboard';
import { VendingDashboard } from '../components/dashboard/VendingDashboard';

type TabType = 'stores' | 'vending';

// Each tab has its own URL so links, bookmarks and the back button keep working.
const TAB_PATHS: Record<TabType, string> = {
  stores: '/',
  vending: '/vending',
};

const TABS: { id: TabType; label: string }[] = [
  { id: 'stores', label: 'Stores' },
  { id: 'vending', label: 'Vending' },
];

export const Dashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Stores is the default: anything that isn't /vending shows it.
  const activeTab: TabType = location.pathname === TAB_PATHS.vending ? 'vending' : 'stores';

  return (
    <PullToRefresh>
    <div className="min-h-screen bg-[#0e1117]">
      <div className="max-w-[1920px] mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1 sm:mb-2">Business Intelligence Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-400">
            {activeTab === 'vending'
              ? 'Hello Aji vending machine performance'
              : 'Real-time analytics and performance metrics'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#2e303d]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => navigate(TAB_PATHS[tab.id])}
              className={`px-5 py-2.5 text-sm font-medium rounded-lg border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'stores' ? <StoresDashboard /> : <VendingDashboard />}

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm py-4">
          <p>Last updated: {new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
    </PullToRefresh>
  );
};

export default Dashboard;
