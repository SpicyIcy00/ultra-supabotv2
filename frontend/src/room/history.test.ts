// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  arrivedSince, firstUnseen, forgetLast, lastSeen, lastThread, remember,
} from './history';

describe('the room remembers where you were', () => {
  beforeEach(() => localStorage.clear());

  it('has nowhere to go back to until you have been somewhere', () => {
    expect(lastThread()).toBeNull();
    remember('t1');
    expect(lastThread()).toBe('t1');
  });

  it('forgets the last thread when you clear the board on purpose', () => {
    remember('t1');
    forgetLast();
    expect(lastThread()).toBeNull();
    // What you had seen there is not forgotten — only where "/" goes.
    remember('t1', '2026-09-11T10:00:00Z');
    forgetLast();
    expect(lastSeen('t1')).toBe('2026-09-11T10:00:00Z');
  });

  it('records what you have seen forwards only', () => {
    remember('t1', '2026-09-11T10:00:00Z');
    remember('t1', '2026-09-11T09:00:00Z');
    expect(lastSeen('t1')).toBe('2026-09-11T10:00:00Z');
    remember('t1', '2026-09-11T11:00:00+08:00'); // 03:00Z — earlier, in a different offset
    expect(lastSeen('t1')).toBe('2026-09-11T10:00:00Z');
  });

  it('keeps a dozen threads and lets the oldest fall off', () => {
    for (let n = 0; n < 15; n++) remember(`t${n}`, `2026-09-01T00:00:${String(n).padStart(2, '0')}Z`);
    expect(lastSeen('t0')).toBeNull();
    expect(lastSeen('t14')).not.toBeNull();
  });
});

describe('since you last looked', () => {
  const answers = [
    { at: '2026-09-11T08:00:00Z' }, { at: '2026-09-11T12:00:00Z' }, { at: '2026-09-11T20:00:00Z' },
  ];

  it('counts only answers strictly after the mark, and none on a first visit', () => {
    expect(arrivedSince(answers, null)).toBe(0);
    expect(arrivedSince(answers, '2026-09-11T12:00:00Z')).toBe(1);
    expect(arrivedSince(answers, '2026-09-11T07:00:00Z')).toBe(3);
    expect(arrivedSince(answers, '2026-09-12T00:00:00Z')).toBe(0);
  });

  it('never counts a turn with no time as new', () => {
    expect(arrivedSince([{ at: undefined }, { at: '' }], '2026-09-11T00:00:00Z')).toBe(0);
  });

  it('says where the unseen begin', () => {
    expect(firstUnseen(answers, null)).toBe(3);
    expect(firstUnseen(answers, '2026-09-11T08:00:00Z')).toBe(1);
    expect(firstUnseen(answers, '2026-09-11T20:00:00Z')).toBe(3);
  });
});
