/**
 * Main App Component with Routing
 */
import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { AuthGuard } from './components/AuthGuard';

// Lazy-loaded pages (Dashboard stays eager as the landing page)
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage'));
const AIChatPage = React.lazy(() => import('./pages/AIChatPage'));
const WarehousePage = React.lazy(() => import('./pages/WarehousePage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

const PageSpinner = () => (
  <div className="flex items-center justify-center h-[50vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00d2ff]" />
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGuard>
          <Layout>
            <Suspense fallback={<PageSpinner />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                {/* Vending is a tab of the dashboard, not its own page */}
                <Route path="/vending" element={<Dashboard />} />
                <Route path="/ai-chat" element={<AIChatPage />} />
                {/* Warehouse owns two tabs: Replenishment Reports and Barcode Generator */}
                <Route path="/warehouse" element={<WarehousePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* Legacy paths — kept so old links/bookmarks still resolve */}
                <Route path="/reports/product-sales" element={<Navigate to="/warehouse" replace />} />
                <Route path="/barcodes" element={<Navigate to="/warehouse?tab=barcodes" replace />} />
              </Routes>
            </Suspense>
          </Layout>
        </AuthGuard>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
