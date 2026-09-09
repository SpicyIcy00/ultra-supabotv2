/**
 * How we got here, and what George makes of it.
 *
 * THE TRAIL IS THE WAY BACK. Each step is what was asked; clicking one
 * restores the workspace to that step, which is why there is no Back button
 * anywhere else and no browser history to fight. The steps are the posts of
 * the thread, in order, and nothing here is remembered on the client.
 *
 * THE READING IS GEORGE'S PROSE, and it sits under the trail rather than over
 * the figures, because the figures are the answer and the prose interprets
 * them. An earlier reading stays behind a line that names it, so a person can
 * see what he said before the work moved on.
 *
 * IN PROGRESS IS NOT TABS. Other pieces of work are listed, quiet, and open
 * in the same one workspace. Nothing is kept open beside anything else.
 */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Surface } from '../george/surfaceCompose';
import { Prose } from '../george/Prose';

export interface TrailProps {
  surface: Surface | null;
  /** The step being looked at, or null for the latest. */
  stepIndex: number | null;
  onStep: (index: number | null) => void;
  /** The other pieces of work in the river, newest first. */
  inProgress: { id: string; threadId: string; title: string; at: string }[];
  onOpen: (threadId: string) => void;
  /** What is being asked right now, in George's own words. */
  narration?: string | null;
}

export function Trail({ surface, stepIndex, onStep, inProgress, onOpen, narration }: TrailProps) {
  const [earlier, setEarlier] = useState(false);
  const steps = surface?.steps ?? [];
  const latest = surface?.latest;
  const readings = steps.filter((s) => s.unit.prose.trim().length > 0);
  const reading = readings[readings.length - 1]?.unit.prose ?? '';
  const before = readings.slice(0, -1);

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto px-5 pb-8 pt-2 text-[13px]" data-trail>
      {steps.length > 0 && (
        <nav aria-label="How we got here">
          <p className="desk-label mb-2.5">The work</p>
          <ol className="space-y-1.5">
            {steps.map((step, i) => {
              const here = stepIndex === null ? i === steps.length - 1 : i === stepIndex;
              const text = step.intent?.text ?? 'Where this started';
              return (
                <li key={step.unit.id}>
                  <button
                    type="button"
                    onClick={() => onStep(i === steps.length - 1 ? null : i)}
                    aria-current={here ? 'step' : undefined}
                    data-step={i}
                    className={`block w-full text-left font-george-serif leading-snug ${
                      here ? 'text-george-navy' : 'text-george-slate hover:text-george-navy'
                    }`}
                  >
                    {i > 0 && <span className="mr-1 text-george-muted" aria-hidden>↳</span>}
                    {text}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      {/* George's reading of what is on screen. */}
      {(reading || narration) && (
        <div data-reading className="desk-reading-in">
          <p className="desk-label mb-2">George</p>
          {narration && <p className="mb-2 text-[12px] text-george-slate">{narration}</p>}
          {reading && <Prose text={reading} lede={false} quiet={false} />}
          {before.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setEarlier((o) => !o)}
                aria-expanded={earlier}
                className="flex min-h-touch items-center gap-1.5 text-[12px] text-george-muted hover:text-george-slate"
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${earlier ? 'rotate-90' : ''}`} aria-hidden />
                {before.length === 1 ? 'Earlier reading' : `${before.length} earlier readings`}
              </button>
              {earlier && (
                <div className="mt-2 space-y-3 border-l-2 border-george-line pl-3">
                  {before.map((s) => (
                    <div key={s.unit.id}>
                      {s.intent && <p className="desk-label mb-1">{s.intent.text}</p>}
                      <Prose text={s.unit.prose} lede={false} quiet />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* What each step wrote or could not finish: never folded. */}
      {latest?.error && (
        <p className="rounded-lg bg-george-paper px-3 py-2.5 text-[13px] text-george-navy desk-lift">{latest.error}</p>
      )}
      {latest?.state === 'stopped' && (
        <p className="rounded-lg bg-george-paper px-3 py-2.5 text-[12px] leading-relaxed text-george-slate desk-lift">
          <span className="text-george-navy">Stopped.</span> If George finished anyway, the answer is in this work.
        </p>
      )}

      {inProgress.length > 0 && (
        <nav aria-label="In progress" className="mt-auto">
          <p className="desk-label mb-2.5">In progress</p>
          <ul className="space-y-1.5">
            {inProgress.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onOpen(w.threadId)}
                  data-in-progress={w.threadId}
                  className="block w-full truncate text-left text-george-slate hover:text-george-navy"
                  title={w.title}
                >
                  {w.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
