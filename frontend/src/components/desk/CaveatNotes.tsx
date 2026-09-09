/**
 * A caveat, drawn by what it costs the reader.
 *
 * UI RULE 4 IS UNCHANGED. Every caveat is surfaced — the reader is told which
 * one applies without doing anything, and the tool's own sentence survives
 * whole. What changes is PROMINENCE, which the rule's own 2026-09-05
 * amendment already permits: a caveat may be reduced to a line that names it,
 * with the explanation a tap away.
 *
 *   answer_limiting  the finding does not stand. Whole, above everything,
 *                    never collapsible — the one level that takes attention.
 *   relevant         the finding stands and the reader should know. One line
 *                    in business words, beside the answer.
 *   non_material     named in a single quiet mark; the detail is in the
 *                    inspector, where the raw statuses belong.
 *
 * NO RAW DIAGNOSTIC IS DRAWN HERE. `no_baseline`, `NULL`, row counts and
 * internal statuses are the inspector's; what a reader gets is what it cost
 * them (caveats.ts).
 */
import { AlertTriangle } from 'lucide-react';
import type { Caveat } from './caveats';

/** The one level that may take the reader's attention. */
function Limiting({ caveat }: { caveat: Caveat }) {
  return (
    <div role="note" data-caveat="answer_limiting" className="mb-6 border-l-2 border-george-slate bg-george-paper px-4 py-3">
      <p className="text-[13px] font-medium text-george-navy">{caveat.label}</p>
      <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-george-navy">
        {caveat.consequence ?? caveat.detail}
      </p>
    </div>
  );
}

/** The finding stands; this is what it does not cover. */
function Relevant({ caveat }: { caveat: Caveat }) {
  return (
    <p role="note" data-caveat="relevant" className="mb-5 max-w-2xl border-l-2 border-george-line pl-3 text-[13px] leading-relaxed text-george-slate">
      {caveat.consequence ?? caveat.detail}
    </p>
  );
}

export function Caveats({ caveats, onInspect }: { caveats: Caveat[]; onInspect: () => void }) {
  if (caveats.length === 0) return null;
  const limiting = caveats.filter((c) => c.level === 'answer_limiting');
  const relevant = caveats.filter((c) => c.level === 'relevant');
  const quiet = caveats.filter((c) => c.level === 'non_material');

  return (
    <>
      {limiting.map((c, i) => <Limiting key={`${c.kind}-${i}`} caveat={c} />)}
      {relevant.map((c, i) => <Relevant key={`${c.kind}-${i}`} caveat={c} />)}
      {quiet.length > 0 && (
        // NAMED, NOT EXPLAINED. The reader knows a caveat applies and can
        // open it; it does not compete with the finding for the screen.
        <button
          type="button"
          onClick={onInspect}
          data-caveat="non_material"
          className="mb-4 flex min-h-touch items-center gap-1.5 text-[12px] text-george-muted hover:text-george-slate"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {quiet.length === 1 ? quiet[0].label : `${quiet.length} notes on this reading`}
        </button>
      )}
    </>
  );
}
