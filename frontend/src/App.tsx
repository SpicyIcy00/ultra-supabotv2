/**
 * Routing.
 *
 * "/" IS GEORGE (2026-09-09, the Experience Reset). The desk is the
 * environment, not a destination inside one: a person with George lands on
 * the business at rest and a piece of work has its own address at
 * `/w/:threadId`. Today, Ask, Inbox, Pages and Workflows stopped being five
 * places to navigate between — Ask is the line on the desk, Today is the desk
 * at rest, and the other three are rooms reachable from the line above it.
 * Everything anybody bookmarked still resolves: the old paths redirect.
 *
 * TWO CHROMES DURING THE MIGRATION, ONE GEORGE ABOVE BOTH. The desk draws its
 * own five regions and wears no rail. GeorgeShell remains the chrome for the
 * rooms, and Layout is the existing application on dark, every route at its
 * own path. The stream provider sits above all of it, so an answer keeps
 * arriving whichever surface the person is on.
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

// George.
const DeskPage = React.lazy(() => import('./pages/DeskPage'));
// The workspace George composes (2026-09-10). Beside the desk while it is proven.
const WorkspacePage = React.lazy(() => import('./workspace/WorkspacePage'));
// The rooms: reachable from the desk's line, not destinations beside it.
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

/** An old thread path, forwarded to the work's own address. */
function WorkRedirect() {
  const { threadId = '' } = useParams();
  return <Navigate to={`/w/${threadId}`} replace />;
}

/** George's routes. One page key for all of them. */
function george(element: React.ReactNode) {
  return <RequirePage pageKey="george">{element}</RequirePage>;
}

/** Everything that renders inside the legacy chrome. */
function ChromeRoutes() {
  return (
    <Layout>
      <Routes>
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
                {/* The print sheet sits outside every chrome so there is no
                    sidebar or header to hide — a bare page for the printer. */}
                <Route
                  path="/packing/:listId/print"
                  element={<RequirePage pageKey="packing"><PackingPrintPage /></RequirePage>}
                />
                <Route path="/george/preview" element={<RiverPreview />} />

                {/* The desk. "/" renders it for a person with George and sends
                    everybody else to their own first page. */}
                <Route path="/" element={<LandingRedirect />} />
                <Route path="/w/:threadId" element={george(<DeskPage />)} />
                <Route path="/w2" element={george(<WorkspacePage />)} />
                <Route path="/w2/:threadId" element={george(<WorkspacePage />)} />

                {/* The rooms, in George's chrome. */}
                <Route element={<GeorgeShell />}>
                  <Route path="/inbox" element={george(<InboxPage />)} />
                  <Route path="/pages" element={george(<PagesPage />)} />
                  <Route path="/pages/:pageId" element={george(<PagesPage />)} />
                  <Route path="/workflows" element={george(<WorkflowsPage />)} />
                </Route>

                {/* Where George used to live. Every one of these still resolves. */}
                <Route path="/ask" element={<Navigate to="/" replace />} />
                <Route path="/ask/:threadId" element={<WorkRedirect />} />
                <Route path="/today" element={<Navigate to="/" replace />} />
                <Route path="/george" element={<Navigate to="/" replace />} />
                <Route path="/george/t/:threadId" element={<WorkRedirect />} />

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
