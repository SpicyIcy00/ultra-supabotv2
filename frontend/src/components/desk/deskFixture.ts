/**
 * Fixtures for the desk suites: real SHAPES, synthetic figures.
 *
 * Every row carries what the tools return — a `store_id` beside `store`, a
 * `product_id` beside `product`, the compare fields get_sales computes — and
 * every meta carries the window, the comparison and the definitions' hints
 * (`drivers`, `valid_group_by`, `metric_label`). The figures are invented,
 * because a fixture needs shapes and not production numbers.
 */
import type { DeskContext, Finding } from '../../types/george';
import type { PinCallResult } from '../../types/pins';
import type { Post } from '../../types/river';
import { riverSurfaces, type Surface } from '../george/surfaceCompose';
import { riverItems } from '../george/workUnit';

export const WINDOW = { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' };
export const META = {
  source_table: 'new_transactions',
  filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-08T02:00:00+08:00',
  window: WINDOW,
  metric_domain: 'retail_sales',
  comparison: {
    kind: 'previous_period', display_name: 'vs previous period',
    baseline: { start: '2026-08-24', end: '2026-08-31' }, baseline_statuses: { ok: 7 },
  },
};

export const LABEL: Record<string, string> = {
  net_sales: 'Net sales',
  transaction_count: 'Transactions',
  average_transaction_value: 'Average transaction value',
  product_revenue: 'Product revenue',
};
const DRIVERS: Record<string, string[]> = { net_sales: ['transaction_count', 'average_transaction_value'] };
const VALID: Record<string, string[]> = {
  net_sales: ['store', 'day'], transaction_count: ['store', 'day'],
  average_transaction_value: ['store'], product_revenue: ['store', 'product', 'category'],
};
const UNIT: Record<string, string> = {
  net_sales: 'PHP', transaction_count: 'transactions', average_transaction_value: 'PHP', product_revenue: 'PHP',
};

export const STORES = [
  { id: 's-opus', label: 'OPUS' },
  { id: 's-greenhills', label: 'Greenhills' },
  { id: 's-rockwell', label: 'Rockwell' },
  { id: 's-north-edsa', label: 'North Edsa' },
  { id: 's-magnolia', label: 'Magnolia' },
  { id: 's-fairview', label: 'Fairview' },
  { id: 's-shang', label: 'Shang' },
];

export const cmp = (value: number, baseline: number, extra: Record<string, unknown> = {}) => ({
  value, baseline, change: value - baseline,
  change_pct: Math.round(((value - baseline) / baseline) * 1000) / 10,
  direction: value > baseline ? 'up' : value < baseline ? 'down' : 'flat',
  baseline_status: 'ok', unit: 'PHP', ...extra,
});

export const args = (metric: string, store: string | null, over: Record<string, unknown> = {}) => ({
  metric, date_range: 'last_week', filters: store ? { store } : {}, compare_to: 'previous_period', group_by: [], ...over,
});

function metaFor(metric: string, over: Record<string, unknown> = {}) {
  return {
    ...META, metric, metric_label: LABEL[metric], metric_unit: UNIT[metric],
    drivers: DRIVERS[metric] ?? [], valid_group_by: VALID[metric], ...over,
  };
}

/**
 * A read grouped by store. Two stores — North Edsa and Magnolia — fall while
 * the rest rise, so the composer's attention rule marks exactly those two.
 * Values differ by metric so the plane has a shape.
 */
export function chain(seq: number, metric = 'net_sales', over: Record<string, unknown> = {}) {
  const base = metric === 'transaction_count' ? 1000 : metric === 'average_transaction_value' ? 500 : 100000;
  const step = metric === 'transaction_count' ? 60 : metric === 'average_transaction_value' ? 20 : 9000;
  return {
    seq, tool: 'get_sales',
    arguments: args(metric, null, { group_by: ['store'], ...over }),
    rows: STORES.map((s, i) => {
      const value = base - i * step;
      const falls = i === 3 || i === 4;
      const baseline = falls ? value + step * (i === 3 ? 1.5 : 0.8) : value - step * 0.7;
      return { store_id: s.id, store: s.label, ...cmp(value, Math.round(baseline)) };
    }),
    meta: metaFor(metric),
  };
}

/** The headline set grouped by store: net sales, transactions, ATP — three reads. */
export function headlineSet(seqs = [1, 2, 3]) {
  return [chain(seqs[0], 'net_sales'), chain(seqs[1], 'transaction_count'), chain(seqs[2], 'average_transaction_value')];
}

/** A single compared figure scoped to one store. */
export function atom(seq: number, metric: string, store: string, v: number, b: number) {
  return { seq, tool: 'get_sales', arguments: args(metric, store), rows: [cmp(v, b)], meta: metaFor(metric) };
}

/** The headline set scoped to one store: three atoms. */
export function scopedSet(store: string, seqs = [1, 2, 3]) {
  return [
    atom(seqs[0], 'net_sales', store, 412380, 457110),
    atom(seqs[1], 'transaction_count', store, 2913, 2975),
    atom(seqs[2], 'average_transaction_value', store, 141.57, 153.65),
  ];
}

export const PRODUCTS = [
  { id: 'p-gummy', label: 'Mango Gummy' },
  { id: 'p-chew', label: 'Cola Chew' },
  { id: 'p-milk', label: 'Milk Candy' },
  { id: 'p-mint', label: 'Mint Drop' },
];

/** Product revenue by product at one store, ranked by biggest drop, with one product new this period. */
export function products(seq: number, store: string, over: Record<string, unknown> = {}) {
  return {
    seq, tool: 'get_sales',
    arguments: args('product_revenue', store, { group_by: ['product'], top_n: 4, rank_by: 'biggest_drop', ...over }),
    rows: [
      { product_id: PRODUCTS[0].id, sku: 'G1', product: PRODUCTS[0].label, ...cmp(1000, 4000) },
      { product_id: PRODUCTS[1].id, sku: 'C1', product: PRODUCTS[1].label, ...cmp(2000, 3500) },
      { product_id: PRODUCTS[2].id, sku: 'M1', product: PRODUCTS[2].label, ...cmp(900, 1000) },
      { product_id: PRODUCTS[3].id, sku: 'D1', product: PRODUCTS[3].label,
        value: 300, baseline: null, change: null, change_pct: null, direction: null, baseline_status: 'no_baseline', unit: 'PHP' },
    ],
    meta: metaFor('product_revenue', {
      comparison: { ...META.comparison, rank_by: 'biggest_drop', baseline_statuses: { ok: 3, no_baseline: 1 },
        not_ranked: { counts: { no_baseline: 1 }, no_current: [], no_baseline: [{ subject: PRODUCTS[3].label, value: 300, unit: 'PHP' }], ranked_subjects: 3 } },
    }),
  };
}

/** A time series: the grammar has no stage for it, so it is drawn as figures. */
export function series(seq: number) {
  return {
    seq, tool: 'get_sales',
    arguments: { metric: 'net_sales', date_range: 'last_month', group_by: ['day'], filters: { store: 'OPUS' } },
    rows: Array.from({ length: 14 }, (_, i) => ({ day: `2026-08-${String(i + 1).padStart(2, '0')}`, value: 1000 + i * 10 })),
    meta: { ...META, window: { kind: 'preset', name: 'last_month' }, metric: 'net_sales', metric_label: 'Net sales', metric_unit: 'PHP', comparison: undefined },
  };
}

export type Charted = { seq: number; tool: string; arguments: Record<string, unknown>; rows: Record<string, unknown>[]; meta: Record<string, unknown> };

export const finding = (seq: number, role: Finding['role'], of: number | null = null, identity?: string): Finding =>
  ({ seq, role, of, tool: 'get_sales', ...(identity ? { identity } : {}) });

export const PERF = (seqs = [1, 2, 3]) => [
  finding(seqs[0], 'primary', null, 'net_sales = transaction_count x average_transaction_value'),
  finding(seqs[1], 'driver', seqs[0]), finding(seqs[2], 'driver', seqs[0]),
];

let clock = 0;

export function post(id: string, charted: Charted[], findings: Finding[] | undefined, over: Partial<Post> = {}): Post {
  clock += 1;
  return {
    id, thread_id: 't1', parent_id: null, kind: 'answer', author: 'george', author_user: null, visibility: 'private',
    owner_user: 'ice', mine: true, body: `reading ${id}`, conversation_id: id,
    created_at: `2026-09-08T02:${String(clock).padStart(2, '0')}:00+08:00`,
    notices: [], receipts: META,
    payload: { charted, calls: charted.map((c) => ({ seq: c.seq, tool: c.tool, arguments: c.arguments })), findings },
    ...over,
  } as Post;
}

export function question(id: string, text: string, parent: string | null, desk: DeskContext | null = null): Post {
  return {
    ...post(id, [], undefined),
    kind: 'question', author: 'user', author_user: 'ice', body: text, parent_id: parent,
    payload: desk ? { desk } : null, receipts: null,
  } as Post;
}

export function surfacesOf(posts: Post[]): Surface[] {
  return riverSurfaces(riverItems(posts, [])).filter((e): e is Surface => e.kind === 'surface');
}

export const NORTH_EDSA = { dimension: 'store' as const, id: 's-north-edsa', label: 'North Edsa' };
export const MAGNOLIA = { dimension: 'store' as const, id: 's-magnolia', label: 'Magnolia' };
export const GREENHILLS = { dimension: 'store' as const, id: 's-greenhills', label: 'Greenhills' };

/** A replay's results: the same calls over another window, as the runner returns them. */
export function replayResults(charted: Charted[], window: { name: string; start: string; end: string }): PinCallResult[] {
  return charted.map((c) => ({
    tool: c.tool,
    arguments: { ...c.arguments, date_range: window.name },
    status: 'ok' as const,
    duration_ms: 3,
    rows: c.rows.map((r) => (typeof r.value === 'number' ? { ...r, value: r.value * 1.1 } : r)),
    meta: { ...c.meta, window: { kind: 'preset', ...window } },
    notices: [],
  }));
}
