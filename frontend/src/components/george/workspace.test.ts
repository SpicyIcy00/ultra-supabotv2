/**
 * Workspace V2 decisions: one fact one representation, continuity that cannot
 * merge unrelated work, caveats as data states, actions only where valid.
 */
import { describe, expect, it } from 'vitest';
import type { Post } from '../../types/river';
import { actionsFor, subjectAction } from './actionShape';
import { caveatPlans, unitCoverage } from './caveatShape';
import { composerHint, CONTINUE_HINT, ROOT_HINT } from './composerHint';
import { dedupeSources, factKeys } from './dedupe';
import { coverageInvalidates, coverageLine, levelCaption, levelLayout, majorityDirection, performanceMembers } from './instrumentShape';
import type { ComparisonRow } from './pinShape';
import { resultBlocks, type ResultSource, type ShapedResult } from './resultShape';
import { continuesWork, riverItems, workUnitFromPost, type Utterance, type WorkUnit } from './workUnit';

const WINDOW = { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' };
const META = {
  source_table: 'new_transactions', filters_applied: [], snapshot_timestamp: '2026-09-08T02:00:00+08:00',
  window: WINDOW, comparison: { kind: 'previous_period', display_name: 'vs previous period', baseline: { start: '2026-08-24', end: '2026-08-31' } },
};
const cmp = (value: number, baseline: number, extra: Record<string, unknown> = {}) => ({
  value, baseline, change: value - baseline, change_pct: Math.round(((value - baseline) / baseline) * 1000) / 10,
  direction: value >= baseline ? 'up' : 'down', baseline_status: 'ok', ...extra,
});
const atom = (seq: number, metric: string, label: string, v: number, b: number): ResultSource => ({
  seq, tool: 'get_sales',
  arguments: { metric, date_range: 'last_week', filters: { store: 'Rockwell' }, compare_to: 'previous_period', group_by: [] },
  rows: [cmp(v, b, { unit: 'PHP' })],
  meta: { ...META, metric, metric_label: label, valid_group_by: ['store', 'day'], drivers: metric === 'net_sales' ? ['transaction_count', 'average_transaction_value'] : [] },
});
const ATOMS = [atom(1, 'net_sales', 'Net sales', 203717, 179000), atom(2, 'transaction_count', 'Transactions', 366, 328), atom(3, 'average_transaction_value', 'Basket', 556.6, 545.7)];
/** The same three facts as one coarse result — a table with a `measure` column. */
const COARSE: ResultSource = {
  seq: 4, tool: 'get_sales',
  arguments: { date_range: 'last_week', filters: { store: 'Rockwell' }, compare_to: 'previous_period' },
  rows: [
    { measure: 'net_sales', ...cmp(203717, 179000) },
    { measure: 'transaction_count', ...cmp(366, 328) },
    { measure: 'average_transaction_value', ...cmp(556.6, 545.7) },
  ],
  meta: META,
};

describe('one fact, one representation', () => {
  it('reads a fact key as metric, subject and scope', () => {
    const keys = factKeys(ATOMS[0])!;
    expect(keys.size).toBe(1);
    expect([...keys][0]).toContain('net_sales');
    expect([...keys][0]).toContain('last_week');
  });

  it('suppresses a coarse result wholly covered by atoms, whichever came first', () => {
    const { kept, suppressed } = dedupeSources([COARSE, ...ATOMS]);
    expect(kept.map((s) => s.seq)).toEqual([1, 2, 3]);
    expect(suppressed).toEqual([{ seq: 4, coveredBy: [1, 2, 3] }]);
  });

  it('keeps a coarse result that shows a fact nobody else shows', () => {
    const { kept } = dedupeSources([COARSE, ATOMS[0], ATOMS[1]]);
    expect(kept.map((s) => s.seq)).toEqual([4, 1, 2]);
  });

  it('keeps the earlier of two results with the same grain and keys', () => {
    const again = { ...ATOMS[0], seq: 9 };
    const { kept, suppressed } = dedupeSources([ATOMS[0], again]);
    expect(kept.map((s) => s.seq)).toEqual([1]);
    expect(suppressed[0]).toEqual({ seq: 9, coveredBy: [1] });
  });

  it('never drops what it cannot identify', () => {
    const blind: ResultSource = { seq: 5, tool: 'get_stock', rows: [{ product: 'CCP', quantity_on_hand: 4 }], meta: { source_table: 'stock' } };
    expect(dedupeSources([blind, { ...blind, seq: 6 }]).kept).toHaveLength(2);
  });

  it('never dedupes by prose or by figures agreeing', () => {
    // Two results of the same fact that DISAGREE are still duplicates: one
    // representation, and the disagreement is for the receipts.
    const disagree = { ...ATOMS[0], seq: 9, rows: [cmp(1, 2, { unit: 'PHP' })] };
    expect(dedupeSources([ATOMS[0], disagree]).kept).toHaveLength(1);
  });
});

describe('comparison as the atom', () => {
  const rows: ComparisonRow[] = [
    { subject: 'OPUS', value: 555147, baseline: 425000, change: 130147, changePct: 30.6, direction: 'up', row: {} },
    { subject: 'Greenhills', value: 294291, baseline: 238000, change: 56291, changePct: 23.5, direction: 'up', row: {} },
    { subject: 'Rockwell', value: 203717, baseline: 179000, change: 24717, changePct: 13.8, direction: 'up', row: {} },
    { subject: 'Shang', value: 41242, baseline: 60000, change: -18758, changePct: -31.3, direction: 'down', row: {} },
  ];

  it('lengths level bars by value against the largest', () => {
    const l = levelLayout(rows);
    expect(l.bars[0].level).toBe(1);
    expect(l.bars[2].level).toBeCloseTo(203717 / 555147);
  });

  it('marks the exception the data establishes: the one that moved against the majority', () => {
    expect(majorityDirection(rows)).toBe('up');
    expect(levelLayout(rows).bars.map((b) => b.exception)).toEqual([false, false, false, true]);
  });

  it('marks nothing when there is no majority', () => {
    const mixed = rows.slice(0, 2).map((r, i) => ({ ...r, direction: i ? 'down' as const : 'up' as const }));
    expect(levelLayout(mixed).bars.every((b) => !b.exception)).toBe(true);
  });

  it('never captions a level comparison as ranked by change', () => {
    expect(levelCaption(levelLayout(rows), 'Net sales')).toBe("Net sales · in the tool's order");
    expect(levelCaption(levelLayout(rows, { top_n: 5 }), 'Net sales')).toBe('Net sales · largest first');
    expect(levelCaption(levelLayout(rows))).not.toMatch(/change/);
  });

  it('accepts a performance set only when every member is one compared metric with a delta', () => {
    const shaped = resultBlocks(ATOMS);
    expect(shaped[0].kind).toBe('group');
    const members = shaped[0].kind === 'group' ? shaped[0].members : [];
    expect(performanceMembers(members)).not.toBeNull();
    const broken = members.map((m, i) => (i ? m : { ...m, shape: { ...m.shape, rows: [{ ...(m.shape as { rows: ComparisonRow[] }).rows[0], changePct: null }] } } as ShapedResult));
    expect(performanceMembers(broken)).toBeNull();
  });
});

describe('caveats as data states', () => {
  const partial = { ...META, comparison: { ...META.comparison, baseline_statuses: { ok: 78, no_baseline: 20, no_current: 13, zero_baseline: 5 } } };
  const src: ResultSource = { seq: 1, tool: 'get_sales', rows: [cmp(1, 2)], meta: partial };
  const notice = { kind: 'comparison_incomplete', message: '38 of 116 compared rows could not be compared.', source: 'x' };

  it('reconciles the compact line to the underlying states', () => {
    const c = unitCoverage([src])!;
    expect(c.total).toBe(116);
    expect(c.measured).toBe(78);
    expect(coverageLine(c)).toBe('78 / 116 comparable · 38 excluded');
    expect(c.segments.reduce((n, s) => n + s.count, 0)).toBe(116);
  });

  it('presents a state-backed notice as its coverage, with the full message retained', () => {
    const [plan] = caveatPlans([notice], [src]);
    expect(plan.kind).toBe('coverage');
    expect(plan.notice.message).toBe(notice.message);
  });

  it('cannot minimise a notice that invalidates the figure', () => {
    const none = { ...src, meta: { ...META, comparison: { ...META.comparison, baseline_statuses: { no_baseline: 5 } } } };
    expect(coverageInvalidates(unitCoverage([none]))).toBe(true);
    expect(caveatPlans([notice], [none])[0].kind).toBe('banner');
  });

  it('keeps a notice whole when no state backs it', () => {
    expect(caveatPlans([{ kind: 'stale_stock', message: 'Stock is stale.' }], [src])[0].kind).toBe('banner');
    expect(caveatPlans([notice], [{ ...src, meta: META }])[0].kind).toBe('banner');
  });

  it('sums coverage across several compared results', () => {
    const c = unitCoverage([src, { ...src, seq: 2 }])!;
    expect(c.total).toBe(232);
  });
});

describe('actions only where the definitions allow', () => {
  const shaped = (s: ResultSource): ShapedResult => resultBlocks([s]).flatMap((b) => (b.kind === 'group' ? b.members : [b.result]))[0];

  it('offers why and by-store for a compared metric that declares drivers and may group by store', () => {
    const labels = actionsFor(shaped({ ...ATOMS[0], arguments: { ...ATOMS[0].arguments, filters: {} } })).map((a) => a.label);
    expect(labels).toEqual(['Why?', 'By store']);
  });

  it('offers nothing the definitions do not permit', () => {
    const labels = actionsFor(shaped(ATOMS[1])).map((a) => a.label);
    expect(labels).not.toContain('Why?');            // no drivers declared
    expect(labels).not.toContain('By product');      // not in valid_group_by
    expect(labels).not.toContain('By store');        // already one store
  });

  it('offers nothing without definition facts on the meta', () => {
    expect(actionsFor(shaped({ ...ATOMS[0], meta: META }))).toEqual([]);
  });

  it('asks in business words, never in tool vocabulary', () => {
    for (const a of actionsFor(shaped({ ...ATOMS[0], arguments: { ...ATOMS[0].arguments, filters: {} } }))) {
      expect(a.question).not.toMatch(/get_|group_by|compare_to|rank_by/);
    }
  });

  it('narrows to a store row only when the result is grouped by store', () => {
    const byStore = shaped({ ...ATOMS[0], arguments: { ...ATOMS[0].arguments, filters: {}, group_by: ['store'] }, rows: [{ store: 'OPUS', ...cmp(2, 1) }, { store: 'Shang', ...cmp(1, 2) }] });
    expect(subjectAction(byStore, 'OPUS')?.label).toBe('Focus on OPUS');
    expect(subjectAction(shaped(ATOMS[0]), 'OPUS')).toBeNull();
  });
});

describe('continuity that cannot merge unrelated work', () => {
  const post = (id: string, over: Partial<Post>): Post => ({
    id, thread_id: 't1', parent_id: null, kind: 'answer', author: 'george', author_user: null, visibility: 'private',
    owner_user: 'ice', mine: true, body: 'x', conversation_id: id, created_at: '2026-09-08T02:00:00+08:00', notices: [], receipts: META,
    payload: { charted: [{ seq: 1, tool: 'get_sales', arguments: ATOMS[0].arguments, rows: ATOMS[0].rows, meta: ATOMS[0].meta }],
               calls: [{ seq: 1, tool: 'get_sales', arguments: ATOMS[0].arguments }],
               findings: [{ seq: 1, role: 'primary', of: null, tool: 'get_sales' }] },
    ...over,
  } as Post);
  const work = (id: string, over: Partial<Post> = {}) => workUnitFromPost(post(id, over), undefined) as WorkUnit;
  const ask = (id: string, parent: string | null): Utterance => ({
    kind: 'utterance', id, text: 'Why?', at: '', authorUser: null, canShare: false, eyebrow: null, continues: false,
    post: post(id, { kind: 'question', author: 'user', parent_id: parent }),
  });

  it('continues when the question replies to the answer and the scope is the same', () => {
    expect(continuesWork(work('a1'), ask('q2', 'a1'), work('a2'))).toBe(true);
  });

  it('does not continue without the reply link', () => {
    expect(continuesWork(work('a1'), ask('q2', null), work('a2'))).toBe(false);
    expect(continuesWork(work('a1'), ask('q2', 'a0'), work('a2'))).toBe(false);
  });

  it('does not continue across a change of scope', () => {
    const magnolia = work('a2', { payload: { ...(post('a2', {}).payload as object),
      calls: [{ seq: 1, tool: 'get_sales', arguments: { ...ATOMS[0].arguments, filters: { store: 'Magnolia' } } }] } as never });
    expect(continuesWork(work('a1'), ask('q2', 'a1'), magnolia)).toBe(false);
  });

  it('does not continue across threads', () => {
    expect(continuesWork(work('a1'), ask('q2', 'a1'), work('a2', { thread_id: 't2' }))).toBe(false);
  });

  it('never continues from prose: the question text is not consulted', () => {
    const q = { ...ask('q2', 'a1'), text: 'Completely unrelated question about vending' };
    expect(continuesWork(work('a1'), q, work('a2'))).toBe(true);
  });

  it('marks the items in place and leaves every post its own row', () => {
    const items = riverItems([post('q1', { kind: 'question', author: 'user' }), post('a1', {}), post('q2', { kind: 'question', author: 'user', parent_id: 'a1' }), post('a2', {})], []);
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.continues)).toEqual([false, false, true, true]);
    expect(items[1].kind === 'work' && items[1].continuedBy).toBe(true);
  });
});

describe('the composer invites work', () => {
  it('asks what to work on at the root, and offers to go on once there is work', () => {
    expect(composerHint(null, [])).toBe(ROOT_HINT);
    const items = riverItems([{ ...({} as Post), id: 'a1', author: 'george', kind: 'answer', body: 'x', payload: null } as Post], []);
    expect(composerHint(null, items)).toBe(CONTINUE_HINT);
  });

  it('names a known page or a known store, and never invents one', () => {
    expect(composerHint({ page_id: 'p', title: 'AJI BARN Reorder' }, [])).toContain('AJI BARN Reorder');
    const items = riverItems([{ id: 'a1', author: 'george', kind: 'answer', body: 'x', thread_id: 't', parent_id: null, author_user: null, visibility: 'private', owner_user: 'ice', mine: true, conversation_id: 'c', created_at: '', notices: [], receipts: null,
      payload: { charted: [], calls: [{ seq: 1, tool: 'get_sales', arguments: ATOMS[0].arguments }] } } as unknown as Post], []);
    expect(composerHint(null, items)).toContain('Rockwell');
  });
});
