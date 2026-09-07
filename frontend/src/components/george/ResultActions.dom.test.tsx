/**
 * What a finished result offers, and what it must not.
 *
 * §6 of this milestone asks for actions to stay extremely restrained, and the
 * failure mode is not a missing button — it is a toolbar arriving one icon at
 * a time. So this asserts the ABSENCE as hard as the presence: one control,
 * no second gesture, and no approvals colour on it.
 *
 * It also holds the existing pin rule that predates this branch: an answer
 * with no tool call has no numbers behind it, and a tile of frozen prose is
 * exactly what pins exist to avoid.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GeorgeTurn, ToolCall } from '../../types/george';
import { ResultActions } from './ResultActions';

afterEach(cleanup);

const turn = (toolCalls: ToolCall[]): GeorgeTurn => ({
  role: 'george',
  text: 'Rockwell is down 12% on the week.',
  thinking: '',
  toolCalls,
  notices: [],
  pinned: [],
  saved: [],
  at: '2026-09-07T09:00:00+08:00',
});

function actions(calls: ToolCall[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ResultActions turn={turn(calls)} question="How did Rockwell do this week?" />
    </QueryClientProvider>,
  );
}

const CALL = { seq: 1, tool: 'get_sales', arguments: { group_by: ['store'] } };

describe('the action row', () => {
  it('offers Pin for a result with calls behind it', () => {
    actions([CALL]);
    expect(screen.getByRole('button', { name: /pin/i })).toBeTruthy();
  });

  it('offers nothing for an answer that read nothing', () => {
    // No tool call means no numbers, and a tile of prose would freeze a
    // sentence written against last month's figures.
    const { container } = actions([]);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('is one control and not a toolbar', () => {
    const { container } = actions([CALL]);
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  it('does not offer a second word for the same gesture', () => {
    // CLAUDE.md fixes six words with six meanings: a PIN re-runs an answer,
    // a SAVE turns logic into a versioned rule with a promotion gate. A
    // control here labelled Save would make them one thing on the surface
    // where a person first meets both.
    actions([CALL]);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('wears no approvals colour — pinning is something you chose to do', () => {
    const { container } = actions([CALL]);
    expect(container.innerHTML).not.toMatch(/george-accent/);
  });
});
