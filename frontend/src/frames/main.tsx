/**
 * THE FRAMES HARNESS — the real room, drawn from recorded rows, with no backend.
 *
 * `ops/frames.py` opens `frames.html?scene=…&rail=open|closed` in headless
 * Chrome and screenshots it beside the same scene of the design
 * (`ops/ideal/bob-ahead-of-me.html`). NOW.md, 2026-09-17: nine cards closed
 * with "nobody has seen it in a browser"; every Phase 2S card is held by
 * pixels instead, and this is what the pixels are taken of.
 *
 * IT MOUNTS `Room` ITSELF, not a copy of its layout, so a frame cannot pass
 * while the product draws something else. What is faked is only what is
 * outside the room: the stream (a context holding the recorded turn), the
 * network (an axios adapter answering from the fixture, empty elsewhere) and
 * the signed-in person. No request leaves the page.
 *
 * NOT PART OF THE APP. It is not in `index.html`'s graph, not routed, not
 * built by `vite build` — the dev server serves it for `ops/frames.py` only.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BobCtx, type BobContext } from '../components/bob/bobContext';
import { useAuthStore } from '../stores/authStore';
import Room from '../room/Room';
import { KeptPage } from '../room/KeptPage';
import WatchesPage from '../pages/WatchesPage';
import { BobHere } from '../room/BobHere';
import { RoomShell } from '../room/RoomShell';
import vocabReads from '../room/__fixtures__/vocab-reads.json';
import { Layout } from '../components/Layout';
import { useRegisterHere } from '../hooks/useHere';
import scenes from './scenes.json';
import '../index.css';

interface Scene {
  reading?: Record<string, unknown>;
  composed?: Record<string, unknown>[];
  scene: string;
  /** The turn's notices, loop warnings included, as the stream sent them. */
  notices?: Record<string, unknown>[];
  question: string;
  answer: string;
  at: string;
  blocks: Record<string, unknown>[];
  /** How he laid the right-hand side out, when the fixture has one (P3.p). */
  arrangement?: unknown;
  calls: Record<string, unknown>[];
}

const params = new URLSearchParams(window.location.search);
const all = (scenes as { scenes: Scene[]; desk: unknown }).scenes;
const scene = all.find((s) => s.scene === params.get('scene')) ?? all[0];

try {
  localStorage.clear();
  localStorage.setItem('bob.side', params.get('rail') === 'closed' ? 'closed' : 'open');
  const theme = params.get('theme');
  if (theme === 'light' || theme === 'dark') localStorage.setItem('room-theme', theme);
} catch { /* the frame still draws */ }

useAuthStore.setState({
  user: { id: 'frames', username: 'owner', display_name: 'You', role: 'owner',
          allowed_pages: ['bob', 'dashboard', 'analytics', 'warehouse', 'packing'] },
});

/* ------------------------------------------------------- a kept page (W4.1) */
/**
 * THE FOUR PAGES OF THE SIDEBAR, AS SHAPES — Estate Dashboard, Store
 * Dashboard, Estate Week and AJI BARN Reorder, each drawn by the REAL
 * `KeptPage` over the reads `ops/record_vocab_reads.py` recorded with the
 * vetted tools. `?kept=dashboard|week|list|collection` mounts one; every figure
 * on it is a recorded read, and the kind is the only thing that differs
 * between the frames.
 */
const READS = vocabReads as unknown as Record<string, {
  tool: string; arguments: Record<string, unknown>;
  rows: Record<string, unknown>[]; meta: Record<string, unknown>;
}>;
const KEPT_PAGES: Record<string, { title: string; analyses: [string, string, string][] }> = {
  dashboard: { title: 'Estate Dashboard', analyses: [
    ['Estate net sales', 'figure', 'figure'],
    ['Transactions', 'figure', 'figure'],
    ['Average ticket', 'figure', 'figure'],
    ['Stock cover', 'figure', 'figure'],
    ['By shop', 'ranked', 'ranked'],
    ['Day by day', 'line', 'line'],
  ] },
  week: { title: 'Estate Week', analyses: [
    ['How the estate moved', 'dumbbell', 'dumbbell'],
    ['Day by day', 'line', 'line'],
    ['What moved it', 'contributors', 'contributors'],
    ['By shop', 'ranked', 'ranked'],
  ] },
  list: { title: 'AJI BARN Reorder', analyses: [
    ['Lines at zero', 'list', 'table'],
    ['Below cover', 'table', 'table'],
    ['What is moving', 'ranked', 'ranked'],
    // One analysis carrying both — the case where a chart has rows to be an
    // aside to, and is set beside them rather than above them.
    ['Orders waiting', 'ranked,table', 'ranked,table'],
    ['To visit', 'table', 'table'],
  ] },
  collection: { title: 'Estate Dashboard', analyses: [
    ['Estate net sales', 'figure', 'figure'],
    ['Transactions', 'figure', 'figure'],
    ['Average ticket', 'figure', 'figure'],
    ['Stock cover', 'figure', 'figure'],
    ['By shop', 'ranked', 'ranked'],
    ['Day by day', 'line', 'line'],
  ] },
};
const keptKind = params.get('kept');
const keptPage = keptKind ? KEPT_PAGES[keptKind] ?? KEPT_PAGES.collection : null;
const keptPins = (keptPage?.analyses ?? []).map(([title], i) => ({
  id: `pin-${i}`, title, question: null, page: keptPage?.title ?? null, page_id: 'page-1',
  position: i, conversation_id: null, tool_calls: [], created_at: '2026-09-23T00:00:00+08:00',
  last_run_at: null, last_ok_at: '2026-09-23T08:00:00+08:00', last_status: 'ok',
}));
const keptRunOf = (id: string) => {
  const i = Number(id.split('-')[1]);
  const [title, marks, reads_] = (keptPage?.analyses ?? [])[i] ?? ['', 'table', 'table'];
  const pairs = marks.split(',').map((m, n) => [m, reads_.split(',')[n]] as const);
  return {
    id, title, status: 'ok', notices: [], last_ok_at: null, ran_at: '2026-09-23T08:00:00+08:00',
    blocks: pairs.map(([mark, read], n) => ({
      op: 'put', kind: mark, key: `pin-${n}`, weight: n ? 'supporting' : 'lead',
      seq: n, tool: READS[read].tool })),
    results: pairs.map(([, read]) => ({
      tool: READS[read].tool, arguments: READS[read].arguments, status: 'ok',
      duration_ms: 12, rows: READS[read].rows, meta: READS[read].meta, notices: [] })),
  };
};

/* --------------------------------------------- what is watching (W4.4) ---
 *
 * `?watching=1` mounts the REAL `WatchesPage` over a fixture that carries one
 * of each case the card is about: a standing question switched on with an
 * answer behind it, one born off, a watch with no backtest (which cannot be
 * switched on and says why), a backtested one waiting for a person, and one
 * switched on that has been quiet for eleven checks.
 *
 * The rail reads the same endpoint, so the fixture is served whether or not
 * the page itself is mounted — otherwise the sidebar's group would have
 * nothing to draw beside the page that is about it.
 */
const WATCHING = {
  questions: [
    { id: 'q1', family: 'question', asks: 'How are we doing?',
      when: 'every day at 08:00', on: true, state: 'asked on schedule',
      told: ['Show more of Rockwell.', 'Leave AJI CMG out of the estate line.'],
      told_by: 'instructions',
      slot: { kind: 'daily', hour: 8, minute: 0, days_of_week: null },
      last_run_at: '2026-09-23T08:01:00+08:00', last_status: 'ok', last_error: null,
      last_said: { said: 'Yesterday was ₱182,400 across the estate, a little under the usual Tuesday. Rockwell carried most of the shortfall.',
                   at: '2026-09-23T08:01:00+08:00', read_at: '2026-09-23T08:00:00+08:00',
                   thread_id: 't-1', post_id: 'p-1' },
      thread_id: 't-1', checks: null, spoke: null, backtest: null,
      backtest_at: null, backtest_window: null, switch_on_refusal: null,
      may: { switch: true, reschedule: true, rewrite: true, remove: true } },
    { id: 'q2', family: 'question', asks: 'What needs ordering at AJI BARN?',
      when: 'Mon, Thu at 07:00', on: false, state: 'switched off',
      told: [], told_by: 'instructions',
      slot: { kind: 'weekly', hour: 7, minute: 0, days_of_week: [0, 3] },
      last_run_at: null, last_status: null, last_error: null, last_said: null,
      thread_id: null, checks: null, spoke: null, backtest: null,
      backtest_at: null, backtest_window: null, switch_on_refusal: null,
      may: { switch: true, reschedule: true, rewrite: true, remove: true } },
  ],
  watches: [
    { id: 'w1', family: 'watch', asks: 'A shop’s sales drop — any shop',
      when: 'every day at 08:00', on: false, state: 'not backtested yet',
      told: ['A shop’s sales drop', 'only when it moves down', 'every shop'],
      told_by: 'condition',
      slot: { kind: 'daily', hour: 8, minute: 0, days_of_week: null },
      last_run_at: null, last_status: null, last_error: null, last_said: null,
      thread_id: null, checks: 0, spoke: 0, backtest: null,
      backtest_at: null, backtest_window: null,
      switch_on_refusal: 'This watch has not been backtested, so nobody knows how often it would speak. Back it over the last 60 days first — that says how many days it would have fired, and on which.',
      may: { switch: true, reschedule: true, rewrite: false, remove: true } },
    { id: 'w2', family: 'watch', asks: 'A line runs out — Rockwell, Greenhills',
      when: 'every day at 06:30', on: false, state: 'ready — not switched on',
      told: ['A line runs out', 'Rockwell, Greenhills'],
      told_by: 'condition',
      slot: { kind: 'daily', hour: 6, minute: 30, days_of_week: null },
      last_run_at: null, last_status: null, last_error: null, last_said: null,
      thread_id: null, checks: 0, spoke: 0, backtest: '9 of the last 60 days',
      backtest_at: '2026-09-22T09:12:00+08:00', backtest_window: '2026-07-25 to 2026-09-22',
      switch_on_refusal: null,
      may: { switch: true, reschedule: true, rewrite: false, remove: true } },
    { id: 'w3', family: 'watch', asks: 'Stock below cover — AJI BARN',
      when: 'Mon at 08:00', on: true, state: 'watching',
      told: ['Stock below cover', 'AJI BARN'], told_by: 'condition',
      slot: { kind: 'weekly', hour: 8, minute: 0, days_of_week: [0] },
      last_run_at: '2026-09-22T08:00:00+08:00', last_status: 'quiet', last_error: null,
      last_said: null, thread_id: null, checks: 11, spoke: 0,
      backtest: '2 of the last 60 days', backtest_at: '2026-09-08T10:00:00+08:00',
      backtest_window: '2026-07-11 to 2026-09-08', switch_on_refusal: null,
      may: { switch: true, reschedule: true, rewrite: false, remove: true } },
  ],
};
const watching = params.get('watching');

const desk = (scenes as { desk: unknown }).desk;
axios.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  const url = config.url ?? '';
  const ok = (data: unknown): AxiosResponse => ({ data, status: 200, statusText: 'OK', headers: {}, config });
  if (keptPage) {
    if (url.endsWith('/bob/pages/page-1')) {
      return ok({ id: 'page-1', title: keptPage.title,
                  purpose: 'What this page is for, in one line.',
                  created_at: '2026-09-23T00:00:00+08:00', updated_at: '2026-09-23T00:00:00+08:00',
                  pins: keptPins.length, kind: keptKind, kind_set_by: 'derived' });
    }
    if (/\/bob\/pins\/[^/]+\/run$/.test(url)) return ok(keptRunOf(url.split('/').slice(-2)[0]));
    if (url.endsWith('/bob/pins')) return ok(keptPins);
  }
  if (url.endsWith('/definitions/desk')) {
    if (desk) return ok(desk);
    throw new AxiosError('no desk definitions in the fixture', 'ERR_BAD_RESPONSE', config, null,
      { data: null, status: 404, statusText: 'Not Found', headers: {}, config } as AxiosResponse);
  }
  if (url.includes('/standing/latest')) return ok(null);
  // W4.4. Served always: the rail reads it too, and a sidebar group with
  // nothing in it beside the page about it would be the wrong frame.
  if (url.endsWith('/bob/watching')) return ok(WATCHING);
  // The colours Settings saved, so a frame's swatches are the live room's.
  if (url.endsWith('/analytics/stores')) return ok((scenes as { stores?: unknown[] }).stores ?? []);
  return ok([]);
};

// ?lit=NAME puts one name in every block's emphasis, so a frame draws the
// ringed swatch a lit row wears — the case the clip measurement must see.
const lit = params.get('lit');
const blocks = lit ? scene.blocks.map((b) => ({ ...b, emphasise: lit })) : scene.blocks;

const turns = [
  { role: 'user', text: scene.question, at: scene.at },
  {
    role: 'bob', text: scene.answer, thinking: '', at: scene.at,
    toolCalls: scene.calls, defaultComposition: { blocks }, notices: scene.notices ?? [],
    ...(scene.reading ? { reading: scene.reading } : {}),
    ...(scene.composed?.length
      ? { composition: { blocks: scene.composed,
                         ...(scene.arrangement ? { arrangement: scene.arrangement } : {}) } }
      : {}),
  },
];

const noop = () => {};
// ?here=warehouse (W1.4): the scene's turn as an answer asked FROM a BI page,
// drawn beside it by the one line — the BI chrome, a stand-in page body, and
// BobHere, at whatever width the frame is shot.
const here = params.get('here');
const bob = {
  turns, busy: false, threadId: here ? 't-here' : null, storedThreadId: here ? 't-here' : null,
  where: here ? `screen:${here}` : null, pageScope: null,
  open: noop, ask: async () => {}, reset: noop, cancel: noop, setComposer: noop,
  presence: 'idle', live: null, composer: null,
} as unknown as BobContext;

// ?voice=listening (P2S.5): a recogniser that hears "compare these two" and
// keeps listening, so `ops/frames.py --voice` can hold the mic and shoot the
// composer mid-phrase. Headless Chrome has no microphone to give a real one.
if (params.get('voice') === 'listening') {
  class Heard {
    continuous = false; interimResults = false; lang = '';
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      setTimeout(() => this.onresult?.({
        results: [Object.assign([{ transcript: 'compare these two' }], { isFinal: false })],
      }), 250);
    }
    stop() { /* the frame is taken while it is still held */ }
    abort() { /* nothing to let go of */ }
  }
  // Both names: Chrome now ships the standard one too, and the room takes it first.
  Object.assign(window, { SpeechRecognition: Heard, webkitSpeechRecognition: Heard });
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** A BI page as it registers itself; its body is a stand-in, the chrome is real. */
function HerePage({ name }: { name: string }) {
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  useRegisterHere({ key: name, label, view: name === 'warehouse' ? 'Replenishment Reports' : null });
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">{label}</h1>
      <p className="text-gray-400 mb-6">The page as it was, with Bob answering beside it.</p>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-16 mb-3 rounded-lg bg-gray-800/60 border border-gray-700" />
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BobCtx.Provider value={bob}>
        {watching ? (
          <MemoryRouter initialEntries={['/watches']}>
            <RoomShell><WatchesPage /></RoomShell>
          </MemoryRouter>
        ) : keptPage ? (
          <MemoryRouter initialEntries={['/pages/page-1']}>
            <RoomShell><KeptPage pageId="page-1" onBack={noop} /></RoomShell>
          </MemoryRouter>
        ) : here ? (
          <MemoryRouter initialEntries={[`/${here}`]}>
            <Layout><HerePage name={here} /></Layout>
            <BobHere />
          </MemoryRouter>
        ) : (
          <MemoryRouter initialEntries={['/bob']}>
            <Routes>
              <Route path="*" element={<Room />} />
            </Routes>
          </MemoryRouter>
        )}
      </BobCtx.Provider>
    </QueryClientProvider>
  </React.StrictMode>,
);
