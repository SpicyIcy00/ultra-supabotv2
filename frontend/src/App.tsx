/**
 * Main App Component with Routing
 */
import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { AuthGuard } from './components/AuthGuard';

// Lazy-loaded pages (Dashboard stays eager as the landing page)
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage'));
const AIChatPage = React.lazy(() => import('./pages/AIChatPage'));
const ReportingPage = React.lazy(() => import('./pages/ReportingPage'));
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
                <Route path="/ai-chat" element={<AIChatPage />} />
                <Route path="/reports/product-sales" element={<ReportingPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </Suspense>
          </Layout>
        </AuthGuard>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
