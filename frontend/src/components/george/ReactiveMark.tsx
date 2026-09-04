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
 *
 * THE WORK IS SHOWN, NOT SUMMARISED. Two lines sit under the mark and they say
 * different things: the LABEL is what he is doing, named from the tool that is
 * actually running, and the COGNITION line beneath it is what he is thinking,
 * streaming as it arrives. The second is the model's own summarized reasoning
 * — worth watching, never evidence, and no figure is ever read out of it.
 *
 * Both slots are FIXED HEIGHT, held whether or not there is anything in them.
 * A line that appears and disappears as thinking starts and stops would push
 * the conversation down the page mid-read, and in the header it would resize
 * the chrome around it on every turn.
 */
import type { GeorgeState } from '../../types/george';
import { MARK_LABEL, markClass, markPath } from './markState';
import { actLine, cognitionTail } from './cognition';

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
  /**
   * The thinking so far, live. Passed raw; the last clause is taken here, so
   * the caller never has to know how the line is shaped.
   */
  thinking?: string;
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
  thinking = '',
  variant = 'hero',
}: Props) {
  // Named from the tool that is running, not from the state alone: "checking
  // purchasing" is what is happening, where "Reading the data — get_purchasing"
  // was the log line for it.
  const detail =
    state === 'running' && running.length > 0 ? actLine(running) : MARK_LABEL[state];

  // Shown while he is working, and dropped the moment the answer starts: once
  // there are words in the thread, the reasoning behind them is no longer the
  // most useful thing on screen, and the turn's own disclosure still holds all
  // of it.
  const cognition =
    state === 'thinking' || state === 'running' ? cognitionTail(thinking) : '';

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2.5">
        <Blossom state={state} toolResults={toolResults} className="h-7 w-7 shrink-0" />
        <div className="min-w-0">
          <p className="font-george-serif text-[14px] leading-tight text-george-navy">George</p>
          <p className="truncate text-[11px] text-george-slate">{detail}</p>
          {/* One line here, and the slot is held empty rather than removed —
              the header must not change height when a turn starts. */}
          <p className="h-[15px] truncate font-george-serif text-[11px] italic leading-[15px] text-george-muted">
            {cognition}
          </p>
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
      {/* Two lines' worth, always reserved. aria-hidden because the label above
          already announces the state, and reading a half-formed thought aloud
          on every delta would make the page unusable with a screen reader. */}
      <p
        className="mt-1 line-clamp-2 h-[32px] max-w-[26rem] overflow-hidden font-george-serif text-[12px] italic leading-4 text-george-muted"
        aria-hidden
      >
        {cognition}
      </p>
    </div>
  );
}
