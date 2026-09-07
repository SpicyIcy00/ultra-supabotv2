/**
 * Level 3: how an answer was made.
 *
 * WHILE THE TURN RUNS this is open — the tool rows land one by one, and
 * watching real execution is the point. ONCE IT IS OVER it collapses to a
 * single line with counts, and the rows and the full reasoning sit behind
 * it. Nothing that qualifies a figure is ever in here: notices, receipts
 * and confirmations are drawn by the turn itself, above and below the
 * answer, and cannot be collapsed (turnShape.ts).
 *
 * The reasoning is the MODEL'S, and it is labelled as such by its register —
 * dimmed, quoted, behind a disclosure — so it cannot be read as evidence of
 * anything. No figure is ever taken from it.
 */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { GeorgeTurn } from '../../types/george';
import { ToolCallRow } from './ToolCallRow';
import { activitySummary, hasActivity, showsActivity } from './turnShape';

type AnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;

export function ActivityDisclosure({ turn, live }: { turn: AnswerTurn; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (!hasActivity(turn)) return null;

  const expanded = showsActivity(turn, live) || open;

  return (
    <div>
      {!showsActivity(turn, live) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-touch items-center gap-1.5 text-[12px] text-george-muted"
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden
          />
          Activity · {activitySummary(turn)}
        </button>
      )}

      {expanded && (
        <div className="space-y-2">
          {turn.toolCalls.length > 0 && (
            <div className="space-y-1.5">
              {turn.toolCalls.map((c) => (
                <ToolCallRow key={c.seq} call={c} />
              ))}
            </div>
          )}
          {/* The full reasoning, once the live line under the mark has gone.
              While the turn runs it streams there instead, and showing it
              here too would be the same text twice on one screen. */}
          {turn.thinking && !live && (
            <p className="border-l-2 border-george-line pl-3 font-george-serif text-[13px] italic leading-relaxed text-george-slate whitespace-pre-wrap">
              {turn.thinking}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
