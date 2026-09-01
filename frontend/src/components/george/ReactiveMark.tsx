/**
 * George's mark. Reflects loop state so streaming is legible without reading
 * text: idle -> listening -> thinking -> running tools -> answering.
 *
 * The ring is the only moving part. Colour stays navy in every state except
 * error — orange is reserved for "needs you" (UI rule 5) and must not be spent
 * on a progress indicator.
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
        <div
          className={`absolute inset-[3px] rounded-full flex items-center justify-center
            ${state === 'error' ? 'bg-george-accent-soft' : 'bg-george-navy'}`}
        >
          <span
            className={`font-george-serif leading-none ${size === 'lg' ? 'text-lg' : 'text-xs'}
              ${state === 'error' ? 'text-george-accent' : 'text-george-cream'}`}
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
