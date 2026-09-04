/**
 * George's mark, reacting to the loop state so streaming is legible without
 * reading text: idle -> listening -> thinking -> running tools -> answering,
 * and error.
 *
 * The drawing and the state mapping live in markState.ts; this file only
 * places them. See that file for why the stamens are knocked out rather than
 * painted, and why the mark is deliberately uneven.
 *
 * MOTION IS A SWAY, NOT A SPIN. The mark is hand-perturbed, so it has no exact
 * symmetry and no angle at which a rotation would loop without a visible jump.
 * The states tilt and breathe it instead, on uneven keyframe stops so the
 * movement reads as held rather than driven. All of it is CSS on one <g>; the
 * path is never touched except in error.
 *
 * ORANGE HERE IS NOT "NEEDS YOU". The mark is the one exemption to UI rule 5,
 * recorded in CLAUDE.md: it is static brand presence and asks for nothing. The
 * error state honours the other half of that amendment — it dims and gaps, and
 * adds no orange at all.
 */
import type { GeorgeState } from '../../types/george';
import { MARK_LABEL, markClass, markPath } from './markState';

interface Props {
  state: GeorgeState;
  /** Tool names currently in flight, shown while state === 'running'. */
  running?: string[];
  size?: 'sm' | 'lg';
}

export function ReactiveMark({ state, running = [], size = 'lg' }: Props) {
  const dim = size === 'lg' ? 'h-11 w-11' : 'h-7 w-7';

  return (
    <div className="flex items-center gap-3">
      {/* currentColor, so the one drawing serves the orange-on-cream mark here
          and the cream-on-navy avatar without a second copy of the path. */}
      <svg
        viewBox="0 0 100 100"
        className={`${dim} shrink-0 text-george-accent`}
        role="img"
        aria-label="George"
      >
        <g className={markClass(state)}>
          <path d={markPath(state)} fill="currentColor" fillRule="evenodd" />
        </g>
      </svg>

      <div className="min-w-0">
        <p className="font-george-serif text-george-navy leading-tight truncate">
          {size === 'lg' ? 'George' : MARK_LABEL[state]}
        </p>
        {size === 'lg' && (
          <p className="text-xs text-george-slate truncate" aria-live="polite">
            {state === 'running' && running.length > 0
              ? `Reading the data — ${running.join(', ')}`
              : MARK_LABEL[state]}
          </p>
        )}
      </div>
    </div>
  );
}
