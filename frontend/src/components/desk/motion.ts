/**
 * Motion on the desk: what moves, and what happens when a person asked for
 * less of it.
 *
 * MOTION SAYS WHAT HAPPENED. A focused object moves to the centre and the rest
 * recede; a comparison enters beside the focus; deeper evidence grows from the
 * object it explains; a reading fades in under the figures. Every transition
 * follows a click or a frame, and nothing plays on its own — no idle drift,
 * no particles, no processing theatre.
 *
 * REDUCED MOTION IS THE SAME MODEL WITH NO TRAVEL. Under
 * `prefers-reduced-motion` every transition collapses to a crossfade or to
 * nothing, and the interaction model is untouched: focus still focuses,
 * selection still selects, the field still recomposes. The mode is read from
 * the media query and nothing else, so a test can hold both branches.
 */
import { useEffect, useState } from 'react';

export type MotionMode = 'full' | 'reduced';

export const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export function motionMode(prefersReduced: boolean): MotionMode {
  return prefersReduced ? 'reduced' : 'full';
}

/** The class the desk's root carries; every transition is keyed on it in CSS. */
export const MOTION_CLASS: Record<MotionMode, string> = {
  full: 'desk-motion',
  reduced: 'desk-motion desk-motion--reduced',
};

function query(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(REDUCED_QUERY);
  } catch {
    return null;
  }
}

export function prefersReducedMotion(): boolean {
  return Boolean(query()?.matches);
}

/** The mode, and it follows the setting if the person changes it while here. */
export function useMotionMode(): MotionMode {
  const [mode, setMode] = useState<MotionMode>(() => motionMode(prefersReducedMotion()));
  useEffect(() => {
    const q = query();
    if (!q) return;
    const onChange = () => setMode(motionMode(q.matches));
    onChange();
    q.addEventListener?.('change', onChange);
    return () => q.removeEventListener?.('change', onChange);
  }, []);
  return mode;
}
