/**
 * The board, and what may be done to it.
 *
 * The property that matters most is the one the workspace did not have until
 * 2026-09-10: AN OBJECT NOBODY TOUCHED STAYS. Ask about Seikyo, then ask about
 * North Edsa, and the draft order is still there, still drawing the read it
 * was made from, still carrying that read's own timestamp.
 *
 * The others: George cannot draw a figure the rows do not carry; the caveat is
 * whole but does not become a wall; and what the PERSON does to the board —
 * focus, set aside, sort — is instant, is theirs, and changes no figure.
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompositionBlock, GeorgeTurn, ToolCall } from '../types/george';
import type { Post } from '../types/river';
import { buildBoard, inOrder, sorted, type Local } from './board';
import { restoreFromPosts, type AnswerTurn } from './composition';
import { fmt, splitCaveat } from './widgets';
import { Board } from './render';

afterEach(cleanup);

const META = {
  source_table: 'new_transactions', filters_applied: ['is_cancelled = false'],
  snapshot_timestamp: '2026-09-10T02:00:00+08:00', metric_label: 'Net sales',
};

const SHOPS: ToolCall = {
  seq: 1, tool: 'get_sales', arguments: { group_by: 'store', compare_to: 'previous_period' },
  result: {
    row_count: 3, source_table: 'new_transactions', truncated: false, duration_ms: 12, error: null, rows_complete: true,
    meta: META,
    rows: [
      { unit: 'PHP', store: 'Rockwell', value: 412884, baseline: 455000, change: -42116, change_pct: -9.3, direction: 'down', baseline_status: 'ok' },
      { unit: 'PHP', store: 'OPUS', value: 121451, baseline: 118000, change: 3451, change_pct: 2.9, direction: 'up', baseline_status: 'ok' },
      { unit: 'PHP', store: 'Fairview', value: 288110, baseline: 288000, change: 110, change_pct: 0.0, direction: 'flat', baseline_status: 'ok' },
    ],
  },
};

const PLAN: ToolCall = {
  seq: 2, tool: 'get_purchase_plan', arguments: { supplier: 'Seikyo SEK001' },
  result: {
    row_count: 2, source_table: 'purchase_order_lines', truncated: false, duration_ms: 40, error: null, rows_complete: true,
    meta: { ...META, metric_label: 'Purchase plan', supplier: 'Seikyo SEK001', cover_days: 60 } as typeof META,
    rows: [
      { product: 'Kameda Orange Big Pack', sku: 'K-01', units_per_day: 3.7, on_hand: 0, days_of_cover: 0, suggested_order_qty: 334, days_with_nothing: 89 },
      { product: 'Aji Assorted JP candy', sku: 'A-77', units_per_day: 16.2, on_hand: 18, days_of_cover: 1.1, suggested_order_qty: 954, days_with_nothing: 0 },
    ],
  },
};

function turn(blocks: CompositionBlock[] | null, over: Partial<AnswerTurn> = {}): AnswerTurn {
  return {
    role: 'george', text: 'Rockwell is the one to look at.', thinking: '', toolCalls: [SHOPS, PLAN],
    notices: [], pinned: [], saved: [], pageChanges: [], at: '2026-09-10T02:00:00Z',
    ...(blocks ? { composition: { seq: 9, rejected: [], blocks } } : {}),
    ...over,
  };
}

function draw(answers: AnswerTurn[], local: Record<string, Local> = {}, focused: string | null = null) {
  const board = buildBoard(answers);
  return {
    board,
    ...render(
      <Board
        answers={answers} board={board} local={local} focused={focused} selection={[]} live={false}
        onSelect={() => {}} onFocus={() => {}} onClose={() => {}} onLocal={() => {}}
      />,
    ),
  };
}

// --------------------------------------------------------------- the fold

describe('the board', () => {
  it('KEEPS AN OBJECT NOBODY TOUCHED — the whole point', () => {
    const board = buildBoard([
      turn([{ op: 'put', kind: 'draft', key: 'seikyo-order', weight: 'lead', seq: 2 }]),
      turn([{ op: 'put', kind: 'hero', key: 'north-edsa', weight: 'lead', seq: 1, subject: 'Rockwell' }]),
    ]);
    expect(board.map((o) => o.key).sort()).toEqual(['north-edsa', 'seikyo-order']);
    // And it still draws the turn it was made from, not the newest one.
    expect(board.find((o) => o.key === 'seikyo-order')!.turn).toBe(0);
    expect(board.find((o) => o.key === 'seikyo-order')!.touched).toBe(0);
  });

  it('transforms an object in place when the same key comes back', () => {
    const board = buildBoard([
      turn([{ op: 'put', kind: 'draft', key: 'seikyo-order', weight: 'lead', seq: 2 }]),
      turn([{ op: 'put', kind: 'draft', key: 'seikyo-order', weight: 'lead', seq: 2 }]),
    ]);
    expect(board).toHaveLength(1);
    expect(board[0].turn).toBe(1);
  });

  it('changes only what the change names, and re-points the read only when told', () => {
    const board = buildBoard([
      turn([{ op: 'put', kind: 'hero', key: 'rockwell', weight: 'lead', seq: 1, subject: 'Rockwell' }]),
      turn([{ op: 'change', key: 'rockwell', weight: 'quiet' }]),
    ]);
    expect(board[0].kind).toBe('hero');       // untouched
    expect(board[0].subject).toBe('Rockwell'); // untouched
    expect(board[0].weight).toBe('quiet');     // changed
    expect(board[0].turn).toBe(0);             // still the read it was made from
    expect(board[0].touched).toBe(1);
  });

  it('quiets, drops, and ignores an edit to something that is not there', () => {
    const board = buildBoard([
      turn([
        { op: 'put', kind: 'table', key: 'a', weight: 'supporting', seq: 1 },
        { op: 'put', kind: 'table', key: 'b', weight: 'supporting', seq: 1 },
      ]),
      turn([
        { op: 'quiet', key: 'a' },
        { op: 'drop', key: 'b' },
        { op: 'change', key: 'ghost', weight: 'lead' },
      ]),
    ]);
    expect(board.map((o) => [o.key, o.weight])).toEqual([['a', 'quiet']]);
  });

  it('never lets two objects lead', () => {
    const board = buildBoard([
      turn([{ op: 'put', kind: 'hero', key: 'one', weight: 'lead', seq: 1, subject: 'Rockwell' }]),
      turn([{ op: 'put', kind: 'hero', key: 'two', weight: 'lead', seq: 1, subject: 'OPUS' }]),
    ]);
    expect(board.filter((o) => o.weight === 'lead').map((o) => o.key)).toEqual(['two']);
    expect(board.find((o) => o.key === 'one')!.weight).toBe('supporting');
  });

  it('is bounded, and what leaves is what was set aside longest ago', () => {
    const turns: AnswerTurn[] = [];
    for (let i = 0; i < 15; i++) {
      turns.push(turn([{ op: 'put', kind: 'table', key: `k${i}`, weight: i < 3 ? 'quiet' : 'supporting', seq: 1 }]));
    }
    const board = buildBoard(turns);
    expect(board).toHaveLength(12);
    expect(board.some((o) => o.key === 'k0')).toBe(false);  // oldest quiet went first
    expect(board.some((o) => o.key === 'k14')).toBe(true);
  });

  it('folds a turn that composed nothing into a plain, turn-scoped fallback', () => {
    const board = buildBoard([turn(null), turn(null)]);
    // Two turns of prose and reads, and no key collision between them.
    expect(new Set(board.map((o) => o.key)).size).toBe(board.length);
    expect(board.filter((o) => o.kind === 'text')).toHaveLength(2);
  });
});

// --------------------------------------------------------------- drawing

describe('drawing the board', () => {
  it('draws each object at its weight, from its own turn', () => {
    const { container } = draw([
      turn([{ op: 'put', kind: 'draft', key: 'seikyo-order', weight: 'supporting', seq: 2 }]),
      turn([{ op: 'put', kind: 'hero', key: 'rockwell', weight: 'lead', seq: 1, subject: 'Rockwell' }]),
    ]);
    const kinds = [...container.querySelectorAll('[data-widget]')].map((el) => el.getAttribute('data-widget'));
    expect(kinds[0]).toBe('hero');                       // the lead is drawn first
    expect(kinds).toContain('draft');                    // and yesterday's draft is still here
    const hero = container.querySelector('[data-widget="hero"]')!;
    expect(hero.textContent).toContain('₱412,884');
    expect(hero.textContent).toContain('−9.3%');
    // The draft's figures come from ITS read, not from the newest turn's.
    expect(container.querySelector('[data-widget="draft"]')!.textContent).toContain('Kameda Orange Big Pack');
  });

  it('marks an object the newest turn did not touch', () => {
    const { container } = draw([
      turn([{ op: 'put', kind: 'draft', key: 'seikyo-order', weight: 'supporting', seq: 2 }]),
      turn([{ op: 'put', kind: 'hero', key: 'rockwell', weight: 'lead', seq: 1, subject: 'Rockwell' }]),
    ]);
    const ages = [...container.querySelectorAll('.ws-obj-age')].map((el) => el.textContent);
    expect(ages).toEqual(['from earlier']);
  });

  it('says so when an object names a subject its read does not carry', () => {
    const { container } = draw([
      turn([{ op: 'put', kind: 'subject', key: 'shang', weight: 'lead', seq: 1, subject: 'Shangri-La' }]),
    ]);
    expect(container.textContent).toContain('which this read does not carry');
  });

  it('keeps the newest turn\'s caveats above everything', () => {
    const { container } = draw([
      turn([{ op: 'put', kind: 'hero', key: 'r', weight: 'lead', seq: 1, subject: 'Rockwell' }], {
        notices: [{ kind: 'comparison_incomplete', message: '300 of 650 products cannot be placed against the earlier window.', source: 'get_sales' }],
      }),
    ]);
    expect(container.querySelector('[data-composition] > *')!.textContent).toContain('cannot be placed');
  });
});

// --------------------------------------------------------------- what is yours

describe('what the person does to the board', () => {
  it('focus makes one object lead and puts George\'s back when released', () => {
    const board = buildBoard([
      turn([{ op: 'put', kind: 'hero', key: 'his', weight: 'lead', seq: 1, subject: 'Rockwell' }]),
      turn([{ op: 'put', kind: 'table', key: 'mine', weight: 'quiet', seq: 1 }]),
    ]);
    expect(inOrder(board, {}, 'mine')[0].key).toBe('mine');
    expect(inOrder(board, {}, 'mine').find((o) => o.key === 'his')!.weight).toBe('supporting');
    expect(inOrder(board, {}, null)[0].key).toBe('his');   // released, his lead is back
  });

  it('set aside removes it from the board without deleting it', () => {
    const board = buildBoard([turn([{ op: 'put', kind: 'table', key: 'a', weight: 'quiet', seq: 1 }])]);
    expect(inOrder(board, { a: { closed: true } }, null)).toHaveLength(0);
    expect(board).toHaveLength(1);                          // still on the board, one click back
  });

  it('sorting reorders the rows the read returned and changes no figure', () => {
    const rows = SHOPS.result!.rows!;
    const up = sorted(rows, { column: 'value', desc: false }).map((r) => r.store);
    const down = sorted(rows, { column: 'value', desc: true }).map((r) => r.store);
    expect(up).toEqual(['OPUS', 'Fairview', 'Rockwell']);
    expect(down).toEqual(['Rockwell', 'Fairview', 'OPUS']);
    expect(sorted(rows, { column: 'value', desc: true })).toHaveLength(rows.length);
    expect(new Set(down)).toEqual(new Set(up));
  });

  it('a table header click asks for a sort and nothing else', () => {
    const onLocal = vi.fn();
    const answers = [turn([{ op: 'put', kind: 'table', key: 'shops', weight: 'supporting', seq: 1 }])];
    const board = buildBoard(answers);
    const { container } = render(
      <Board answers={answers} board={board} local={{}} focused={null} selection={[]} live={false}
        onSelect={() => {}} onFocus={() => {}} onClose={() => {}} onLocal={onLocal} />,
    );
    const header = [...container.querySelectorAll('th')].find((th) => th.textContent?.startsWith('value'))!;
    fireEvent.click(header);
    expect(onLocal).toHaveBeenCalledWith('shops', { sort: { column: 'value', desc: true } });
  });

  it('offers focus and set aside on every object', () => {
    const { container } = draw([turn([{ op: 'put', kind: 'table', key: 'a', weight: 'quiet', seq: 1 }])]);
    const words = [...container.querySelectorAll('.ws-obj-btn')].map((el) => el.textContent);
    expect(words).toEqual(['focus', 'set aside']);
  });
});

// --------------------------------------------------------------- unchanged rules

describe('a caveat', () => {
  const REAL = '126 of 515 compared row(s) could not be compared against the 2026 08 24 to 2026 08 31 '
    + 'baseline: 66 no_baseline (the baseline window returned no figure (NULL) — nothing to compare '
    + 'against): Sari Kesari BALI Indonesian peanuts salted garlic (INDO 2); Sari Kesari BALI Indonesian '
    + 'peanuts spicy (INDO01); Original Flavor Beef Jerky 80G (SH843) and 61 more.';

  it('keeps the count and the reason visible and puts only the list behind a word', () => {
    const { head, detail } = splitCaveat(REAL);
    expect(head).toContain('126 of 515');
    expect(head).toContain('nothing to compare against');
    expect(head).not.toContain('Sari Kesari');
    expect(detail).toContain('Sari Kesari');
  });

  it('leaves a short caveat entirely alone', () => {
    const short = '300 of 650 products cannot be placed against the earlier window.';
    expect(splitCaveat(short)).toEqual({ head: short, detail: null });
  });
});

describe('figures', () => {
  it('keeps centavos off a large peso figure and on a small rate', () => {
    expect(fmt('net_sales', 141838.5)).toBe('₱141,839');
    expect(fmt('units_per_day', 3.711)).toBe('3.71');
    expect(fmt('net_sales', 412884)).toBe('₱412,884');
  });
});

describe('a reopened thread', () => {
  it('restores the composition and the charted rows from the answer post, and invents neither', () => {
    const stored: GeorgeTurn = {
      ...turn(null, { toolCalls: [{ seq: 2, tool: 'get_purchase_plan', arguments: { supplier: 'Seikyo SEK001' } }] }),
      post: { question_post_id: 'q1', answer_post_id: 'a1', thread_id: 't', conversation_id: 'c', visibility: 'private', stored: true },
    };
    const post = {
      id: 'a1', thread_id: 't', parent_id: 'q1', kind: 'answer', author: 'george', author_user: null, owner_user: 'me',
      visibility: 'private', mine: true, body: 'x', receipts: null, notices: [], conversation_id: 'c', created_at: null,
      payload: {
        charted: [{ seq: 2, tool: 'get_purchase_plan', arguments: { supplier: 'Seikyo SEK001' }, rows: PLAN.result!.rows, meta: PLAN.result!.meta }],
        composition: { blocks: [{ op: 'put', kind: 'draft', key: 'seikyo-order', weight: 'lead', seq: 2 }] },
      },
    } as unknown as Post;
    const [restored] = restoreFromPosts([stored], [post]) as AnswerTurn[];
    expect(restored.composition?.blocks.map((b) => b.key)).toEqual(['seikyo-order']);
    expect(restored.toolCalls[0].result?.rows).toHaveLength(2);
    // And the board a reload rebuilds is the board that was there.
    expect(buildBoard([restored]).map((o) => o.key)).toEqual(['seikyo-order']);

    const [bare] = restoreFromPosts([stored], [{ ...post, payload: null }]) as AnswerTurn[];
    expect(bare.composition).toBeUndefined();
  });
});
