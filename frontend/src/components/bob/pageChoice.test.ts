/**
 * The page choice: one decision behind the Pin dialog and the Move control.
 */
import { describe, expect, it } from 'vitest';
import { choiceBody, choiceFor, isChoiceReady, movesPin } from './pageChoice';

describe('choiceBody', () => {
  it('resolves none to a null page id, which is Ungrouped', () => {
    expect(choiceBody({ kind: 'none' })).toEqual({ page_id: null });
  });

  it('resolves an existing page to its ID — never its title', () => {
    const body = choiceBody({ kind: 'existing', pageId: 'p-1', title: 'FFR Overview' });
    expect(body).toEqual({ page_id: 'p-1' });
    expect(JSON.stringify(body)).not.toContain('FFR Overview');
  });

  it('sends a new name as typed — normalisation is the backend’s, in one place', () => {
    expect(choiceBody({ kind: 'new', name: '  Drink   Mix ' })).toEqual({ page: '  Drink   Mix ' });
  });

  it('is not yet a page when the new name is blank', () => {
    expect(choiceBody({ kind: 'new', name: '' })).toBeUndefined();
    expect(choiceBody({ kind: 'new', name: '   ' })).toBeUndefined();
    expect(isChoiceReady({ kind: 'new', name: '   ' })).toBe(false);
    expect(isChoiceReady({ kind: 'none' })).toBe(true);
    expect(isChoiceReady({ kind: 'existing', pageId: 'p-1', title: 'x' })).toBe(true);
  });
});

describe('choiceFor', () => {
  it('reads a pin’s current page as an existing choice by id', () => {
    expect(choiceFor({ page_id: 'p-2', page: 'Purchasing' }))
      .toEqual({ kind: 'existing', pageId: 'p-2', title: 'Purchasing' });
  });

  it('reads no page as none', () => {
    expect(choiceFor({ page_id: null, page: null })).toEqual({ kind: 'none' });
  });
});

describe('movesPin', () => {
  it('is a move when the target differs from where the pin sits', () => {
    expect(movesPin('p-fame', { kind: 'existing', pageId: 'p-purch', title: 'Purchasing' })).toBe(true);
    expect(movesPin('p-fame', { kind: 'none' })).toBe(true);
    expect(movesPin(null, { kind: 'new', name: 'Fame' })).toBe(true);
    expect(movesPin(null, { kind: 'existing', pageId: 'p-fame', title: 'Fame' })).toBe(true);
  });

  it('is not a move to the page the pin is already on', () => {
    expect(movesPin('p-fame', { kind: 'existing', pageId: 'p-fame', title: 'Fame' })).toBe(false);
    expect(movesPin(null, { kind: 'none' })).toBe(false);
  });

  it('is not a move to a page that has no name yet', () => {
    expect(movesPin('p-fame', { kind: 'new', name: '' })).toBe(false);
  });
});
