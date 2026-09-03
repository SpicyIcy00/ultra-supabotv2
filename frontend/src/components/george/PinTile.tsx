/**
 * One pinned tile.
 *
 * A pin re-runs, so this renders whatever the tools say NOW — never a number
 * captured when it was pinned. The body shape is inferred from the result, and
 * the caveats and receipts come from the same components chat uses, so a notice
 * looks identical whether you met it in conversation or on a page.
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
import { Clock, RefreshCw, Trash2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Pin, PinCallResult, PinRun } from '../../types/pins';
import { errorMessage, runPin } from '../../services/pinsApi';
import { ago, fmt, inferShape, type Shape } from './pinShape';
import { NoticeBanner } from './NoticeBanner';
import { ReceiptsBlock } from './ReceiptsBlock';

/* ------------------------------------------------------------------ bodies -- */

function NumberBody({ shape }: { shape: Extract<Shape, { kind: 'number' }> }) {
  return (
    <div>
      <p className="font-george-serif text-[30px] leading-none tabular-nums text-george-navy">
        {shape.unit === 'PHP' ? '₱' : ''}
        {fmt(shape.value)}
      </p>
      {(shape.label || shape.unit) && (
        <p className="mt-1 text-[12px] text-george-slate">
          {[shape.label, shape.unit !== 'PHP' ? shape.unit : null].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

function ChartBody({ shape }: { shape: Extract<Shape, { kind: 'chart' }> }) {
  // Bars for a handful of buckets, a line once there are enough to read a trend.
  const Chart = shape.rows.length > 12 ? LineChart : BarChart;
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={shape.rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="currentColor" className="text-george-line" />
          <XAxis dataKey={shape.x} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={52}
                 tickFormatter={(v) => fmt(v)} />
          <Tooltip formatter={(v) => fmt(v)} labelStyle={{ fontSize: 12 }}
                   contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          {shape.rows.length > 12 ? (
            <Line type="monotone" dataKey="value" dot={false} strokeWidth={2}
                  stroke="currentColor" className="text-george-navy" />
          ) : (
            <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="currentColor"
                 className="text-george-navy" />
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

function TableBody({
  shape,
  fullCount,
}: {
  shape: Extract<Shape, { kind: 'table' }>;
  fullCount?: number;
}) {
  const shown = shape.rows.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-george-line text-left text-[11px] uppercase tracking-wide text-george-muted">
            {shape.columns.map((c) => (
              <th key={c} className="py-1 pr-3 font-medium">{c.replace(/_/g, ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shape.rows.map((r, i) => (
            <tr key={i} className="border-b border-george-line/50 last:border-0">
              {shape.columns.map((c) => (
                <td key={c} className="py-1.5 pr-3 tabular-nums text-george-navy">{fmt(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {fullCount !== undefined && fullCount > shown && (
        // Never let a partial list read as a total.
        <p className="mt-1.5 text-[11px] text-george-muted">
          {shown} of {fullCount.toLocaleString('en-PH')} rows
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- tile -- */

function PlainState({ heading, detail, when }: { heading: string; detail?: string; when: string }) {
  return (
    <div>
      <p className="text-[13px] text-george-navy">{heading}</p>
      {detail && (
        <p className="mt-1 text-[12px] leading-relaxed text-george-slate">{detail}</p>
      )}
      <p className="mt-2 flex items-center gap-1 text-[11px] text-george-muted">
        <Clock className="h-3 w-3" aria-hidden />
        {when}
      </p>
    </div>
  );
}

export function PinTile({
  pin,
  onDelete,
}: {
  pin: Pin;
  onDelete: (id: string) => void;
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
    <article className="rounded-xl border border-george-line bg-george-paper p-3.5">
      <header className="mb-2.5 flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-george-serif text-[15px] leading-snug text-george-navy">
          {pin.title}
        </h3>
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={run.isPending}
          aria-label={`Refresh ${pin.title}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-george-muted hover:text-george-slate disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${run.isPending ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(pin.id)}
          aria-label={`Delete ${pin.title}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-george-muted hover:text-george-slate"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      {run.isPending && !data && (
        <p className="text-[13px] text-george-muted">Running…</p>
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

          {data.status === 'ok' && first && <OkBody result={first} />}

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
    </article>
  );
}

function OkBody({ result }: { result: PinCallResult }) {
  const shape = inferShape(result);
  return (
    <div className="space-y-2.5">
      {shape === null ? (
        <p className="text-[13px] text-george-slate">
          No rows matched. That is an empty result, not a zero.
        </p>
      ) : shape.kind === 'number' ? (
        <NumberBody shape={shape} />
      ) : shape.kind === 'chart' ? (
        <ChartBody shape={shape} />
      ) : (
        <TableBody shape={shape} fullCount={result.meta?.row_count} />
      )}
      {/* The receipts line — where it came from, which filters, when it was read. */}
      <ReceiptsBlock meta={result.meta} />
    </div>
  );
}
