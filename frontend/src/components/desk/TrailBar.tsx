/**
 * The work trail: where this investigation has been, above the work itself.
 *
 *   The business  ›  What's going on with the stores?  ›  Why?  ›  Products
 *
 * NOT A TRANSCRIPT. Each step is a STATE — the question and the scope it was
 * asked in — and clicking one recomposes the workspace at that state from the
 * posts. Nothing scrolls to an old message, no answer is repeated, and the
 * current step is the one that dominates while the rest go quiet.
 *
 * SERVER TRUTH, EXCEPT FOR THE ONE BEING MADE. Every stored step comes from a
 * question post and the desk the loop stored on it; the last step is marked
 * `current` when the person has changed the focus since they last asked, and
 * it stops being current the moment they ask anything (workTrail.ts).
 *
 * IT SCROLLS SIDEWAYS, NEVER WRAPS. A trail that reflows to two lines moves
 * the work under the reader every time it grows.
 */
import { ChevronRight } from 'lucide-react';
import { shortLabel, type TrailStep } from './workTrail';

export interface WorkTrailProps {
  steps: TrailStep[];
  /** Which step is being looked at. */
  activeId: string;
  onStep: (step: TrailStep) => void;
}

export function WorkTrail({ steps, activeId, onStep }: WorkTrailProps) {
  if (steps.length === 0) return null;
  return (
    <nav aria-label="This investigation" data-work-trail className="min-w-0">
      <ol className="flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {steps.map((step, i) => {
          const here = step.id === activeId;
          return (
            <li key={step.id} className="flex shrink-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-george-muted" aria-hidden />}
              <button
                type="button"
                onClick={() => onStep(step)}
                aria-current={here ? 'step' : undefined}
                data-trail-step={step.id}
                data-kind={step.kind}
                title={step.label}
                className={`min-h-touch whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] transition-colors ${
                  here
                    ? 'bg-george-navy text-george-cream'
                    : 'text-george-slate hover:bg-george-paper hover:text-george-navy'
                }`}
              >
                {shortLabel(step)}
                {step.scope.length > 0 && !here && (
                  <span className="ml-1.5 text-george-muted">{step.scope.join(', ')}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
