// @vitest-environment jsdom
/**
 * THE TOKEN ROW, DRAWN (P1.j).
 *
 * What it has to be: the scope the figures are on, said in the argument's own
 * words and its own value; what it could be instead, one tap away; and the
 * tool's own sentence when the move was refused, above the figures it is
 * about. What it may never be: a colour that means something, a claim about
 * anything that is not loaded, or a control that silently did nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Tokens } from './Tokens';
import type { DrawnToken } from './tokenShape';

const window_: DrawnToken = {
  argument: 'window', kind: 'navigation', label: 'window',
  value: 'last_week', valueLabel: 'last week',
  alternatives: [
    { value: 'last_week', label: 'last week', spellings: ['last week'] },
    { value: 'last_month', label: 'last month', spellings: ['last month'] },
  ],
  targets: [{ post: 'p1', turn: 0, seq: 0, tool: 'get_sales' }],
};

const grouped: DrawnToken = {
  argument: 'group_by', kind: 'analytical', label: 'grouped',
  value: ['store'], valueLabel: 'by store',
  alternatives: [
    { value: ['store'], label: 'by store', spellings: ['stores'] },
    { value: ['product'], label: 'by product', spellings: ['products'] },
  ],
  targets: [{ post: 'p1', turn: 0, seq: 0, tool: 'get_sales' }],
};

const draw = (over: Partial<Parameters<typeof Tokens>[0]> = {}) => {
  const onMove = vi.fn();
  const onCorrect = vi.fn();
  render(<Tokens tokens={[window_, grouped]} onMove={onMove} onCorrect={onCorrect} {...over} />);
  return { onMove, onCorrect };
};

afterEach(cleanup);

describe('the token row', () => {
  it('says what the figures are of, in the argument\'s words and its value', () => {
    draw();
    expect(screen.getByLabelText('window: last week')).toBeTruthy();
    expect(screen.getByLabelText('grouped: by store')).toBeTruthy();
  });

  it('is nothing at all when no read on screen carries an argument', () => {
    const { container } = render(
      <Tokens tokens={[]} onMove={vi.fn()} onCorrect={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('offers the alternatives only once you ask for them', () => {
    draw();
    expect(screen.queryByText('last month')).toBeNull();
    fireEvent.click(screen.getByLabelText('window: last week'));
    expect(screen.getByText('last month')).toBeTruthy();
  });

  it('cannot be moved to where it already is', () => {
    draw();
    fireEvent.click(screen.getByLabelText('window: last week'));
    const chip = screen.getAllByText('last week')
      .map((el) => el.closest('button'))
      .find((el) => el?.className === 'r-chip');
    expect(chip?.disabled).toBe(true);
  });

  it('hands back the token and the alternative, and closes', () => {
    const { onMove } = draw();
    fireEvent.click(screen.getByLabelText('grouped: by store'));
    fireEvent.click(screen.getByText('by product'));
    expect(onMove).toHaveBeenCalledWith(grouped, grouped.alternatives[1]);
    expect(screen.queryByText('by product')).toBeNull();
  });

  it('says a replay is running rather than freezing on the old figures', () => {
    draw({ moving: true });
    expect(screen.getByText('reading…')).toBeTruthy();
  });

  it('says the tool\'s own words when a move was refused, unrephrased', () => {
    const said = 'this_month is still in progress; last_month is the closed one.';
    draw({ refusal: said });
    expect(screen.getByText(said)).toBeTruthy();
  });

  it('draws the one token that costs a turn, and it wears no colour', () => {
    const { onCorrect } = draw({ correction: 'not what I meant' });
    const button = screen.getByText('not what I meant').closest('button');
    expect(button?.className).not.toMatch(/needs|accent|do\b/);
    fireEvent.click(button!);
    expect(onCorrect).toHaveBeenCalled();
  });
});
