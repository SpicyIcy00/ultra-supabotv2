/**
 * "Build me a dashboard" opens the dashboard (W2.4, 2026-09-22): the room opens
 * the kept page the turn WROTE — never one it only talked about.
 */
import { describe, expect, it } from 'vitest';
import type { AnswerTurn } from './data';
import { pageOpened } from './pageOpened';

const ID = '11111111-2222-3333-4444-555555555555';

function turn(p: Partial<AnswerTurn>): AnswerTurn {
  return { role: 'bob', text: '', thinking: '', toolCalls: [], notices: [], pinned: [],
           saved: [], pageChanges: [], ...p } as unknown as AnswerTurn;
}

describe('pageOpened', () => {
  it('opens the page the committed write names, live', () => {
    const t = turn({ pageChanges: [{ page_id: ID, title: 'Shops', created: true } as never] });
    expect(pageOpened(t)).toBe(ID);
  });

  it('opens it from the write call on a reopened thread, which keeps calls and not frames', () => {
    const t = turn({ toolCalls: [
      { seq: 0, tool: 'get_sales', arguments: {}, result: { error: null, rows: [{ store: 'A' }] } },
      { seq: 1, tool: 'create_page', arguments: { title: 'Shops' },
        result: { error: null, rows: [{ page_id: ID, title: 'Shops' }] } },
    ] as never });
    expect(pageOpened(t)).toBe(ID);
  });

  it('opens nothing for a write that failed, or a turn that wrote no page', () => {
    expect(pageOpened(turn({ toolCalls: [
      { seq: 0, tool: 'create_page', arguments: {}, result: { error: 'refused', rows: [] } },
    ] as never }))).toBeNull();
    expect(pageOpened(turn({ text: 'I built you a dashboard.' }))).toBeNull();
    expect(pageOpened(null)).toBeNull();
  });
});
