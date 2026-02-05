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
import { SettingsPage } from './pages/SettingsPage';
import { StoreFiltersPage } from './pages/StoreFiltersPage';
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
              <Route path="/store-filters" element={<StoreFiltersPage />} />
            </Routes>
          </Layout>
        </AuthGuard>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
