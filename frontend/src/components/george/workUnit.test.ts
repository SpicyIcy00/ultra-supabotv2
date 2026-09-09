/**
 * A piece of work is the same piece of work live and stored.
 *
 * THIS IS UI RULE 3 AS A TEST. "Every number is inspectable, identically
 * whether the figure came from chat or from a tile" was only ever true by
 * inspection: AnswerTurn drew the streaming answer and PostCard drew the
 * stored one, and nothing held them together. inferShape solved it one layer
 * down for a single figure; this holds it for the whole exchange.
 *
 * THE METHOD. Build a turn, let it finish, and build the post the loop would
 * have written from the same turn. Push both through the two builders and
 * assert `workSubstance` is equal. What is deliberately NOT compared is the
 * part that is honestly different — the model's reasoning, the row counts, the
 * state — because a builder that made those match would be inventing them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GeorgeTurn, ToolCall } from '../../types/george';
import type { Post } from '../../types/river';
import {
  GROUP_WINDOW_MS,
  groupsWithItem,
  latestWorkId,
  riverItems,
  workSubstance,
  workUnitFromPost,
  workUnitFromTurn,
  streamSignal,
} from './workUnit';

const META = {
  source_table: 'new_transactions',
  filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-08T02:00:00+08:00',
  row_count: 1,
  window: { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' },
};

const ROWS = [{ store: 'Rockwell', value: 48210, unit: 'PHP' }];

function call(seq = 1): ToolCall {
  return {
    seq,
    tool: 'get_sales',
    arguments: { metric: 'net_sales', date_range: 'last_week', filters: { store: 'Rockwell' } },
    result: {
      row_count: 1,
      source_table: 'new_transactions',
      truncated: false,
      duration_ms: 42,
      error: null,
      rows: ROWS,
      rows_complete: true,
      meta: META,
      pinnable: true,
    },
  };
}

/** A finished George turn, as the stream leaves it. */
function finishedTurn(overrides: Partial<Extract<GeorgeTurn, { role: 'george' }>> = {}) {
  return {
    role: 'george' as const,
    text: 'Rockwell took ₱48,210 last week.',
    thinking: 'checking the window',
    toolCalls: [call()],
    notices: [{ kind: 'stale_stock', message: 'Stock data is stale.' }],
    pinned: [],
    saved: [],
    pageChanges: [],
    receipts: META,
    post: {
      question_post_id: 'q1',
      answer_post_id: 'a1',
      thread_id: 't1',
      conversation_id: 'c1',
      visibility: 'private' as const,
      stored: true,
    },
    done: {
      conversation_id: 'c1',
      iterations: 2,
      tool_calls: 1,
      status: 'ok',
      notice_forced: false,
      usage: { input: 1, output: 1, cache_read: 0 },
      cache_hit: false,
    },
    at: '2026-09-08T02:00:01+08:00',
    ...overrides,
  };
}

/** The answer post the loop writes from that same turn. */
function storedAnswer(overrides: Partial<Post> = {}): Post {
  return {
    id: 'a1',
    thread_id: 't1',
    parent_id: 'q1',
    kind: 'answer',
    author: 'george',
    author_user: null,
    visibility: 'private',
    owner_user: 'ice',
    mine: true,
    body: 'Rockwell took ₱48,210 last week.',
    conversation_id: 'c1',
    created_at: '2026-09-08T02:00:01+08:00',
    notices: [{ kind: 'stale_stock', message: 'Stock data is stale.' }],
    receipts: META,
    payload: {
      charted: [{ seq: 1, tool: 'get_sales', arguments: call().arguments, rows: ROWS, meta: META }],
      calls: [{ seq: 1, tool: 'get_sales', arguments: call().arguments }],
    },
    ...overrides,
  } as Post;
}

describe('one exchange, two sources, one substance', () => {
  it('produces the same substance from a live turn and from its stored post', () => {
    const live = workUnitFromTurn(finishedTurn(), 'How did Rockwell do?', 'live-0');
    const stored = workUnitFromPost(storedAnswer(), 'How did Rockwell do?');
    expect(workSubstance(live)).toEqual(workSubstance(stored));
  });

  it('draws the same figures from either source', () => {
    const live = workUnitFromTurn(finishedTurn(), undefined, 'live-0');
    const stored = workUnitFromPost(storedAnswer(), undefined);
    expect(live.blocks).toEqual(stored.blocks);
    expect(live.blocks.length).toBe(1);
  });

  it('carries the same caveat from either source', () => {
    const live = workUnitFromTurn(finishedTurn(), undefined, 'live-0');
    const stored = workUnitFromPost(storedAnswer(), undefined);
    expect(live.notices).toEqual(stored.notices);
    expect(live.notices).toHaveLength(1);
  });

  it('offers the same pin from either source', () => {
    const live = workUnitFromTurn(finishedTurn(), undefined, 'live-0');
    const stored = workUnitFromPost(storedAnswer(), undefined);
    expect(live.pinnable).toEqual(stored.pinnable);
    expect(live.pinnable).toEqual([{ tool: 'get_sales', arguments: call().arguments }]);
  });

  it('says which is which, because they are different facts', () => {
    expect(workUnitFromTurn(finishedTurn(), undefined, 'x').state).toBe('complete');
    expect(workUnitFromPost(storedAnswer(), undefined).state).toBe('stored');
  });
});

describe('identity survives the handoff', () => {
  it('takes the answer post id as soon as the post frame names it', () => {
    // This is what keeps the entry in place when the refetch lands: the live
    // item and the stored item are the same id, so React reconciles rather
    // than unmounting one subtree and mounting another.
    const live = workUnitFromTurn(finishedTurn(), undefined, 'live-0');
    const stored = workUnitFromPost(storedAnswer(), undefined);
    expect(live.id).toBe(stored.id);
  });

  it('falls back to a synthetic id only while no post exists', () => {
    const streaming = finishedTurn({ post: undefined, done: undefined });
    expect(workUnitFromTurn(streaming, undefined, 'live-0').id).toBe('live-0');
  });

  it('uses the question post id when the turn produced no answer post', () => {
    const turn = finishedTurn({
      post: {
        question_post_id: 'q1',
        answer_post_id: null,
        thread_id: 't1',
        conversation_id: 'c1',
        visibility: 'private',
        stored: true,
      },
    });
    expect(workUnitFromTurn(turn, undefined, 'live-0').id).toBe('q1');
  });

  it('gives a live question the id of the question post its answer names', () => {
    const items = riverItems([], [
      { role: 'user', text: 'How did Rockwell do?', at: '2026-09-08T02:00:00+08:00' },
      finishedTurn(),
    ]);
    expect(items.map((i) => i.id)).toEqual(['q1', 'a1']);
  });
});

describe('a turn still running', () => {
  const streaming = finishedTurn({ post: undefined, done: undefined, text: 'Rockwell' });

  it('is streaming', () => {
    expect(workUnitFromTurn(streaming, undefined, 'x').state).toBe('streaming');
  });

  it('offers no pin, because the work is not finished', () => {
    expect(workUnitFromTurn(streaming, undefined, 'x').pinnable).toBeNull();
  });

  it('is stopped when the person stopped it, and failed when it failed', () => {
    expect(
      workUnitFromTurn(finishedTurn({ done: undefined, cancelled: true }), undefined, 'x').state,
    ).toBe('stopped');
    expect(
      workUnitFromTurn(finishedTurn({ done: undefined, error: 'boom' }), undefined, 'x').state,
    ).toBe('failed');
  });
});

describe('a stored post that cannot be pinned', () => {
  // Every post written before 2026-09-07 carries `charted` and no `calls`.
  const old = storedAnswer({ payload: { charted: storedAnswer().payload!.charted } as never });

  it('offers no pin rather than a pin that guesses', () => {
    expect(workUnitFromPost(old, undefined).pinnable).toBeNull();
  });

  it('narrates no calls it cannot prove it made', () => {
    // The activity line and the pin read the SAME validated list, so a post
    // that cannot be pinned also cannot claim to have called anything.
    expect(workUnitFromPost(old, undefined).calls).toEqual([]);
  });

  it('still draws its figures, which are a real snapshot', () => {
    expect(workUnitFromPost(old, undefined).blocks).toHaveLength(1);
  });
});

describe('a stored post narrates what it did', () => {
  it('turns its validated calls into activity, in stored order', () => {
    const unit = workUnitFromPost(storedAnswer(), undefined);
    expect(unit.calls).toEqual([{ seq: 0, tool: 'get_sales', arguments: call().arguments }]);
  });

  it('has no reasoning, because none was stored', () => {
    expect(workUnitFromPost(storedAnswer(), undefined).thinking).toBe('');
  });
});

describe('the list', () => {
  const question: Post = storedAnswer({
    id: 'q1',
    parent_id: null,
    kind: 'question',
    author: 'user',
    author_user: 'ice',
    body: 'How did Rockwell do?',
    payload: null,
    receipts: null,
    notices: [],
  }) as Post;

  it('draws a person on the person side and George on his', () => {
    const items = riverItems([question, storedAnswer()], []);
    expect(items.map((i) => i.kind)).toEqual(['utterance', 'work']);
  });

  it('finds the question for an answer whose parent is in the list', () => {
    const items = riverItems([question, storedAnswer()], []);
    const work = items[1];
    expect(work.kind === 'work' && work.question).toBe('How did Rockwell do?');
  });

  it('leaves the question undefined when the parent is not loaded', () => {
    const items = riverItems([storedAnswer()], []);
    const work = items[0];
    // Never taken from the answer's own prose.
    expect(work.kind === 'work' && work.question).toBeUndefined();
  });

  it('names the newest work as the leader, never a question', () => {
    const items = riverItems([question, storedAnswer()], []);
    expect(latestWorkId(items)).toBe('a1');
  });

  it('puts stored posts before the live turns', () => {
    const items = riverItems([question, storedAnswer()], [
      { role: 'user', text: 'And Greenhills?', at: '2026-09-08T02:05:00+08:00' },
    ]);
    expect(items).toHaveLength(3);
    expect(items[2].kind).toBe('utterance');
  });
});

describe('grouping', () => {
  const a = workUnitFromPost(storedAnswer({ id: 'a1' }), undefined);
  const b = workUnitFromPost(
    storedAnswer({ id: 'a2', created_at: '2026-09-08T02:00:30+08:00' }),
    undefined,
  );

  it('groups two stored answers a moment apart', () => {
    expect(groupsWithItem(a, b)).toBe(true);
  });

  it('does not group across the window', () => {
    const later = workUnitFromPost(
      storedAnswer({
        id: 'a3',
        created_at: new Date(Date.parse(a.at) + GROUP_WINDOW_MS + 1000).toISOString(),
      }),
      undefined,
    );
    expect(groupsWithItem(a, later)).toBe(false);
  });

  it('never groups a live entry', () => {
    // Its time is the client's clock and the entry above it is timed by the
    // server's. Two clocks cannot be differenced.
    const live = workUnitFromTurn(finishedTurn(), undefined, 'live-0');
    expect(groupsWithItem(a, live)).toBe(false);
  });

  it('never groups a person with George', () => {
    const items = riverItems(
      [storedAnswer({ id: 'q1', kind: 'question', author: 'user', author_user: 'ice' }), storedAnswer()],
      [],
    );
    expect(groupsWithItem(items[0], items[1])).toBe(false);
  });
});

describe('the follow signal', () => {
  it('changes when prose grows', () => {
    const before = streamSignal([finishedTurn({ text: 'Rock' })]);
    const after = streamSignal([finishedTurn({ text: 'Rockwell' })]);
    expect(before).not.toBe(after);
  });

  it('changes when a result lands', () => {
    const pending = finishedTurn({ toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {} }] });
    expect(streamSignal([pending])).not.toBe(streamSignal([finishedTurn()]));
  });

  it('does not change when only the reasoning grows', () => {
    // Reasoning streams into a fixed-height line inside the disclosure and
    // moves nothing, so following it would scroll the page for content that
    // did not move.
    const a = streamSignal([finishedTurn({ thinking: 'one' })]);
    const b = streamSignal([finishedTurn({ thinking: 'one two three four' })]);
    expect(a).toBe(b);
  });
});

describe('the memoization that makes a long thread affordable', () => {
  // Both of these were measured, not assumed — ops/RIVER_V2.md records the
  // numbers. Removing either costs about 8x per streamed delta, and neither
  // failure is visible in a diff without a note saying what it was for.
  const read = (p: string) =>
    readFileSync(join(__dirname, p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('memoizes an entry on its props', () => {
    expect(read('RiverEntry.tsx')).toMatch(/export const RiverEntry = memo\(/);
  });

  it('builds the stored half apart from the live half', () => {
    // A single builder over both hands every stored entry a new object on
    // every delta, and memo never fires.
    for (const file of ['../desk/useDesk.ts', 'RiverFeed.tsx']) {
      const src = read(file);
      expect(src).toMatch(/storedItems\(/);
      expect(src).toMatch(/liveItems\(/);
      expect(src).not.toMatch(/riverItems\(/);
    }
  });
});

describe('findings survive the handoff', () => {
  const FINDINGS = [
    { seq: 1, role: 'primary' as const, of: null, tool: 'get_sales' },
  ];

  it('composes a live turn and its stored post identically when both carry roles', () => {
    const live = workUnitFromTurn(finishedTurn({ findings: FINDINGS }), undefined, 'live-0');
    const stored = workUnitFromPost(
      storedAnswer({ payload: { ...(storedAnswer().payload as object), findings: FINDINGS } } as never),
      undefined,
    );
    expect(workSubstance(live)).toEqual(workSubstance(stored));
    expect(live.composition.kind).toBe('structured');
  });

  it('composes as adjacency, live and stored, when neither carries roles', () => {
    const live = workUnitFromTurn(finishedTurn(), undefined, 'live-0');
    const stored = workUnitFromPost(storedAnswer(), undefined);
    expect(live.composition.kind).toBe('adjacent');
    expect(stored.composition.kind).toBe('adjacent');
    expect(live.findings).toEqual([]);
    expect(stored.findings).toEqual([]);
  });

  it('drops a malformed stored role rather than trusting it', () => {
    const stored = workUnitFromPost(
      storedAnswer({
        payload: {
          ...(storedAnswer().payload as object),
          findings: [{ seq: 'one', role: 'primary' }, { seq: 1, role: 'insight' }],
        },
      } as never),
      undefined,
    );
    // Nothing survived validation, so the surface is adjacency — never wrong.
    expect(stored.findings).toEqual([]);
    expect(stored.composition.kind).toBe('adjacent');
  });
});
