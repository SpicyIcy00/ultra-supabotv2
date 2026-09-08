/**
 * Level 3: how an answer was made.
 *
 * ONE LINE, IN WORDS, IN BOTH PHASES. "Reading sales and counting stock…"
 * while it happens; "Read sales and counted stock — 412 rows" once it is over.
 * The tool rows, their arguments and the full reasoning sit behind it.
 *
 * The rows used to stand open while a turn ran. What that actually put on
 * screen, as the most prominent thing a person saw while waiting, was
 * `get_sales {"group_by":["store"]}` — implementation detail dressed as
 * progress. Simple surface, then explanation, then technical evidence; not
 * technical evidence first. Nothing was removed: the same rows are one tap
 * away, and the line above them says what they are.
 *
 * WHAT IS NEVER IN HERE. A notice (UI rule 4), the receipts line (rules 3 and
 * 6), the stopped note, and a pin or save confirmation. Each is a fact about
 * the answer rather than about how it was made, and each is drawn by the turn
 * itself, above and below.
 *
 * The reasoning inside is the MODEL'S, and its register says so — dimmed,
 * italic, behind a disclosure. No figure is ever taken from it. The line on
 * the button is the opposite: derived from the tools and true by construction.
 */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ToolCallRow } from './ToolCallRow';
import { activitySummary, hasActivity, isRunning, workLine, type Activity } from './turnShape';

export function ActivityDisclosure({ turn, live }: { turn: Activity; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (!hasActivity(turn)) return null;

  const running = isRunning(turn, live);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-touch items-center gap-1.5 text-left text-[12px] text-george-muted"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
        {/* The words first. The counts are the technical form of the same
            fact and follow it, so nobody has to read a total to learn that
            George read sales. */}
        <span className={running ? 'text-george-slate' : undefined}>{workLine(turn, live)}</span>
        {!running && (
          <span className="hidden xs:inline text-george-muted">· {activitySummary(turn)}</span>
        )}
      </button>

      {open && (
        <div className="mt-1.5 space-y-2">
          {turn.toolCalls.length > 0 && (
            <div className="space-y-1.5">
              {turn.toolCalls.map((c) => (
                <ToolCallRow key={c.seq} call={c} />
              ))}
            </div>
          )}
          {/* What he said while working — prose from before a read, moved
              here by the loop's interim_prose reset. His words, in his
              register, but an account of the work rather than the answer:
              same treatment as the reasoning below. */}
          {turn.narration && (
            <p className="border-l-2 border-george-line pl-3 font-george-serif text-[13px] leading-relaxed text-george-slate whitespace-pre-wrap">
              {turn.narration}
            </p>
          )}
          {/* The full reasoning, once the live line under the mark has gone.
              While the turn runs it streams there instead, and showing it
              here too would be the same text twice on one screen. */}
          {turn.thinking && !running && (
            <p className="border-l-2 border-george-line pl-3 font-george-serif text-[13px] italic leading-relaxed text-george-slate whitespace-pre-wrap">
              {turn.thinking}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
