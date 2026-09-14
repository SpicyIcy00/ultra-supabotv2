/**
 * The record, read back — and the shape a replay changed (P1.j).
 *
 * P1.i appended every change to the answer post and nothing read it, so a
 * reload drew the STORED window under figures a person had moved. These are
 * the two halves that card named as its shortfall.
 *
 * WHAT IS RESTORED IS THE CHANGE, NOT THE ROWS. `replaysToRestore` returns
 * what to run again; nothing here carries a figure, because a figure drawn
 * from a stored copy would wear the read time of a read that happened
 * yesterday (UI rule 6).
 */
import { describe, expect, it } from 'vitest';
import type { CompositionBlock, GeorgeTurn } from '../types/george';
import type { Post } from '../types/river';
import { shapedByReplay, type BoardObject } from './board';
import { replaysToRestore } from './restore';

const answer = (post: string | null): GeorgeTurn => ({
  role: 'george', text: '', thinking: '', toolCalls: [], notices: [],
  pinned: [], saved: [], pageChanges: [], at: '2026-09-14T00:00:00Z',
  ...(post ? { post: { answer_post_id: post } } : {}),
} as unknown as GeorgeTurn);

const asked = (): GeorgeTurn => (
  { role: 'user', text: 'how did we do?', at: '2026-09-14T00:00:00Z' } as GeorgeTurn);

const post = (id: string, replays: unknown[]): Post => (
  { id, payload: { replays } } as unknown as Post);

const object = (over: Partial<BoardObject>): BoardObject => ({
  key: 'read-0', kind: 'figure', weight: 'lead', turn: 0, touched: 0, ...over,
} as BoardObject);

describe('replaysToRestore', () => {
  it('runs the newest change per call, and not the road there', () => {
    const turns = [asked(), answer('p1')];
    const posts = [post('p1', [
      { seq: 0, argument: 'window', value: 'last_month', status: 'ok' },
      { seq: 0, argument: 'window', value: 'last_30_days', status: 'ok' },
      { seq: 1, argument: 'top_n', value: 25, status: 'ok' },
    ])];
    expect(replaysToRestore(turns, posts, 4)).toEqual([
      { post: 'p1', turn: 0, seq: 0, argument: 'window', value: 'last_30_days' },
      { post: 'p1', turn: 0, seq: 1, argument: 'top_n', value: 25 },
    ]);
  });

  it('names the newest answer by its index among the answers', () => {
    const turns = [asked(), answer('p1'), asked(), answer('p2')];
    const posts = [
      post('p1', [{ seq: 0, argument: 'window', value: 'yesterday', status: 'ok' }]),
      post('p2', [{ seq: 3, argument: 'window', value: 'last_month', status: 'ok' }]),
    ];
    expect(replaysToRestore(turns, posts, 4))
      .toEqual([{ post: 'p2', turn: 1, seq: 3, argument: 'window', value: 'last_month' }]);
  });

  it('leaves a refused change where it was: it never drew anything', () => {
    const turns = [asked(), answer('p1')];
    const posts = [post('p1', [
      { seq: 0, argument: 'window', value: 'this_month', status: 'refused' },
    ])];
    expect(replaysToRestore(turns, posts, 4)).toEqual([]);
  });

  it('restores nothing from a turn that was never logged, or never moved', () => {
    expect(replaysToRestore([asked(), answer(null)], [], 4)).toEqual([]);
    expect(replaysToRestore([asked(), answer('p1')], [post('p1', [])], 4)).toEqual([]);
    expect(replaysToRestore([asked()], [], 4)).toEqual([]);
  });

  it('reads back no more than the definitions allow', () => {
    const turns = [asked(), answer('p1')];
    const posts = [post('p1', [0, 1, 2, 3, 4].map((seq) => (
      { seq, argument: 'window', value: 'last_month', status: 'ok' })))];
    expect(replaysToRestore(turns, posts, 2)).toHaveLength(2);
    expect(replaysToRestore(turns, posts, 0)).toEqual([]);
  });
});

describe('shapedByReplay', () => {
  const frame: CompositionBlock[] = [
    { op: 'put', kind: 'table', key: 'read-0', weight: 'quiet', seq: 0 },
  ] as unknown as CompositionBlock[];

  it('keeps the object where it is and loses the words said about old rows', () => {
    const board = [object({
      kind: 'figure', claim: 'Rockwell led the week', note: 'against the rest',
      seq: 0, tool: 'get_sales',
    })];
    const [out] = shapedByReplay(board, { '0:0': frame });
    expect(out.key).toBe('read-0');
    expect(out.turn).toBe(0);
    expect(out.kind).toBe('table');
    expect(out.claim).toBeUndefined();
    expect(out.note).toBeUndefined();
  });

  it('leaves every object no replay reshaped exactly as it was', () => {
    const board = [object({ seq: 0, claim: 'kept' }), object({ key: 'b', seq: 1 })];
    expect(shapedByReplay(board, {})).toBe(board);
    const out = shapedByReplay(board, { '0:1': frame });
    expect(out[0]).toBe(board[0]);
    expect(out[0].claim).toBe('kept');
  });

  it('does not reshape an object from a different turn with the same seq', () => {
    const board = [object({ seq: 0, turn: 1, touched: 1, claim: 'kept' })];
    expect(shapedByReplay(board, { '0:0': frame })[0].claim).toBe('kept');
  });
});
