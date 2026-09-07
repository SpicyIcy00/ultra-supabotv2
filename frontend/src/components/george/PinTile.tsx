/**
 * One pinned result, as a section of a page rather than a card on a grid.
 *
 * A pin re-runs, so this renders whatever the tools say NOW — never a number
 * captured when it was pinned. The figures go through the SAME surface an
 * answer goes through, so a pin of three figures is three figures on the page
 * exactly as it was in the thread, with the same grouping and the same
 * receipts rule (UI rule 3). Until 2026-09-07 this drew the first result
 * alone, and a three-call pin showed one number.
 *
 * WHY THE CARD WENT. Five bordered boxes on a two-column grid, each with two
 * icon buttons in its corner, is the shape of an admin dashboard, and it read
 * as one: every figure the same size, none of them leading, and the chrome
 * competing with the numbers. The page is a document now — a rule above each
 * section, a serif heading, the figure at a size that matches how much it has
 * to say, and the controls stepped back until they are wanted.
 *
 * THE FIRST SECTION LEADS. `lead` sets a lone figure and chart larger. That is
 * the page's own order — the order the person pinned things in — not this
 * component deciding which number matters.
 *
 * A PARTIAL REPLAY SAYS SO. Calls fail independently, and a tile that quietly
 * drew two of three figures would be claiming the pin reproduced whole. So
 * what came back is drawn, and what did not is named above it, in the
 * runner's own words — a refusal is a real answer, not a fault. No red, no
 * orange, no alarm icon: orange is reserved for "needs you" (UI rule 5) and a
 * rotted tile does not need you in that sense.
 *
 * Every state carries a time (UI rule 6). When there is no meta to take one
 * from, the tile falls back to when it last worked, or says it never has.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import type { Pin, PinCallResult, PinRun } from '../../types/pins';
import { errorMessage, runPin } from '../../services/pinsApi';
import { ago, missingLabel, replayState } from './pinShape';
import { blocksFromPinRun } from './resultShape';
import { ResultSurface } from './ResultSurface';
import { NoticeBanner } from './NoticeBanner';
import { ReceiptsBlock } from './ReceiptsBlock';

/* -------------------------------------------------------------------- tile -- */

function PlainState({ heading, detail, when }: { heading: string; detail?: string; when: string }) {
  return (
    <div>
      <p className="text-[15px] text-george-navy">{heading}</p>
      {detail && (
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-george-slate">{detail}</p>
      )}
      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-george-muted">
        <Clock className="h-3 w-3" aria-hidden />
        {when}
      </p>
    </div>
  );
}

/** The heading for a run in which NOTHING came back, by its worst state. */
function nothingHeading(status: PinRun['status']): string {
  switch (status) {
    case 'refused':
      return 'George declined to answer this.';
    case 'unrunnable':
      return 'This pin can no longer run.';
    default:
      return 'This tile could not be refreshed.';
  }
}

export function PinTile({
  pin,
  onDelete,
  lead = false,
  actions,
}: {
  pin: Pin;
  onDelete: (id: string) => void;
  /** The first section on the page: its figure is set larger. */
  lead?: boolean;
  /** Anything else the page wants beside Refresh and Remove, kept as quiet. */
  actions?: ReactNode;
}) {
  const qc = useQueryClient();

  // Re-run on mount: a pin is only worth anything current. No polling — the
  // receipts line carries the age, which is the honest alternative to churning
  // through the warehouse for data nobody is looking at.
  const run = useMutation<PinRun, unknown, void>({
    mutationFn: () => runPin(pin.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pins'] }),
  });
  const { mutate } = run;
  useEffect(() => { mutate(); }, [mutate]);

  const data = run.data;

  return (
    <section className="border-t border-george-line pt-7 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3
          className={`min-w-0 font-george-serif leading-snug text-george-navy ${
            lead ? 'text-[22px]' : 'text-[18px]'
          }`}
        >
          {pin.title}
        </h3>
        {/* Stepped back until wanted: the page is about the figures, and two
            icon buttons per section was the loudest thing on it. */}
        <div className="flex shrink-0 items-baseline gap-4 text-[12px]">
          <button
            type="button"
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="text-george-muted hover:text-george-navy disabled:opacity-40"
          >
            {run.isPending ? 'Reading…' : 'Refresh'}
          </button>
          {actions}
          <button
            type="button"
            onClick={() => onDelete(pin.id)}
            aria-label={`Remove ${pin.title}`}
            className="text-george-muted hover:text-george-navy"
          >
            Remove
          </button>
        </div>
      </div>

      {run.isPending && !data && (
        <p className="text-[13px] text-george-muted">Reading…</p>
      )}

      {run.isError && !data && (
        <PlainState
          heading="Could not reach George."
          detail={errorMessage(run.error)}
          when={`Last worked ${ago(pin.last_ok_at)}`}
        />
      )}

      {data && <RunBody data={data} lead={lead} />}
    </section>
  );
}

/**
 * A run, drawn whole.
 *
 * Order within the section is the order a turn uses: notices, then what did
 * not reproduce, then the figures with their receipts. A caveat sits above the
 * number it qualifies (UI rule 4), and a missing figure is a caveat about the
 * ones beside it.
 */
function RunBody({ data, lead }: { data: PinRun; lead: boolean }) {
  const state = useMemo(() => replayState(data.results), [data.results]);
  const blocks = useMemo(() => blocksFromPinRun(state.drawn), [state.drawn]);
  const cameBack = state.drawn.length + state.empty.length > 0;

  return (
    <div className="space-y-3">
      {/* Above the figures, always — same component, same rules as chat. */}
      <NoticeBanner notices={data.notices} />

      {!cameBack ? (
        <PlainState
          heading={nothingHeading(data.status)}
          detail={state.missing[0]?.error}
          when={
            data.status === 'refused'
              ? `Checked ${ago(data.ran_at)}`
              : `Last worked ${ago(data.last_ok_at)}`
          }
        />
      ) : (
        <>
          {state.missing.length > 0 && (
            <PartialReplay missing={state.missing} total={data.results.length} ranAt={data.ran_at} />
          )}

          <ResultSurface blocks={blocks} large={lead} />

          {state.empty.map((r, i) => (
            <EmptyResult key={`${r.tool}-${i}`} result={r} />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * The calls that did not come back, named above the ones that did.
 *
 * Structure and position rather than hue: a rule down the left edge, slate
 * on paper, the same treatment a notice gets, because it is one — a fact
 * about the figures below it that a reader has to have before reading them.
 */
function PartialReplay({
  missing,
  total,
  ranAt,
}: {
  missing: PinCallResult[];
  total: number;
  ranAt: string;
}) {
  return (
    <div
      role="note"
      aria-label="Partly reproduced"
      className="border-l-2 border-george-slate bg-george-paper py-2 pl-3 pr-3"
    >
      <p className="text-[13px] text-george-navy">
        Only part of this pin came back: {missing.length} of {total}{' '}
        {total === 1 ? 'call' : 'calls'} did not reproduce.
      </p>
      <ul className="mt-1.5 space-y-1">
        {missing.map((r, i) => (
          <li key={`${r.tool}-${i}`} className="text-[12px] leading-relaxed text-george-slate">
            <span className="text-george-navy">{r.tool}</span> {missingLabel(r.status)}
            {r.error ? `: ${r.error}` : '.'}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-george-muted">
        <Clock className="h-3 w-3" aria-hidden />
        Checked {ago(ranAt)}
      </p>
    </div>
  );
}

/** An ok call with no rows: an empty result, not a zero, with its receipts. */
function EmptyResult({ result }: { result: PinCallResult }) {
  return (
    <div>
      <p className="text-[15px] text-george-slate">
        No rows matched. That is an empty result, not a zero.
      </p>
      <ReceiptsBlock meta={result.meta} />
    </div>
  );
}
