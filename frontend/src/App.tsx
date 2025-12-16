/**
 * Main App Component with Routing
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import AnalyticsPage from './pages/AnalyticsPage';
import AIChatPage from './pages/AIChatPage';
import ReportingPage from './pages/ReportingPage';

function SettingsPage() {
  return (
    <div className="text-center py-20">
      <h1 className="text-3xl font-bold text-white mb-4">Settings</h1>
      <p className="text-gray-400">Dashboard settings coming soon...</p>
    </div>
  );
}


import { AuthGuard } from './components/AuthGuard';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGuard>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/ai-chat" element={<AIChatPage />} />
              <Route path="/reports/product-sales" element={<ReportingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Layout>
        </AuthGuard>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
