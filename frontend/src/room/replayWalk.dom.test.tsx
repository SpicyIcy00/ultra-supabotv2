/**
 * REPLAY — a finished ladder, walked (P2.e).
 *
 * The card's done-when, twice: a stored *"why was North Edsa up"* walks its
 * steps out of the post's own calls with nothing asked of anything, and a step
 * that was refused shows the refusal.
 *
 * THE LADDER HERE IS A REAL ONE. `__fixtures__/recorded-runs.json` is the
 * recorded eval run, and `dogfood-remainder-caveats/why` is five calls that
 * are the investigation ladder as the definitions describe it: the transaction
 * count and the basket value against the previous period, net sales beside
 * them, then the week by day and the products that gained. Those rows came off
 * the estate; nothing in this file invents one.
 *
 * WHAT THESE HOLD, beyond the two done-whens:
 *
 *   - NOTHING IS ASKED. No fetch, no query client, no props but the turns.
 *   - A ROW IS NEVER DRAWN WITHOUT ITS TIME (UI rule 6) — a record that kept
 *     rows and no snapshot draws no table and says why.
 *   - FOUR STATES, FOUR RENDERINGS (UI rule 8): landed with rows, landed with
 *     the rows not kept, declined, running.
 *   - NO TOOL NAME AND NO ARGUMENT REACHES THE SCREEN, the rule Behind it has.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Replay } from './Replay';
import { restoreFromPosts } from './restore';
import type { GeorgeTurn, ToolCall } from '../types/george';
import type { Post } from '../types/river';
import recorded from './__fixtures__/recorded-runs.json';

afterEach(cleanup);

/** The recorded ladder: "Why was North Edsa up so much last week?" */
const RUN = recorded.runs.find((r) => r.run === 'dogfood-remainder-caveats/why')!;

/**
 * The recorded calls as a thread, the way a reopened one arrives: the
 * question, then the answer carrying the calls with their rows and receipts.
 */
function thread(over: Record<string, unknown> = {}): GeorgeTurn[] {
  return [
    { role: 'user', text: RUN.question, at: '2026-09-13T15:18:10Z' },
    {
      role: 'george',
      text: 'Transactions carried it; the basket fell.',
      thinking: '',
      at: '2026-09-13T15:18:30Z',
      toolCalls: RUN.calls.map((c, n) => ({
        seq: c.seq,
        tool: c.tool,
        arguments: c.arguments,
        result: {
          row_count: (c.result?.rows ?? []).length,
          source_table: c.result?.meta?.source_table ?? null,
          truncated: false,
          duration_ms: 400 + n * 130,
          error: null,
          rows: c.result?.rows ?? [],
          rows_complete: true,
          meta: c.result?.meta ?? null,
        },
      })),
      notices: [],
      ...over,
    },
  ] as unknown as GeorgeTurn[];
}

/** One turn built by hand, for the states the recorded run does not carry. */
function turnWith(calls: unknown[]): GeorgeTurn[] {
  return [
    { role: 'user', text: 'why is Rockwell down?', at: '2026-09-14T08:00:00Z' },
    {
      role: 'george', text: 'It is the basket.', thinking: '',
      at: '2026-09-14T08:00:20Z', toolCalls: calls, notices: [],
    },
  ] as unknown as GeorgeTurn[];
}

const META = {
  source_table: 'new_transactions',
  metric_label: 'Net sales',
  window: { name: 'last_week' },
  snapshot_timestamp: '2026-09-14T08:00:00Z',
  filters_applied: ["t.store_id IN (2: Rockwell)   # metrics.yaml: stores.active_retail"],
};

describe('a stored investigation is walked from the post\'s own calls', () => {
  it('draws every step of the ladder, in the order it ran', () => {
    render(<Replay turns={thread()} onBack={vi.fn()} />);
    expect(screen.getByText(/step 1 of 5/i)).toBeTruthy();
    const lines = Array.from(document.querySelectorAll('.r-walk-line'))
      .map((b) => b.textContent ?? '');
    expect(lines).toHaveLength(5);
    // Five reads of sales, said in words rather than in the tool's name.
    expect(lines.every((l) => l.includes('read sales'))).toBe(true);
    // The rungs are numbered in the order they ran, one to five.
    expect(lines.map((l) => l.trim()[0])).toEqual(['1', '2', '3', '4', '5']);
  });

  it('heads the rungs with the question they were taken under', () => {
    render(<Replay turns={thread()} onBack={vi.fn()} />);
    const asked = document.querySelectorAll('.r-walk-asked');
    // One heading for one run of five steps, not one per step.
    expect(asked).toHaveLength(1);
    expect(asked[0].textContent).toContain('Why was North Edsa up so much last week?');
  });

  it('shows the rows the step brought back, with the receipts of the read', () => {
    render(<Replay turns={thread()} onBack={vi.fn()} />);
    const open = document.querySelector('.r-walk-open')!;
    // Step 1 verified the transaction count: 536 against 400, up 34%.
    expect(open.textContent).toContain('536');
    expect(open.textContent).toContain('400');
    // And the receipts under them say what was measured and when it was read.
    expect(open.textContent).toContain('Transactions');
    expect(open.textContent).toMatch(/read \w+ \d+/);
    expect(open.textContent).toContain('from new_transactions');
  });

  it('walks: next and back move one rung, and the rows move with them', () => {
    render(<Replay turns={thread()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('next →'));
    expect(screen.getByText(/step 2 of 5/i)).toBeTruthy();
    // The basket, which is the rung that answers the question.
    expect(document.querySelector('.r-walk-open')!.textContent).toContain('322.71');
    fireEvent.click(screen.getByText('← back'));
    expect(screen.getByText(/step 1 of 5/i)).toBeTruthy();
    expect(document.querySelector('.r-walk-open')!.textContent).toContain('536');
  });

  it('steps with the arrow keys, because a walk is stepped through', () => {
    render(<Replay turns={thread()} onBack={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/step 3 of 5/i)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText(/step 2 of 5/i)).toBeTruthy();
  });

  it('does not walk off either end', () => {
    render(<Replay turns={thread()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('← back'));
    expect(screen.getByText(/step 1 of 5/i)).toBeTruthy();
    for (let i = 0; i < 9; i += 1) fireEvent.click(screen.getByText('next →'));
    expect(screen.getByText(/step 5 of 5/i)).toBeTruthy();
  });

  it('says how long each step took, off the record rather than off a guess', () => {
    render(<Replay turns={thread()} onBack={vi.fn()} />);
    const lines = Array.from(document.querySelectorAll('.r-walk-line'))
      .map((b) => b.textContent ?? '');
    expect(lines[0]).toContain('400ms');
    expect(lines[4]).toContain('920ms');
  });

  it('draws no tool name and no argument anywhere on the screen', () => {
    const { container } = render(<Replay turns={thread()} onBack={vi.fn()} />);
    const text = container.textContent ?? '';
    // The CALL's own vocabulary. `previous_period` is deliberately not in
    // this list: it appears on screen inside a `filters_applied` predicate
    // the TOOL wrote, which is a receipt and is exactly what this view is
    // for. What must never appear is the call the client is holding.
    for (const forbidden of ['get_sales', 'group_by', 'compare_to', 'date_range',
                             'rank_by', 'top_n']) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe('the done-when, literally: out of the POST, after a reload', () => {
  /**
   * WHAT A REOPENED THREAD ACTUALLY HOLDS, and the two halves it comes in.
   * `/chats/{id}` gives the calls with their clocks and their errors out of
   * george.tool_calls, and the answer POST gives the rows out of
   * `payload.charted`; `restoreFromPosts` is what puts the second onto the
   * first. Walking that is the card's own done-when, and this drives the real
   * function rather than a turn shaped by hand to look like its output.
   */
  const stored: GeorgeTurn[] = [
    { role: 'user', text: RUN.question, at: '2026-09-13T15:18:10Z' },
    {
      role: 'george', text: 'Transactions carried it; the basket fell.',
      thinking: '', at: '2026-09-13T15:18:30Z', notices: [],
      // The chat history keeps the call and its clock, and no rows at all.
      toolCalls: RUN.calls.map((c, n) => ({
        seq: c.seq, tool: c.tool, arguments: c.arguments,
        result: {
          row_count: (c.result?.rows ?? []).length,
          source_table: c.result?.meta?.source_table ?? null,
          truncated: false, duration_ms: 400 + n * 130, error: null,
        },
      })) as unknown as ToolCall[],
      post: {
        question_post_id: 'q1', answer_post_id: 'a1', thread_id: 't',
        conversation_id: 'c', visibility: 'private', stored: true,
      },
    },
  ] as unknown as GeorgeTurn[];

  const post = {
    id: 'a1', thread_id: 't', parent_id: 'q1', kind: 'answer', author: 'george',
    author_user: null, owner_user: 'me', visibility: 'private', mine: true,
    body: 'x', receipts: null, notices: [], conversation_id: 'c', created_at: null,
    payload: { charted: RUN.calls.map((c) => ({
      seq: c.seq, tool: c.tool, arguments: c.arguments,
      rows: c.result?.rows ?? [], meta: c.result?.meta ?? null,
    })) },
  } as unknown as Post;

  it('walks the stored ladder with its rows, its receipts and its times', () => {
    render(<Replay turns={restoreFromPosts(stored, [post])} onBack={vi.fn()} />);
    expect(screen.getByText(/step 1 of 5/i)).toBeTruthy();
    const open = document.querySelector('.r-walk-open')!;
    // The rows are the post's, and they carry the read's own receipts.
    expect(open.querySelector('.r-rows')).not.toBeNull();
    expect(open.textContent).toContain('536');
    expect(open.textContent).toMatch(/read \w+ \d+/);
    // The clock is the log's, not the post's — the post never held one.
    expect(document.querySelector('.r-walk-line')!.textContent).toContain('400ms');
  });

  it('reaches the last rung of the ladder, which localized by product', () => {
    render(<Replay turns={restoreFromPosts(stored, [post])} onBack={vi.fn()} />);
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByText('next →'));
    expect(screen.getByText(/step 5 of 5/i)).toBeTruthy();
    const open = document.querySelector('.r-walk-open')!;
    expect(open.textContent).toContain('Aji Mix');
    expect(open.textContent).toContain('Product revenue');
  });
});

describe('a step with a refusal shows the refusal', () => {
  const REFUSED = [
    {
      seq: 0, tool: 'get_sales', arguments: { date_range: 'last_week' },
      result: {
        row_count: 1, source_table: 'new_transactions', truncated: false,
        duration_ms: 310, error: null,
        rows: [{ store: 'Rockwell', value: 203717, change_pct: -12.1, direction: 'down', unit: 'PHP' }],
        rows_complete: true, meta: META,
      },
    },
    {
      seq: 1, tool: 'get_sales', arguments: { compare_to: 'same_period_last_year' },
      result: {
        row_count: null, source_table: null, truncated: false, duration_ms: 90,
        error: 'Year-on-year is not supported: the estate is a different shape a '
          + 'year apart. Define a same-store rule first, then add the comparison.',
        rows: [], rows_complete: false, meta: null,
      },
    },
  ];

  it('gives the tool its own sentence, whole', () => {
    render(<Replay turns={turnWith(REFUSED)} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('next →'));
    const open = document.querySelector('.r-walk-open')!;
    expect(open.textContent).toContain('Year-on-year is not supported');
    expect(open.textContent).toContain('Define a same-store rule first');
  });

  it('marks it declined on its line, and claims no receipts it does not have', () => {
    render(<Replay turns={turnWith(REFUSED)} onBack={vi.fn()} />);
    const lines = Array.from(document.querySelectorAll('.r-walk-line'));
    expect(lines[1].textContent).toContain('declined');
    fireEvent.click(screen.getByText('next →'));
    const open = document.querySelector('.r-walk-open')!;
    expect(open.querySelector('.r-rows')).toBeNull();
    expect(open.textContent).not.toContain('from new_transactions');
    expect(open.textContent).not.toMatch(/read \w+ \d+,/);
  });

  it('a refusal is not an emptiness: it never says nothing came back', () => {
    render(<Replay turns={turnWith(REFUSED)} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('next →'));
    expect(document.querySelector('.r-walk-open')!.textContent)
      .not.toContain('nothing came back');
  });
});

describe('four facts, four renderings', () => {
  it('a read that returned nothing says nothing came back', () => {
    render(<Replay turns={turnWith([{
      seq: 0, tool: 'get_stock', arguments: {},
      result: {
        row_count: 0, source_table: 'inventory', truncated: false, duration_ms: 120,
        error: null, rows: [], rows_complete: true,
        meta: { ...META, source_table: 'inventory', metric_label: null },
      },
    }])} onBack={vi.fn()} />);
    const open = document.querySelector('.r-walk-open')!;
    expect(open.textContent).toContain('nothing came back');
    expect(open.querySelector('.r-rows')).toBeNull();
    // It still has receipts: it read something and found none of it.
    expect(open.textContent).toContain('from inventory');
  });

  it('a read whose rows the record did not keep says so, with how many there were', () => {
    render(<Replay turns={turnWith([{
      seq: 0, tool: 'get_sales', arguments: {},
      result: {
        row_count: 214, source_table: 'new_transactions', truncated: false,
        duration_ms: 880, error: null, rows: [], rows_complete: false, meta: META,
      },
    }])} onBack={vi.fn()} />);
    const open = document.querySelector('.r-walk-open')!;
    // NOT "0 rows", which is what counting the empty array used to report for
    // a read the loop would not send whole.
    expect(document.querySelector('.r-walk-line')!.textContent).toContain('214 rows');
    expect(open.textContent).toContain('the 214 rows this brought back were not kept');
    expect(open.querySelector('.r-rows')).toBeNull();
  });

  it('a step still running says so and draws nothing', () => {
    render(<Replay turns={turnWith([{ seq: 0, tool: 'get_sales', arguments: {} }])}
                   onBack={vi.fn()} />);
    const open = document.querySelector('.r-walk-open')!;
    expect(open.textContent).toContain('still running');
    expect(open.querySelector('.r-rows')).toBeNull();
    expect(document.querySelector('.r-walk-line')!.textContent).toContain('reading sales…');
  });

  it('a step that read nothing at all is not an empty read', () => {
    render(<Replay turns={turnWith([{
      seq: 0, tool: 'compose', arguments: {},
      result: { row_count: null, source_table: null, truncated: false,
                duration_ms: 12, error: null, rows: [], rows_complete: true, meta: null },
    }])} onBack={vi.fn()} />);
    const open = document.querySelector('.r-walk-open')!;
    expect(document.querySelector('.r-walk-line')!.textContent).toContain('arranged the workspace');
    // A compose reads nothing, so it never wears a row count.
    expect(document.querySelector('.r-walk-line')!.textContent).not.toContain('row');
    expect(open.textContent).toContain('something he did to the screen');
    expect(open.textContent).not.toContain('nothing came back');
  });
});

describe('a row is never drawn without its time', () => {
  it('withholds rows a record kept with no snapshot, and says why', () => {
    render(<Replay turns={turnWith([{
      seq: 0, tool: 'get_sales', arguments: {},
      result: {
        row_count: 2, source_table: 'new_transactions', truncated: false,
        duration_ms: 200, error: null,
        rows: [{ store: 'Rockwell', value: 203717 }, { store: 'OPUS', value: 555147 }],
        rows_complete: true,
        // The receipts the loop stores, minus the one thing UI rule 6 needs.
        meta: { source_table: 'new_transactions', filters_applied: [] },
      },
    }])} onBack={vi.fn()} />);
    const open = document.querySelector('.r-walk-open')!;
    expect(open.querySelector('.r-rows')).toBeNull();
    expect(open.textContent).toContain('kept without their receipts');
    expect(open.textContent).not.toContain('203,717');
  });
});

describe('the walk includes what he DID, not only what he read', () => {
  it('keeps a compose and a pin as rungs of their own', () => {
    render(<Replay turns={turnWith([
      { seq: 0, tool: 'get_sales', arguments: {},
        result: { row_count: 1, source_table: 'new_transactions', truncated: false,
                  duration_ms: 300, error: null,
                  rows: [{ store: 'Rockwell', value: 203717, unit: 'PHP' }],
                  rows_complete: true, meta: META } },
      { seq: 1, tool: 'compose', arguments: {},
        result: { row_count: null, source_table: null, truncated: false,
                  duration_ms: 9, error: null, rows: [], rows_complete: true, meta: null } },
      { seq: 2, tool: 'pin_answer', arguments: {},
        result: { row_count: 1, source_table: null, truncated: false,
                  duration_ms: 140, error: null, rows: [], rows_complete: true, meta: null } },
    ])} onBack={vi.fn()} />);
    const lines = Array.from(document.querySelectorAll('.r-walk-line'))
      .map((b) => b.textContent ?? '');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('arranged the workspace');
    expect(lines[2]).toContain('pinned it');
  });

  it('drops a duplicate, because nobody did that work', () => {
    render(<Replay turns={turnWith([
      { seq: 0, tool: 'get_sales', arguments: {},
        result: { row_count: 1, source_table: 'new_transactions', truncated: false,
                  duration_ms: 300, error: null,
                  rows: [{ store: 'Rockwell', value: 203717, unit: 'PHP' }],
                  rows_complete: true, meta: META } },
      { seq: 1, tool: 'get_sales', arguments: {}, duplicate_of: 0,
        result: { row_count: 1, source_table: 'new_transactions', truncated: false,
                  duration_ms: 0, error: null, rows: [], rows_complete: false, meta: META } },
    ])} onBack={vi.fn()} />);
    expect(document.querySelectorAll('.r-walk-line')).toHaveLength(1);
  });
});

describe('it costs nothing to walk', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('makes no request of anything', () => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    render(<Replay turns={thread()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('next →'));
    fireEvent.click(screen.getByText('next →'));
    expect(fetched).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('says so plainly when a conversation did nothing at all', () => {
    render(<Replay turns={[
      { role: 'user', text: 'hello', at: '2026-09-14T08:00:00Z' },
      { role: 'george', text: 'Morning.', thinking: '', at: '2026-09-14T08:00:01Z',
        toolCalls: [], notices: [] },
    ] as unknown as GeorgeTurn[]} onBack={vi.fn()} />);
    expect(screen.getByText(/nothing has been done in this conversation yet/i)).toBeTruthy();
    // Not a position it does not have.
    expect(document.querySelector('.r-walk-where')).toBeNull();
  });
});
