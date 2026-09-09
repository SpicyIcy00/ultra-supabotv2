/**
 * What a person can do from here: local actions never reach the model, ask
 * actions are business-language questions built from trusted state, and a
 * selection needs nobody to restate its names.
 */
import { describe, expect, it } from 'vitest';
import { composeDesk } from './deskCompose';
import { deskActions, localizeQuestion } from './deskActions';
import { deskReducer, INITIAL_DESK } from './deskState';
import { headlineSet, MAGNOLIA, NORTH_EDSA, PERF, post, products, question, scopedSet, surfacesOf, GREENHILLS, finding } from './deskFixture';

const TOOLISH = /get_|group_by|compare_to|rank_by|change_pct|top_n|date_range|record_findings/;

describe('4. direct manipulation is local; interpretation is asked', () => {
  const [estate] = surfacesOf([question('q1', 'stores?', null), post('a1', headlineSet(), PERF())]);

  it('offers the list equivalent on a field as a local action', () => {
    const actions = deskActions(composeDesk(estate, INITIAL_DESK), INITIAL_DESK);
    const list = actions.find((a) => a.id === 'list')!;
    expect(list.kind).toBe('local');
    expect(list.local).toEqual({ type: 'list', on: true });
    expect(actions.filter((a) => a.kind === 'ask').every((a) => a.question && !TOOLISH.test(a.question))).toBe(true);
  });

  it('with a store focused: Why?, Products, Categories as questions naming the store, and Back as local', () => {
    const state = deskReducer(INITIAL_DESK, { type: 'focus', subject: NORTH_EDSA });
    const actions = deskActions(composeDesk(estate, state), state);
    expect(actions.map((a) => a.label)).toEqual(['Why?', 'Products', 'Categories', 'Back']);
    expect(actions[0].question).toBe('Why did net sales change for North Edsa last week?');
    expect(actions[1].question).toBe('Which products moved most at North Edsa last week?');
    expect(actions[2].question).toBe('Which categories moved most at North Edsa last week?');
    expect(actions[3]).toMatchObject({ kind: 'local', local: { type: 'back' } });
    for (const a of actions) if (a.question) expect(a.question).not.toMatch(TOOLISH);
  });

  it('3. with several stores selected: Compare these and Why these? name every subject; Clear is local', () => {
    const state = deskReducer(INITIAL_DESK, { type: 'select', subjects: [NORTH_EDSA, MAGNOLIA, GREENHILLS] });
    const layout = composeDesk(estate, state);
    const actions = deskActions(layout, state);
    expect(actions.map((a) => a.label)).toEqual(['Why these?', 'Clear']);
    expect(actions[0].question).toBe('Why did net sales change for North Edsa, Magnolia and Greenhills last week?');
    // On a field (not yet compared), the comparison is offered too.
    const two = deskReducer(INITIAL_DESK, { type: 'select', subjects: [NORTH_EDSA, MAGNOLIA] });
    const fieldOnly = { ...composeDesk(estate, two), stage: composeDesk(estate, INITIAL_DESK).stage };
    const offered = deskActions(fieldOnly, two);
    expect(offered.map((a) => a.label)).toEqual(['Compare these', 'Why these?', 'Clear']);
    expect(offered[0].question).toBe('Compare North Edsa and Magnolia last week, net sales against the previous period');
  });

  it('does not offer a breakdown the desk already shows, and phrases a product question within its store', () => {
    const [s] = surfacesOf([
      question('q1', 'North Edsa?', null), post('a1', scopedSet('North Edsa'), PERF()),
      question('q2', 'Products.', 'a1'), post('a2', [products(4, 'North Edsa')], [finding(4, 'breakdown', 1)]),
    ]);
    const state = deskReducer(INITIAL_DESK, { type: 'focus', subject: NORTH_EDSA });
    const actions = deskActions(composeDesk(s, state), state);
    expect(actions.map((a) => a.label)).toEqual(['Why?', 'Categories', 'Back']);
    const gummy = { dimension: 'product' as const, id: 'p-gummy', label: 'Mango Gummy' };
    const chew = { dimension: 'product' as const, id: 'p-chew', label: 'Cola Chew' };
    const productState = deskReducer(INITIAL_DESK, { type: 'select', subjects: [gummy, chew] });
    const productActions = deskActions(composeDesk(s, productState), productState);
    expect(productActions[0].question).toBe('Why did product revenue change for Mango Gummy and Cola Chew at North Edsa last week?');
  });

  it('phrases the localize rung in a reader’s words', () => {
    expect(localizeQuestion('product', null, { window: { kind: 'preset', name: 'last_week' } })).toBe('Which products moved most across the stores last week?');
    expect(localizeQuestion('category', 'OPUS', {})).toBe('Which categories moved most at OPUS?');
  });
});
