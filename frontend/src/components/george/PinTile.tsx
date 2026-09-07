/**
 * One pinned figure, as a section of a page rather than a card on a grid.
 *
 * A pin re-runs, so this renders whatever the tools say NOW — never a number
 * captured when it was pinned. The body shape is inferred from the result, and
 * the caveats and receipts come from the same components chat uses, so a notice
 * looks identical whether you met it in conversation or on a page.
 *
 * WHY THE CARD WENT. Five bordered boxes on a two-column grid, each with two
 * icon buttons in its corner, is the shape of an admin dashboard, and it read
 * as one: every figure the same size, none of them leading, and the chrome
 * competing with the numbers. The page is a document now — a rule above each
 * section, a serif heading, the figure at a size that matches how much it has
 * to say, and the controls stepped back until they are wanted. Nothing about
 * what runs or what is shown has changed.
 *
 * THE FIRST SECTION LEADS. `lead` sets its figure and chart larger. That is
 * the page's own order — the order the person pinned things in — not this
 * component deciding which number matters.
 *
 * THE THREE NON-OK STATES RENDER PLAINLY. No red, no orange, no alarm icon. A
 * refusal is the tool declining to produce a misleading number — that is a real
 * answer, not a failure. Orange is reserved for "needs you" (UI rule 5) and a
 * tile that has simply rotted does not need you in that sense.
 *
 * Every state carries a time (UI rule 6). When there is no meta to take one
 * from, the tile falls back to when it last worked, or says it never has.
 */
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import type { Pin, PinCallResult, PinRun } from '../../types/pins';
import { errorMessage, runPin } from '../../services/pinsApi';
import { ago, inferShape } from './pinShape';
import { Comparison, Metric, ResultTable } from './ResultBlocks';
import { GeorgeChart } from './GeorgeChart';
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

export function PinTile({
  pin,
  onDelete,
  lead = false,
}: {
  pin: Pin;
  onDelete: (id: string) => void;
  /** The first section on the page: its figure is set larger. */
  lead?: boolean;
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
  const first = data?.results?.[0];

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

      {data && (
        <>
          {/* Above the figures, always — same component, same rules as chat. */}
          <NoticeBanner notices={data.notices} />

          {data.status === 'ok' && first && <OkBody result={first} lead={lead} />}

          {data.status === 'refused' && (
            <PlainState
              heading="George declined to answer this."
              detail={first?.error}
              when={`Checked ${ago(data.ran_at)}`}
            />
          )}

          {data.status === 'unrunnable' && (
            <PlainState
              heading="This pin can no longer run."
              detail={first?.error}
              when={`Last worked ${ago(data.last_ok_at)}`}
            />
          )}

          {data.status === 'failed' && (
            <PlainState
              heading="This tile could not be refreshed."
              detail={first?.error}
              when={`Last worked ${ago(data.last_ok_at)}`}
            />
          )}
        </>
      )}
    </section>
  );
}

function OkBody({ result, lead }: { result: PinCallResult; lead: boolean }) {
  const shape = inferShape(result);
  return (
    <div className="space-y-3">
      {shape === null ? (
        <p className="text-[15px] text-george-slate">
          No rows matched. That is an empty result, not a zero.
        </p>
      ) : shape.kind === 'number' ? (
        <Metric shape={shape} size={lead ? 'lead' : 'default'} />
      ) : shape.kind === 'comparison' ? (
        <Comparison shape={shape} size={lead ? 'lead' : 'default'} />
      ) : shape.kind === 'chart' ? (
        <GeorgeChart shape={shape} meta={result.meta} height={lead ? 220 : 160} />
      ) : (
        <ResultTable shape={shape} fullCount={result.meta?.row_count} />
      )}
      {/* The receipts line — where it came from, which filters, when it was read. */}
      <ReceiptsBlock meta={result.meta} />
    </div>
  );
}
