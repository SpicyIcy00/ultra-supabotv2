/**
 * The page choice: one decision behind the Pin dialog and the Move control.
 */
import { describe, expect, it } from 'vitest';
import { choiceFor, chosenPage, isChoiceReady, movesPin } from './pageChoice';

describe('chosenPage', () => {
  it('resolves none to null, which is ungrouped', () => {
    expect(chosenPage({ kind: 'none' })).toBeNull();
  });

  it('resolves an existing page to its name, unchanged', () => {
    expect(chosenPage({ kind: 'existing', page: 'FFR Overview' })).toBe('FFR Overview');
  });

  it('sends a new name as typed — normalisation is the backend’s, in one place', () => {
    expect(chosenPage({ kind: 'new', name: '  Drink   Mix ' })).toBe('  Drink   Mix ');
  });

  it('is not yet a page when the new name is blank', () => {
    expect(chosenPage({ kind: 'new', name: '' })).toBeUndefined();
    expect(chosenPage({ kind: 'new', name: '   ' })).toBeUndefined();
    expect(isChoiceReady({ kind: 'new', name: '   ' })).toBe(false);
    expect(isChoiceReady({ kind: 'none' })).toBe(true);
  });
});

describe('choiceFor', () => {
  it('reads a pin’s current page as an existing choice', () => {
    expect(choiceFor('Purchasing')).toEqual({ kind: 'existing', page: 'Purchasing' });
  });

  it('reads no page as none', () => {
    expect(choiceFor(null)).toEqual({ kind: 'none' });
  });
});

describe('movesPin', () => {
  it('is a move when the target differs from where the pin sits', () => {
    expect(movesPin('Fame', { kind: 'existing', page: 'Purchasing' })).toBe(true);
    expect(movesPin('Fame', { kind: 'none' })).toBe(true);
    expect(movesPin(null, { kind: 'new', name: 'Fame' })).toBe(true);
  });

  it('is not a move to the page the pin is already on', () => {
    expect(movesPin('Fame', { kind: 'existing', page: 'Fame' })).toBe(false);
    expect(movesPin(null, { kind: 'none' })).toBe(false);
  });

  it('is not a move to a page that has no name yet', () => {
    expect(movesPin('Fame', { kind: 'new', name: '' })).toBe(false);
  });
});
