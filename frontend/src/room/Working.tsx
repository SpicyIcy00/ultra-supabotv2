/**
 * FEELING HIM WORK.
 *
 * The owner's feature 13: *feel him working — checking data, bringing evidence
 * in, updating what we look at — with no fake thinking animation and no
 * chain-of-thought.* Both halves of that are constraints:
 *
 *   NOTHING HERE IS INVENTED. Every line comes from a frame the loop sent —
 *   a call that started, a result that landed, a refusal. There is no
 *   progress bar counting to a number nobody knows, no spinner standing in
 *   for a step, and no reasoning text. If George is doing nothing, this shows
 *   nothing.
 *
 *   IT IS IN WORDS, NOT IN TOOL NAMES. "reading sales", never
 *   `get_sales {"group_by":["store"]}`. The words are in work.ts, where the
 *   line above the claim and the Behind it view read the same ones.
 *
 * A LANDED READ SAYS HOW MUCH IT BROUGHT BACK AND HOW LONG IT TOOK, because
 * both are the difference between a read that found the business and one that
 * found nothing, and both are knowable from the frame rather than from the
 * prose.
 *
 * AND THE WORK OUTLIVES THE TURN (P1.k). The trail used to vanish the moment
 * the answer landed: the person had watched four reads go by and then had a
 * paragraph with nothing behind it. `WorkLine` is what is left — one derived
 * line above the claim, and the same steps under it when you want them.
 */
import { useEffect, useState } from 'react';

import type { AnswerTurn } from './data';
import { receiptsLine } from './data';
import { durationWords, stepsOf, summaryOf, summaryWords, type Step } from './work';

/**
 * HOW LONG HE HAS BEEN AT IT (P0.3).
 *
 * The one number on this line that does not come from a frame, and it is
 * allowed for the reason the rest are not: nothing has arrived yet. A person
 * waiting has no way to tell a turn that is working from one that has stalled,
 * and Phase 1's targets are seconds — first visible change under 2 s, median
 * answer under 10 s — so the wait is the thing being worked on. Showing it is
 * showing the subject.
 *
 * It is a measurement, not an estimate: the turn's own start time, which the
 * client set when it asked, against the clock now. There is no progress bar,
 * no predicted finish and no percentage — none of those is knowable, and
 * inventing one is what the header of this file forbids.
 *
 * The server measures the same wait properly (`duration_ms` on the `done`
 * frame and in george.conversations, off one monotonic clock inside the
 * turn). That is the figure the clock report reads, and the one the work line
 * shows once the turn is over. This is what the person sees while it runs.
 */
function useElapsed(startedAt: string | undefined, live: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    // Re-read immediately so a turn that starts does not carry the stale
    // `now` from whenever this component last rendered.
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live, startedAt]);
  const started = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(started)) return null;
  // Never negative: a client clock nudged backwards mid-turn would otherwise
  // count down, which reads as a bug in George rather than in the clock.
  return Math.max(0, Math.round((now - started) / 1000));
}

/** Seconds as a person reads them: `8s`, then `1m 04s` once a minute is up. */
export function elapsedWords(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(seconds - m * 60).padStart(2, '0')}s`;
}

/**
 * ONE RUNG, AND WHAT IS UNDER IT.
 *
 * Tapping a step opens the receipts of the read it was — what was measured,
 * how it was cut, which days, when it was read. That is UI rule 3 where the
 * work is: the figures on the board open in the panel, and the steps that
 * fetched them open here, with no new route and no modal.
 *
 * A STEP WITH NOTHING BEHIND IT DOES NOT PRETEND TO OPEN. A call still running
 * and a compose have no receipts, and a control that does nothing teaches you
 * that none of them do.
 */
function StepLine({ step, open, onToggle }: {
  step: Step;
  open: boolean;
  onToggle: (() => void) | null;
}) {
  const line = step.meta ? receiptsLine(step.meta) : '';
  const openable = Boolean(onToggle && (line || step.declined));
  const body = (
    <>
      {step.state === 'running' ? `${step.words}…` : step.words}
      {step.state === 'declined' && <span className="r-work-n">declined</span>}
      {step.rows !== null && (
        <span className="r-work-n">{step.rows === 1 ? '1 row' : `${step.rows} rows`}</span>
      )}
      {step.ms !== null && <span className="r-work-n">{durationWords(step.ms)}</span>}
    </>
  );
  return (
    <>
      {openable ? (
        <button type="button" aria-expanded={open}
                className={`r-work r-work--step${step.state === 'running' ? '' : ' r-work--done'}`}
                onClick={onToggle ?? undefined}>
          {body}
        </button>
      ) : (
        <p className={`r-work${step.state === 'running' ? '' : ' r-work--done'}`}>{body}</p>
      )}
      {open && (
        <div className="r-work-receipts">
          {/* THE TOOL'S OWN SENTENCE when it declined, which is written to be
              read — never an exception, and never the client's paraphrase. */}
          {step.declined && <p className="r-work-declined">{step.declined}</p>}
          {line && <p className="r-src">{line}</p>}
          {step.meta?.source_table && <p className="r-src">from {step.meta.source_table}</p>}
        </div>
      )}
    </>
  );
}

export function Working({ turn, live }: { turn: AnswerTurn | null; live: boolean }) {
  // Before the early return: a hook cannot be called conditionally, and the
  // turn is the only thing it needs.
  const elapsed = useElapsed(turn?.at, live);
  const [open, setOpen] = useState<string | null>(null);
  // The board is the result. While he is finished, this has nothing to add,
  // and a trail that lingered would be a second account of the same thing —
  // the work line below is what stands in its place.
  if (!live || !turn) return null;
  const clock = elapsed === null ? null : (
    <span className="r-work-clock">{elapsedWords(elapsed)}</span>
  );
  const steps = stepsOf(turn);
  if (!steps.length) {
    // Real, and the only honest thing to say before the first call returns.
    return <p className="r-work">thinking…{clock}</p>;
  }

  return (
    <div className="r-work-trail">
      {steps.map((step) => (
        <StepLine key={step.key} step={step} open={open === step.key}
                  onToggle={() => setOpen(open === step.key ? null : step.key)} />
      ))}
      {/* At the FOOT of the trail, not beside the running line: a call that
          lands moves that line's words, and a number that jumped with it
          would read as part of the call rather than as the wait. */}
      {clock && <p className="r-work r-work--clock">{clock}</p>}
    </div>
  );
}

/**
 * WHAT THE TURN COST, ONE LINE, ABOVE THE CLAIM.
 *
 * Perplexity's shape: sources above the answer, steps behind one plain line.
 * Four counts off frames that already arrived — reads that landed, calls made,
 * the turn's own clock, caveats raised — and the steps themselves one tap
 * away. It is the only account of the work that survives the turn, which is
 * the point: an answer whose evidence is a paragraph of prose is an answer you
 * have to take on trust.
 *
 * NOT AN ACCENT, NOT A BADGE, NOT A SCORE. Four counts is not a rating of the
 * work and nothing here is coloured: the one colour means "needs you" (UI
 * rule 5), and a turn that read four things is not better than one that read
 * one.
 */
export function WorkLine({ turn, onBehind }: {
  turn: AnswerTurn | null;
  /** Opens the whole thread's reads. Absent where there is nowhere to go. */
  onBehind?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  if (!turn) return null;
  const steps = stepsOf(turn);
  // A TURN THAT CALLED NOTHING HAS NO WORK TO SHOW. He answered from what he
  // already had, and "0 reads · 0 tools" would be a line about an absence.
  if (!steps.length) return null;
  const words = summaryWords(summaryOf(turn));
  return (
    <div className="r-workline">
      <p className="r-workline-row">
        <button type="button" className="r-workline-line" aria-expanded={open}
                onClick={() => setOpen(!open)}>
          {words.join(' · ')}
        </button>
        {onBehind && (
          <button type="button" className="r-workline-behind" onClick={onBehind}>
            behind it
          </button>
        )}
      </p>
      {open && (
        <div className="r-work-trail r-work-trail--settled">
          {steps.map((s) => (
            <StepLine key={s.key} step={s} open={step === s.key}
                      onToggle={() => setStep(step === s.key ? null : s.key)} />
          ))}
        </div>
      )}
    </div>
  );
}
