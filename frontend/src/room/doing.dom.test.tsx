// @vitest-environment jsdom
/**
 * A LINE UNDER HIM WHILE HE WORKS — the log, 2026-09-17: *"the alive not
 * saying any text for awhile but it came out maybe it just took long to load"*.
 * It did take long (53 s and 73 s that day), and nothing was drawn under the
 * mark until the answer arrived. Now the running read and the clock are
 * (`Doing`, a work surface, the system's voice), and the words he wrote before
 * the answer are (`Narration`, his voice, in Reading.tsx); both go the moment
 * his answer starts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Doing } from './Working';
import { Narration } from './Reading';
import type { AnswerTurn } from './data';

afterEach(cleanup);

const turn = (extra: object) => ({
  role: 'bob', text: '', thinking: '', at: new Date().toISOString(), toolCalls: [], ...extra,
}) as unknown as AnswerTurn;

describe('while he works', () => {
  it("says the read that is running, in the trail's words, with the clock", () => {
    const { container } = render(<Doing live answering={false}
      turn={turn({ toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {} }] })} />);
    expect(container.querySelector('.r-doing')?.getAttribute('data-doing')).toBe('reading');
    expect(container.querySelector('.r-doing-line')?.textContent).toMatch(/…/);
    expect(container.querySelector('.r-work-clock')).not.toBeNull();
  });

  it('says thinking once the reads have landed and nothing is running', () => {
    const landed = { seq: 1, tool: 'get_sales', arguments: {}, result: { rows: [{ value: 1 }], meta: {} } };
    const { container } = render(<Doing live answering={false} turn={turn({ toolCalls: [landed] })} />);
    expect(container.querySelector('.r-doing-line')?.textContent).toMatch(/thinking…/);
  });

  it('draws what he wrote before the answer, in his own voice, which nothing drew before', () => {
    const { container } = render(<Narration live answering={false} said="Rockwell is down; let me look at the drivers." />);
    const said = container.querySelector('.r-doing-said');
    expect(said?.textContent).toContain('let me look at the drivers');
    expect(said?.className).toContain('r-say');
  });

  it('is gone the moment his answer starts, and when he is done', () => {
    expect(render(<Doing live answering turn={turn({})} />).container.firstChild).toBeNull();
    cleanup();
    expect(render(<Doing live={false} answering={false} turn={turn({})} />).container.firstChild).toBeNull();
    cleanup();
    expect(render(<Narration live answering said="x" />).container.firstChild).toBeNull();
    cleanup();
    expect(render(<Narration live={false} answering={false} said="x" />).container.firstChild).toBeNull();
  });
});
