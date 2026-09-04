/**
 * George's mark, reacting to the loop state so streaming is legible without
 * reading text: idle -> listening -> thinking -> running tools -> answering,
 * and error.
 *
 * The drawing and the state mapping live in markState.ts; this file places
 * them. See that file for why the stamens are knocked out rather than painted,
 * and why the mark is deliberately uneven.
 *
 * TWO PRESENTATIONS, ONE MARK. `hero` is George's presence in the room: large,
 * centred, at the top of the conversation with his name and what he is doing
 * beneath it. `inline` is the same mark small, for the header once the hero has
 * been scrolled past. Only the hero carries aria-live — both are mounted during
 * the dock crossfade, and two live regions would announce every state twice.
 *
 * MOTION IS A SWAY, NOT A SPIN. The mark is hand-perturbed, so it has no exact
 * symmetry and no angle at which a rotation would loop without a visible jump.
 * The states tilt and breathe instead, on uneven keyframe stops so the movement
 * reads as held. Amplitudes are tuned at the size the mark is actually drawn —
 * see index.css.
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
  /**
   * How many tool results have landed in this turn. Each increment beats the
   * mark once, so work arriving is visible as well as described. It is a count
   * rather than an event because the mark is rendered from state, not driven.
   */
  toolResults?: number;
  variant?: 'hero' | 'inline';
}

function Blossom({
  state,
  toolResults = 0,
  className,
}: {
  state: GeorgeState;
  toolResults?: number;
  className: string;
}) {
  return (
    // currentColor, so the one drawing serves the accent-on-cream mark here and
    // the cream-on-navy avatar without a second copy of the path existing.
    <svg
      viewBox="0 0 100 100"
      className={`${className} text-george-accent`}
      role="img"
      aria-label="George"
    >
      {/* Keyed on the count so each landing restarts the beat. It sits OUTSIDE
          the sway group, so the pulse composes with the sway rather than
          restarting it mid-swing. No pulse before the first result lands. */}
      <g key={toolResults} className={toolResults > 0 ? 'george-mark-pulse' : undefined}>
        <g className={markClass(state)}>
          <path d={markPath(state)} fill="currentColor" fillRule="evenodd" />
        </g>
      </g>
    </svg>
  );
}

export function ReactiveMark({
  state,
  running = [],
  toolResults = 0,
  variant = 'hero',
}: Props) {
  const detail =
    state === 'running' && running.length > 0
      ? `Reading the data — ${running.join(', ')}`
      : MARK_LABEL[state];

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2.5">
        <Blossom state={state} toolResults={toolResults} className="h-7 w-7 shrink-0" />
        <div className="min-w-0">
          <p className="font-george-serif text-[14px] leading-tight text-george-navy">George</p>
          <p className="truncate text-[11px] text-george-slate">{detail}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      <Blossom
        state={state}
        toolResults={toolResults}
        className="h-14 w-14 md:h-20 md:w-20"
      />
      <p className="mt-3 font-george-serif text-[17px] leading-none text-george-navy">George</p>
      <p className="mt-1.5 max-w-[22rem] truncate text-xs text-george-slate" aria-live="polite">
        {detail}
      </p>
    </div>
  );
}
