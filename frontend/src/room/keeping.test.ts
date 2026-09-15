/**
 * WHAT A THREAD WOULD KEEP — and, more importantly, what it says it would not.
 *
 * The plan is the whole of P2.a's honesty: the gesture is one press, so
 * everything a person needs to know about what is about to be written has to be
 * on screen before it. These cases are the four ways a turn is left off, the one
 * way a section is shortened, and the bounds — which are the SERVICE'S bounds,
 * asserted here against the numbers the backend refuses on so the two cannot
 * drift into a 422 nobody could have predicted.
 */
import { describe, expect, it } from 'vitest';

import type { GeorgeTurn, ToolCall } from '../types/george';
import { MAX_CALLS_PER_SECTION, MAX_SECTIONS, keepPlan, offeredTitle } from './keeping';

function call(seq: number, tool: string, args: Record<string, unknown> = {},
              over: Partial<NonNullable<ToolCall['result']>> = {}): ToolCall {
  return {
    seq, tool, arguments: args,
    result: {
      row_count: 3, source_table: 'mart.x', truncated: false, duration_ms: 120,
      error: null, pinnable: true, ...over,
    },
  };
}

function george(calls: ToolCall[]): Extract<GeorgeTurn, { role: 'george' }> {
  return {
    role: 'george', text: 'an answer', thinking: '', toolCalls: calls,
    notices: [], pinned: [], saved: [], pageChanges: [], at: '2026-09-15T09:00:00+08:00',
  };
}

function asked(text: string): GeorgeTurn {
  return { role: 'user', text, at: '2026-09-15T09:00:00+08:00' };
}

/** One question and its answer, over the calls given. */
function turn(question: string, calls: ToolCall[]): GeorgeTurn[] {
  return [asked(question), george(calls)];
}

describe('the plan a thread would be kept as', () => {
  it('is one section per question, named by the question and not by the answer', () => {
    const plan = keepPlan([
      ...turn('how are we doing', [call(1, 'get_sales')]),
      ...turn('and the warehouse?', [call(2, 'get_stock')]),
    ]);
    expect(plan.sections.map((s) => s.title)).toEqual(['how are we doing', 'and the warehouse?']);
    expect(plan.leftOff).toEqual([]);
  });

  it('keeps the calls exactly as they ran, and nothing else', () => {
    const plan = keepPlan(turn('rockwell last week', [
      call(1, 'get_sales', { store: 'Rockwell', window: 'last_week' }),
    ]));
    expect(plan.sections[0].calls).toEqual([
      { tool: 'get_sales', arguments: { store: 'Rockwell', window: 'last_week' } },
    ]);
  });

  it('leaves off a turn that read nothing, and says so', () => {
    const plan = keepPlan(turn('what do you think?', []));
    expect(plan.sections).toEqual([]);
    expect(plan.leftOff).toHaveLength(1);
    expect(plan.leftOff[0].why).toMatch(/read nothing/);
  });

  it('leaves off a call the loop refused to mark pinnable', () => {
    // compose is not a read; the loop says so on the frame and this believes it
    // rather than recognising a name.
    const plan = keepPlan(turn('draw it', [call(1, 'compose', {}, { pinnable: false })]));
    expect(plan.sections).toEqual([]);
    expect(plan.leftOff[0].why).toMatch(/read nothing/);
  });

  it('leaves off a call that failed, and a duplicate the loop served from its own record', () => {
    const failed = call(1, 'get_sales', {}, { error: 'net_sales declines a product grouping' });
    const dup: ToolCall = { ...call(2, 'get_stock'), duplicate_of: 1 };
    const plan = keepPlan(turn('again', [failed, dup]));
    expect(plan.sections).toEqual([]);
  });

  it('treats a frame with no pinnable flag as pinnable, exactly as postShape does', () => {
    const old = call(1, 'get_sales');
    delete old.result!.pinnable;
    expect(keepPlan(turn('old backend', [old])).sections).toHaveLength(1);
  });

  it('leaves off a turn that took more reads than one section holds, naming both numbers', () => {
    const many = Array.from({ length: MAX_CALLS_PER_SECTION + 1 },
      (_, i) => call(i + 1, 'get_sales', { store: `s${i}` }));
    const plan = keepPlan(turn('every shop, one at a time', many));
    expect(plan.sections).toEqual([]);
    expect(plan.leftOff[0].why)
      .toBe(`it took ${MAX_CALLS_PER_SECTION + 1} reads, and one section holds ${MAX_CALLS_PER_SECTION}`);
  });

  it('keeps one read once, and the later section says how many it lost upward', () => {
    const same = { store: 'Rockwell', window: 'last_week' };
    const plan = keepPlan([
      ...turn('rockwell', [call(1, 'get_sales', same)]),
      ...turn('rockwell and its stock', [call(2, 'get_sales', same), call(3, 'get_stock')]),
    ]);
    expect(plan.sections).toHaveLength(2);
    expect(plan.sections[1].calls).toEqual([{ tool: 'get_stock', arguments: {} }]);
    expect(plan.sections[1].alreadyKept).toBe(1);
  });

  it('matches the service on a duplicate whose arguments only differ in key order', () => {
    const plan = keepPlan([
      ...turn('first', [call(1, 'get_sales', { window: 'last_week', store: 'Rockwell' })]),
      ...turn('again', [call(2, 'get_sales', { store: 'Rockwell', window: 'last_week' })]),
    ]);
    expect(plan.sections).toHaveLength(1);
    expect(plan.leftOff[0].why).toMatch(/already kept in a section above/);
  });

  it('matches the service on a duplicate nested inside an argument', () => {
    const a = { date_range: { from: '2026-08-01', to: '2026-09-01' }, store: 'OPUS' };
    const b = { store: 'OPUS', date_range: { to: '2026-09-01', from: '2026-08-01' } };
    const plan = keepPlan([
      ...turn('august', [call(1, 'get_sales', a)]),
      ...turn('august again', [call(2, 'get_sales', b)]),
    ]);
    expect(plan.sections).toHaveLength(1);
  });

  it('leaves off a turn whose every read is already kept above', () => {
    const plan = keepPlan([
      ...turn('first', [call(1, 'get_sales')]),
      ...turn('same again', [call(2, 'get_sales')]),
    ]);
    expect(plan.sections).toHaveLength(1);
    expect(plan.leftOff).toHaveLength(1);
    expect(plan.leftOff[0].title).toBe('same again');
  });

  it('keeps the newest sections when the thread is longer than one build, in the order asked', () => {
    const turns = Array.from({ length: MAX_SECTIONS + 2 }, (_, i) =>
      turn(`q${i}`, [call(i + 1, 'get_sales', { store: `s${i}` })])).flat();
    const plan = keepPlan(turns);
    expect(plan.sections.map((s) => s.title)).toEqual(['q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
    expect(plan.leftOff.map((l) => l.title)).toEqual(['q0', 'q1']);
    expect(plan.leftOff[0].why).toMatch(new RegExp(`kept ${MAX_SECTIONS} sections at a time`));
  });

  it('does not spend the cap on turns that had nothing to keep anyway', () => {
    // Two empty turns first: a bound is about what would land, so it is
    // measured over what CAN land and never over the whole transcript.
    const turns = [
      ...turn('nothing here', []),
      ...turn('nor here', []),
      ...Array.from({ length: MAX_SECTIONS }, (_, i) =>
        turn(`q${i}`, [call(i + 1, 'get_sales', { store: `s${i}` })])).flat(),
    ];
    const plan = keepPlan(turns);
    expect(plan.sections).toHaveLength(MAX_SECTIONS);
    expect(plan.leftOff.every((l) => /read nothing/.test(l.why))).toBe(true);
  });

  it('names a turn with no question by what it read, as the service itself would', () => {
    const plan = keepPlan([george([call(1, 'get_brief')])]);
    expect(plan.sections[0].title).toBe('get_brief');
  });

  it('offers the thread\'s first question as the page\'s name, never a figure', () => {
    expect(offeredTitle(turn('how are we doing', [call(1, 'get_sales')])))
      .toBe('how are we doing');
    // Nothing asked at all: a name, not a claim about what was found.
    expect(offeredTitle([george([call(1, 'get_brief')])])).toBe('Kept from a conversation');
  });

  it('cuts the offered name to the page title bound rather than being refused there', () => {
    const long = 'x'.repeat(400);
    expect(offeredTitle(turn(long, [call(1, 'get_sales')])).length).toBe(100);
  });
});
