// @vitest-environment jsdom
/**
 * THE WAIT IS SHOWN, AND IT IS REAL.
 *
 * P0.3 put a clock on the working line. Phase 1's targets are seconds — first
 * visible change under 2 s, median answer under 10 s — and a person waiting
 * could not tell a turn that was working from one that had stalled.
 *
 * What is held here is that it stays a measurement. It counts from the turn's
 * own start, it never runs while nothing is running, it never counts
 * backwards, and it never becomes a prediction: there is no bar, no
 * percentage and no estimated finish anywhere in this file, because none of
 * those is knowable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';

import type { AnswerTurn } from './data';
import { Working, elapsedWords } from './Working';

const START = '2026-09-13T08:00:00.000Z';

function turn(extra: Partial<AnswerTurn> = {}): AnswerTurn {
  return {
    role: 'bob', text: '', thinking: '', at: START,
    toolCalls: [], notices: [], pinned: [], saved: [], pageChanges: [],
    ...extra,
  } as AnswerTurn;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(START));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('elapsedWords', () => {
  it('says seconds until a minute is up, then minutes and seconds', () => {
    expect(elapsedWords(0)).toBe('0s');
    expect(elapsedWords(9)).toBe('9s');
    expect(elapsedWords(59)).toBe('59s');
    expect(elapsedWords(60)).toBe('1m 00s');
    expect(elapsedWords(64)).toBe('1m 04s');
    expect(elapsedWords(3_600)).toBe('60m 00s');
  });
});

describe('the working clock', () => {
  it('counts from the turn start while he is working', () => {
    render(<Working turn={turn()} live />);
    expect(screen.getByText('0s')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(screen.getByText('8s')).toBeTruthy();
  });

  it('shows nothing at all once the turn is done', () => {
    const { container } = render(<Working turn={turn()} live={false} />);
    // The board is the result; a lingering clock would be a second account
    // of a wait that is over.
    expect(container.textContent).toBe('');
  });

  it('keeps counting once calls have landed, at the foot of the trail', () => {
    const withCall = turn({
      toolCalls: [{
        seq: 1, tool: 'get_sales', arguments: {},
        result: {
          row_count: 0, source_table: 'new_transactions', truncated: false,
          duration_ms: 40, error: null, rows: [],
        },
      }],
    });
    const { container } = render(<Working turn={withCall} live />);
    act(() => { vi.advanceTimersByTime(12_000); });
    const lines = Array.from(container.querySelectorAll('.r-work'));
    expect(lines[lines.length - 1].textContent).toBe('12s');
    expect(screen.getByText('read sales')).toBeTruthy();
  });

  it('never counts backwards when the client clock is nudged back', () => {
    render(<Working turn={turn()} live />);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByText('5s')).toBeTruthy();
    // The browser's clock moves behind the turn's own start time.
    vi.setSystemTime(new Date(Date.parse(START) - 30_000));
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByText('0s')).toBeTruthy();
  });

  it('shows no clock rather than a wrong one when the start is unreadable', () => {
    const { container } = render(<Working turn={turn({ at: 'not a date' })} live />);
    expect(container.textContent).toBe('thinking…');
  });

  it('does not tick while nothing is running', () => {
    const { rerender, container } = render(<Working turn={turn()} live={false} />);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(container.textContent).toBe('');
    // And when he starts, it starts from the new turn rather than from
    // whatever the component last rendered.
    const fresh = new Date(Date.parse(START) + 60_000).toISOString();
    vi.setSystemTime(new Date(fresh));
    rerender(<Working turn={turn({ at: fresh })} live />);
    expect(screen.getByText('0s')).toBeTruthy();
  });
});
