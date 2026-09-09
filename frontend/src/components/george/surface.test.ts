/**
 * Generative Workspace V3: the Surface Model, the Surface Composer, identity
 * versus shape, and the semantic seam — held pure, without a DOM.
 *
 * Numbered to the milestone's list where a test answers one of its items.
 */
import { describe, expect, it } from 'vitest';
import type { Post } from '../../types/river';
import { anchorOf, anchorRelation, belongsToSurface, identityKey, mergeAnchor } from './surfaceAnchor';
import {
  attentionIn, broaderThanAnchor, composeSurface, goalOf, riverSurfaces, surfaceFindings, surfaceSources,
  type Surface,
} from './surfaceCompose';
import { instructionId, instructionQuestion, refinementsFor, subjectRefinement } from './surfaceEvents';
import {
  authoredStrings, surfaceViolations, trustedVocabulary, unaccountedNumerals, type SurfacePlan,
} from './surfaceModel';
import { riverItems, workUnitFromPost, type Utterance, type WorkUnit } from './workUnit';
import { workUnitFromTurn } from './workUnit';
import type { GeorgeTurn } from '../../types/george';

/* ------------------------------------------------------------------ fixtures -- */

const WINDOW = { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' };
const META = {
  source_table: 'new_transactions', filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-08T02:00:00+08:00', window: WINDOW, metric_domain: 'retail_sales',
  comparison: { kind: 'previous_period', display_name: 'vs previous period', baseline: { start: '2026-08-24', end: '2026-08-31' }, baseline_statuses: { ok: 1 } },
};
const cmp = (value: number, baseline: number, extra: Record<string, unknown> = {}) => ({
  value, baseline, change: value - baseline, change_pct: Math.round(((value - baseline) / baseline) * 1000) / 10,
  direction: value > baseline ? 'up' : value < baseline ? 'down' : 'flat', baseline_status: 'ok', unit: 'PHP', ...extra,
});
const args = (metric: string, store: string | null, over: Record<string, unknown> = {}) => ({
  metric, date_range: 'last_week', filters: store ? { store } : {}, compare_to: 'previous_period', group_by: [], ...over,
});
const LABEL: Record<string, string> = { net_sales: 'Net sales', transaction_count: 'Transactions', average_transaction_value: 'Average transaction value', product_revenue: 'Product revenue' };
const DRIVERS: Record<string, string[]> = { net_sales: ['transaction_count', 'average_transaction_value'] };
const VALID: Record<string, string[]> = { net_sales: ['store', 'day'], transaction_count: ['store', 'day'], average_transaction_value: ['store'], product_revenue: ['store', 'product', 'category'] };

const atom = (seq: number, metric: string, store: string, v: number, b: number) => ({
  seq, tool: 'get_sales', arguments: args(metric, store), rows: [cmp(v, b)],
  meta: { ...META, metric, metric_label: LABEL[metric], drivers: DRIVERS[metric] ?? [], valid_group_by: VALID[metric] },
});
const OPUS = [atom(1, 'net_sales', 'OPUS', 555147, 425000), atom(2, 'transaction_count', 'OPUS', 1041, 940), atom(3, 'average_transaction_value', 'OPUS', 533.3, 452.1)];
const STORES = ['OPUS', 'Greenhills', 'Rockwell', 'North Edsa', 'Magnolia', 'Fairview', 'Shang'];
const chain = (seq: number, metric = 'net_sales', over: Record<string, unknown> = {}) => ({
  seq, tool: 'get_sales', arguments: args(metric, null, { group_by: ['store'], ...over }),
  rows: STORES.map((s, i) => ({ store: s, ...cmp(100000 - i * 9000, i === 3 || i === 4 ? 105000 - i * 9000 : 90000 - i * 9000) })),
  meta: { ...META, metric, metric_label: LABEL[metric], drivers: DRIVERS[metric] ?? [], valid_group_by: VALID[metric], comparison: { ...META.comparison, baseline_statuses: { ok: 7 } } },
});
const products = (seq: number) => ({
  seq, tool: 'get_sales', arguments: args('product_revenue', 'OPUS', { group_by: ['product'], top_n: 3, rank_by: 'biggest_drop' }),
  rows: [{ product: 'Mango Gummy', ...cmp(1000, 4000) }, { product: 'Cola Chew', ...cmp(2000, 3500) }, { product: 'Milk Candy', ...cmp(900, 1000) }],
  meta: { ...META, metric: 'product_revenue', metric_label: LABEL.product_revenue, valid_group_by: VALID.product_revenue, comparison: { ...META.comparison, rank_by: 'biggest_drop', baseline_statuses: { ok: 3 } } },
});

type Charted = ReturnType<typeof atom> | ReturnType<typeof chain> | ReturnType<typeof products> | { seq: number; tool: string; arguments: Record<string, unknown>; rows: Record<string, unknown>[]; meta: Record<string, unknown> };
const finding = (seq: number, role: 'primary' | 'driver' | 'breakdown' | 'context', of: number | null = null) => ({ seq, role, of, tool: 'get_sales' });

function post(id: string, charted: Charted[], findings: ReturnType<typeof finding>[] | undefined, over: Partial<Post> = {}): Post {
  return {
    id, thread_id: 't1', parent_id: null, kind: 'answer', author: 'george', author_user: null, visibility: 'private',
    owner_user: 'ice', mine: true, body: `reading ${id}`, conversation_id: id, created_at: `2026-09-08T02:00:0${id.length}+08:00`,
    notices: [], receipts: META,
    payload: { charted, calls: charted.map((c) => ({ seq: c.seq, tool: c.tool, arguments: c.arguments })), findings },
    ...over,
  } as Post;
}
const question = (id: string, text: string, parent: string | null): Post =>
  ({ ...post(id, [], undefined), kind: 'question', author: 'user', author_user: 'ice', body: text, parent_id: parent, payload: null, receipts: null } as Post);

const work = (id: string, charted: Charted[], findings?: ReturnType<typeof finding>[]) => workUnitFromPost(post(id, charted, findings), undefined) as WorkUnit;
const ask = (id: string, parent: string | null, text = 'Why?'): Utterance => ({
  kind: 'utterance', id, text, at: '', authorUser: null, canShare: false, eyebrow: null, continues: false,
  post: question(id, text, parent),
});

const PERF = [finding(1, 'primary'), finding(2, 'driver', 1), finding(3, 'driver', 1)];

function surfacesOf(posts: Post[]): Surface[] {
  return riverSurfaces(riverItems(posts, [])).filter((e): e is Surface => e.kind === 'surface');
}

/* --------------------------------------------------------- 1. the model -- */

describe('1. the Surface Model is typed and validated', () => {
  it('accepts a sound plan and rejects markup, colours, dimensions and foreign figures', () => {
    const plan = composeSurface('a1', [{ intent: null, unit: work('a1', OPUS, [finding(1, 'primary')]) }], anchorOf(work('a1', OPUS)));
    expect(surfaceViolations(plan)).toEqual([]);
    const bad: SurfacePlan = { ...plan, title: '<span style="color:#ff0000">OPUS</span>' };
    expect(surfaceViolations(bad).some((v) => v.includes('markup'))).toBe(true);
    const wide: SurfacePlan = { ...plan, title: 'OPUS 320px' };
    expect(surfaceViolations(wide).length).toBeGreaterThan(0);
    const figure: SurfacePlan = { ...plan, title: 'OPUS · ₱555,147' };
    expect(surfaceViolations(figure).some((v) => v.includes('figure the evidence does not carry'))).toBe(true);
    const foreign: SurfacePlan = { ...plan, goal: 'dashboard' as never };
    expect(surfaceViolations(foreign)).toContain('dashboard is not a goal');
  });

  it('accounts numerals only when the trusted vocabulary carries them', () => {
    const vocab = trustedVocabulary(composeSurface('a1', [{ intent: null, unit: work('a1', OPUS) }], anchorOf(work('a1', OPUS))));
    expect(unaccountedNumerals('2026-08-31 → 2026-09-07', vocab)).toEqual([]);
    expect(unaccountedNumerals('up 30.6%', vocab)).toEqual(['30.6']);
  });
});

/* --------------------------------------------------- 2–4. the composer -- */

describe('2. the composer is deterministic for identical trusted input', () => {
  it('composes byte-identical plans from equal inputs', () => {
    const a = composeSurface('a1', [{ intent: null, unit: work('a1', OPUS, PERF) }], anchorOf(work('a1', OPUS, PERF)));
    const b = composeSurface('a1', [{ intent: null, unit: work('a1', OPUS, PERF) }], anchorOf(work('a1', OPUS, PERF)));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('3–4. the composer introduces no figure and emits no presentation', () => {
  it('authors only closed-vocabulary words and trusted tokens', () => {
    const plan = composeSurface('a1', [{ intent: null, unit: work('a1', [chain(1)], [finding(1, 'primary')]) }], anchorOf(work('a1', [chain(1)])));
    expect(surfaceViolations(plan)).toEqual([]);
    for (const s of authoredStrings(plan)) {
      expect(s).not.toMatch(/<|className|style=|#[0-9a-f]{6}|px\b|React/i);
    }
    // Every figure on the plan is inside a ResultSource the tool returned.
    for (const s of plan.sections) for (const b of s.blocks) {
      const members = b.kind === 'group' ? b.members : [b.result];
      for (const m of members) expect(plan.evidence.map((e) => e.seq)).toContain(m.source.seq);
    }
  });
});

/* --------------------------------------------- 5–8. minimum sufficiency -- */

describe('5–6. one fact, one representation — across the whole surface', () => {
  it('draws the headline set once as one instrument and suppresses the covering table', () => {
    const coarse: Charted = { seq: 4, tool: 'get_sales', arguments: args('net_sales', 'OPUS'),
      rows: OPUS.map((a) => ({ measure: a.arguments.metric, ...a.rows[0] })), meta: META };
    const unit = work('a1', [coarse, ...OPUS], [finding(1, 'primary'), finding(2, 'driver', 1), finding(3, 'driver', 1)]);
    const plan = composeSurface('a1', [{ intent: null, unit }], anchorOf(unit));
    // The unit already suppressed the table (workUnit composes through dedupe);
    // the surface draws the three atoms and nothing else.
    expect(unit.suppressed).toEqual([{ seq: 4, coveredBy: [1, 2, 3] }]);
    expect(plan.evidence.map((e) => e.localSeq)).toEqual([1, 2, 3]);
    expect(plan.sections.map((s) => s.role)).toEqual(['primary', 'driver']);
  });

  it('suppresses a refinement re-read of the fact already on screen', () => {
    const [s] = surfacesOf([question('q1', 'How did OPUS do?', null), post('a1', OPUS, [finding(1, 'primary')]),
      question('q2', 'Why?', 'a1'), post('a2', OPUS, PERF)]);
    // Three facts drawn once; the second turn's three re-reads are duplicates.
    expect(s.plan.evidence).toHaveLength(3);
    expect(s.plan.suppressed).toHaveLength(3);
    expect(s.plan.evidence.every((e) => e.unitId === 'a1')).toBe(true);
  });
});

describe('7–8. single-store performance folds the chain; a requested chain comparison stands', () => {
  it('folds a chain-wide read as context outside the anchor', () => {
    const unit = work('a1', [...OPUS, chain(4)], [finding(1, 'primary'), finding(2, 'driver', 1), finding(3, 'driver', 1), finding(4, 'context')]);
    const anchor = anchorOf(unit);
    expect(anchor.subjects).toEqual(['OPUS']);
    expect(broaderThanAnchor({ ...chain(4), seq: 4 }, anchor)).toBe(true);
    const plan = composeSurface('a1', [{ intent: null, unit }], anchor);
    const context = plan.sections.find((s) => s.role === 'context')!;
    expect(context.rank).toBe('context');
    expect(context.folded).toBe(true);
    expect(plan.goal).toBe('investigation');
    expect(plan.sections[1].instrument).toBe('driver_split');
  });

  it('keeps a requested chain comparison as the primary, unfolded, with the comparison goal', () => {
    const unit = work('a1', [chain(1)], [finding(1, 'primary')]);
    const plan = composeSurface('a1', [{ intent: null, unit }], anchorOf(unit));
    expect(plan.goal).toBe('comparison');
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0].folded).toBe(false);
    expect(plan.anchor.subjects).toEqual([]);
  });

  it('never folds what is within the anchor, and never folds the whole estate', () => {
    expect(broaderThanAnchor(OPUS[0] as never, anchorOf(work('a1', OPUS)))).toBe(false);
    expect(broaderThanAnchor(chain(1) as never, anchorOf(work('a1', [chain(1)])))).toBe(false);
  });
});

/* ------------------------------------------- 9–10. attention, no score -- */

describe('9–10. attention only from trusted findings, and no synthetic score', () => {
  it('marks the subjects that moved against the majority, from the tool direction alone', () => {
    const unit = work('a1', [chain(1)], [finding(1, 'primary')]);
    const plan = composeSurface('a1', [{ intent: null, unit }], anchorOf(unit));
    expect(plan.attention.map((a) => a.subject).sort()).toEqual(['Magnolia', 'North Edsa']);
    expect(plan.attention.every((a) => a.reason === 'against_the_majority' && a.direction === 'down')).toBe(true);
  });

  it('marks nothing without findings, and nothing in a folded context section', () => {
    expect(composeSurface('a1', [{ intent: null, unit: work('a1', [chain(1)]) }], anchorOf(work('a1', [chain(1)]))).attention).toEqual([]);
    const unit = work('a1', [...OPUS, chain(4)], [finding(1, 'primary'), finding(4, 'context')]);
    expect(composeSurface('a1', [{ intent: null, unit }], anchorOf(unit)).attention).toEqual([]);
  });

  it('marks the first row of a change ranking the TOOL performed', () => {
    const unit = work('a1', [...OPUS, products(4)], [finding(1, 'primary'), finding(4, 'breakdown', 1)]);
    const plan = composeSurface('a1', [{ intent: null, unit }], anchorOf(unit));
    expect(plan.attention).toEqual([{ subject: 'Mango Gummy', reason: 'ranked_first', direction: 'down', role: 'breakdown', measure: 'Product revenue' }]);
  });

  it('carries no score, threshold, severity or confidence anywhere on the plan', () => {
    const unit = work('a1', [chain(1)], [finding(1, 'primary')]);
    const json = JSON.stringify(composeSurface('a1', [{ intent: null, unit }], anchorOf(unit)));
    expect(json).not.toMatch(/"(score|severity|importance|confidence|threshold|health)"/);
    expect(attentionIn([]).length).toBe(0);
  });
});

/* -------------------------------------------- 14–17. identity and shape -- */

describe('11. identity versus analysis shape', () => {
  it('keeps identity across a change of comparison, grouping or metric', () => {
    const a = anchorOf(work('a1', [atom(1, 'net_sales', 'OPUS', 1, 1)]));
    const b = anchorOf(work('a2', [{ ...products(1), arguments: args('product_revenue', 'OPUS', { group_by: ['product'] }) }]));
    expect(identityKey(a)).toBe(identityKey(b));
    expect(anchorRelation(a, b)).toBe('same');
  });

  it('ends identity across a window, a business or a population filter', () => {
    const a = anchorOf(work('a1', OPUS));
    const month = anchorOf(work('a2', OPUS.map((c) => ({ ...c, meta: { ...c.meta, window: { kind: 'preset', name: 'last_month' } } }))));
    expect(anchorRelation(a, month)).toBe('unrelated');
    const tagged = anchorOf(work('a3', OPUS.map((c) => ({ ...c, arguments: { ...c.arguments, filters: { store: 'OPUS', tag: 'gift' } } }))));
    expect(anchorRelation(a, tagged)).toBe('unrelated');
  });

  it('relates subjects by expansion, narrowing and disjunction', () => {
    const opus = anchorOf(work('a1', OPUS));
    const estate = anchorOf(work('a2', [chain(1)]));
    const magnolia = anchorOf(work('a3', OPUS.map((c) => ({ ...c, arguments: { ...c.arguments, filters: { store: 'Magnolia' } } }))));
    expect(anchorRelation(opus, estate)).toBe('expanded');
    expect(anchorRelation(estate, opus)).toBe('narrowed');
    expect(anchorRelation(opus, magnolia)).toBe('disjoint');
    expect(mergeAnchor(opus, estate).subjects).toEqual([]);
  });
});

describe('14. "Why?" refines the same Work Surface', () => {
  it('deepens the surface: the same primary, the drivers added, one object', () => {
    const [s] = surfacesOf([question('q1', 'How did OPUS do last week?', null), post('a1', [OPUS[0]], [finding(1, 'primary')]),
      question('q2', 'Why?', 'a1'), post('a2', OPUS, PERF)]);
    expect(s.steps).toHaveLength(2);
    expect(s.id).toBe('a1');
    expect(s.plan.sections.map((x) => x.role)).toEqual(['primary', 'driver']);
    expect(s.plan.sections[1].instrument).toBe('driver_split');
    expect(s.plan.goal).toBe('investigation');
  });
});

describe('15. "Compare it with Rockwell" stays one Work Surface where compatible', () => {
  it('expands the anchor to the estate and recomposes around the comparison', () => {
    const [s] = surfacesOf([question('q1', 'How did OPUS do last week?', null), post('a1', OPUS, PERF),
      question('q2', 'Compare it with Rockwell.', 'a1'), post('a2', [chain(1)], [finding(1, 'primary')])]);
    expect(s.steps).toHaveLength(2);
    expect(s.anchor.subjects).toEqual([]);
    expect(s.plan.goal).toBe('comparison');
    // The newest surviving primary leads; the earlier performance becomes context, unfolded.
    const roles = s.plan.sections.map((x) => x.role);
    expect(roles[0]).toBe('primary');
    expect(roles).toContain('context');
    expect(s.plan.sections.find((x) => x.role === 'context')!.folded).toBe(false);
  });
});

describe('16. product refinement stays on the surface when scope-compatible', () => {
  it('adds a breakdown rung beneath the same primary', () => {
    const [s] = surfacesOf([question('q1', 'How did OPUS do last week?', null), post('a1', OPUS, PERF),
      question('q2', 'Show me the products.', 'a1'), post('a2', [OPUS[0], products(2)], [finding(1, 'primary'), finding(2, 'breakdown', 1)])]);
    expect(s.steps).toHaveLength(2);
    expect(s.plan.sections.map((x) => x.role)).toEqual(['primary', 'driver', 'breakdown']);
    expect(s.plan.attention[0]).toMatchObject({ subject: 'Mango Gummy', reason: 'ranked_first' });
  });
});

describe('17. changed unrelated scope does not merge', () => {
  it('starts a new surface for another store, another window, or another thread', () => {
    const magnolia = OPUS.map((c) => ({ ...c, arguments: { ...c.arguments, filters: { store: 'Magnolia' } } }));
    expect(surfacesOf([question('q1', 'OPUS?', null), post('a1', OPUS, PERF), question('q2', 'And Magnolia?', 'a1'), post('a2', magnolia, PERF)])).toHaveLength(2);
    const month = OPUS.map((c) => ({ ...c, meta: { ...c.meta, window: { kind: 'preset', name: 'last_month' } } }));
    expect(surfacesOf([question('q1', 'OPUS?', null), post('a1', OPUS, PERF), question('q2', 'Last month?', 'a1'), post('a2', month, PERF)])).toHaveLength(2);
    expect(surfacesOf([question('q1', 'OPUS?', null), post('a1', OPUS, PERF), question('q2', 'Why?', 'a1'), post('a2', OPUS, PERF, { thread_id: 't2' })])).toHaveLength(2);
  });

  it('needs the reply link, and never consults the question text', () => {
    expect(belongsToSurface(work('a1', OPUS), ask('q2', null), work('a2', OPUS))).toBe(false);
    expect(belongsToSurface(work('a1', OPUS), ask('q2', 'a1', 'Completely unrelated words'), work('a2', OPUS))).toBe(true);
  });

  it('keeps a no-read follow-up on the surface it replied to', () => {
    expect(belongsToSurface(work('a1', OPUS), ask('q2', 'a1'), work('a2', []))).toBe(true);
  });
});

/* ------------------------------------ 18–20. history, reload, handoff -- */

describe('18–19. append-only posts, and a reload that reconstructs the evolved surface', () => {
  const POSTS = [question('q1', 'How did OPUS do last week?', null), post('a1', OPUS, PERF),
    question('q2', 'Why?', 'a1'), post('a2', OPUS, PERF),
    question('q3', 'Compare it with Rockwell.', 'a2'), post('a3', [chain(1)], [finding(1, 'primary')])];

  it('leaves every post its own row and touches none of them', () => {
    const before = JSON.stringify(POSTS);
    const items = riverItems(POSTS, []);
    riverSurfaces(items);
    expect(JSON.stringify(POSTS)).toBe(before);
    expect(items).toHaveLength(6);
  });

  it('rebuilds the same plan from the same posts, twice', () => {
    const a = surfacesOf(POSTS);
    const b = surfacesOf(POSTS.map((p) => JSON.parse(JSON.stringify(p))));
    expect(a).toHaveLength(1);
    expect(JSON.stringify(a[0].plan)).toBe(JSON.stringify(b[0].plan));
    expect(a[0].steps.map((s) => s.intent?.text)).toEqual(['How did OPUS do last week?', 'Why?', 'Compare it with Rockwell.']);
  });
});

describe('20. the live-to-stored handoff neither duplicates nor resets the surface', () => {
  it('composes a live refinement onto the stored surface with the same id, and the same plan once stored', () => {
    const stored = riverItems([question('q1', 'How did OPUS do last week?', null), post('a1', [OPUS[0]], [finding(1, 'primary')])], []);
    const liveTurn: GeorgeTurn = {
      role: 'george', text: 'reading a2', at: '2026-09-08T02:00:05+08:00', thinking: '', notices: [], pinned: [], saved: [], pageChanges: [],
      findings: PERF as never,
      toolCalls: OPUS.map((c) => ({ seq: c.seq, tool: c.tool, arguments: c.arguments,
        result: { row_count: 1, source_table: 'new_transactions', truncated: false, duration_ms: 1, error: null, rows: c.rows, rows_complete: true, meta: c.meta, pinnable: true } })),
      done: { conversation_id: 'a2', thread_id: 't1', iterations: 1, tool_calls: 3, status: 'ok', cache_hit: false } as never,
      post: { question_post_id: 'q2', answer_post_id: 'a2', conversation_id: 'a2', thread_id: 't1', stored: true } as never,
    } as unknown as GeorgeTurn;
    const liveQ: Utterance = { kind: 'utterance', id: 'q2', text: 'Why?', at: '', authorUser: null, canShare: false, eyebrow: null, continues: false, post: null, parentId: 'a1' };
    const liveUnit = workUnitFromTurn(liveTurn as never, 'Why?', 'live');
    const live = riverSurfaces([...stored, liveQ, liveUnit]);
    expect(live).toHaveLength(1);
    const liveSurface = live[0] as Surface;
    expect(liveSurface.id).toBe('a1');
    expect(liveSurface.steps).toHaveLength(2);

    const settled = surfacesOf([question('q1', 'How did OPUS do last week?', null), post('a1', [OPUS[0]], [finding(1, 'primary')]), question('q2', 'Why?', 'a1'), post('a2', OPUS, PERF)]);
    expect(settled[0].id).toBe('a1');
    expect(JSON.stringify(settled[0].plan.sections.map((s) => [s.role, s.rank, s.instrument, s.folded])))
      .toBe(JSON.stringify(liveSurface.plan.sections.map((s) => [s.role, s.rank, s.instrument, s.folded])));
  });
});

/* -------------------------------------------- 27. the semantic seam -- */

describe('27. semantic UI actions use ids and trusted state, not the DOM', () => {
  it('turns an instruction into a business-language question deterministically', () => {
    const unit = work('a1', OPUS, PERF);
    const anchor = anchorOf(unit);
    const meta = OPUS[0].meta;
    expect(instructionQuestion({ op: 'explain' }, meta, anchor)).toBe('Why did net sales change at OPUS last week?');
    expect(instructionQuestion({ op: 'compare_subject', subject: 'Rockwell' }, meta, anchor)).toBe('Compare Rockwell with OPUS last week, net sales against the previous period');
    expect(instructionQuestion({ op: 'focus_subject', subject: 'North Edsa' }, meta, anchor)).toBe('How did North Edsa do last week? Show net sales compared with the previous period.');
    expect(instructionId({ op: 'break_down', dimension: 'product' })).toBe('break_down:product');
    for (const q of [instructionQuestion({ op: 'explain' }, meta, anchor), instructionQuestion({ op: 'break_down', dimension: 'store' }, meta)]) {
      expect(q).not.toMatch(/get_|group_by|compare_to|rank_by|change_pct/);
    }
  });

  it('offers only what the definitions permit, and a row action only for a store grouping', () => {
    const unit = work('a1', OPUS, PERF);
    const plan = composeSurface('a1', [{ intent: null, unit }], anchorOf(unit));
    expect(plan.refinements.map((r) => r.id)).toEqual(['explain']); // one store already; product not permitted for net sales
    const estate = work('a2', [chain(1)], [finding(1, 'primary')]);
    const estatePlan = composeSurface('a2', [{ intent: null, unit: estate }], anchorOf(estate));
    expect(estatePlan.refinements).toEqual([]); // grouped already: why needs one figure, store is taken
    const shaped = estatePlan.sections[0].blocks[0];
    const result = shaped.kind === 'group' ? shaped.members[0] : shaped.result;
    expect(subjectRefinement(result, 'North Edsa', estatePlan.anchor)?.instruction).toEqual({ op: 'focus_subject', subject: 'North Edsa' });
    expect(refinementsFor(result, estatePlan.anchor).every((r) => r.instruction.op !== 'compare_subject')).toBe(true);
  });
});

/* ------------------------------------------ 29–30. honesty and simplicity -- */

describe('29–30. missing evidence is a truthful limitation; a simple question stays simple', () => {
  it('composes a statement with no sections when nothing was drawn, keeping the receipts', () => {
    const unit = work('a1', []);
    const plan = composeSurface('a1', [{ intent: null, unit }], anchorOf(unit));
    expect(plan.goal).toBe('statement');
    expect(plan.sections).toEqual([]);
    expect(plan.refinements).toEqual([]);
    expect(surfaceViolations(plan)).toEqual([]);
  });

  it('draws one figure as one primary section and nothing else', () => {
    const unit = work('a1', [OPUS[0]]);
    const plan = composeSurface('a1', [{ intent: null, unit }], anchorOf(unit));
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0].rank).toBe('primary');
    expect(plan.goal).toBe('listing');
    expect(plan.title).toBe('The figures · OPUS · Last week');
  });

  it('renumbers sources across steps and keeps the way back', () => {
    const { sources, findings } = surfaceSources([{ intent: null, unit: work('a1', OPUS, PERF) }, { intent: null, unit: work('a2', OPUS, PERF) }]);
    expect(sources.map((s) => s.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(sources.map((s) => s.localSeq)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(findings.filter((f) => f.role === 'primary').map((f) => f.seq)).toEqual([0, 3]);
    // Step two re-read all three: its primary is shown as step one's, and its
    // drivers re-hang on the surviving figure rather than becoming context.
    const roles = surfaceFindings(findings, new Set([0, 1, 2, 4, 5]), [{ seq: 3, coveredBy: [0] }]);
    expect(roles.filter((f) => f.role === 'primary').map((f) => f.seq)).toEqual([0]);
    expect(roles.filter((f) => f.role === 'driver').map((f) => [f.seq, f.of])).toEqual([[1, 0], [2, 0], [4, 0], [5, 0]]);
    // A driver whose primary is shown by nothing on screen is context.
    const orphan = surfaceFindings(findings, new Set([0, 1, 2, 4, 5]), []);
    expect(orphan.filter((f) => f.role === 'context').map((f) => f.seq)).toEqual([4, 5]);
    expect(goalOf([], anchorOf(work('a1', [])))).toBe('statement');
  });
});
