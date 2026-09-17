/**
 * THE FRAMES HARNESS — the real room, drawn from recorded rows, with no backend.
 *
 * `ops/frames.py` opens `frames.html?scene=…&rail=open|closed` in headless
 * Chrome and screenshots it beside the same scene of the design
 * (`ops/ideal/george-ahead-of-me.html`). NOW.md, 2026-09-17: nine cards closed
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
import { GeorgeCtx, type GeorgeContext } from '../components/george/georgeContext';
import { useAuthStore } from '../stores/authStore';
import Room from '../room/Room';
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
  calls: Record<string, unknown>[];
}

const params = new URLSearchParams(window.location.search);
const all = (scenes as { scenes: Scene[]; desk: unknown }).scenes;
const scene = all.find((s) => s.scene === params.get('scene')) ?? all[0];

try {
  localStorage.clear();
  localStorage.setItem('george.side', params.get('rail') === 'closed' ? 'closed' : 'open');
  const theme = params.get('theme');
  if (theme === 'light' || theme === 'dark') localStorage.setItem('room-theme', theme);
} catch { /* the frame still draws */ }

useAuthStore.setState({
  user: { id: 'frames', username: 'owner', display_name: 'You', role: 'owner', allowed_pages: ['george'] },
});

const desk = (scenes as { desk: unknown }).desk;
axios.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  const url = config.url ?? '';
  const ok = (data: unknown): AxiosResponse => ({ data, status: 200, statusText: 'OK', headers: {}, config });
  if (url.endsWith('/definitions/desk')) {
    if (desk) return ok(desk);
    throw new AxiosError('no desk definitions in the fixture', 'ERR_BAD_RESPONSE', config, null,
      { data: null, status: 404, statusText: 'Not Found', headers: {}, config } as AxiosResponse);
  }
  if (url.includes('/standing/latest')) return ok(null);
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
    role: 'george', text: scene.answer, thinking: '', at: scene.at,
    toolCalls: scene.calls, defaultComposition: { blocks }, notices: scene.notices ?? [],
    ...(scene.reading ? { reading: scene.reading } : {}),
    ...(scene.composed?.length ? { composition: { blocks: scene.composed } } : {}),
  },
];

const noop = () => {};
const george = {
  turns, busy: false, threadId: null, storedThreadId: null,
  open: noop, ask: async () => {}, reset: noop, cancel: noop, setComposer: noop,
  presence: 'idle', live: null, composer: null,
} as unknown as GeorgeContext;

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <GeorgeCtx.Provider value={george}>
        <MemoryRouter initialEntries={['/george']}>
          <Routes>
            <Route path="*" element={<Room />} />
          </Routes>
        </MemoryRouter>
      </GeorgeCtx.Provider>
    </QueryClientProvider>
  </React.StrictMode>,
);
