/**
 * The refinement: one coherent answer, a representation that earns itself,
 * caveats by consequence, a trail of states, and George's initiative.
 *
 * Held pure, without a DOM. Numbered to the milestone's acceptance tests.
 */
import { describe, expect, it } from 'vitest';
import { composeDesk, planeEarnsItsPlace, quadrantOf, type FieldObject } from './deskCompose';
import { conclusionOf, leadAndRest } from './conclusion';
import { excludedWords, isReaderSafe, levelCaveats, RAW_DIAGNOSTIC } from './caveats';
import { guidanceFor, recommendationFor } from './initiative';
import { deskActions, MAX_MOVES, questionAnchor } from './deskActions';
import { deskReducer, INITIAL_DESK } from './deskState';
import { activeStep, shortLabel, workTrail } from './workTrail';
import {
  chain, divergingSet, finding, headlineSet, MAGNOLIA, NORTH_EDSA, PERF, post, products, question,
  scopedSet, surfacesOf,
} from './deskFixture';

const Q = question;
const northEdsa = { selection: { dimension: 'store' as const, subjects: [{ id: 's-north-edsa', label: 'North Edsa' }] } };
const focused = deskReducer(INITIAL_DESK, { type: 'focus', subject: NORTH_EDSA });
/** What the server says the definitions permit a breakdown by. */
const BREAKDOWNS = ['product', 'category'];

const estate = () => surfacesOf([Q('q1', 'What’s going on with the stores?', null), post('a1', headlineSet(), PERF())])[0];
const opened = () => surfacesOf([
  Q('q1', 'North Edsa?', null), post('a1', scopedSet('North Edsa'), PERF()),
])[0];

/* ---------------------------------------------- 13, 14. representation -- */

describe('13–14. the representation is deterministic, and a plane is not mandatory', () => {
  it('draws a ranked comparison for one measure across stores', () => {
    const [s] = surfacesOf([Q('q1', 'Net sales by store?', null), post('a1', [chain(1)], [finding(1, 'primary')])]);
    const layout = composeDesk(s, INITIAL_DESK);
    expect(layout.stage.kind).toBe('field');
    if (layout.stage.kind !== 'field') return;
    // One measure has one dimension to place on; a plane would invent a second.
    expect(layout.stage.field.representation).toBe('ranked');
    expect(layout.guidance).toBeNull();
  });

  it('uses a plane only when the drivers disagree ACROSS subjects', () => {
    const layout = composeDesk(estate(), INITIAL_DESK);
    if (layout.stage.kind !== 'field') throw new Error('field expected');
    // The fixture has five stores up on both drivers and two down on both:
    // two quadrants, so the second axis separates something.
    expect(layout.stage.field.representation).toBe('plane');
    expect(layout.stage.field.planeDeclined).toBeNull();
  });

  it('declines the plane when every subject moved the same way on both drivers', () => {
    // Every store up on both: one quadrant, and a ranked list says it.
    const agreeing = headlineSet().map((c) => ({
      ...c,
      rows: c.rows.map((r) => ({ ...r, change: 10, change_pct: 5, direction: 'up', baseline: (r.value as number) - 10 })),
    }));
    const [s] = surfacesOf([Q('q1', 'stores?', null), post('a1', agreeing, PERF())]);
    const layout = composeDesk(s, INITIAL_DESK);
    if (layout.stage.kind !== 'field') throw new Error('field expected');
    expect(layout.stage.field.representation).toBe('ranked');
    expect(layout.stage.field.planeDeclined).toContain('same way on both drivers');
    expect(layout.guidance).toBeNull();
  });

  it('reads a quadrant from the SIGN of two changes the tool computed, and nothing else', () => {
    const at = (x: number | null, y: number | null) => ({ x, y } as FieldObject);
    expect(quadrantOf(at(1, 1))).toBe('++');
    expect(quadrantOf(at(-1, 1))).toBe('-+');
    expect(quadrantOf(at(1, null))).toBeNull();
    expect(planeEarnsItsPlace([at(1, 1), at(2, 2), at(3, 3)])).toBe(false);
    expect(planeEarnsItsPlace([at(1, 1), at(2, 2), at(-3, 3)])).toBe(true);
    expect(planeEarnsItsPlace([at(1, 1), at(-2, 2)])).toBe(false); // too few to read as a field
  });
});

/* ------------------------------------------------------- 15. guidance -- */

describe('15. a less conventional visual says how to read it, in one line', () => {
  it('attaches guidance to a plane and to nothing else', () => {
    const layout = composeDesk(estate(), INITIAL_DESK);
    expect(layout.guidance).toBeTruthy();
    expect(layout.guidance).toContain('Further right');
    expect(layout.guidance).toContain('Size is');
    // It says what a click does: a control nobody knows about does not exist.
    expect(layout.guidance).toMatch(/click/i);
    // Two sentences at most, and no tool vocabulary.
    expect((layout.guidance ?? '').split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3);
    expect(layout.guidance).not.toMatch(/get_sales|change_pct|group_by/);
    if (layout.stage.kind !== 'field') return;
    expect(guidanceFor({ ...layout.stage.field, representation: 'ranked' })).toBeNull();
  });
});

/* ----------------------------------------------------- 1. the reading -- */

describe('1. George’s reading is one sentence, with the figures it reads', () => {
  it('names the driver that moved more, and carries no numeral', () => {
    const [s] = surfacesOf([Q('q1', 'stores?', null), post('a1', divergingSet(), PERF())]);
    const layout = composeDesk(s, focused);
    expect(layout.stage.kind).toBe('anatomy');
    const conclusion = layout.conclusion!;
    expect(conclusion).toBeTruthy();
    expect(conclusion).not.toMatch(/\d/);
    expect(conclusion.toLowerCase()).toContain('transactions');
    expect(conclusion.toLowerCase()).toContain('average transaction value');
    // The canonical reading: more transactions carried it, baskets fell.
    expect(conclusion).toMatch(/carried the rise/);
    // A reading, never a cause and never a share.
    expect(conclusion).not.toMatch(/\bcaused\b|because of|%|share/i);
    // And never a synonym no definition establishes.
    expect(conclusion).not.toMatch(/customers|traffic|footfall|shoppers|visits/i);
  });

  it('says neither carried it when the two moved by the same amount', () => {
    const even = scopedSet('North Edsa').map((c, i) => ({
      ...c,
      rows: [{ ...c.rows[0], change_pct: i === 1 ? 5 : i === 2 ? -5 : -1, direction: i === 1 ? 'up' : 'down' }],
    }));
    const [s] = surfacesOf([Q('q1', 'North Edsa?', null), post('a1', even, PERF())]);
    const layout = composeDesk(s, INITIAL_DESK);
    if (layout.stage.kind !== 'anatomy') throw new Error('anatomy expected');
    expect(conclusionOf(layout.stage.anatomy)).toContain('neither carried');
  });

  it('says nothing when there is nothing to decompose', () => {
    const [s] = surfacesOf([Q('q1', 'Net sales?', null), post('a1', [scopedSet('OPUS')[0]], undefined)]);
    expect(composeDesk(s, INITIAL_DESK).conclusion).toBeNull();
  });

  it('splits George’s own prose into a lead and the rest', () => {
    const { lead, rest } = leadAndRest('Transactions carried it. The basket was smaller than the week before.');
    expect(lead).toBe('Transactions carried it.');
    expect(rest).toBe('The basket was smaller than the week before.');
    // A figure never splits a sentence in half.
    expect(leadAndRest('OPUS took ₱1,234.50 last week.').rest).toBe('');
    expect(leadAndRest('').lead).toBe('');
  });
});

/* ------------------------------------------- 6, 7, 8. caveats by cost -- */

describe('6–8. a caveat is drawn by what it costs the reader', () => {
  const notice = { kind: 'comparison_incomplete', message: '105 of 256 compare row(s) could not be compared: 56 no_baseline, 49 no_current.', source: 'metrics.yaml' };

  it('7. translates an exclusion into consequence, never into statuses', () => {
    const meta = { comparison: { baseline_statuses: { ok: 151, no_baseline: 56, no_current: 49 } },
      window: { kind: 'preset', name: 'last_week' } };
    const [caveat] = levelCaveats([notice], [meta], 'product');
    expect(caveat.level).toBe('relevant');
    expect(caveat.consequence).toContain('56 products are new');
    expect(caveat.consequence).toContain('49 sold nothing');
    expect(caveat.consequence).toContain('left out of the growth comparison');
    // No raw diagnostic reaches the reader.
    expect(isReaderSafe(caveat.consequence!)).toBe(true);
    expect(caveat.consequence).not.toMatch(RAW_DIAGNOSTIC);
    // 8. The tool's own sentence survives whole, for the inspector.
    expect(caveat.detail).toBe(notice.message);
  });

  it('6. leaves a non-material note out of the primary answer', () => {
    const meta = { comparison: { baseline_statuses: { ok: 7 } }, window: { kind: 'preset', name: 'last_week' } };
    const [caveat] = levelCaveats([notice], [meta], 'store');
    expect(caveat.level).toBe('non_material');
    expect(caveat.consequence).toBeNull();
    expect(caveat.detail).toBe(notice.message);
  });

  it('surfaces an answer-limiting caveat and says what still stands', () => {
    const meta = { comparison: { baseline_statuses: { no_baseline: 12 } }, window: { kind: 'preset', name: 'last_week' } };
    const [caveat] = levelCaveats([notice], [meta], 'product');
    expect(caveat.level).toBe('answer_limiting');
    expect(caveat.consequence).toContain('no growth to report');
    expect(caveat.consequence).toContain('still stand');
    expect(isReaderSafe(caveat.consequence!)).toBe(true);
  });

  it('keeps a notice it cannot read the consequence of, rather than quietening it', () => {
    const other = { kind: 'stale_stock', message: 'Stock was last read four days ago.' };
    const [caveat] = levelCaveats([other], [{}], 'store');
    expect(caveat.level).toBe('relevant');
    expect(caveat.consequence).toBe(other.message);
  });

  it('names subjects in the reader’s words, whatever the dimension', () => {
    const meta = { comparison: { baseline_statuses: { ok: 1, no_baseline: 3 } }, window: { kind: 'preset', name: 'last_month' } };
    expect(excludedWords(meta, 'store')).toContain('3 stores are new');
    expect(excludedWords(meta, 'category')).toContain('3 categories are new');
    expect(excludedWords({ comparison: { baseline_statuses: { ok: 4 } } }, 'store')).toBeNull();
  });
});

/* ---------------------------------------------- 3, 4. the work trail -- */

describe('3–4. the trail is states, reconstructed from server truth', () => {
  const POSTS = [
    Q('q1', 'What’s going on with the stores?', null), post('a1', headlineSet(), PERF()),
    Q('q2', 'Why?', 'a1', northEdsa), post('a2', [], undefined, { body: 'Basket value fell further.' }),
  ];

  it('builds a step per question, carrying the scope it was asked in', () => {
    const [s] = surfacesOf(POSTS);
    const trail = workTrail(s, INITIAL_DESK);
    expect(trail.map((t) => t.label)).toEqual(['What’s going on with the stores?', 'Why?']);
    expect(trail.map((t) => t.kind)).toEqual(['stored', 'stored']);
    // The scope is the desk the question was asked from — server truth.
    expect(trail[1].scope).toEqual(['North Edsa']);
    expect(trail[1].selection).toEqual([NORTH_EDSA]);
  });

  it('adds the state being made now, marked as current, and never as history', () => {
    const [s] = surfacesOf(POSTS);
    const withMagnolia = deskReducer(INITIAL_DESK, { type: 'focus', subject: MAGNOLIA });
    const trail = workTrail(s, withMagnolia);
    expect(trail).toHaveLength(3);
    expect(trail[2]).toMatchObject({ kind: 'current', label: 'Magnolia', index: null });
    // Restoring the same selection the newest step already carries adds nothing.
    const same = deskReducer(INITIAL_DESK, { type: 'focus', subject: NORTH_EDSA });
    expect(workTrail(s, same)).toHaveLength(2);
  });

  it('does not add a current step while an EARLIER step is being looked at', () => {
    const [s] = surfacesOf(POSTS);
    const back = deskReducer(deskReducer(INITIAL_DESK, { type: 'step', index: 0 }),
      { type: 'focus', subject: MAGNOLIA });
    expect(workTrail(s, back).some((t) => t.kind === 'current')).toBe(false);
  });

  it('names the step being looked at, and the newest by default', () => {
    const [s] = surfacesOf(POSTS);
    const trail = workTrail(s, INITIAL_DESK);
    expect(activeStep(trail, INITIAL_DESK)?.label).toBe('Why?');
    expect(activeStep(trail, deskReducer(INITIAL_DESK, { type: 'step', index: 0 }))?.label)
      .toBe('What’s going on with the stores?');
  });

  it('at rest, the trail is the business itself', () => {
    expect(workTrail(null, INITIAL_DESK).map((t) => t.label)).toEqual(['The business']);
  });

  it('shortens a long question without losing its sense', () => {
    const long = { id: 'x', label: 'Why did net sales change at North Edsa over the last seven days compared with the week before?', scope: [], kind: 'stored' as const, index: 0, selection: [] };
    expect(shortLabel(long).length).toBeLessThanOrEqual(43);
    expect(shortLabel(long)).toMatch(/…$/);
    expect(shortLabel(long)).toContain('Why did net sales');
  });
});

/* ------------------------------------------ 9, 10. George’s initiative -- */

describe('9–10. a recommendation is grounded, and carries the move that does it', () => {
  it('offers products when the drivers went opposite ways, naming the evidence', () => {
    // North Edsa: more transactions, smaller baskets — the case the question
    // "which products are behind the extra transactions" exists for.
    const [s] = surfacesOf([Q('q1', 'stores?', null), post('a1', divergingSet(), PERF())]);
    const layout = composeDesk(s, focused);
    const r = recommendationFor(layout, questionAnchor(layout), null, BREAKDOWNS);
    expect(r).toBeTruthy();
    expect(r!.ground).toBe('drivers_diverge');
    expect(r!.text).toMatch(/which products/i);
    // 10. It carries the action, in business words, so nobody retypes it.
    expect(r!.action.kind).toBe('ask');
    expect(r!.action.question).toBe('Which products moved most at North Edsa last week?');
    expect(r!.action.question).not.toMatch(/get_sales|group_by|rank_by|top_n/);
  });

  it('offers a comparison when something moved against the rest', () => {
    // The drivers agree at this store, so the diverging ground does not fire
    // and the next one — a subject that moved the other way — does.
    const agreeing = headlineSet().map((c) => ({
      ...c,
      rows: c.rows.map((r, i) => (i === 3
        ? { ...r, change: -10, change_pct: -5, direction: 'down' }
        : { ...r, change: 10, change_pct: 5, direction: 'up' })),
    }));
    const [s] = surfacesOf([Q('q1', 'stores?', null), post('a1', agreeing, PERF())]);
    const layout = composeDesk(s, deskReducer(INITIAL_DESK, { type: 'focus', subject: MAGNOLIA }));
    const r = recommendationFor(layout, questionAnchor(layout), null, BREAKDOWNS);
    expect(r?.ground).toBe('against_the_majority');
    expect(r?.text).toContain('North Edsa');
    expect(r?.action.label).toBe('Compare with North Edsa');
    expect(r?.action.question).toContain('North Edsa');
    expect(r?.action.question).toContain('Magnolia');
  });

  it('makes NO recommendation when nothing in the evidence supports one', () => {
    // A figure with no measured change: nothing moved, so there is nothing to
    // localize and nothing singled out. George says nothing rather than
    // inventing a next step — "which products moved" is about a movement.
    const flat = scopedSet('OPUS')[0];
    const still = {
      ...flat,
      rows: [{ value: 412380, unit: 'PHP' }],
      meta: { ...flat.meta, comparison: undefined },
    };
    const [s] = surfacesOf([Q('q1', 'Net sales?', null), post('a1', [still], undefined)]);
    const layout = composeDesk(s, INITIAL_DESK);
    expect(recommendationFor(layout, questionAnchor(layout), null, BREAKDOWNS)).toBeNull();
  });

  it('does not offer a breakdown the desk already shows', () => {
    const [s] = surfacesOf([
      Q('q1', 'North Edsa?', null), post('a1', scopedSet('North Edsa'), PERF()),
      Q('q2', 'Products.', 'a1'), post('a2', [products(4, 'North Edsa')], [finding(4, 'breakdown', 1)]),
    ]);
    const layout = composeDesk(s, focused);
    const r = recommendationFor(layout, questionAnchor(layout), 'product', BREAKDOWNS);
    expect(r?.ground).not.toBe('drivers_diverge');
    expect(r?.action.id).not.toBe('recommend:products');
  });

  it('never recommends a breakdown the definitions do not have', () => {
    // A domain with no product-grain metric has no product breakdown to
    // offer, and George says nothing rather than suggesting a refused read.
    // The SERVER decides which dimensions exist, from metrics.yaml — a client
    // reading the headline metric's own permissions would never offer the one
    // move the investigation ladder is built around, because net sales is
    // transaction grain and refuses a product grouping.
    const layout = composeDesk(opened(), INITIAL_DESK);
    expect(recommendationFor(layout, questionAnchor(layout), null, [])?.action.id)
      .not.toBe('recommend:products');
    expect(recommendationFor(layout, questionAnchor(layout), null, BREAKDOWNS)?.action.id)
      .toBe('recommend:products');
  });
});

describe('8. the moves are the few most relevant, and never repeat the suggestion', () => {
  it('caps the questions offered and excludes George’s own', () => {
    const layout = composeDesk(estate(), focused);
    const r = recommendationFor(layout, questionAnchor(layout), null, BREAKDOWNS);
    const moves = deskActions(layout, focused, r?.action.question ?? null);
    expect(moves.filter((m) => m.kind === 'ask').length).toBeLessThanOrEqual(MAX_MOVES);
    expect(moves.every((m) => m.question !== r?.action.question)).toBe(true);
    // Every asked move is business words.
    for (const m of moves) if (m.question) expect(m.question).not.toMatch(/get_sales|group_by|rank_by|compare_to/);
  });
});
