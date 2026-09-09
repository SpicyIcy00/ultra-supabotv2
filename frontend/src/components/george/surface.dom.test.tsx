/**
 * The Work Surface, as rendered.
 *
 * The evolved surface reads as ONE object: one avatar, one title, a trail of
 * refinements, the figure then what moved it, a folded line for context that
 * reaches outside the work, an attention line that names rows and carries no
 * number, the latest reading, and refinements offered as semantic actions.
 * Numbered to the milestone list where a test answers one of its items.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import type { Post } from '../../types/river';
import { GeorgeStreamProvider } from './GeorgeStreamProvider';
import { RiverEntries } from './RiverEntry';
import { attentionLine } from './WorkSurface';
import { riverItems } from './workUnit';
import { leakedTerms, transactionSynonyms, coveredFigures } from './proseLeak';

afterEach(cleanup);

const WINDOW = { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' };
const META = {
  source_table: 'new_transactions', filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-08T02:00:00+08:00', window: WINDOW, metric_domain: 'retail_sales',
  comparison: { kind: 'previous_period', display_name: 'vs previous period', baseline: { start: '2026-08-24', end: '2026-08-31' }, baseline_statuses: { ok: 1 } },
};
const cmp = (value: number, baseline: number) => ({
  value, baseline, change: value - baseline, change_pct: Math.round(((value - baseline) / baseline) * 1000) / 10,
  direction: value > baseline ? 'up' : value < baseline ? 'down' : 'flat', baseline_status: 'ok', unit: 'PHP',
});
const args = (metric: string, store: string | null, over: Record<string, unknown> = {}) => ({
  metric, date_range: 'last_week', filters: store ? { store } : {}, compare_to: 'previous_period', group_by: [], ...over,
});
const LABEL: Record<string, string> = { net_sales: 'Net sales', transaction_count: 'Transactions', average_transaction_value: 'Average transaction value' };
const atom = (seq: number, metric: string, v: number, b: number) => ({
  seq, tool: 'get_sales', arguments: args(metric, 'OPUS'), rows: [cmp(v, b)],
  meta: { ...META, metric, metric_label: LABEL[metric], drivers: metric === 'net_sales' ? ['transaction_count', 'average_transaction_value'] : [], valid_group_by: ['store'] },
});
const OPUS = [atom(1, 'net_sales', 555147, 425000), atom(2, 'transaction_count', 1041, 940), atom(3, 'average_transaction_value', 533.3, 452.1)];
const STORES = ['OPUS', 'Greenhills', 'Rockwell', 'North Edsa', 'Magnolia', 'Fairview', 'Shang'];
const chain = (seq: number) => ({
  seq, tool: 'get_sales', arguments: args('net_sales', null, { group_by: ['store'] }),
  rows: STORES.map((s, i) => ({ store: s, ...cmp(100000 - i * 9000, i === 3 || i === 4 ? 105000 - i * 9000 : 90000 - i * 9000) })),
  meta: { ...META, metric: 'net_sales', metric_label: 'Net sales', drivers: ['transaction_count', 'average_transaction_value'], valid_group_by: ['store'], comparison: { ...META.comparison, baseline_statuses: { ok: 7 } } },
});
const finding = (seq: number, role: string, of: number | null = null) => ({ seq, role, of, tool: 'get_sales' });
const PERF = [finding(1, 'primary'), finding(2, 'driver', 1), finding(3, 'driver', 1)];

function post(id: string, charted: unknown[], findings: unknown[] | undefined, body: string, over: Partial<Post> = {}): Post {
  return {
    id, thread_id: 't1', parent_id: null, kind: 'answer', author: 'george', author_user: null, visibility: 'private',
    owner_user: 'ice', mine: true, body, conversation_id: id, created_at: '2026-09-08T02:00:01+08:00', notices: [], receipts: META,
    payload: { charted, calls: (charted as { seq: number; tool: string; arguments: unknown }[]).map((c) => ({ seq: c.seq, tool: c.tool, arguments: c.arguments })), findings },
    ...over,
  } as Post;
}
const question = (id: string, text: string, parent: string | null): Post =>
  ({ ...post(id, [], undefined, text), kind: 'question', author: 'user', author_user: 'ice', parent_id: parent, payload: null, receipts: null } as Post);

function mount(posts: Post[], onAsk?: (q: string) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><GeorgeStreamProvider>
      <RiverEntries items={riverItems(posts, [])} focusLatest onAsk={onAsk} />
    </GeorgeStreamProvider></MemoryRouter></QueryClientProvider>,
  );
}
const precedes = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const A = [question('q1', 'How did OPUS do last week?', null), post('a1', OPUS, PERF, 'Basket value led it.')];
const WHY = [...A, question('q2', 'Why?', 'a1'), post('a2', OPUS, PERF, 'Basket value rose more than transactions; these reads do not establish why.')];

describe('A. one surface for one question', () => {
  it('is the answer: title, one performance instrument, short reading beneath, no chain', () => {
    const { container } = mount(A);
    expect(container.querySelectorAll('[data-surface]')).toHaveLength(1);
    expect(container.querySelector('[data-surface-title]')!.textContent).toBe('Why it moved · OPUS · Last week');
    expect(container.querySelectorAll('[data-instrument="performance"]')).toHaveLength(1);
    expect(container.querySelector('[data-folded]')).toBeNull();
    expect(precedes(container.querySelector('[data-instrument="performance"]')!, screen.getByText('Basket value led it.'))).toBe(true);
  });

  it('7. folds a chain-wide read behind a line that names it, never dropping it', () => {
    const { container } = mount([A[0], post('a1', [...OPUS, chain(4)], [...PERF, finding(4, 'context')], 'OPUS led the chain.')]);
    const folded = container.querySelector('[data-folded="context"]')!;
    expect(folded).toBeTruthy();
    expect(folded.textContent).toContain('Also read');
    expect(container.querySelectorAll('[data-instrument="subject-comparison"], [data-instrument="comparison"]')).toHaveLength(0);
    fireEvent.click(folded);
    expect(container.querySelector('[data-folded-open="context"]')).toBeTruthy();
    expect(container.querySelector('[data-instrument="subject-comparison"]')).toBeTruthy();
  });
});

describe('B. "Why?" deepens the SAME visible work', () => {
  it('draws one object with a trail, the figure then what moved it, and the latest reading', () => {
    const { container } = mount(WHY);
    expect(container.querySelectorAll('[data-work]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-work] .rounded-full.bg-george-navy')).toHaveLength(1);
    const trail = container.querySelector('[data-trail]')!;
    expect(trail.textContent).toContain('Why?');
    const sections = [...container.querySelectorAll('[data-surface-work] section')].map((s) => s.getAttribute('aria-label'));
    expect(sections).toEqual(['The figure', 'What moved it']);
    expect(container.querySelectorAll('[data-instrument="performance"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-instrument="performance"]')).toHaveLength(1);
    expect(screen.getAllByText('₱555,147')).toHaveLength(1);
    expect(screen.getByText(/these reads do not establish why/)).toBeTruthy();
    // The earlier reading is kept, quieter, behind a line that names it.
    expect(container.querySelector('[data-earlier-readings]')!.textContent).toContain('Earlier in this work');
  });

  it('draws every notice from every step, once, above the figures', () => {
    const notice = { kind: 'comparison_incomplete', message: 'One store could not be compared.', source: 'x' };
    const { container } = mount([A[0], { ...A[1], notices: [notice] } as Post, question('q2', 'Why?', 'a1'), { ...WHY[3], notices: [notice] } as Post]);
    expect(screen.getAllByText('One store could not be compared.')).toHaveLength(1);
    expect(precedes(screen.getByText('One store could not be compared.'), container.querySelector('[data-instrument="performance"]')!)).toBe(true);
  });
});

describe('C–E. comparison recomposes the same work; attention is visible in the hierarchy', () => {
  const COMPARE = [...WHY, question('q3', 'Compare it with Rockwell.', 'a2'), post('a3', [chain(1)], [finding(1, 'primary')], 'North Edsa and Magnolia are the ones to look at.')];

  it('C. stays one object and leads with the comparison', () => {
    const { container } = mount(COMPARE);
    expect(container.querySelectorAll('[data-work]')).toHaveLength(1);
    expect(container.querySelector('[data-surface-title]')!.textContent).toBe('Compared · Last week');
    const ranks = [...container.querySelectorAll('[data-surface-work] [data-rank]')].map((s) => s.getAttribute('data-rank'));
    expect(ranks[0]).toBe('primary');
    expect(container.querySelector('[data-trail]')!.textContent).toContain('Compare it with Rockwell.');
  });

  it('E. names what the data singles out, with no number in the line', () => {
    const { container } = mount([question('q1', 'Compare all stores last week and show me what deserves attention.', null), post('a1', [chain(1)], [finding(1, 'primary')], 'Two stores fell.')]);
    const line = container.querySelector('[data-attention]')!;
    expect(line.textContent).toBe('North Edsa and Magnolia fell while the rest moved the other way.');
    expect(line.textContent).not.toMatch(/\d/);
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelectorAll('[data-instrument]')).toHaveLength(1);
  });

  it('marks nothing when the data marks nothing', () => {
    expect(attentionLine([])).toBeNull();
  });
});

describe('12–13. the surface puts no tool vocabulary on screen, and the prose lint holds', () => {
  it('renders no tool or argument name anywhere', () => {
    const { container } = mount(WHY);
    expect(container.textContent).not.toMatch(/get_sales|group_by|compare_to|change_pct|record_findings|rank_by|biggest_drop/);
  });

  it('flags leaked vocabulary, unsupported transaction wording, and repeated covered figures', () => {
    expect(leakedTerms("I ran get_sales with rank_by='biggest_drop'. Unchanged from a moment ago.")).toEqual(['get_sales', 'rank_by', 'biggest_drop', 'unchanged from a moment ago']);
    expect(leakedTerms('Net sales were compared with the previous week.')).toEqual([]);
    expect(transactionSynonyms('Transactions rose, so more customers came in.')).toEqual(['customers']);
    expect(transactionSynonyms('Suppliers: people are slow.')).toEqual([]);
    expect(coveredFigures('OPUS took ₱555,147, up 30.6%, on 1,041 transactions.', OPUS as never)).toEqual(['555,147', '30.6', '1,041']);
    expect(coveredFigures('Basket value led it.', OPUS as never)).toEqual([]);
  });
});

describe('27. actions on the surface are semantic refinements', () => {
  it('asks the deterministic question for the offered refinement', () => {
    const asked: string[] = [];
    const { container } = mount(A, (q) => asked.push(q));
    const actions = container.querySelector('[data-actions]')!;
    expect(actions.textContent).toContain('Why?');
    expect(actions.textContent).not.toContain('By store');
    fireEvent.click(actions.querySelector('button')!);
    expect(asked).toEqual(['Why did net sales change at OPUS last week?']);
  });
});

describe('30. a simple factual answer stays simple', () => {
  it('draws one figure, one title, no folds, no attention', () => {
    const { container } = mount([question('q1', 'Net sales at OPUS last week?', null), post('a1', [OPUS[0]], [finding(1, 'primary')], 'Up on the week before.')]);
    expect(screen.getAllByText('₱555,147')).toHaveLength(1);
    expect(container.querySelector('[data-surface-title]')!.textContent).toBe('The figures · OPUS · Last week');
    expect(container.querySelector('[data-folded]')).toBeNull();
    expect(container.querySelector('[data-attention]')).toBeNull();
    expect(container.querySelector('[data-trail]')).toBeNull();
  });
});
