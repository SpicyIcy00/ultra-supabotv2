/**
 * Routing.
 *
 * TWO CHROMES DURING THE MIGRATION, ONE GEORGE ABOVE BOTH. GeorgeShell is
 * the primary environment — Today, Ask, Inbox, Pages, Workflows — on cream.
 * Layout is the existing application on dark: dashboards and the operational
 * tools, every route kept at its own path. The stream provider sits above
 * both so an answer keeps arriving whichever chrome the person is in.
 *
 * "/" is a redirect and nothing else: a person with George lands in George,
 * everyone else where they always did (constants/pages.ts). The dashboard
 * has a real path of its own now, and the old George paths forward to the
 * new ones so nothing anybody bookmarked or sent stops resolving.
 */
import React, { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { SessionGuard } from './components/SessionGuard';
import { RequirePage, NoAccessPage } from './components/RequirePage';
import { LandingRedirect } from './components/LandingRedirect';
import { GeorgeStreamProvider } from './components/george/GeorgeStreamProvider';
import { GeorgeShell } from './components/shell/GeorgeShell';

// George's environment.
const TodayPage = React.lazy(() => import('./pages/TodayPage'));
const AskPage = React.lazy(() => import('./pages/AskPage'));
const InboxPage = React.lazy(() => import('./pages/InboxPage'));
const PagesPage = React.lazy(() => import('./pages/PagesPage'));
const WorkflowsPage = React.lazy(() => import('./pages/WorkflowsPage'));
// A design surface: outside the app chrome and behind no RequirePage gate
// (SessionGuard still applies, as it does to every route). Fixtures only, no
// backend, and nothing links to it. See pages/RiverPreview.tsx.
const RiverPreview = React.lazy(() => import('./pages/RiverPreview'));

// The existing application. AIChatPage is the legacy NL->SQL chatbot and is
// not George; it stays reachable under Operations, unchanged.
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage'));
const AIChatPage = React.lazy(() => import('./pages/AIChatPage'));
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

/** The old thread path, forwarded with its id. */
function ThreadRedirect() {
  const { threadId = '' } = useParams();
  return <Navigate to={`/ask/${threadId}`} replace />;
}

/** George's routes, inside the shell. One page key for all of them. */
function george(element: React.ReactNode) {
  return <RequirePage pageKey="george">{element}</RequirePage>;
}

/** Everything that renders inside the legacy chrome. */
function ChromeRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingRedirect />} />
        {/* Dashboard owns two tabs: Stores (/dashboard) and Vending (/vending) */}
        <Route path="/dashboard" element={<RequirePage pageKey="dashboard"><Dashboard /></RequirePage>} />
        <Route path="/vending" element={<RequirePage pageKey="dashboard"><Dashboard /></RequirePage>} />
        <Route path="/analytics" element={<RequirePage pageKey="analytics"><AnalyticsPage /></RequirePage>} />
        <Route path="/ai-chat" element={<RequirePage pageKey="ai_chat"><AIChatPage /></RequirePage>} />
        {/* Warehouse owns two tabs: Replenishment Reports and Barcode Generator */}
        <Route path="/warehouse" element={<RequirePage pageKey="warehouse"><WarehousePage /></RequirePage>} />
        <Route path="/packing" element={<RequirePage pageKey="packing"><PackingPage /></RequirePage>} />
        <Route path="/settings" element={<RequirePage pageKey="settings"><SettingsPage /></RequirePage>} />
        <Route path="/admin/page-access" element={<RequirePage pageKey="admin"><AdminPageAccessPage /></RequirePage>} />
        <Route path="/no-access" element={<NoAccessPage />} />
        {/* Legacy paths — kept so old links/bookmarks still resolve */}
        <Route path="/reports/product-sales" element={<Navigate to="/warehouse" replace />} />
        <Route path="/barcodes" element={<Navigate to="/warehouse?tab=barcodes" replace />} />
        <Route path="*" element={<LandingRedirect />} />
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
          {/* One George above every route, so an answer keeps arriving while
              the person moves around the app. Inside SessionGuard, which keys
              its subtree on the session, so logout tears the stream down. */}
          <GeorgeStreamProvider>
            <Suspense fallback={<PageSpinner />}>
              <Routes>
                {/* The print sheet sits outside both chromes so there is no
                    sidebar or header to hide — a bare page for the printer. */}
                <Route
                  path="/packing/:listId/print"
                  element={<RequirePage pageKey="packing"><PackingPrintPage /></RequirePage>}
                />
                <Route path="/george/preview" element={<RiverPreview />} />

                <Route element={<GeorgeShell />}>
                  <Route path="/today" element={george(<TodayPage />)} />
                  <Route path="/ask" element={george(<AskPage />)} />
                  <Route path="/ask/:threadId" element={george(<AskPage />)} />
                  <Route path="/inbox" element={george(<InboxPage />)} />
                  <Route path="/pages" element={george(<PagesPage />)} />
                  <Route path="/workflows" element={george(<WorkflowsPage />)} />
                  {/* The paths George lived at until 2026-09-07. */}
                  <Route path="/george" element={<Navigate to="/today" replace />} />
                  <Route path="/george/t/:threadId" element={<ThreadRedirect />} />
                </Route>

                <Route path="*" element={<ChromeRoutes />} />
              </Routes>
            </Suspense>
          </GeorgeStreamProvider>
        </SessionGuard>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
