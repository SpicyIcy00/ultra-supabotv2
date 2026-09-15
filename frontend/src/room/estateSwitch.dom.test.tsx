// @vitest-environment jsdom
/**
 * THE ESTATE SWITCH, DRAWN (P2.g).
 *
 * What it has to be: the businesses as the definitions name them, the one that
 * is on marked without colour, and three renderings of its own state that never
 * borrow each other's (UI rule 8) — not loaded, failed, loaded.
 *
 * What it may never be: a pill the client invented, a count of anything that
 * was read, or a control wearing the accent. One colour means "needs you", and
 * a scope is not an approval (UI rule 5).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { EstateSwitch } from './EstateSwitch';
import { Composer } from './Composer';
import type { DeskDefinitions } from '../services/deskApi';

const defs = {
  estate: {
    label: 'estate',
    default: 'all',
    parts: [
      { key: 'all', label: 'All', says: null,
        places: ['Rockwell', 'AJI BARN', 'AJI CMG'] },
      // ONE BUSINESS, ONE PILL. The shops and both warehouses, because a
      // warehouse is a place inside a business and a place is the selection's
      // job — `@AJI BARN` binds one, a tap on a row binds one.
      { key: 'aji_ichiban', label: 'Aji Ichiban', says: 'shops and warehouses',
        places: ['Rockwell', 'AJI BARN', 'AJI CMG'] },
      // THE OTHER BUSINESS, and the only part with no places: vending's are
      // machines, which live in Weimi and not in the definitions.
      { key: 'vending', label: 'vending', says: 'the machines · own domain',
        places: [] },
    ],
  },
} as unknown as DeskDefinitions;

afterEach(cleanup);

describe('the estate switch', () => {
  it('draws one pill per business, in the definitions own words and order', () => {
    render(<EstateSwitch defs={defs} picked={null} onPick={vi.fn()} />);
    const pills = screen.getAllByRole('button');
    expect(pills.map((b) => b.textContent)).toEqual(
      ['All', 'Aji Ichibanshops and warehouses', 'vendingthe machines · own domain']);
  });

  it('marks the part that is on, and only that one', () => {
    render(<EstateSwitch defs={defs} picked="aji_ichiban" onPick={vi.fn()} />);
    const on = screen.getAllByRole('button').filter(
      (b) => b.getAttribute('aria-pressed') === 'true');
    expect(on).toHaveLength(1);
    expect(on[0].textContent).toContain('Aji Ichiban');
  });

  it('hands back the part key that was pressed, and nothing else', () => {
    const onPick = vi.fn();
    render(<EstateSwitch defs={defs} picked={null} onPick={onPick} />);
    fireEvent.click(screen.getByText('vending'));
    expect(onPick).toHaveBeenCalledWith('vending');
  });

  it('wears no colour: the part that is on is border and weight', () => {
    const { container } = render(
      <EstateSwitch defs={defs} picked="aji_ichiban" onPick={vi.fn()} />);
    // UI rule 5 — the accent is approvals and nothing else. Held here as well
    // as in accentUse.test.ts, because this is a new control and every new
    // control is where that rule gets broken.
    expect(container.innerHTML).not.toMatch(/accent/i);
    expect(container.querySelector('.r-est--on')?.textContent).toContain('Aji Ichiban');
  });

  it('draws nothing at all before the definitions arrive', () => {
    const { container } = render(
      <EstateSwitch defs={undefined} picked={null} onPick={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('says so when the definitions could not be read, rather than vanishing', () => {
    // Not-yet-loaded and failed are different facts (UI rule 8). A switch that
    // is silently absent is a capability a person cannot know they lost.
    render(<EstateSwitch defs={undefined} picked={null} failed onPick={vi.fn()} />);
    expect(screen.getByText(/could not be read/)).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('what the question carries', () => {
  const composer = (over: Record<string, unknown> = {}) => render(
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false } } })}>
    <Composer
      draft="" onDraft={vi.fn()} subjects={[]} scope={null} named={[]}
      onUnpick={vi.fn()} onUnscope={vi.fn()} onUnname={vi.fn()} onBind={vi.fn()}
      onSend={vi.fn()} onStop={vi.fn()} onClear={vi.fn()} busy={false}
      defs={defs} read={async (q: string) => ({ query: q, candidates: [], unavailable: {} })}
      {...over}
    />
    </QueryClientProvider>,
  );

  it('draws the business above the line, where the rest of what travels is', () => {
    composer({ estate: { key: 'aji_ichiban', label: 'Aji Ichiban' } });
    expect(screen.getByTitle('the part of the estate this question is about')
      .textContent).toContain('Aji Ichiban');
  });

  it('draws no chip on the default, because nothing is travelling', () => {
    composer({ estate: null });
    expect(screen.queryByTitle('the part of the estate this question is about'))
      .toBeNull();
  });

  it('removing the chip is the same gesture as pressing the default pill', () => {
    const onUnestate = vi.fn();
    composer({ estate: { key: 'vending', label: 'vending' }, onUnestate });
    fireEvent.click(screen.getByTitle('the part of the estate this question is about'));
    expect(onUnestate).toHaveBeenCalled();
  });
});
