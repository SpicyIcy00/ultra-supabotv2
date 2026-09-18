// @vitest-environment jsdom
/**
 * VOICE, AS RENDERED (P2S.5) — the card's done-when, on a mocked recogniser
 * and a mocked speech synthesis, since jsdom has neither.
 *
 *   - hold the mic, say "how are we doing", release: the words appear as
 *     heard and send;
 *   - two shops tapped and "compare these" spoken sends BOTH as the selection
 *     — asserted on the request the real Room hands the stream;
 *   - a spoken steer replays with no model call — on the real Room too;
 *   - hands-free reads the claim and nothing else, a tap stops it mid-sentence;
 *   - a browser with no recogniser draws no mic and says why;
 *   - each failure says which, and none pretends to have heard.
 *
 * THE ROOM IS MOUNTED WHOLE for the two request tests, as the frames harness
 * mounts it: a fake stream holding one recorded-shape turn, an axios adapter
 * answering the definitions and the replay, no network. Speaking has to reach
 * the SAME `ask` typing reaches, and only the real Room can show that.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Composer } from './Composer';
import { HOLD_MS } from './Mic';
import { FAILURE_SAYS, NOT_IN_THIS_BROWSER, type Recognition, type RecognitionCtor } from './voice';
import { GeorgeCtx, type GeorgeContext } from '../components/george/georgeContext';
import { useAuthStore } from '../stores/authStore';
import frames from '../frames/scenes.json';
import type { Subject } from './subjects';
import Room from './Room';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));

// ------------------------------------------------------------- the fakes --

type Results = Parameters<NonNullable<Recognition['onresult']>>[0]['results'];

/** A recogniser the test speaks into. The last one made is `heard.now`. */
function fakeRecognition() {
  const made: FakeRec[] = [];
  class FakeRec implements Recognition {
    continuous = false;
    interimResults = false;
    lang = '';
    onresult: Recognition['onresult'] = null;
    onerror: Recognition['onerror'] = null;
    onend: Recognition['onend'] = null;
    started = false;
    stopped = false;
    private said: { transcript: string; isFinal: boolean }[] = [];
    constructor() { made.push(this); }
    start() { this.started = true; }
    stop() { this.stopped = true; this.end(); }
    abort() { this.end(); }
    /** Hear a phrase: interim first, then settled. */
    hear(transcript: string, isFinal = true) {
      const last = this.said[this.said.length - 1];
      if (last && !last.isFinal) this.said.pop();
      this.said.push({ transcript, isFinal });
      const results = this.said.map((s) => Object.assign([{ transcript: s.transcript }], { isFinal: s.isFinal }));
      act(() => { this.onresult?.({ results: results as unknown as Results }); });
    }
    fail(error: string) { act(() => { this.onerror?.({ error }); }); }
    end() {
      if (!this.started) return;
      this.started = false;
      act(() => { this.onend?.(); });
    }
  }
  return { Ctor: FakeRec as unknown as RecognitionCtor, made, get now() { return made[made.length - 1]; } };
}

/** Speech synthesis the test can watch: what was said, and whether it was cut off. */
function fakeSynthesis() {
  const spoken: string[] = [];
  let current: { onend?: () => void; onerror?: () => void } | null = null;
  const synth = {
    speaking: false,
    speak: vi.fn((u: { text: string; onend?: () => void }) => { spoken.push(u.text); current = u; synth.speaking = true; }),
    cancel: vi.fn(() => { const u = current; current = null; synth.speaking = false; u?.onerror?.(); }),
  };
  class Utterance { text: string; onend?: () => void; onerror?: () => void; constructor(t: string) { this.text = t; } }
  const finish = () => { const u = current; current = null; synth.speaking = false; act(() => { u?.onend?.(); }); };
  return { synth, Utterance, spoken, finish };
}

// ---------------------------------------------------------- the composer --

function mountComposer(over: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSay = vi.fn();
  const onSend = vi.fn();
  function Harness() {
    const [draft, setDraft] = useState('');
    return (
      <Composer
        draft={draft} onDraft={setDraft} subjects={[] as Subject[]} scope={null} named={[]}
        defs={null} busy={false}
        onUnpick={vi.fn()} onUnscope={vi.fn()} onUnname={vi.fn()} onBind={vi.fn()}
        onSend={onSend} onStop={vi.fn()} onClear={vi.fn()}
        read={vi.fn(async () => ({ query: '', candidates: [], unavailable: {} }))}
        onSay={onSay}
        {...over}
      />
    );
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  const line = screen.getByLabelText('Say something to George') as HTMLInputElement;
  return { onSay, onSend, line };
}

const mic = () => document.querySelector('.r-mic') as HTMLButtonElement;

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('hold the mic, speak, release', () => {
  it('puts the words in the line as they are heard, and sends on release', () => {
    vi.useFakeTimers();
    const rec = fakeRecognition();
    const { onSay, line } = mountComposer({ recognition: rec.Ctor });
    fireEvent.pointerDown(mic());
    expect(rec.now.started).toBe(true);
    expect(mic().getAttribute('data-state')).toBe('listening');
    expect(line.placeholder).toBe('listening…');
    rec.now.hear('how are', false);
    expect(line.value).toBe('how are');              // as heard, before it settles
    rec.now.hear('how are we doing', true);
    expect(line.value).toBe('how are we doing');
    expect(onSay).not.toHaveBeenCalled();            // not before release
    vi.advanceTimersByTime(HOLD_MS + 50);
    fireEvent.pointerUp(mic());
    expect(onSay).toHaveBeenCalledTimes(1);
    expect(onSay).toHaveBeenCalledWith('how are we doing');
    expect(mic().getAttribute('data-state')).toBe('idle');
  });

  it('tapped instead of held, listens until tapped again and leaves the words to correct', () => {
    vi.useFakeTimers();
    const rec = fakeRecognition();
    const { onSay, onSend, line } = mountComposer({ recognition: rec.Ctor });
    fireEvent.pointerDown(mic());
    fireEvent.pointerUp(mic());                      // a tap: still listening
    expect(rec.now.started).toBe(true);
    rec.now.hear('how are we doin', true);
    fireEvent.pointerDown(mic());                    // the tap that stops it
    fireEvent.pointerUp(mic());
    expect(rec.now.stopped).toBe(true);
    expect(onSay).not.toHaveBeenCalled();
    expect(line.value).toBe('how are we doin');
    // Corrected by hand, then sent the ordinary way.
    fireEvent.change(line, { target: { value: 'how are we doing' } });
    fireEvent.keyDown(line, { key: 'Enter' });
    expect(onSend).toHaveBeenCalled();
  });

  it('with hands-free on, a tap ends at the pause and sends with no second tap', () => {
    const rec = fakeRecognition();
    const { onSay } = mountComposer({ recognition: rec.Ctor, handsFree: true, onHandsFree: vi.fn() });
    fireEvent.pointerDown(mic());
    fireEvent.pointerUp(mic());
    rec.now.hear('how are we', false);
    expect(onSay).not.toHaveBeenCalled();
    rec.now.hear('how are we doing', true);
    expect(onSay).toHaveBeenCalledWith('how are we doing');
  });

  it('follows what was already typed', () => {
    vi.useFakeTimers();
    const rec = fakeRecognition();
    const { onSay, line } = mountComposer({ recognition: rec.Ctor });
    fireEvent.change(line, { target: { value: 'compare' } });
    fireEvent.pointerDown(mic());
    rec.now.hear('these two', true);
    vi.advanceTimersByTime(HOLD_MS + 50);
    fireEvent.pointerUp(mic());
    expect(onSay).toHaveBeenCalledWith('compare these two');
  });
});

describe('states you can see', () => {
  it.each([
    ['not-allowed', FAILURE_SAYS.denied],
    ['audio-capture', FAILURE_SAYS['no-microphone']],
    ['network', FAILURE_SAYS['no-service']],
    ['no-speech', FAILURE_SAYS['nothing-heard']],
  ])('%s says which in one line, and sends nothing', (error, says) => {
    vi.useFakeTimers();
    const rec = fakeRecognition();
    const { onSay, line } = mountComposer({ recognition: rec.Ctor });
    fireEvent.pointerDown(mic());
    rec.now.fail(error);
    rec.now.end();
    vi.advanceTimersByTime(HOLD_MS + 50);
    fireEvent.pointerUp(mic());
    expect(document.querySelectorAll('.r-voice-note')).toHaveLength(1);
    expect(document.querySelector('.r-voice-note')?.textContent).toBe(says);
    expect(onSay).not.toHaveBeenCalled();
    expect(line.value).toBe('');
  });

  it('released with nothing heard says "Nothing heard" and never pretends', () => {
    vi.useFakeTimers();
    const rec = fakeRecognition();
    const { onSay } = mountComposer({ recognition: rec.Ctor });
    fireEvent.pointerDown(mic());
    vi.advanceTimersByTime(HOLD_MS + 50);
    fireEvent.pointerUp(mic());
    expect(document.querySelector('.r-voice-note')?.textContent).toBe(FAILURE_SAYS['nothing-heard']);
    expect(onSay).not.toHaveBeenCalled();
  });

  it('typing puts the failure line away', () => {
    const rec = fakeRecognition();
    const { line } = mountComposer({ recognition: rec.Ctor });
    fireEvent.pointerDown(mic());
    rec.now.fail('network');
    rec.now.end();
    expect(document.querySelector('.r-voice-note')).not.toBeNull();
    fireEvent.change(line, { target: { value: 'h' } });
    expect(document.querySelector('.r-voice-note')).toBeNull();
  });
});

describe('only where it works', () => {
  it('a browser with no recogniser draws no mic and says why', () => {
    mountComposer({ recognition: null });
    expect(mic()).toBeNull();
    expect(document.querySelector('.r-voice-note')?.textContent).toBe(NOT_IN_THIS_BROWSER);
  });

  it('draws the mic where the design does: after the chips, before ↑', () => {
    mountComposer({ recognition: fakeRecognition().Ctor,
                    steer: <button type="button">last 30 days</button> });
    const kids = Array.from(document.querySelector('.r-line')!.children);
    const at = (el: Element | null) => kids.indexOf(el as Element);
    expect(at(document.querySelector('.r-mic'))).toBeGreaterThan(at(document.querySelector('.r-steer')));
    expect(at(document.querySelector('.r-mic'))).toBeLessThan(at(document.querySelector('.r-send')));
  });

  it('draws no hands-free switch where the browser cannot read aloud', () => {
    mountComposer({ recognition: fakeRecognition().Ctor, onHandsFree: undefined });
    expect(document.querySelector('.r-hands')).toBeNull();
  });
});

// -------------------------------------------------------------- the room --

const META = {
  source_table: 'new_transactions', snapshot_timestamp: '2026-09-18T06:00:00Z',
  filters_applied: ['sales_day: Asia/Manila'],
};
const ROWS = [
  { store_id: 's-rockwell', store: 'Rockwell', value: 1075722.48, baseline: 2355681.78, change_pct: -54.3, unit: 'PHP' },
  { store_id: 's-greenhills', store: 'Greenhills', value: 1231651.4, baseline: 1294579.0, change_pct: -4.9, unit: 'PHP' },
  { store_id: 's-opus', store: 'OPUS', value: 2436641.59, baseline: 2188939.37, change_pct: 11.3, unit: 'PHP' },
];
const CLAIM = 'Rockwell fell hardest, down 54.3% on the week before.';
const ANSWER = `${CLAIM} Greenhills slipped a little and OPUS grew. I would look at Rockwell's products next.`;

function mountRoom() {
  const desk = (frames as { desk: Record<string, unknown> }).desk;
  const replays: { post: string; seq: number; argument: string; value: unknown }[] = [];
  axios.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const url = config.url ?? '';
    const ok = (data: unknown): AxiosResponse => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (url.endsWith('/definitions/desk')) return ok(desk);
    if (url.endsWith('/replay')) {
      const body = JSON.parse(String(config.data));
      replays.push(body);
      return ok({
        status: 'ok', tool: 'get_sales', rows_complete: true,
        arguments: { group_by: ['store'], date_range: body.value, compare_to: 'previous_period' },
        rows: ROWS, meta: META,
      });
    }
    if (url.includes('/standing/latest')) return ok(null);
    return ok([]);
  };
  useAuthStore.setState({
    user: { id: 'voice', username: 'owner', display_name: 'You', role: 'owner', allowed_pages: ['george'] },
  } as never);
  const ask = vi.fn(async () => {});
  const turns = [
    { role: 'user', text: 'how are we doing', at: '2026-09-18T06:00:00Z' },
    {
      role: 'george', text: ANSWER, thinking: '', at: '2026-09-18T06:00:05Z',
      reading: { claim: 'Rockwell fell hardest', caveat: null, next: null, asks: [] },
      toolCalls: [{
        seq: 0, tool: 'get_sales',
        arguments: { group_by: ['store'], date_range: 'last_7_days', compare_to: 'previous_period' },
        result: { rows: ROWS, meta: META },
      }],
      defaultComposition: { blocks: [{ op: 'put', kind: 'table', key: 't', seq: 0, tool: 'get_sales', weight: 'lead' }] },
      notices: [],
      post: { question_post_id: 'q-1', answer_post_id: 'post-1', thread_id: 't-1',
              conversation_id: 'c-1', visibility: 'org', stored: true },
    },
  ];
  const noop = () => {};
  const george = {
    turns, busy: false, threadId: null, storedThreadId: null,
    open: noop, ask, reset: noop, cancel: noop, setComposer: noop,
    presence: 'idle', live: null, composer: 'idle',
  } as unknown as GeorgeContext;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ask, replays, george, client };
}

function tree(george: GeorgeContext, client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <GeorgeCtx.Provider value={george}>
        <MemoryRouter initialEntries={['/george']}>
          <Routes><Route path="*" element={<Room />} /></Routes>
        </MemoryRouter>
      </GeorgeCtx.Provider>
    </QueryClientProvider>
  );
}

async function renderRoom(george: GeorgeContext, client: QueryClient) {
  const view = render(tree(george, client));
  // The definitions have loaded when the read-as chips are drawn.
  await waitFor(() => expect(document.querySelector('.r-steer .r-token')).not.toBeNull());
  return view;
}

describe('in the room: speaking is the same door as typing', () => {
  let rec: ReturnType<typeof fakeRecognition>;
  let synth: ReturnType<typeof fakeSynthesis>;
  beforeEach(() => {
    rec = fakeRecognition();
    synth = fakeSynthesis();
    vi.stubGlobal('webkitSpeechRecognition', rec.Ctor);
    vi.stubGlobal('speechSynthesis', synth.synth);
    vi.stubGlobal('SpeechSynthesisUtterance', synth.Utterance);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    try { localStorage.clear(); } catch { /* none */ }
  });
  // Unmounted BEFORE the browser's speech goes, as a page is.
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const hold = (said: string) => {
    fireEvent.pointerDown(mic());
    rec.now.hear(said, true);
    // Held long enough to be a hold, measured by the clock the hook reads.
    const t = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(t + HOLD_MS + 50);
    fireEvent.pointerUp(mic());
    clock.mockRestore();
  };

  it('two shops tapped and "compare these" spoken sends both as the selection', async () => {
    const { ask, george, client } = mountRoom();
    await renderRoom(george, client);
    const names = () => Array.from(document.querySelectorAll('button.r-mk-name--tap'));
    await waitFor(() => expect(names().length).toBeGreaterThanOrEqual(2));
    fireEvent.click(names().find((b) => b.textContent?.includes('Rockwell'))!);
    fireEvent.click(names().find((b) => b.textContent?.includes('Greenhills'))!);
    expect(Array.from(document.querySelectorAll('.r-chip--subject')).map((c) => c.textContent))
      .toEqual(['Rockwell ×', 'Greenhills ×']);

    hold('compare these');

    expect(ask).toHaveBeenCalledTimes(1);
    const [question, options] = ask.mock.calls[0] as unknown as [string, { desk: { selection: Record<string, unknown> } }];
    expect(question).toBe('compare these');
    expect(JSON.stringify(options.desk.selection)).toContain('s-rockwell');
    expect(JSON.stringify(options.desk.selection)).toContain('s-greenhills');
    expect(JSON.stringify(options.desk.selection)).not.toContain('s-opus');
  });

  it('a spoken "last 30 days" replays the read with no model call', async () => {
    const { ask, replays, george, client } = mountRoom();
    await renderRoom(george, client);
    hold('Last 30 days');
    await waitFor(() => expect(replays).toHaveLength(1));
    expect(replays[0]).toMatchObject({ post: 'post-1', seq: 0, value: 'last_30_days' });
    expect(ask).not.toHaveBeenCalled();
  });

  it('a spoken "last 90 days" is a question, exactly as typed — no window by that name is defined', async () => {
    const { ask, replays, george, client } = mountRoom();
    await renderRoom(george, client);
    hold('last 90 days');
    expect(ask).toHaveBeenCalledWith('last 90 days', expect.anything());
    expect(replays).toHaveLength(0);
  });

  it('hands-free reads the claim and nothing else, lit while he speaks, and a tap stops him', async () => {
    const { george, client } = mountRoom();
    const busy = { ...george, busy: true } as GeorgeContext;
    const view = await renderRoom(busy, client);
    fireEvent.click(document.querySelector('.r-hands')!);
    expect(document.querySelector('.r-hands')?.getAttribute('aria-pressed')).toBe('true');
    // The answer lands.
    view.rerender(tree(george, client));
    await waitFor(() => expect(synth.spoken).toHaveLength(1));
    expect(synth.spoken[0]).toBe(CLAIM);
    // Nothing else: none of the rest of what he said, no figure the claim did not carry.
    expect(synth.spoken[0]).not.toContain('OPUS');
    expect(synth.spoken[0]).not.toContain('2,436,641');
    await waitFor(() => expect(document.querySelector('.r-say--claim')?.getAttribute('data-speaking')).toBe('yes'));
    // A tap anywhere stops him mid-sentence.
    fireEvent.pointerDown(document.body);
    expect(synth.synth.cancel).toHaveBeenCalled();
    await waitFor(() => expect(document.querySelector('.r-say--claim')?.getAttribute('data-speaking')).toBeNull());
  });

  it('never reads an answer that was already there when the room opened', async () => {
    try { localStorage.setItem('george.handsFree', 'on'); } catch { /* none */ }
    const { george, client } = mountRoom();
    await renderRoom(george, client);
    expect(document.querySelector('.r-hands')?.getAttribute('aria-pressed')).toBe('true');
    expect(synth.spoken).toHaveLength(0);
  });

  it('"read it to me", spoken, reads the claim on screen and asks George nothing', async () => {
    const { ask, george, client } = mountRoom();
    await renderRoom(george, client);
    hold('read it to me');
    expect(synth.spoken).toEqual([CLAIM]);
    expect(ask).not.toHaveBeenCalled();
    synth.finish();
    await waitFor(() => expect(document.querySelector('.r-say--claim')?.getAttribute('data-speaking')).toBeNull());
  });
});
