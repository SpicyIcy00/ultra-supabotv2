// @vitest-environment jsdom
/**
 * VISIBLE WORK, AS RENDERED (P1.k).
 *
 * The card's own done-when, three claims, each one a test below:
 *
 *   "why is Rockwell down" shows four steps with times and a finding after;
 *   every read in Behind it has source, filters and time;
 *   nothing model-written appears in a mono line.
 *
 * THE LAST ONE IS A SCAN, not a review. It reads room.css for every class
 * whose rule sets `var(--mono)`, renders the work surfaces over a turn whose
 * prose is distinctive, and fails if one of George's own strings lands inside
 * one of them. The mono face is where frame-derived strings live — a source
 * table, a duration, a filter the definitions applied — and a sentence he
 * wrote wearing it is a claim borrowing the authority of a receipt. P2.b
 * extends the same scan to the other direction.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnswerTurn } from './data';
import { Reading } from './Reading';
import { WorkLine, Working } from './Working';
import { BehindIt } from './BehindIt';
import recorded from './__fixtures__/recorded-runs.json';

afterEach(cleanup);

const FILTERS = [
  "t.status <> 'cancelled'   # metrics.yaml: filters.cancelled",
  "t.store_id IN (1: Rockwell)   # metrics.yaml: stores.active_retail",
];

function meta(over: Record<string, unknown> = {}) {
  return {
    source_table: 'new_transactions',
    metric_label: 'Net sales',
    group_by: ['store'],
    window: { name: 'last_week' },
    snapshot_timestamp: '2026-09-14T08:00:00Z',
    filters_applied: FILTERS,
    ...over,
  };
}

function read(seq: number, tool: string, ms: number, rows: Record<string, unknown>[]) {
  return {
    seq, tool, arguments: { date_range: 'last_week' },
    result: {
      row_count: rows.length, source_table: 'new_transactions', truncated: false,
      duration_ms: ms, error: null, rows, rows_complete: true, meta: meta(),
    },
  };
}

/** "why is Rockwell down": the primary, its two drivers, the breakdown, the board. */
const WHY: AnswerTurn = {
  role: 'george',
  text: 'Rockwell is down ₱18,400 on last week, and it is basket size rather than footfall.',
  thinking: '',
  at: '2026-09-14T08:00:00Z',
  toolCalls: [
    read(0, 'get_sales', 412, [{ store: 'Rockwell', value: 203717, change_pct: -8.3 }]),
    read(1, 'get_sales', 260, [{ store: 'Rockwell', value: 1187 }]),
    read(2, 'get_sales', 318, [{ store: 'Rockwell', value: 171.6 }]),
    read(3, 'get_stock', 155, [{ product: 'Aji Mix', quantity_on_hand: 0 }]),
    {
      seq: 4, tool: 'compose', arguments: {},
      result: { row_count: 0, source_table: null, truncated: false, duration_ms: 9, error: null },
    },
  ],
  notices: [{ kind: 'partial_window', message: 'this week is not over yet' }],
  pinned: [], saved: [], pageChanges: [],
  reading: { claim: 'down ₱18,400 on last week', next: 'check the basket at the till' },
  done: { duration_ms: 19_000 } as AnswerTurn['done'],
} as AnswerTurn;

describe('the steps, while he works', () => {
  it('shows every call with what it is, what came back and how long it took', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'));
    const { container } = render(<Working turn={WHY} live />);
    const lines = Array.from(container.querySelectorAll('.r-work'))
      .map((e) => e.textContent ?? '');
    // Four reads, each with its own clock off its own frame.
    expect(lines[0]).toContain('read sales');
    expect(lines[0]).toContain('412ms');
    expect(lines[3]).toContain('counted stock');
    expect(lines[3]).toContain('155ms');
    expect(lines.filter((l) => /\d+ms/.test(l))).toHaveLength(5);
    vi.useRealTimers();
  });

  it('opens one step on its own receipts, and closes it again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'));
    const { container } = render(<Working turn={WHY} live />);
    const step = container.querySelectorAll('.r-work--step')[0];
    fireEvent.click(step);
    expect(container.querySelector('.r-work-receipts')?.textContent)
      .toContain('new_transactions');
    fireEvent.click(step);
    expect(container.querySelector('.r-work-receipts')).toBeNull();
    vi.useRealTimers();
  });
});

describe('the line above the claim', () => {
  it('is four counts off the turn, and the steps are one tap under it', () => {
    const { container } = render(<WorkLine turn={WHY} />);
    const line = container.querySelector('.r-workline-line') as HTMLElement;
    expect(line.textContent).toBe('4 reads · 5 tools · 19.0s · 1 caveat');
    expect(container.querySelector('.r-work-trail')).toBeNull();
    fireEvent.click(line);
    expect(container.querySelectorAll('.r-work').length).toBeGreaterThanOrEqual(5);
  });

  it('draws nothing for a turn that called nothing', () => {
    // He answered from what he already had. "0 reads · 0 tools" would be a
    // line about an absence.
    const { container } = render(
      <WorkLine turn={{ ...WHY, toolCalls: [] } as AnswerTurn} />);
    expect(container.textContent).toBe('');
  });

  it('and the work line is what is left once the trail is gone', () => {
    // The trail is live only; the line outlives the turn. Between them the
    // work is on screen at every moment of it.
    const { container } = render(<Working turn={WHY} live={false} />);
    expect(container.textContent).toBe('');
  });
});

describe('behind it', () => {
  const THREAD = [WHY, { ...WHY, at: '2026-09-14T08:06:00Z' } as AnswerTurn];

  it('lists every read of the thread with its source, its filters and its time', () => {
    const { container } = render(<BehindIt answers={THREAD} onBack={() => {}} />);
    const reads = container.querySelectorAll('.r-behind-read');
    // Four reads per answer, twice; the compose is not a read.
    expect(reads).toHaveLength(8);
    for (const entry of Array.from(reads)) {
      const text = entry.textContent ?? '';
      expect(text).toContain('from new_transactions');
      expect(text).toContain('filters cancelled');
      expect(text).toMatch(/read .*Sep/);
    }
  });

  it('shows no tool name and no argument anywhere in it', () => {
    const { container } = render(<BehindIt answers={THREAD} onBack={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('get_sales');
    expect(text).not.toContain('date_range');
    expect(text).toContain('read sales');
  });

  it('draws a refused read as refused, in the tool\'s own words', () => {
    const refused = {
      ...WHY,
      toolCalls: [{
        seq: 0, tool: 'get_sales', arguments: {},
        result: {
          row_count: null, source_table: null, truncated: false, duration_ms: 2,
          error: 'this_month is still running; compare last_month instead.',
        },
      }],
    } as AnswerTurn;
    const { container } = render(<BehindIt answers={[refused]} onBack={() => {}} />);
    expect(container.textContent).toContain('last_month instead');
    // And it claims no receipts it does not have.
    expect(container.textContent).not.toContain('from new_transactions');
  });

  it('says a thread has read nothing only from the list it holds', () => {
    const { container } = render(
      <BehindIt answers={[{ ...WHY, toolCalls: [] } as AnswerTurn]} onBack={() => {}} />);
    expect(container.textContent).toContain('nothing has been read');
  });
});

describe('a figure in the claim jumps to its read', () => {
  it('does not underline a figure of his that no read returned', () => {
    // ₱18,400 is the difference he worked out; no row of this turn holds it,
    // and an underline is a promise that there is something behind it.
    const { container } = render(
      <Reading text={WHY.text} reading={WHY.reading}
               calls={WHY.toolCalls} onFigure={() => {}} />);
    expect(container.querySelector('.r-figure')).toBeNull();
    expect(container.textContent).toContain('₱18,400');
  });

  it('places a figure on the read that returned it', () => {
    const jumped: number[] = [];
    const turn = {
      ...WHY,
      text: 'Rockwell did ₱203,717, and the basket is ₱171.60.',
      reading: { claim: 'Rockwell did ₱203,717, and the basket is ₱171.60.' },
    } as AnswerTurn;
    const { container } = render(
      <Reading text={turn.text} reading={turn.reading}
               calls={turn.toolCalls} onFigure={(seq) => jumped.push(seq)} />);
    const figures = Array.from(container.querySelectorAll('.r-figure'));
    expect(figures.map((f) => f.textContent)).toEqual(['₱203,717', '₱171.60']);
    fireEvent.click(figures[1]);
    // The basket came out of the third read, not the first.
    expect(jumped).toEqual([2]);
  });

  it('leaves the claim a sentence when nothing in it can be placed', () => {
    const { container } = render(
      <Reading text="Nothing here needs you today."
               reading={{ claim: 'Nothing here needs you today.' }}
               calls={WHY.toolCalls} onFigure={() => {}} />);
    expect(container.querySelector('.r-figure')).toBeNull();
    expect(container.textContent).toContain('Nothing here needs you today.');
  });
});

/**
 * THE RECORDED RUNS — the same eight the marks were replayed through (P1.e),
 * and the reason they are here rather than a fixture of my own: every filter
 * line, every source table and every snapshot in them is a real read George
 * really made, and a view that holds over invented meta is a view that holds
 * over what I imagined a tool returns.
 */
describe('behind it, over the runs that actually happened', () => {
  const runs = (recorded as { runs: { question: string; calls: unknown[] }[] }).runs;

  it('gives every read that landed a source, its filters and the time it was read', () => {
    const answers = runs.map((run) => ({
      role: 'george', text: run.question, thinking: '', at: '2026-09-14T08:00:00Z',
      toolCalls: run.calls, notices: [], pinned: [], saved: [], pageChanges: [],
    })) as unknown as AnswerTurn[];
    const { container } = render(<BehindIt answers={answers} onBack={() => {}} />);
    const reads = Array.from(container.querySelectorAll('.r-behind-read'));
    expect(reads.length).toBe(runs.reduce((n, r) => n + r.calls.length, 0));
    for (const entry of reads) {
      const text = entry.textContent ?? '';
      expect(text, text).toMatch(/from \w+/);
      expect(text, text).toMatch(/read \w/);
      expect(entry.querySelectorAll('.r-behind-filters li').length,
             `no filters drawn: ${text}`).toBeGreaterThan(0);
    }
  });

  it('puts the definition on the line and the predicate under it', () => {
    // Where a tool named the definition it applied — 75 of the 79 filters in
    // these runs — the line a person reads is that definition and the SQL sits
    // beneath it. The other four are lines the tools wrote as words with no
    // provenance at all ("brief written on 2026-09-14 (Asia/Manila)"), and
    // those are drawn whole: there is no second half to promote, and dropping
    // them would drop a receipt.
    const answers = runs.map((run) => ({
      role: 'george', text: run.question, thinking: '', at: '2026-09-14T08:00:00Z',
      toolCalls: run.calls, notices: [], pinned: [], saved: [], pageChanges: [],
    })) as unknown as AnswerTurn[];
    const { container } = render(<BehindIt answers={answers} onBack={() => {}} />);
    const entries = Array.from(container.querySelectorAll('.r-behind-filters li'));
    const split = entries.filter((li) => li.querySelector('.r-src'));
    expect(split.length).toBeGreaterThan(entries.length * 0.9);
    for (const li of split) {
      const label = li.querySelector('.r-behind-filter')?.textContent ?? '';
      expect(label, label).not.toMatch(/[<>=(]|IS NULL/);
      // And the predicate is kept, never dropped for being code.
      expect((li.querySelector('.r-src')?.textContent ?? '').length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------- the scan */

/** Every class whose rule sets the mono face, read out of room.css. */
function monoClasses(): string[] {
  const css = readFileSync(join(__dirname, 'room.css'), 'utf-8');
  const out = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/var\(--mono\)/.test(m[2])) continue;
    for (const cls of m[1].matchAll(/\.([\w-]+)/g)) out.add(cls[1]);
  }
  return [...out];
}

describe('nothing model-written appears in a mono line', () => {
  it('finds the mono classes in the stylesheet rather than being told them', () => {
    const classes = monoClasses();
    expect(classes).toContain('r-src');
    expect(classes).toContain('r-work-n');
    expect(classes).toContain('r-workline-line');
  });

  it('holds for every work surface, over a turn whose prose is unmistakable', () => {
    const classes = monoClasses();
    const said = 'Rockwell is down ₱18,400 on last week, and it is basket size rather than footfall.';
    const { container } = render(
      <>
        <WorkLine turn={WHY} onBehind={() => {}} />
        <BehindIt answers={[WHY]} onBack={() => {}} />
        <Reading text={said} reading={WHY.reading} calls={WHY.toolCalls} onFigure={() => {}} />
      </>,
    );
    // Open the steps, so what the fold hides is scanned too.
    fireEvent.click(container.querySelector('.r-workline-line') as HTMLElement);
    // WORDS THAT ARE HIS AND NOT THE DATA'S. A shop is named in the rows, in
    // the filters and in his sentence, and a receipt printing "Rockwell" is
    // printing what the tool returned — the scan is for his PROSE, so a word
    // that appears anywhere in the turn's frames is not evidence of it.
    const frames = JSON.stringify(WHY.toolCalls).toLowerCase();
    const words = said.split(/\s+/)
      .filter((w) => w.length > 4 && !frames.includes(w.toLowerCase()));
    expect(words.length).toBeGreaterThan(4);
    for (const cls of classes) {
      for (const el of Array.from(container.querySelectorAll(`.${cls}`))) {
        const text = el.textContent ?? '';
        for (const word of words) {
          expect(text.includes(word), `${cls} carries his words: ${text}`).toBe(false);
        }
      }
    }
  });
});
