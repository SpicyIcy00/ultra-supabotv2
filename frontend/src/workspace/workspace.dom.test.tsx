/**
 * The workspace draws what George composed, and only that.
 *
 * Three properties, each the reason the renderer exists:
 *   - a composition is drawn by KEY, in George's order, at his weight;
 *   - a turn with no composition draws plainly — prose and tables — so a
 *     screen George did not compose looks like one;
 *   - every figure on screen is a row value; nothing is computed here.
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GeorgeTurn, ToolCall } from '../types/george';
import type { Post } from '../types/river';
import { compositionFor, restoreFromPosts, type AnswerTurn } from './composition';
import { fmt, splitCaveat } from './widgets';
import { Composition } from './render';

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

function turn(over: Partial<AnswerTurn>): AnswerTurn {
  return {
    role: 'george', text: 'Rockwell is the one to look at.', thinking: '', toolCalls: [SHOPS, PLAN],
    notices: [], pinned: [], saved: [], pageChanges: [], at: '2026-09-10T02:00:00Z', ...over,
  };
}

describe('a composed turn', () => {
  it('draws each block by key, in order, at weight', () => {
    const t = turn({
      composition: {
        seq: 3, rejected: [], blocks: [
          { kind: 'hero', key: 'rockwell', weight: 'lead', seq: 1, subject: 'Rockwell' },
          { kind: 'text', key: 'reading', weight: 'supporting' },
          { kind: 'comparison', key: 'two', weight: 'supporting', seq: 1, subjects: ['OPUS', 'Fairview'] },
          { kind: 'table', key: 'shops', weight: 'quiet', seq: 1 },
        ],
      },
    });
    const { container } = render(<Composition turn={t} selection={[]} onSelect={() => {}} live={false} />);
    const kinds = [...container.querySelectorAll('[data-widget]')].map((el) => el.getAttribute('data-widget'));
    expect(kinds).toEqual(['hero', 'text', 'comparison', 'table']);
    // The hero carries the row's figure and the tool's delta, and nothing else.
    const hero = container.querySelector('[data-widget="hero"]')!;
    expect(hero.textContent).toContain('Rockwell');
    expect(hero.textContent).toContain('₱412,884');
    expect(hero.textContent).toContain('−9.3%');
    // Weight is the grid placement, from the block alone.
    expect(hero.closest('.ws-w-lead')).not.toBeNull();
    expect(container.querySelector('[data-widget="table"]')!.closest('.ws-w-quiet')).not.toBeNull();
  });

  it('draws a draft order from the plan rows, with the suggested quantities editable and totalled', () => {
    const t = turn({
      composition: { seq: 3, rejected: [], blocks: [{ kind: 'draft', key: 'seikyo-order', weight: 'lead', seq: 2 }] },
    });
    const { container } = render(<Composition turn={t} selection={[]} onSelect={() => {}} live={false} />);
    const draft = container.querySelector('[data-widget="draft"]')!;
    expect(draft.textContent).toContain('Seikyo SEK001');
    expect(draft.textContent).toContain('Kameda Orange Big Pack');
    expect(draft.textContent).toContain('out of stock 89 days');
    const inputs = [...draft.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value);
    expect(inputs).toEqual(['334', '954']);
    expect(draft.textContent).toContain('1,288');           // 334 + 954, the sum of what is on the rows
    expect(draft.textContent).toContain('nothing sent');
  });

  it('keeps a notice above everything, whatever George composed', () => {
    const t = turn({
      notices: [{ kind: 'comparison_incomplete', message: '300 of 650 products cannot be placed against the earlier window.', source: 'get_sales' }],
      composition: { seq: 3, rejected: [], blocks: [{ kind: 'hero', key: 'rockwell', weight: 'lead', seq: 1, subject: 'Rockwell' }] },
    });
    const { container } = render(<Composition turn={t} selection={[]} onSelect={() => {}} live={false} />);
    const first = container.querySelector('[data-composition] > *')!;
    expect(first.textContent).toContain('cannot be placed');
  });

  it('says so when a block names a subject the read no longer carries', () => {
    const t = turn({
      composition: { seq: 3, rejected: [], blocks: [{ kind: 'subject', key: 'shang', weight: 'lead', seq: 1, subject: 'Shangri-La' }] },
    });
    const { container } = render(<Composition turn={t} selection={[]} onSelect={() => {}} live={false} />);
    expect(container.textContent).toContain('which this read does not carry');
  });
});

/**
 * THE CAVEAT, WHOLE, WITHOUT THE WALL.
 *
 * The first dogfood put forty product SKUs and the word NULL in the top two
 * hundred pixels, above the answer. The rule these tests hold is the one
 * CLAUDE.md already states: the caveat is surfaced above the number, and a
 * caveat that pushes the claim off the screen has not surfaced anything.
 */
describe('a caveat', () => {
  const REAL = '126 of 515 compared row(s) could not be compared against the 2026 08 24 to 2026 08 31 '
    + 'baseline: 66 no_baseline (the baseline window returned no figure (NULL) — nothing to compare '
    + 'against): Sari Kesari BALI Indonesian peanuts salted garlic (INDO 2); Sari Kesari BALI Indonesian '
    + 'peanuts spicy (INDO01); Original Flavor Beef Jerky 80G (SH843); Aji Royal Peak Emperor Plum 250g '
    + '(SH5032); Lucky Big Rongkan (SH744) and 61 more.';

  it('keeps the count and the reason visible and puts only the list behind a word', () => {
    const { head, detail } = splitCaveat(REAL);
    expect(head).toContain('126 of 515');
    expect(head).toContain('no_baseline');
    expect(head).toContain('nothing to compare against');
    expect(head).not.toContain('Sari Kesari');
    expect(detail).toContain('Sari Kesari');
    expect(detail).toContain('and 61 more');
  });

  it('leaves a short caveat entirely alone', () => {
    const short = '300 of 650 products cannot be placed against the earlier window.';
    expect(splitCaveat(short)).toEqual({ head: short, detail: null });
  });

  it('is drawn above everything, and the list is not there until it is asked for', () => {
    const t = turn({
      notices: [{ kind: 'comparison_incomplete', message: REAL, source: 'get_sales' }],
      composition: { seq: 3, rejected: [], blocks: [{ kind: 'hero', key: 'r', weight: 'lead', seq: 1, subject: 'Rockwell' }] },
    });
    const { container } = render(<Composition turn={t} selection={[]} onSelect={() => {}} live={false} />);
    const first = container.querySelector('[data-composition] > *')!;
    expect(first.querySelector('[data-caveats]')).not.toBeNull();
    expect(container.textContent).toContain('126 of 515');
    expect(container.textContent).not.toContain('Sari Kesari');
    fireEvent.click(container.querySelector('.ws-more')!);
    expect(container.textContent).toContain('Sari Kesari');
  });
});

describe('a table', () => {
  it('says a constant column once above the rows instead of on every row', () => {
    const t = turn({ composition: { seq: 3, rejected: [], blocks: [{ kind: 'table', key: 'shops', weight: 'supporting', seq: 1 }] } });
    const { container } = render(<Composition turn={t} selection={[]} onSelect={() => {}} live={false} />);
    const table = container.querySelector('[data-widget="table"]')!;
    const heads = [...table.querySelectorAll('th')].map((el) => el.textContent);
    expect(heads).not.toContain('unit');
    expect(table.querySelector('.ws-mk')!.textContent).toContain('PHP');
    // And the baseline is money, like the value beside it.
    expect(table.textContent).toContain('₱455,000');
  });
});

describe('figures', () => {
  it('keeps centavos off a large peso figure and on a small rate', () => {
    expect(fmt('net_sales', 141838.5)).toBe('₱141,839');
    expect(fmt('units_per_day', 3.711)).toBe('3.71');
    expect(fmt('net_sales', 412884)).toBe('₱412,884');
  });
});

describe('a turn George did not compose', () => {
  it('draws plainly: the prose leads and each read is a quiet table', () => {
    const blocks = compositionFor(turn({}));
    expect(blocks.map((b) => [b.kind, b.weight])).toEqual([['text', 'lead'], ['table', 'quiet'], ['table', 'quiet']]);
  });

  it('never draws a label call, a failed read or a duplicate as a table', () => {
    const t = turn({
      toolCalls: [
        SHOPS,
        { seq: 2, tool: 'record_findings', arguments: {}, result: { ...SHOPS.result!, rows: [{ seq: 1, role: 'primary' }] } },
        { seq: 3, tool: 'get_stock', arguments: {}, result: { ...SHOPS.result!, error: 'refused', rows: [] } },
        { seq: 4, tool: 'get_sales', arguments: SHOPS.arguments, duplicate_of: 1, result: SHOPS.result },
      ],
    });
    expect(compositionFor(t).filter((b) => b.kind === 'table').map((b) => b.seq)).toEqual([1]);
  });
});

describe('a reopened thread', () => {
  it('restores the composition and the charted rows from the answer post, and invents neither', () => {
    const stored: GeorgeTurn = {
      ...turn({ toolCalls: [{ seq: 2, tool: 'get_purchase_plan', arguments: { supplier: 'Seikyo SEK001' } }] }),
      post: { question_post_id: 'q1', answer_post_id: 'a1', thread_id: 't', conversation_id: 'c', visibility: 'private', stored: true },
    };
    const post = {
      id: 'a1', thread_id: 't', parent_id: 'q1', kind: 'answer', author: 'george', author_user: null, owner_user: 'me',
      visibility: 'private', mine: true, body: 'x', receipts: null, notices: [], conversation_id: 'c', created_at: null,
      payload: {
        charted: [{ seq: 2, tool: 'get_purchase_plan', arguments: { supplier: 'Seikyo SEK001' }, rows: PLAN.result!.rows, meta: PLAN.result!.meta }],
        composition: { blocks: [{ kind: 'draft', key: 'seikyo-order', weight: 'lead', seq: 2 }] },
      },
    } as unknown as Post;
    const [restored] = restoreFromPosts([stored], [post]) as AnswerTurn[];
    expect(restored.composition?.blocks.map((b) => b.key)).toEqual(['seikyo-order']);
    expect(restored.toolCalls[0].result?.rows).toHaveLength(2);
    // A post with no payload restores nothing.
    const [bare] = restoreFromPosts([stored], [{ ...post, payload: null }]) as AnswerTurn[];
    expect(bare.composition).toBeUndefined();
    expect(bare.toolCalls[0].result).toBeUndefined();
  });
});
