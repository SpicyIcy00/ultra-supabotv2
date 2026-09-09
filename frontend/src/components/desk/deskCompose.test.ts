/**
 * The desk composer: a field encodes only what rows carry, "Why?" deepens
 * the object in front of the person, a selection compares, a window change
 * recomposes, and the same posts compose the same layout twice.
 *
 * Numbered to the milestone's twelve tests where one answers an item.
 */
import { describe, expect, it } from 'vitest';
import type { PinCallResult } from '../../types/pins';
import { anchorOf, belongsToSurface, withSelection } from '../george/surfaceAnchor';
import { riverItems, workUnitFromPost } from '../george/workUnit';
import { composeDesk, fieldText, fieldRows, strongerDriver } from './deskCompose';
import { deskReducer, INITIAL_DESK, restoreDeskState } from './deskState';
import {
  chain, finding, GREENHILLS, headlineSet, MAGNOLIA, NORTH_EDSA, PERF, post, products, question, replayResults,
  scopedSet, series, STORES, surfacesOf, type Charted,
} from './deskFixture';
import { replayCalls, replayedSurface, replayFindings, restSurface } from './replay';
import { subjectKey } from './subject';

const Q = (id: string, text: string, parent: string | null, desk?: Parameters<typeof question>[3]) => question(id, text, parent, desk);
const northEdsaSelected = { selection: { dimension: 'store' as const, subjects: [{ id: 's-north-edsa', label: 'North Edsa' }] } };

/* ------------------------------------------------------------ the field -- */

describe('a field encodes only what rows carry', () => {
  it('places seven stores on the two declared drivers of net sales, sized by net sales', () => {
    const [s] = surfacesOf([Q('q1', 'What is going on with the stores?', null), post('a1', headlineSet(), PERF())]);
    const layout = composeDesk(s, INITIAL_DESK);
    expect(layout.stage.kind).toBe('field');
    if (layout.stage.kind !== 'field') return;
    const field = layout.stage.field;
    expect(field.encoding).toBe('plane');
    expect(field.x.label).toBe('Transactions');
    expect(field.y?.label).toBe('Average transaction value');
    expect(field.size.label).toBe('Net sales');
    expect(field.objects).toHaveLength(7);
    // Ids off rows, never labels: the subject is the store_id the row carried.
    expect(field.objects.map((o) => o.subject.id)).toEqual(STORES.map((st) => st.id));
    const ne = field.objects.find((o) => o.subject.label === 'North Edsa')!;
    const txn = chain(2, 'transaction_count').rows[3];
    const atp = chain(3, 'average_transaction_value').rows[3];
    expect(ne.x).toBe(txn.change_pct);
    expect(ne.y).toBe(atp.change_pct);
    expect(ne.figure.value).toBe(chain(1).rows[3].value);
    expect(ne.figure.direction).toBe('down');
    // Attention is the composer's: the two that moved against the majority.
    expect(field.objects.filter((o) => o.attention === 'against_the_majority').map((o) => o.subject.label).sort())
      .toEqual(['Magnolia', 'North Edsa']);
    // In the tool's row order, each store once.
    expect(layout.attentionLine).toBe('North Edsa and Magnolia fell while the rest moved the other way.');
    expect(layout.attentionLine).not.toMatch(/\d/);
  });

  it('positions a single compared metric by its change, and a plain read by its level', () => {
    const [single] = surfacesOf([Q('q1', 'Net sales by store?', null), post('a1', [chain(1)], [finding(1, 'primary')])]);
    const one = composeDesk(single, INITIAL_DESK);
    expect(one.stage.kind === 'field' && one.stage.field.encoding).toBe('change');
    expect(one.stage.kind === 'field' && one.stage.field.x.key).toBe('change_pct');
    const grouped = chain(1);
    const plain: Charted = {
      ...grouped,
      rows: grouped.rows.map((r) => ({ store_id: r.store_id, store: r.store, value: r.value })),
      meta: { ...grouped.meta, comparison: undefined },
    };
    const [level] = surfacesOf([Q('q1', 'Net sales by store?', null), post('a1', [plain], undefined)]);
    const lv = composeDesk(level, INITIAL_DESK);
    expect(lv.stage.kind === 'field' && lv.stage.field.encoding).toBe('level');
    expect(lv.stage.kind === 'field' && lv.stage.field.x.key).toBe('value');
  });

  it('ranks products by the change the tool ranked on, and lanes what it could not rank', () => {
    const [s] = surfacesOf([Q('q1', 'Which products moved most at North Edsa?', null), post('a1', [products(1, 'North Edsa')], [finding(1, 'primary')])]);
    const layout = composeDesk(s, INITIAL_DESK);
    expect(layout.stage.kind).toBe('field');
    if (layout.stage.kind !== 'field') return;
    expect(layout.stage.field.dimension).toBe('product');
    expect(layout.stage.field.encoding).toBe('change');
    expect(layout.stage.field.x.key).toBe('change');
    expect(layout.stage.field.objects.map((o) => o.subject.id)).toEqual(['p-gummy', 'p-chew', 'p-milk']);
    expect(layout.stage.field.unranked.map((o) => o.subject.label)).toEqual(['Mint Drop']);
    expect(layout.stage.field.within).toBe('North Edsa');
    expect(layout.level).toBe('breakdown');
  });

  it('11. gives every object a text equivalent, so colour is never the only signal', () => {
    const [s] = surfacesOf([Q('q1', 'stores?', null), post('a1', headlineSet(), PERF())]);
    const layout = composeDesk(s, INITIAL_DESK);
    if (layout.stage.kind !== 'field') throw new Error('field expected');
    const text = fieldText(layout.stage.field);
    expect(text).toHaveLength(7);
    for (const t of text) {
      expect(t.subject).toBeTruthy();
      expect(t.figure).toMatch(/^₱/);
      expect(t.delta).toMatch(/^[+−]\d/);
    }
    expect(fieldRows(layout.stage.field).map((r) => r.subject)).toEqual(STORES.map((st) => st.label));
  });
});

/* ---------------------------------------------------------- focus and why -- */

describe('1. "Why?" deepens the object in front of the person', () => {
  const POSTS = [Q('q1', 'What is going on with the stores?', null), post('a1', headlineSet(), PERF())];

  it('focusing a store slices its anatomy from the rows already on screen — no new read', () => {
    const [s] = surfacesOf(POSTS);
    const layout = composeDesk(s, deskReducer(INITIAL_DESK, { type: 'focus', subject: NORTH_EDSA }));
    expect(layout.stage.kind).toBe('anatomy');
    if (layout.stage.kind !== 'anatomy') return;
    const { anatomy } = layout.stage;
    expect(anatomy.subject.label).toBe('North Edsa');
    expect(anatomy.headline.label).toBe('Net sales');
    expect(anatomy.headline.seq).toBe(s.plan.evidence[0].seq);
    expect(anatomy.drivers.map((d) => d.label)).toEqual(['Transactions', 'Average transaction value']);
    expect(anatomy.identity).toContain('net_sales = transaction_count');
    expect(layout.level).toBe('subject');
    expect(layout.scope).toEqual(['North Edsa']);
    // The estate recedes; nothing leaves.
    expect(layout.receded.some((r) => r.kind === 'field' && r.field.objects.length === 7)).toBe(true);
  });

  it('a "Why?" answered from the surface stays ONE object: one surface, one stage, focus restored from the stored desk', () => {
    const surfaces = surfacesOf([...POSTS, Q('q2', 'Why?', 'a1', northEdsaSelected), post('a2', [], undefined, { body: 'Basket value fell more than transactions.' })]);
    expect(surfaces).toHaveLength(1);
    const [s] = surfaces;
    expect(s.steps).toHaveLength(2);
    const layout = composeDesk(s, restoreDeskState(s));
    expect(layout.stage.kind).toBe('anatomy');
    expect(layout.focus).toEqual(NORTH_EDSA);
    // Nothing appended: the same three reads are the whole evidence.
    expect(s.plan.evidence).toHaveLength(3);
    expect(s.latest.prose).toBe('Basket value fell more than transactions.');
  });

  it('a "Why?" answered with scoped re-reads still stays ONE object and hangs the drivers under the focus', () => {
    const surfaces = surfacesOf([...POSTS, Q('q2', 'Why?', 'a1', northEdsaSelected), post('a2', scopedSet('North Edsa', [1, 2, 3]), PERF([1, 2, 3]))]);
    expect(surfaces).toHaveLength(1);
    const [s] = surfaces;
    const layout = composeDesk(s, restoreDeskState(s));
    expect(layout.stage.kind).toBe('anatomy');
    if (layout.stage.kind !== 'anatomy') return;
    expect(layout.stage.anatomy.drivers).toHaveLength(2);
    // The stronger measured driver is a reading of two figures, never a share.
    expect(layout.stage.anatomy.stronger).toBe(1);
    expect(JSON.stringify(layout)).not.toMatch(/"(share|score|severity|attribution)"/);
    expect(layout.receded.some((r) => r.kind === 'field')).toBe(true);
  });

  it('reads the larger move qualitatively and refuses a reading when the two are equal', () => {
    const drivers = (a: number | null, b: number | null) => [
      { label: 'a', value: 1, changePct: a, direction: null, seq: 0, rowIndex: 0, meta: {} },
      { label: 'b', value: 1, changePct: b, direction: null, seq: 0, rowIndex: 0, meta: {} },
    ];
    expect(strongerDriver(drivers(-2.1, -7.9))).toBe(1);
    expect(strongerDriver(drivers(9, -3))).toBe(0);
    expect(strongerDriver(drivers(-5, 5))).toBeNull();
    expect(strongerDriver(drivers(null, 5))).toBeNull();
  });

  it('"Products." deepens the same object into its breakdown beneath the anatomy', () => {
    const surfaces = surfacesOf([
      ...POSTS,
      Q('q2', 'Why?', 'a1', northEdsaSelected), post('a2', scopedSet('North Edsa'), PERF()),
      Q('q3', 'Products.', 'a2', northEdsaSelected), post('a3', [products(4, 'North Edsa')], [finding(4, 'breakdown', 1)]),
    ]);
    expect(surfaces).toHaveLength(1);
    const layout = composeDesk(surfaces[0], restoreDeskState(surfaces[0]));
    expect(layout.stage.kind).toBe('anatomy');
    if (layout.stage.kind !== 'anatomy') return;
    expect(layout.stage.breakdown?.dimension).toBe('product');
    expect(layout.stage.breakdown?.objects.map((o) => o.subject.label)).toEqual(['Mango Gummy', 'Cola Chew', 'Milk Candy']);
    expect(layout.level).toBe('breakdown');
  });
});

/* --------------------------------------------------------------- compare -- */

describe('2–3. selection is semantic context, by id, and compares without restating names', () => {
  it('two stores selected on the estate compare abreast, sliced from the same rows', () => {
    const [s] = surfacesOf([Q('q1', 'stores?', null), post('a1', headlineSet(), PERF())]);
    const layout = composeDesk(s, deskReducer(INITIAL_DESK, { type: 'select', subjects: [NORTH_EDSA, MAGNOLIA] }));
    expect(layout.stage.kind).toBe('compare');
    if (layout.stage.kind !== 'compare') return;
    expect(layout.stage.subjects.map((a) => a.subject.label)).toEqual(['North Edsa', 'Magnolia']);
    expect(layout.stage.subjects[0].drivers).toHaveLength(2);
    expect(layout.scope).toEqual(['North Edsa', 'Magnolia']);
  });

  it('"Compare that with Magnolia" joins the work through the stored selection even when its reads name only Magnolia', () => {
    const products1 = products(4, 'North Edsa');
    const magnolia = products(5, 'Magnolia');
    const surfaces = surfacesOf([
      Q('q1', 'stores?', null), post('a1', headlineSet(), PERF()),
      Q('q2', 'Products.', 'a1', northEdsaSelected), post('a2', [products1], [finding(4, 'primary')]),
      Q('q3', 'Compare that with Magnolia.', 'a2', northEdsaSelected), post('a3', [magnolia], [finding(5, 'primary')]),
    ]);
    expect(surfaces).toHaveLength(1);
    const layout = composeDesk(surfaces[0], restoreDeskState(surfaces[0]));
    expect(layout.stage.kind).toBe('compare');
    if (layout.stage.kind !== 'compare') return;
    expect(layout.stage.fields.map((f) => f.within)).toEqual(['North Edsa', 'Magnolia']);
    expect(layout.stage.fields[0].objects.map((o) => o.subject.id)).toEqual(layout.stage.fields[1].objects.map((o) => o.subject.id));
  });

  it('the join is the selection and not the words: without a selection the same reads split, and a product selection does not join stores', () => {
    const prev = workUnitFromPost(post('a2', [products(4, 'North Edsa')], [finding(4, 'primary')]), undefined);
    const next = workUnitFromPost(post('a3', [products(5, 'Magnolia')], [finding(5, 'primary')]), undefined);
    const plain = riverItems([Q('q3', 'Compare that with Magnolia.', 'a2')], [])[0];
    const selected = riverItems([Q('q3', 'Compare that with Magnolia.', 'a2', northEdsaSelected)], [])[0];
    const productSel = riverItems([Q('q3', 'x', 'a2', { selection: { dimension: 'product', subjects: [{ id: 'p-gummy', label: 'Mango Gummy' }] } })], [])[0];
    if (plain.kind !== 'utterance' || selected.kind !== 'utterance' || productSel.kind !== 'utterance') throw new Error('utterances expected');
    expect(belongsToSurface(prev, plain, next)).toBe(false);
    expect(belongsToSurface(prev, selected, next)).toBe(true);
    expect(belongsToSurface(prev, productSel, next)).toBe(false);
    expect(withSelection(anchorOf(next), selected).subjects).toEqual(['Magnolia', 'North Edsa']);
  });
});

/* ----------------------------------------------------- reload and replay -- */

describe('5–6. a window change recomposes, and the same posts compose the same layout', () => {
  const POSTS = [Q('q1', 'stores?', null), post('a1', headlineSet(), PERF())];

  it('replays the surface’s calls with the window argument moved, and nothing else', () => {
    const [s] = surfacesOf(POSTS);
    const calls = replayCalls(s, { kind: 'preset', name: 'last_month' }, { get_sales: 'date_range', get_movement: 'date_range' });
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      expect(c.arguments.date_range).toBe('last_month');
      expect(c.arguments.compare_to).toBe('previous_period');
      expect(c.arguments.group_by).toEqual(['store']);
    }
    const explicit = replayCalls(s, { kind: 'explicit', start: '2026-08-01', end: '2026-08-15' }, { get_sales: 'date_range' });
    expect(explicit[0].arguments.date_range).toEqual({ start: '2026-08-01', end: '2026-08-15' });
  });

  it('carries the roles across by position, so the replayed field keeps its primary and drivers', () => {
    const [s] = surfacesOf(POSTS);
    expect(replayFindings(s).map((f) => [f.seq, f.role, f.of])).toEqual([[0, 'primary', null], [1, 'driver', 0], [2, 'driver', 0]]);
    const results = replayResults(headlineSet(), { name: 'last_month', start: '2026-08-01', end: '2026-09-01' });
    const replayed = replayedSurface(s, results, '2026-09-09T09:00:00+08:00');
    const before = composeDesk(s, INITIAL_DESK);
    const after = composeDesk(replayed, INITIAL_DESK);
    expect(after.stage.kind).toBe('field');
    if (after.stage.kind !== 'field' || before.stage.kind !== 'field') return;
    expect(after.stage.field.encoding).toBe('plane');
    // The same subjects, keyed the same way, so the objects move rather than remount.
    expect(after.stage.field.objects.map((o) => subjectKey(o.subject))).toEqual(before.stage.field.objects.map((o) => subjectKey(o.subject)));
    expect(after.anchor?.window?.name).toBe('last_month');
    expect(after.title).toContain('Last month');
    expect(after.stage.field.objects[0].figure.meta.window?.name).toBe('last_month');
    // A focus survives the replay: the subject is the same subject.
    const focused = composeDesk(replayed, deskReducer(INITIAL_DESK, { type: 'focus', subject: NORTH_EDSA }));
    expect(focused.stage.kind).toBe('anatomy');
  });

  it('draws a refused replay as a refusal, not as a field', () => {
    const refused: PinCallResult[] = [{ tool: 'get_sales', arguments: {}, status: 'refused', duration_ms: 1, rows: [], meta: {}, notices: [], error: 'compare_to is refused on this_week' }];
    const [s] = surfacesOf(POSTS);
    const layout = composeDesk(replayedSurface(s, refused, '2026-09-09T09:00:00+08:00'), INITIAL_DESK);
    expect(layout.stage.kind).toBe('statement');
  });

  it('composes the same layout from the same posts twice, and from a deep copy', () => {
    const a = composeDesk(surfacesOf(POSTS)[0], INITIAL_DESK);
    const b = composeDesk(surfacesOf(POSTS.map((p) => JSON.parse(JSON.stringify(p))))[0], INITIAL_DESK);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const focusedA = composeDesk(surfacesOf(POSTS)[0], deskReducer(INITIAL_DESK, { type: 'focus', subject: GREENHILLS }));
    expect(focusedA.fingerprint).not.toBe(a.fingerprint);
  });

  it('the desk at rest is the resting reads composed by the one path, with the composer’s own attention', () => {
    const results = replayResults([chain(0)], { name: 'last_7_days', start: '2026-09-01', end: '2026-09-08' });
    const layout = composeDesk(restSurface(results, '2026-09-09T09:00:00+08:00'), INITIAL_DESK);
    expect(layout.stage.kind).toBe('field');
    if (layout.stage.kind !== 'field') return;
    expect(layout.stage.field.objects).toHaveLength(7);
    expect(layout.attention.map((a) => a.subject).sort()).toEqual(['Magnolia', 'North Edsa']);
    expect(layout.stage.field.headline.source.meta.window?.name).toBe('last_7_days');
  });
});

/* ------------------------------------------------------------- fallbacks -- */

describe('what the grammar cannot yet stage is drawn by the primitives, honestly', () => {
  it('draws a time series as figures and a read-nothing answer as a statement', () => {
    const [chart] = surfacesOf([Q('q1', 'daily?', null), post('a1', [series(1)], undefined)]);
    expect(composeDesk(chart, INITIAL_DESK).stage.kind).toBe('figures');
    const [nothing] = surfacesOf([Q('q1', 'hello', null), post('a1', [], undefined)]);
    expect(composeDesk(nothing, INITIAL_DESK).stage.kind).toBe('statement');
    expect(composeDesk(null, INITIAL_DESK).stage.kind).toBe('statement');
  });

  it('keeps folded context receded and named, never dropped', () => {
    const [s] = surfacesOf([Q('q1', 'OPUS?', null), post('a1', [...scopedSet('OPUS'), chain(4)], [...PERF(), finding(4, 'context')])]);
    const layout = composeDesk(s, INITIAL_DESK);
    expect(layout.stage.kind).toBe('anatomy');
    expect(layout.receded.some((r) => r.kind === 'section' && r.section.folded)).toBe(true);
  });
});
