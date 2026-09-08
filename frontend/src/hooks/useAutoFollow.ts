/**
 * Following a stream without taking the workspace away from the reader.
 *
 * WHO OWNS SCROLLING. The SCROLL CONTAINER does, and that is the whole fix.
 * Until now the turn list owned it: AnswerTurns held a `useEffect` on `turns`
 * that called `scrollIntoView({ behavior: 'smooth' })`, and `turns` is a new
 * array on every streamed delta — every `text` delta, every `thinking` delta,
 * every tool frame. That is hundreds of smooth scrolls per turn, each one
 * animating over the last, with nothing anywhere asking whether the reader had
 * scrolled up to look at something. Scrolling up during a turn was unwinnable
 * by construction, which is the "auto-scroll takes control of the workspace"
 * the dogfood found.
 *
 * THREE RULES, AND EACH ONE IS THE ANSWER TO SOMETHING THAT WENT WRONG.
 *
 *   1. FOLLOW IS RELEASED BY THE READER AND NEVER TAKEN BACK BY US. Scrolling
 *      up more than FOLLOW_THRESHOLD_PX from the bottom means the reader is
 *      reading something; from that moment nothing moves the viewport until
 *      they ask. Scrolling back down to within the threshold re-engages it,
 *      because arriving at the bottom is how a person says "carry on".
 *
 *   2. NEVER SMOOTH. A smooth scroll is an animation with a duration, and new
 *      content arrives faster than the animation finishes, so the animations
 *      queue and the page slides continuously under the text. An instant jump
 *      to the bottom while pinned to the bottom is not perceived as motion at
 *      all — the content grew downward and the viewport stayed with it. This
 *      also makes `prefers-reduced-motion` a non-question here: there is no
 *      motion to reduce.
 *
 *   3. THE WAY BACK IS AN AFFORDANCE, NOT A SNAP. Once follow is released the
 *      only thing that returns the reader to the bottom is their own click on
 *      the pill. `atBottom` is what the pill's visibility is derived from —
 *      never "is George busy", because a pill that appears whenever he starts
 *      working is a pill that appears while you are already at the bottom
 *      reading him work.
 *
 * PURE DECISIONS, TESTED WITHOUT A DOM. `followAfterScroll` and `distanceFromBottom`
 * are the two judgements this file makes and they are ordinary functions —
 * the convention every decision module in this app follows (riverMerge.ts,
 * presence.ts, turnShape.ts). The hook is the wiring around them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How close to the bottom still counts as "at the bottom".
 *
 * Generous on purpose. A reader who has drifted a line or two — by a trackpad
 * nudge, by an on-screen keyboard opening, by the column changing width when a
 * table lands (shellLayout.SHELL_COLUMN_TRANSITION) — has not decided to stop
 * following, and treating that as a decision would strand them mid-answer
 * watching nothing arrive. Wide enough to absorb a stray gesture, far short of
 * a screenful.
 */
export const FOLLOW_THRESHOLD_PX = 120;

/** The three numbers a scroll decision is made from. */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * How far the bottom of the content is below the bottom of the viewport.
 *
 * Zero means pinned. Never negative: overscroll (rubber-banding on iOS, a
 * trackpad flick past the end) produces a scrollTop beyond the maximum, and a
 * negative distance would read as "further from the bottom than the bottom",
 * which would then compare wrongly against the threshold.
 */
export function distanceFromBottom({
  scrollTop,
  scrollHeight,
  clientHeight,
}: ScrollMetrics): number {
  return Math.max(0, scrollHeight - scrollTop - clientHeight);
}

/** Whether the viewport is close enough to the bottom to count as pinned. */
export function isAtBottom(
  metrics: ScrollMetrics,
  threshold: number = FOLLOW_THRESHOLD_PX,
): boolean {
  return distanceFromBottom(metrics) <= threshold;
}

/**
 * Whether to follow after the reader has scrolled.
 *
 * Position decides, in both directions, and it is the same test either way:
 * away from the bottom releases, back at the bottom re-engages. There is no
 * memory of HOW the reader got there and no separate "they scrolled up once so
 * never follow again" latch — a latch would mean the pill could not hand
 * following back, and the reader would have no way to resume short of
 * reloading.
 */
export function followAfterScroll(
  metrics: ScrollMetrics,
  threshold: number = FOLLOW_THRESHOLD_PX,
): boolean {
  return isAtBottom(metrics, threshold);
}

export interface AutoFollow {
  /** Put this on the element that actually scrolls. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Whether new content is currently pulling the viewport down. */
  following: boolean;
  /**
   * Whether the viewport is at the bottom right now.
   *
   * Distinct from `following`, and the pill reads THIS. They agree almost
   * always; they differ for the frame between a programmatic jump and the
   * scroll event it causes, and showing the pill in that gap would flash it
   * once per answer.
   */
  atBottom: boolean;
  /** Return to the bottom and resume following. The pill's only job. */
  jumpToBottom: () => void;
}

/**
 * Keep a scroll container pinned to the bottom while the reader wants it.
 *
 * @param signal anything that changes when the content grows — for a live
 *   turn, the streamed text length and the number of results, not the turns
 *   array itself. A referentially-new array every delta would be a fine
 *   signal too; a primitive is passed so the effect's dependency is a value
 *   rather than an identity, and a re-render that changed nothing does not
 *   move the page.
 * @param enabled false disables following entirely — a page with no live
 *   content has nothing to follow, and a container that jumps on mount would
 *   throw away the reader's restored scroll position.
 */
export function useAutoFollow(signal: unknown, enabled = true): AutoFollow {
  const ref = useRef<HTMLDivElement | null>(null);
  const [following, setFollowing] = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  // Our own scroll writes fire scroll events exactly like the reader's, and a
  // programmatic jump momentarily reports a position that is not yet the
  // bottom. Treating that as a reader gesture would release follow on the
  // first delta of every answer. The flag is lowered by the event it caused.
  const programmatic = useRef(false);

  const measure = useCallback((): ScrollMetrics | null => {
    const el = ref.current;
    if (!el) return null;
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    programmatic.current = true;
    // Instant, always. See rule 2 above.
    el.scrollTop = el.scrollHeight;
    setFollowing(true);
    setAtBottom(true);
  }, []);

  // The reader's own scrolling is the only thing that changes `following`.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      if (programmatic.current) {
        programmatic.current = false;
        return;
      }
      const metrics = measure();
      if (!metrics) return;
      const bottom = isAtBottom(metrics);
      setAtBottom(bottom);
      setFollowing(followAfterScroll(metrics));
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [measure]);

  // Content grew. Stay with it only if the reader is still following.
  useEffect(() => {
    if (!enabled || !following) return;
    const el = ref.current;
    if (!el) return;
    // In a frame, so the jump happens after the browser has laid out whatever
    // just rendered — scrollHeight read before layout is the OLD height, and
    // the page would land one delta short of the bottom, forever.
    const frame = requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      programmatic.current = true;
      node.scrollTop = node.scrollHeight;
      setAtBottom(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [signal, following, enabled]);

  return { ref, following, atBottom, jumpToBottom };
}
