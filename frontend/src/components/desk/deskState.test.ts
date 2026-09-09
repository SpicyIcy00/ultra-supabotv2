/**
 * The desk's state: selection is ids off rows, focus is one selection, and
 * every action here is a change of view — none consults the model.
 */
import { describe, expect, it } from 'vitest';
import {
  deskContextFor, deskReducer, focusOf, INITIAL_DESK, isSelected, restoreDeskState, selectionWords,
} from './deskState';
import { GREENHILLS, headlineSet, MAGNOLIA, NORTH_EDSA, PERF, post, question, surfacesOf } from './deskFixture';
import { sameSubject } from './subject';

const gummy = { dimension: 'product' as const, id: 'p-gummy', label: 'Mango Gummy' };

describe('focus is one selection', () => {
  it('focuses one subject, and toggling a second makes a comparison', () => {
    let s = deskReducer(INITIAL_DESK, { type: 'focus', subject: NORTH_EDSA });
    expect(focusOf(s)).toEqual(NORTH_EDSA);
    s = deskReducer(s, { type: 'toggle', subject: MAGNOLIA });
    expect(focusOf(s)).toBeNull();
    expect(s.selection.map((x) => x.label)).toEqual(['North Edsa', 'Magnolia']);
    s = deskReducer(s, { type: 'toggle', subject: MAGNOLIA });
    expect(focusOf(s)).toEqual(NORTH_EDSA);
  });

  it('keeps a selection to one dimension', () => {
    let s = deskReducer(INITIAL_DESK, { type: 'select', subjects: [NORTH_EDSA, MAGNOLIA] });
    s = deskReducer(s, { type: 'toggle', subject: gummy });
    expect(s.selection).toEqual([gummy]);
  });

  it('selects by id, and a scoped store matches a grouped one by its label', () => {
    const s = deskReducer(INITIAL_DESK, { type: 'select', subjects: [NORTH_EDSA] });
    expect(isSelected(s, { dimension: 'store', id: 'North Edsa', label: 'North Edsa' })).toBe(true);
    expect(isSelected(s, { dimension: 'store', id: 'other', label: 'Rockwell' })).toBe(false);
    expect(sameSubject(gummy, { dimension: 'product', id: 'p-other', label: 'Mango Gummy' })).toBe(false);
  });

  it('backs out one level at a time: inspector, then selection, then window', () => {
    let s = deskReducer(INITIAL_DESK, { type: 'select', subjects: [NORTH_EDSA] });
    s = deskReducer(s, { type: 'window', window: { kind: 'preset', name: 'last_month' } });
    s = deskReducer(s, { type: 'inspect', target: { kind: 'receipts', seq: 1 } });
    s = deskReducer(s, { type: 'back' });
    expect(s.inspector).toBeNull();
    expect(s.selection).toHaveLength(1);
    s = deskReducer(s, { type: 'back' });
    expect(s.selection).toEqual([]);
    expect(s.window).not.toBeNull();
    s = deskReducer(s, { type: 'back' });
    expect(s.window).toBeNull();
    expect(deskReducer(s, { type: 'back' })).toBe(s);
  });
});

describe('the desk as context', () => {
  it('sends ids and labels off rows, and the window, and nothing for an empty desk', () => {
    expect(deskContextFor(INITIAL_DESK)).toBeNull();
    const s = deskReducer(
      deskReducer(INITIAL_DESK, { type: 'select', subjects: [NORTH_EDSA, GREENHILLS] }),
      { type: 'window', window: { kind: 'preset', name: 'last_month' } },
    );
    expect(deskContextFor(s)).toEqual({
      selection: { dimension: 'store', subjects: [{ id: 's-north-edsa', label: 'North Edsa' }, { id: 's-greenhills', label: 'Greenhills' }] },
      window: { kind: 'preset', name: 'last_month' },
    });
    // Nothing else travels: not what is open, not the step, not the list view.
    const busy = deskReducer(deskReducer(s, { type: 'inspect', target: { kind: 'notices' } }), { type: 'list', on: true });
    expect(deskContextFor(busy)).toEqual(deskContextFor(s));
  });

  it('is restored from the newest question that carried a selection, never from the client', () => {
    const [surface] = surfacesOf([
      question('q1', 'What is going on with the stores?', null),
      post('a1', headlineSet(), PERF()),
      question('q2', 'Why?', 'a1', { selection: { dimension: 'store', subjects: [{ id: 's-north-edsa', label: 'North Edsa' }] } }),
      post('a2', [], undefined),
    ]);
    const restored = restoreDeskState(surface);
    expect(restored.selection).toEqual([NORTH_EDSA]);
    expect(focusOf(restored)).toEqual(NORTH_EDSA);
    expect(restoreDeskState(null)).toEqual(INITIAL_DESK);
  });

  it('names the selection in a few words', () => {
    expect(selectionWords(INITIAL_DESK)).toBeNull();
    expect(selectionWords(deskReducer(INITIAL_DESK, { type: 'select', subjects: [NORTH_EDSA] }))).toBe('North Edsa');
    expect(selectionWords(deskReducer(INITIAL_DESK, { type: 'select', subjects: [NORTH_EDSA, MAGNOLIA, GREENHILLS, GREENHILLS] }))).toBe('4 stores');
  });
});
