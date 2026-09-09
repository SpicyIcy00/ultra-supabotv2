/**
 * The workspace, as rendered: not a transcript.
 *
 * Claims about ORDER and FORM, checked against the DOM: the intent is a line
 * and a rule, not a bubble; the evidence precedes the reading; a caveat still
 * precedes the figure it qualifies; a continuation composes into the object
 * above it; actions appear only where the definitions permit; and no tool
 * vocabulary reaches the surface.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import type { Post } from '../../types/river';
import { GeorgeStreamProvider } from './GeorgeStreamProvider';
import { RiverEntries } from './RiverEntry';
import { riverItems } from './workUnit';

afterEach(cleanup);

const WINDOW = { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' };
const META = {
  source_table: 'new_transactions', filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-08T02:00:00+08:00', window: WINDOW,
  comparison: { kind: 'previous_period', display_name: 'vs previous period', baseline: { start: '2026-08-24', end: '2026-08-31' }, baseline_statuses: { ok: 3 } },
};
const cmp = (value: number, baseline: number) => ({
  value, baseline, change: value - baseline, change_pct: Math.round(((value - baseline) / baseline) * 1000) / 10,
  direction: value >= baseline ? 'up' : 'down', baseline_status: 'ok', unit: 'PHP',
});
const ARGS = { metric: 'net_sales', date_range: 'last_week', filters: { store: 'Rockwell' }, compare_to: 'previous_period', group_by: [] };
const call = (seq: number, metric: string, label: string, v: number, b: number) => ({
  seq, tool: 'get_sales', arguments: { ...ARGS, metric }, rows: [cmp(v, b)],
  meta: { ...META, metric, metric_label: label, valid_group_by: ['store', 'day'], drivers: metric === 'net_sales' ? ['transaction_count', 'average_transaction_value'] : [] },
});
const CALLS = [call(1, 'net_sales', 'Net sales', 203717, 179000), call(2, 'transaction_count', 'Transactions', 366, 328), call(3, 'average_transaction_value', 'Basket', 556.6, 545.7)];
const NOTICE = { kind: 'comparison_incomplete', message: '1 of 4 compared rows could not be compared.', source: 'definitions/metrics.yaml: comparisons' };

function post(id: string, over: Partial<Post>): Post {
  return {
    id, thread_id: 't1', parent_id: null, kind: 'answer', author: 'george', author_user: null, visibility: 'private',
    owner_user: 'ice', mine: true, body: 'The lift is traffic-led.', conversation_id: id, created_at: '2026-09-08T02:00:01+08:00',
    notices: [], receipts: META,
    payload: { charted: CALLS, calls: CALLS.map((c) => ({ seq: c.seq, tool: c.tool, arguments: c.arguments })),
               findings: [{ seq: 1, role: 'primary', of: null, tool: 'get_sales' }, { seq: 2, role: 'driver', of: 1, tool: 'get_sales' }, { seq: 3, role: 'driver', of: 1, tool: 'get_sales' }] },
    ...over,
  } as Post;
}

function mount(posts: Post[], onAsk?: (q: string) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><GeorgeStreamProvider>
      <RiverEntries items={riverItems(posts, [])} focusLatest onAsk={onAsk} />
    </GeorgeStreamProvider></MemoryRouter></QueryClientProvider>,
  );
}

const precedes = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const QUESTION = post('q1', { kind: 'question', author: 'user', author_user: 'ice', body: 'How did Rockwell do last week?', payload: null, receipts: null });

describe('the intent', () => {
  it('is a line and a rule, never a bubble', () => {
    const { container } = mount([QUESTION, post('a1', {})]);
    const intent = container.querySelector('[data-intent]')!;
    expect(intent).toBeTruthy();
    expect(intent.textContent).toContain('How did Rockwell do last week?');
    expect(intent.querySelector('.rounded-2xl')).toBeNull();
    expect(intent.querySelector('.bg-george-navy')).toBeNull();
    expect(intent.className).not.toContain('justify-end');
  });
});

describe('the work is the answer', () => {
  it('draws the evidence before the reading', () => {
    const { container } = mount([QUESTION, post('a1', {})]);
    const figures = container.querySelector('[data-instrument="performance"]')!;
    const prose = screen.getByText('The lift is traffic-led.');
    expect(figures).toBeTruthy();
    expect(precedes(figures, prose)).toBe(true);
  });

  it('draws the ladder — the figure, then what moved it as one split — and no table', () => {
    const { container } = mount([QUESTION, post('a1', {})]);
    // George said which was primary: the figure leads, the two drivers are
    // one split instrument beneath it. Each figure is printed once.
    expect(container.querySelectorAll('[data-instrument="performance"]')).toHaveLength(1);
    expect(container.querySelector('table')).toBeNull();
    expect(screen.getAllByText('₱203,717')).toHaveLength(1);
    expect(screen.getAllByText('₱366')).toHaveLength(1);
  });

  it('draws a headline set with no roles as one performance instrument, not three figures', () => {
    const p = post('a1', {});
    const { container } = mount([QUESTION, { ...p, payload: { ...(p.payload as object), findings: undefined } } as Post]);
    expect(container.querySelectorAll('[data-instrument="performance"]')).toHaveLength(1);
    expect(container.querySelector('.grid-cols-1')).toBeNull(); // no MetricGroup grid
    expect(screen.getAllByText('₱203,717')).toHaveLength(1);
    expect(screen.getAllByText('₱366')).toHaveLength(1);
  });

  it('suppresses a coarse table wholly covered by the atoms', () => {
    const coarse = { seq: 4, tool: 'get_sales', arguments: { date_range: 'last_week', filters: { store: 'Rockwell' }, compare_to: 'previous_period' },
      rows: [{ measure: 'net_sales', ...cmp(203717, 179000) }, { measure: 'transaction_count', ...cmp(366, 328) }, { measure: 'average_transaction_value', ...cmp(556.6, 545.7) }], meta: META };
    const p = post('a1', {});
    const { container } = mount([QUESTION, { ...p, payload: { ...(p.payload as object), charted: [coarse, ...CALLS], calls: [{ seq: 4, tool: 'get_sales', arguments: coarse.arguments }, ...CALLS.map((c) => ({ seq: c.seq, tool: c.tool, arguments: c.arguments }))] } } as Post]);
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelectorAll('[data-instrument="performance"]')).toHaveLength(1);
  });

  it('keeps the caveat above the figures, as its data state, with the full text retained', () => {
    const p = post('a1', { notices: [NOTICE] });
    const partial = CALLS.map((c) => ({ ...c, meta: { ...c.meta, comparison: { ...META.comparison, baseline_statuses: { ok: 3, no_baseline: 1 } } } }));
    const { container } = mount([QUESTION, { ...p, payload: { ...(p.payload as object), charted: partial } } as Post]);
    const caveat = container.querySelector('[data-caveat="coverage"]')!;
    expect(caveat).toBeTruthy();
    expect(caveat.textContent).toContain('comparable');
    expect(caveat.textContent).toContain(NOTICE.message);
    expect(precedes(caveat, container.querySelector('[data-instrument="performance"]')!)).toBe(true);
  });

  it('cannot minimise a caveat that invalidates the figure', () => {
    const p = post('a1', { notices: [NOTICE] });
    const none = CALLS.map((c) => ({ ...c, meta: { ...c.meta, comparison: { ...META.comparison, baseline_statuses: { no_baseline: 3 } } } }));
    const { container } = mount([QUESTION, { ...p, payload: { ...(p.payload as object), charted: none } } as Post]);
    expect(container.querySelector('[data-caveat="coverage"]')).toBeNull();
    expect(screen.getByRole('note').textContent).toContain(NOTICE.message);
  });

  it('puts no tool vocabulary on the surface', () => {
    const { container } = mount([QUESTION, post('a1', {})]);
    expect(container.textContent).not.toMatch(/get_sales|group_by|compare_to|change_pct|record_findings/);
  });
});

describe('operability', () => {
  it('offers only what the definitions permit, as questions in business words', () => {
    const asked: string[] = [];
    const { container } = mount([QUESTION, post('a1', {})], (q) => asked.push(q));
    const actions = container.querySelector('[data-actions]')!;
    expect(actions.textContent).toContain('Why?');
    expect(actions.textContent).not.toContain('By store'); // already one store
    expect(actions.textContent).not.toContain('By product'); // not permitted
    (actions.querySelector('button') as HTMLButtonElement).click();
    expect(asked[0]).toMatch(/^Why did net sales change at Rockwell last week\?$/);
  });
});

describe('continuity', () => {
  const FOLLOW = post('q2', { kind: 'question', author: 'user', author_user: 'ice', body: 'Why?', parent_id: 'a1', payload: null, receipts: null });

  it('composes a same-scope reply into ONE work surface, not a second answer', () => {
    const { container } = mount([QUESTION, post('a1', {}), FOLLOW, post('a2', {})]);
    // One surface: one [data-work], one avatar; the refinement is its trail.
    expect(container.querySelectorAll('[data-work]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-work] .rounded-full.bg-george-navy')).toHaveLength(1);
    const intents = container.querySelectorAll('[data-intent]');
    expect(intents).toHaveLength(2);
    expect(intents[1].getAttribute('data-continues')).toBe('true');
    expect(intents[1].textContent).toContain('Why?');
    // The re-read of the same three facts is not drawn twice.
    expect(container.querySelectorAll('[data-instrument="performance"]')).toHaveLength(1);
    expect(screen.getAllByText('₱203,717')).toHaveLength(1);
  });

  it('does not compose a reply over another subject', () => {
    const magnolia = CALLS.map((c) => ({ ...c, arguments: { ...c.arguments, filters: { store: 'Magnolia' } } }));
    const other = post('a2', { payload: { ...(post('a2', {}).payload as object), charted: magnolia, calls: magnolia.map((c) => ({ seq: c.seq, tool: c.tool, arguments: c.arguments })) } as never });
    const { container } = mount([QUESTION, post('a1', {}), FOLLOW, other]);
    expect(container.querySelectorAll('[data-work]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-work] .rounded-full.bg-george-navy')).toHaveLength(2);
  });
});
