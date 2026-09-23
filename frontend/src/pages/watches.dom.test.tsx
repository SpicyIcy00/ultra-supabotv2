// @vitest-environment jsdom
/**
 * W4.4's done-when, on the page itself.
 *
 * Every standing question and watch on ONE page, each with its slot, its last
 * run and what it last said; switched on or off in ONE gesture; and what it
 * was told readable. Plus the three things the card names as wrong today:
 *
 *   - an off row still carries its slot (the rail replaced it with "off");
 *   - rule 7 is READ before it is pressed — a watch with no backtest says
 *     why, above a switch that is drawn and disabled rather than hidden;
 *   - a watch that has never fired says so, and the page does not read as
 *     broken, because silence is a watch's normal state.
 *
 * And the two rules that hold everywhere: loading, failed and loaded are three
 * renderings (UI rule 8), and no number is drawn without a time on it (rule 6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Watching, WatchingRow } from '../services/standingApi';

const read = vi.fn();
const flip = vi.fn();
const move = vi.fn();
const word = vi.fn();
const gone = vi.fn();
vi.mock('../services/standingApi', () => ({
  getWatching: () => read(),
  switchWatching: (...a: unknown[]) => flip(...a),
  rescheduleWatching: (...a: unknown[]) => move(...a),
  rewriteWatching: (...a: unknown[]) => word(...a),
  removeWatching: (...a: unknown[]) => gone(...a),
  anchorOf: (r: { family: string; id: string }) => `${r.family}-${r.id}`,
  refusalOf: (e: { detail?: string }) => e?.detail ?? 'That could not be done.',
}));
vi.mock('../room/RoomShell', () => ({
  RoomHead: ({ title, says }: { title: string; says?: string }) => (
    <header><h1>{title}</h1><p>{says}</p></header>
  ),
}));
const registered = vi.fn();
vi.mock('../hooks/useHere', () => ({ useRegisterHere: (h: unknown) => registered(h) }));

import WatchesPage, { silenceOf, slotTime, WATCHES_LABEL } from './WatchesPage';

function question(over: Partial<WatchingRow> = {}): WatchingRow {
  return {
    id: 'q1', family: 'question', asks: 'How are we doing?',
    when: 'every day at 08:00', on: false, state: 'switched off',
    told: ['Show more of Rockwell.'], told_by: 'instructions',
    slot: { kind: 'daily', hour: 8, minute: 0, days_of_week: null },
    last_run_at: null, last_status: null, last_error: null, last_said: null,
    thread_id: null, checks: null, spoke: null, backtest: null,
    backtest_at: null, backtest_window: null, switch_on_refusal: null,
    may: { switch: true, reschedule: true, rewrite: true, remove: true },
    ...over,
  };
}

function watch(over: Partial<WatchingRow> = {}): WatchingRow {
  return {
    ...question(),
    id: 'w1', family: 'watch', asks: 'A shop’s sales drop — any shop',
    when: 'Mon at 08:00', state: 'not backtested yet',
    told: ['A shop’s sales drop', 'only when it moves down', 'every shop'],
    told_by: 'condition',
    slot: { kind: 'weekly', hour: 8, minute: 0, days_of_week: [0] },
    checks: 0, spoke: 0,
    switch_on_refusal: 'This watch has not been backtested, so nobody knows how often it would speak.',
    may: { switch: true, reschedule: true, rewrite: false, remove: true },
    ...over,
  };
}

const EMPTY: Watching = { questions: [], watches: [] };

function page() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><WatchesPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  read.mockReset(); flip.mockReset(); move.mockReset(); word.mockReset();
  gone.mockReset(); registered.mockReset();
  read.mockResolvedValue(EMPTY);
});
afterEach(cleanup);

// ---------------------------------------------------------------------------
// Both families, on one page
// ---------------------------------------------------------------------------

describe('every standing question and watch, on one page', () => {
  it('draws both families under their own words, with their slots', async () => {
    read.mockResolvedValue({ questions: [question()], watches: [watch()] });
    page();
    expect(await screen.findByText('How are we doing?')).toBeTruthy();
    // Its name is the heading; the same words also appear under "what it
    // watches", because a watch IS its condition.
    expect(screen.getByRole('heading', { name: /A shop’s sales drop/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Standing questions' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Watches' })).toBeTruthy();
    // The room's word, in the title and in what the page calls itself.
    expect(screen.getByRole('heading', { name: WATCHES_LABEL })).toBeTruthy();
  });

  it('gives every row an anchor the rail can link straight to', async () => {
    read.mockResolvedValue({ questions: [question()], watches: [watch()] });
    const { container } = page();
    await screen.findByText('How are we doing?');
    expect(container.querySelector('#question-q1')).toBeTruthy();
    expect(container.querySelector('#watch-w1')).toBeTruthy();
  });

  it('brings the linked row into view once it exists', async () => {
    read.mockResolvedValue({ questions: [question()], watches: [watch()] });
    const seen: unknown[] = [];
    const real = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function into(this: Element) { seen.push(this.id); };
    try {
      render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/watches#watch-w1']}><WatchesPage /></MemoryRouter>
        </QueryClientProvider>,
      );
      await screen.findByText('How are we doing?');
      // The rows arrive after the document does, so the browser's own hash
      // resolution has already run and found nothing.
      await waitFor(() => expect(seen).toContain('watch-w1'));
    } finally {
      Element.prototype.scrollIntoView = real;
    }
  });

  it('tells Bob what is on it — names only, never a figure', async () => {
    read.mockResolvedValue({ questions: [question()], watches: [watch()] });
    page();
    await screen.findByText('How are we doing?');
    await waitFor(() => expect(registered).toHaveBeenCalled());
    const here = registered.mock.calls.at(-1)?.[0] as { key: string; subjects: string[] };
    expect(here.key).toBe('watches');
    expect(here.subjects).toEqual(['How are we doing?', 'A shop’s sales drop — any shop']);
  });
});

// ---------------------------------------------------------------------------
// The slot is always a time
// ---------------------------------------------------------------------------

describe('its slot, whether it is on or off', () => {
  it('draws the time on an off row as well as an on one', async () => {
    read.mockResolvedValue({
      questions: [question({ on: false }), question({ id: 'q2', on: true, asks: 'Reorders?',
                                                     state: 'asked on schedule' })],
      watches: [],
    });
    const { container } = page();
    await screen.findByText('Reorders?');
    const rows = container.querySelectorAll('.r-item');
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.textContent).toContain('every day at 08:00'));
    // The switch says what pressing it does; the slot never stands in for it.
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: /Switch on/ })).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByRole('button', { name: /Switch off/ })).toBeTruthy();
  });

  it('reads the slot back out of what the service holds', () => {
    expect(slotTime(question())).toBe('08:00');
    expect(slotTime(question({ slot: { kind: 'daily', hour: 6, minute: 5, days_of_week: null } })))
      .toBe('06:05');
  });
});

// ---------------------------------------------------------------------------
// One gesture, and rule 7
// ---------------------------------------------------------------------------

describe('one gesture switches it on or off', () => {
  it('switches a standing question on through the server and takes the row back', async () => {
    read.mockResolvedValue({ questions: [question()], watches: [] });
    flip.mockResolvedValue(question({ on: true, state: 'asked on schedule' }));
    page();
    fireEvent.click(await screen.findByRole('button', { name: /Switch on/ }));
    await waitFor(() => expect(flip).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }), true));
    expect(await screen.findByRole('button', { name: /Switch off/ })).toBeTruthy();
  });

  it('shows a refusal in the server’s own words and leaves the switch where it was', async () => {
    read.mockResolvedValue({ questions: [question()], watches: [] });
    flip.mockRejectedValue({ detail: 'No standing question of yours has that id.' });
    page();
    fireEvent.click(await screen.findByRole('button', { name: /Switch on/ }));
    expect(await screen.findByText('No standing question of yours has that id.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Switch on/ })).toBeTruthy();
  });

  it('says WHY a watch cannot be switched on, above a switch it draws and disables', async () => {
    read.mockResolvedValue({ questions: [], watches: [watch()] });
    const { container } = page();
    const said = await screen.findByText(/has not been backtested/);
    const row = container.querySelector('#watch-w1') as HTMLElement;
    const button = within(row).getByRole('button', { name: /Switch on/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    // ABOVE the control it governs, and never wearing the accent (UI rules 4, 5).
    expect(said.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.querySelector('.r-w-gate')?.className).not.toContain('accent');
  });

  it('lets a backtested watch be switched on, and shows when that was measured', async () => {
    read.mockResolvedValue({ questions: [], watches: [watch({
      state: 'ready — not switched on', switch_on_refusal: null,
      backtest: '9 of the last 60 days', backtest_window: '2026-07-25 to 2026-09-22',
      backtest_at: '2026-09-22T09:00:00+08:00',
    })] });
    page();
    const button = await screen.findByRole('button', { name: /Switch on/ });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    // UI rule 6: the measurement carries its measuring time and its window.
    const line = screen.getByText(/would have spoken on 9 of the last 60 days/);
    expect(line.textContent).toContain('2026-07-25 to 2026-09-22');
    expect(line.textContent).toMatch(/measured 22 Sep/);
  });
});

// ---------------------------------------------------------------------------
// What it last said, and what it was told
// ---------------------------------------------------------------------------

describe('what it last said, and what it was told', () => {
  it('quotes the answer with its read time and a way into the thread', async () => {
    read.mockResolvedValue({ questions: [question({
      on: true, state: 'asked on schedule', last_run_at: '2026-09-23T08:01:00+08:00',
      last_status: 'ok', thread_id: 't1',
      last_said: { said: 'Yesterday was steady across the estate.',
                   at: '2026-09-23T08:01:00+08:00', read_at: '2026-09-23T08:00:00+08:00',
                   thread_id: 't1', post_id: 'p1' },
    })], watches: [] });
    page();
    expect(await screen.findByText('Yesterday was steady across the estate.')).toBeTruthy();
    // Its receipts line is built from several nodes, so read the whole line.
    const receipts = (await screen.findByText('Yesterday was steady across the estate.'))
      .parentElement?.querySelector('.r-src');
    expect(receipts?.textContent).toMatch(/said 23 Sep/);
    expect(receipts?.textContent).toMatch(/read 23 Sep/);
    expect(screen.getByRole('link', { name: 'open the thread' }).getAttribute('href')).toBe('/w/t1');
  });

  it('reads out what a question was told, and says who adds one', async () => {
    read.mockResolvedValue({ questions: [question()], watches: [] });
    page();
    expect(await screen.findByText('Show more of Rockwell.')).toBeTruthy();
    expect(screen.getByText(/Ask Bob to add or remove a standing instruction/)).toBeTruthy();
  });

  it('reads out what a watch watches, and offers no wording to change', async () => {
    read.mockResolvedValue({ questions: [], watches: [watch()] });
    page();
    await screen.findByText('only when it moves down');
    expect(screen.getByText('every shop')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    // Not a dead control: it says a watch has no wording, and draws none.
    expect(screen.getByText(/A watch has no wording to change/)).toBeTruthy();
    expect(screen.queryByLabelText('asks')).toBeNull();
    expect(screen.getByLabelText('slot')).toBeTruthy();
  });

  it('moves the slot through the server, keeping the days it did not change', async () => {
    read.mockResolvedValue({ questions: [], watches: [watch()] });
    move.mockResolvedValue(watch({ when: 'Mon at 09:30' }));
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('slot'), { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move it' }));
    await waitFor(() => expect(move).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'w1' }),
      { hour: 9, minute: 30, kind: 'weekly', days_of_week: [0] },
    ));
  });

  it('rewrites what a standing question asks', async () => {
    read.mockResolvedValue({ questions: [question()], watches: [] });
    word.mockResolvedValue(question({ asks: 'How did yesterday go?' }));
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('asks'), { target: { value: 'How did yesterday go?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite it' }));
    await waitFor(() => expect(word).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'q1' }), 'How did yesterday go?'));
  });
});

// ---------------------------------------------------------------------------
// Silence is normal
// ---------------------------------------------------------------------------

describe('a watch that has never fired says so', () => {
  it('counts the checks and the times it spoke, off the record', () => {
    expect(silenceOf(watch({ on: true, checks: 11, spoke: 0 })))
      .toBe('11 checks, and it has not spoken. Silence is normal for a watch.');
    expect(silenceOf(watch({ on: true, checks: 11, spoke: 2 }))).toBe('11 checks, spoken on 2.');
    expect(silenceOf(watch({ on: true, checks: 0 })))
      .toBe('Switched on and not checked yet — it runs at its slot.');
    expect(silenceOf(watch({ on: false, checks: 0 })))
      .toBe('Not checked yet: it is switched off.');
    // A standing question has no such counts and is never given one.
    expect(silenceOf(question())).toBeNull();
  });

  it('draws it as normal rather than as a failure, with the time it last looked', async () => {
    read.mockResolvedValue({ questions: [], watches: [watch({
      on: true, state: 'watching', switch_on_refusal: null, checks: 11, spoke: 0,
      last_run_at: '2026-09-23T08:00:00+08:00', last_status: 'quiet',
      backtest: '9 of the last 60 days', backtest_at: '2026-09-22T09:00:00+08:00',
    })] });
    page();
    expect(await screen.findByText(/Silence is normal for a watch/)).toBeTruthy();
    // "quiet" is the normal outcome and is never drawn as a last-run failure.
    expect(screen.queryByText(/last run/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Three renderings (UI rule 8)
// ---------------------------------------------------------------------------

describe('loading, failed and loaded are three things', () => {
  it('says checking, then could not be read, then none yet — never one for another', async () => {
    let resolve!: (v: Watching) => void;
    read.mockReturnValue(new Promise<Watching>((r) => { resolve = r; }));
    page();
    expect(screen.getAllByText('Checking…').length).toBe(2);
    expect(screen.queryByText(/None yet/)).toBeNull();
    resolve(EMPTY);
    expect((await screen.findAllByText(/None yet. Ask Bob for one./)).length).toBe(2);
  });

  it('says these could not be read, and never "none yet"', async () => {
    read.mockRejectedValue(new Error('down'));
    page();
    expect((await screen.findAllByText('These could not be read.')).length).toBe(2);
    expect(screen.queryByText(/None yet/)).toBeNull();
  });
});
