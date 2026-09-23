/**
 * W4.3's frame harness — the REAL SystemPage, with no backend.
 *
 * Same shape as src/frames/main.tsx: the page itself is mounted, and only
 * what is outside it is faked — the network (an axios adapter answering from
 * a fixture) and the signed-in person. Scratchpad-scale and not part of the
 * app's build; `ops/w43_frames.py` in the scratchpad opens it.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BobCtx, type BobContext } from '../components/bob/bobContext';
import { useAuthStore } from '../stores/authStore';
import { RoomShell } from '../room/RoomShell';
import SystemPage from '../pages/SystemPage';
import '../index.css';

const params = new URLSearchParams(window.location.search);
const scene = params.get('scene') ?? 'ungated';
const admin = params.get('admin') !== 'no';

try {
  localStorage.clear();
  localStorage.setItem('bob.side', params.get('rail') === 'closed' ? 'closed' : 'open');
} catch { /* the frame still draws */ }

useAuthStore.setState({
  token: 't',
  user: { id: 'u', username: 'admin', display_name: 'Isaiah',
          role: admin ? 'admin' : 'warehouse_staff', allowed_pages: ['bob'] },
});

const V1 = {
  id: 'v1', version: 1, created_by: 'admin', created_at: '2026-09-20T01:00:00Z',
  steps: [{ name: 'what is running out', tool: 'get_stock_cover', arguments: {}, why: 'The lines whose cover is under the window.' },
          { name: 'the warehouse', tool: 'get_stock', arguments: {}, why: null }],
  parameters: [{ name: 'window_days', type: 'number', default: 7, description: null }],
  intent: 'Every morning, what runs out in the next week and where it can come from.',
  change_note: null, definitions_version: 4,
  backtested_at: null, backtest_run_id: null, promoted_at: null, promoted_by: null,
};
const V1_TESTED = { ...V1, backtested_at: '2026-09-21T01:00:00Z', backtest_run_id: 'r1' };
const V1_PROMOTED = { ...V1_TESTED, promoted_at: '2026-09-22T02:00:00Z', promoted_by: 'Isaiah' };
const V2 = { ...V1, id: 'v2', version: 2, created_at: '2026-09-23T01:00:00Z',
             change_note: 'Use 30-day velocity instead of 14.',
             backtested_at: '2026-09-23T02:00:00Z', backtest_run_id: 'r2',
             promoted_at: '2026-09-23T03:00:00Z', promoted_by: 'Isaiah' };

const RUNS = [
  { id: 'run2', workflow_id: 'w1', version_id: 'v1', mode: 'backtest', requested_by: 'Isaiah',
    as_of: '2026-09-21', status: 'ok', started_at: '2026-09-21T01:00:00Z',
    finished_at: '2026-09-21T01:00:12Z',
    notices: [{ kind: 'partial_window', message: 'Two of the seven days have no transactions on record.' }] },
  { id: 'run1', workflow_id: 'w1', version_id: 'v1', mode: 'run', requested_by: 'Isaiah',
    as_of: null, status: 'ok', started_at: '2026-09-20T02:00:00Z',
    finished_at: '2026-09-20T02:00:09Z', notices: [] },
];

const SCENES: Record<string, { versions: unknown[]; current: unknown; schedules: unknown[] }> = {
  // What the owner was looking at: v1, never backtested, schedule off.
  ungated: {
    versions: [V1], current: V1,
    schedules: [{ id: 's1', workflow_id: 'w1', version_id: 'v1', kind: 'daily', hour: 7,
                  minute: 0, days_of_week: [], day_of_month: null, bindings: {},
                  telegram_chat_ids: [], enabled: false, last_slot: null,
                  last_run_at: null, last_status: null, last_error: null }],
  },
  // Backtested and waiting: the Promote control live, naming its backtest.
  waiting: {
    versions: [V1_TESTED], current: V1_TESTED,
    schedules: [{ id: 's1', workflow_id: 'w1', version_id: 'v1', kind: 'daily', hour: 7,
                  minute: 0, days_of_week: [], day_of_month: null, bindings: {},
                  telegram_chat_ids: [], enabled: false, last_slot: null,
                  last_run_at: null, last_status: null, last_error: null }],
  },
  // Rule 8: v2 is newest and promoted, the enabled schedule still fires v1.
  diverged: {
    versions: [V2, V1_PROMOTED], current: V2,
    schedules: [{ id: 's1', workflow_id: 'w1', version_id: 'v1', kind: 'daily', hour: 7,
                  minute: 0, days_of_week: [], day_of_month: null, bindings: {},
                  telegram_chat_ids: [], enabled: true, last_slot: null,
                  last_run_at: '2026-09-23T07:00:00+08:00', last_status: 'ok',
                  last_error: null }],
  },
};

const s = SCENES[scene] ?? SCENES.ungated;

axios.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  const url = config.url ?? '';
  const ok = (data: unknown): AxiosResponse =>
    ({ data, status: 200, statusText: 'OK', headers: {}, config } as AxiosResponse);
  if (url.endsWith('/versions')) return ok(s.versions);
  if (url.endsWith('/schedules')) return ok(s.schedules);
  if (url.endsWith('/runs')) return ok(RUNS);
  if (/\/runs\/[^/]+$/.test(url)) {
    return ok({ steps: [{ name: 'what is running out', tool: 'get_stock_cover', status: 'ok' },
                        { name: 'the warehouse', tool: 'get_stock', status: 'ok' }] });
  }
  if (/\/workflows\/w1$/.test(url)) {
    return ok({ id: 'w1', name: 'Morning Runout', created_by: 'admin',
                created_at: '2026-09-20T01:00:00Z', status: 'active', current_version: s.current });
  }
  return ok([]);
};

const noop = () => {};
const bob = {
  turns: [], busy: false, threadId: null, storedThreadId: null, where: null,
  pageScope: null, open: noop, ask: async () => {}, reset: noop, cancel: noop,
  setComposer: noop, presence: 'idle', live: null, composer: null,
} as unknown as BobContext;

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BobCtx.Provider value={bob}>
      <MemoryRouter initialEntries={['/workflows/w1']}>
        <Routes>
          <Route path="/workflows/:workflowId"
                 element={<RoomShell><SystemPage /></RoomShell>} />
        </Routes>
      </MemoryRouter>
      </BobCtx.Provider>
    </QueryClientProvider>
  </React.StrictMode>,
);
