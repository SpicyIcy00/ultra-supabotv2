/**
 * George's mark. Reflects loop state so streaming is legible without reading
 * text: idle -> listening -> thinking -> running tools -> answering, and error.
 *
 * The ring is the only moving part.
 *
 * NOTHING HERE IS ORANGE, INCLUDING ERROR. One colour means "needs you" (UI
 * rule 5), reserved for a workflow version waiting to be promoted, and its
 * meaning is destroyed by a second use — the rule names errors first among the
 * things that may not borrow it. This file used to say exactly that in its own
 * docstring and then render the error state in `george-accent`, which is the
 * failure mode the rule predicts: the exception looks principled until it is
 * the only orange most users ever see.
 *
 * So error is distinguished from idle WITHOUT colour: idle is the filled navy
 * mark at rest, error is the same navy hollowed out — a broken ring drawn as a
 * dashed border, the letterform dropped to the slate weight. Distinct at a
 * glance, still navy, still not asking for anything.
 */
import type { GeorgeState } from '../../types/george';

const LABEL: Record<GeorgeState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  running: 'Reading the data',
  answering: 'Answering',
  error: 'Something went wrong',
};

interface Props {
  state: GeorgeState;
  /** Tool names currently in flight, shown while state === 'running'. */
  running?: string[];
  size?: 'sm' | 'lg';
}

export function ReactiveMark({ state, running = [], size = 'lg' }: Props) {
  const active = state !== 'idle' && state !== 'error';
  const failed = state === 'error';
  const dim = size === 'lg' ? 'h-11 w-11' : 'h-7 w-7';

  return (
    <div className="flex items-center gap-3">
      <div className={`relative ${dim} shrink-0`}>
        {active && (
          <span
            className="absolute inset-0 rounded-full border-2 border-george-navy/25 border-t-george-navy animate-spin"
            style={{ animationDuration: state === 'thinking' ? '2.4s' : '1s' }}
            aria-hidden
          />
        )}
        {/* The broken ring: stationary, dashed, navy. What separates error
            from idle is the outline and the hollow centre, never a hue. */}
        {failed && (
          <span
            className="absolute inset-0 rounded-full border-2 border-dashed border-george-navy/40"
            aria-hidden
          />
        )}
        <div
          className={`absolute inset-[3px] rounded-full flex items-center justify-center
            ${failed ? 'bg-transparent' : 'bg-george-navy'}`}
        >
          <span
            className={`font-george-serif leading-none ${size === 'lg' ? 'text-lg' : 'text-xs'}
              ${failed ? 'text-george-slate' : 'text-george-cream'}`}
          >
            G
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="font-george-serif text-george-navy leading-tight truncate">
          {size === 'lg' ? 'George' : LABEL[state]}
        </p>
        {size === 'lg' && (
          <p className="text-xs text-george-slate truncate" aria-live="polite">
            {state === 'running' && running.length > 0
              ? `Reading the data — ${running.join(', ')}`
              : LABEL[state]}
          </p>
        )}
      </div>
    </div>
  );
}
