/**
 * Following a stream is a decision, and this is where it is held.
 *
 * The claims under test are the ones the dogfood found broken: a reader who
 * scrolls up keeps their position, a reader at the bottom keeps following, and
 * nothing here ever asks for smooth motion — the last of which is asserted
 * against the source, because "never animate" is a property of the code rather
 * than of a return value.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FOLLOW_THRESHOLD_PX,
  distanceFromBottom,
  followAfterScroll,
  isAtBottom,
} from './useAutoFollow';

/** A container of `clientHeight` showing `scrollTop` of `scrollHeight`. */
const at = (scrollTop: number, scrollHeight = 2000, clientHeight = 800) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

/** Pinned exactly to the bottom of a 2000/800 container. */
const BOTTOM = 1200;

describe('distanceFromBottom', () => {
  it('is zero when pinned to the bottom', () => {
    expect(distanceFromBottom(at(BOTTOM))).toBe(0);
  });

  it('measures how far the content extends below the viewport', () => {
    expect(distanceFromBottom(at(BOTTOM - 300))).toBe(300);
  });

  it('never goes negative when the container is overscrolled', () => {
    // iOS rubber-banding and a trackpad flick both report a scrollTop past the
    // maximum. A negative distance would compare wrongly against the threshold.
    expect(distanceFromBottom(at(BOTTOM + 200))).toBe(0);
  });

  it('is zero when the content is shorter than the viewport', () => {
    expect(distanceFromBottom(at(0, 400, 800))).toBe(0);
  });
});

describe('isAtBottom', () => {
  it('accepts a small drift as still at the bottom', () => {
    // A stray nudge, an on-screen keyboard, or the column changing width when
    // a table lands is not a decision to stop following.
    expect(isAtBottom(at(BOTTOM - (FOLLOW_THRESHOLD_PX - 1)))).toBe(true);
  });

  it('includes the threshold itself', () => {
    expect(isAtBottom(at(BOTTOM - FOLLOW_THRESHOLD_PX))).toBe(true);
  });

  it('rejects a drift past the threshold', () => {
    expect(isAtBottom(at(BOTTOM - (FOLLOW_THRESHOLD_PX + 1)))).toBe(false);
  });
});

describe('followAfterScroll', () => {
  it('releases follow when the reader scrolls up to read something', () => {
    expect(followAfterScroll(at(BOTTOM - 600))).toBe(false);
  });

  it('re-engages when the reader scrolls back to the bottom', () => {
    // Position decides in both directions: there is no latch that would make
    // the pill unable to hand following back.
    expect(followAfterScroll(at(BOTTOM))).toBe(true);
  });

  it('keeps following through a delta that only grew the content', () => {
    // The container was pinned and got 400px taller. Until the frame lands the
    // reader is 400px from the bottom, and that must not read as a gesture:
    // the hook guards it with the `programmatic` flag, and the threshold is
    // not what protects it. Asserted here so the guard is not silently removed
    // on the belief that this case is covered by distance alone.
    expect(followAfterScroll(at(BOTTOM, 2400))).toBe(false);
  });

  it('honours a caller-supplied threshold', () => {
    expect(followAfterScroll(at(BOTTOM - 300), 400)).toBe(true);
    expect(followAfterScroll(at(BOTTOM - 300), 100)).toBe(false);
  });
});

describe('the stream is never animated', () => {
  // The CODE, not the prose about it. This file's own comments explain at
  // length why smooth scrolling and scrollIntoView are wrong here, and a scan
  // that counted those would report the reasoning as the offence — the same
  // trap accentUse.test.ts sidesteps by excluding the tests that name the
  // token in order to forbid it.
  const source = readFileSync(join(__dirname, 'useAutoFollow.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('never asks for smooth scrolling', () => {
    // A smooth scroll has a duration; deltas arrive faster than it finishes,
    // so the animations queue and the page slides continuously under the text.
    expect(source).not.toMatch(/smooth/);
  });

  it('never calls scrollIntoView', () => {
    // scrollIntoView targets an element and moves whatever ancestor happens to
    // scroll — including the page behind a modal, and the window itself. The
    // container we were handed is the only thing this hook may move.
    expect(source).not.toMatch(/scrollIntoView/);
  });
});
