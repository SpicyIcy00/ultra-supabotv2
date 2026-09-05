/**
 * Main App Component with Routing
 */
import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { SessionGuard } from './components/SessionGuard';
import { RequirePage, NoAccessPage } from './components/RequirePage';
import { LandingRedirect } from './components/LandingRedirect';

// Lazy-loaded pages (Dashboard stays eager as the landing page)
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage'));
const AIChatPage = React.lazy(() => import('./pages/AIChatPage'));
// George is a parallel surface to AIChatPage, not a replacement — /ai-chat and
// everything under components/chat keep working unchanged.
const RiverPage = React.lazy(() => import('./pages/RiverPage'));
// A design surface: outside the app chrome and behind no RequirePage gate
// (SessionGuard still applies, as it does to every route). Fixtures only, no
// backend, and nothing links to it. See pages/RiverPreview.tsx.
const RiverPreview = React.lazy(() => import('./pages/RiverPreview'));
const WarehousePage = React.lazy(() => import('./pages/WarehousePage'));
const PackingPage = React.lazy(() => import('./pages/PackingPage'));
const PackingPrintPage = React.lazy(() => import('./pages/PackingPrintPage'));
const AdminPageAccessPage = React.lazy(() => import('./pages/AdminPageAccessPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

const PageSpinner = () => (
  <div className="flex items-center justify-center h-[50vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00d2ff]" />
  </div>
);

/** Everything that renders inside the app chrome. */
function ChromeRoutes() {
  return (
    <Layout>
      <Routes>
        {/* A user without 'dashboard' gets sent to their own first
            allowed page instead of an empty dashboard shell. */}
        <Route path="/" element={<LandingRedirect><Dashboard /></LandingRedirect>} />
        <Route path="/analytics" element={<RequirePage pageKey="analytics"><AnalyticsPage /></RequirePage>} />
        {/* Vending is a tab of the dashboard, not its own page */}
        <Route path="/vending" element={<RequirePage pageKey="dashboard"><Dashboard /></RequirePage>} />
        <Route path="/ai-chat" element={<RequirePage pageKey="ai_chat"><AIChatPage /></RequirePage>} />
        <Route path="/george" element={<RequirePage pageKey="george"><RiverPage /></RequirePage>} />
        {/* Warehouse owns two tabs: Replenishment Reports and Barcode Generator */}
        <Route path="/warehouse" element={<RequirePage pageKey="warehouse"><WarehousePage /></RequirePage>} />
        <Route path="/packing" element={<RequirePage pageKey="packing"><PackingPage /></RequirePage>} />
        <Route path="/settings" element={<RequirePage pageKey="settings"><SettingsPage /></RequirePage>} />
        <Route path="/admin/page-access" element={<RequirePage pageKey="admin"><AdminPageAccessPage /></RequirePage>} />
        <Route path="/no-access" element={<NoAccessPage />} />
        {/* Legacy paths — kept so old links/bookmarks still resolve */}
        <Route path="/reports/product-sales" element={<Navigate to="/warehouse" replace />} />
        <Route path="/barcodes" element={<Navigate to="/warehouse?tab=barcodes" replace />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* The legacy shared-code AuthGuard is gone: passcode login replaces it,
            and stacking the two meant typing two codes to reach the app. */}
        <SessionGuard>
          <Suspense fallback={<PageSpinner />}>
            <Routes>
              {/* The print sheet sits outside Layout so there is no sidebar or
                  header to hide — it renders as a bare page for the printer. */}
              <Route
                path="/packing/:listId/print"
                element={<RequirePage pageKey="packing"><PackingPrintPage /></RequirePage>}
              />
              {/* The river's layouts, from fixtures. Chrome-free for the same
                  reason the print sheet is: it is the layout being looked at,
                  not the app around it. */}
              <Route path="/george/preview" element={<RiverPreview />} />
              <Route path="*" element={<ChromeRoutes />} />
            </Routes>
          </Suspense>
        </SessionGuard>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
