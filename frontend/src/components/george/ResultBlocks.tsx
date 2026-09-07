/**
 * The result vocabulary: the small, fixed set of things George is allowed to
 * draw a figure as.
 *
 * WHY THIS FILE EXISTS. Metric and Table were private functions inside
 * PinTile.tsx, so a pinned figure and the same figure in an answer were drawn
 * by different code that happened to agree. UI rule 3 says a number is
 * inspectable "identically whether it came from chat or from a tile" — that is
 * only true by construction if there is one drawing. So the bodies moved here
 * and PinTile imports them, exactly as it already imports GeorgeChart,
 * NoticeBanner and ReceiptsBlock.
 *
 * WHAT IS AND IS NOT DECIDED HERE. Nothing. Which primitive a result becomes is
 * inferShape's decision (pinShape.ts), and how several results compose into one
 * surface is resultShape.ts. This file places what it is handed, and computes
 * no figure of any kind: every number on screen came off a row, and every delta
 * came off a row that already carried it.
 *
 * PALETTE. Navy on cream, one hairline rule where a separator is unavoidable.
 * No cards, no tinted panels, no icons beside figures, and no orange — one
 * colour means "needs you" (UI rule 5) and a figure never does.
 */
import { fmt, type ComparisonRow, type Shape } from './pinShape';

/** How much room a figure gets. The surface decides; the figure obeys. */
export type MetricSize = 'lead' | 'default' | 'grouped';

const FIGURE: Record<MetricSize, string> = {
  lead: 'text-[54px]',
  default: 'text-[38px]',
  // In a group the figures are peers and are read across, so they are sized to
  // fit three abreast on a narrow desktop column without wrapping mid-number.
  grouped: 'text-[28px] md:text-[32px]',
};

/** The currency mark for a unit, or nothing. Units come from meta, never here. */
export function unitPrefix(unit?: string): string {
  return unit === 'PHP' ? '₱' : '';
}

/** The caption under a figure: its label, and its unit when the unit is a word. */
export function metricCaption(label?: string, unit?: string): string {
  return [label, unit && unit !== 'PHP' ? unit : null].filter(Boolean).join(' · ');
}

/* ------------------------------------------------------------------ metric -- */

export function Metric({
  shape,
  size = 'default',
}: {
  shape: Extract<Shape, { kind: 'number' }>;
  size?: MetricSize;
}) {
  const caption = metricCaption(shape.label, shape.unit);
  return (
    <div>
      <p className={`font-george-serif leading-none tabular-nums text-george-navy ${FIGURE[size]}`}>
        {unitPrefix(shape.unit)}
        {fmt(shape.value)}
      </p>
      {caption && <p className="mt-2 text-[13px] text-george-slate">{caption}</p>}
    </div>
  );
}

/**
 * Several figures read across rather than down.
 *
 * A GROUP IS A LAYOUT, NOT A CALCULATION. Its members are whole results of
 * their own, put side by side because resultShape found them to be measures of
 * the SAME scope — same window, same filters, same store argument. Nothing is
 * summed, ratioed or ranked across them; if a fourth number were derived from
 * the other three it would be a definition, and definitions live in
 * metrics.yaml behind vetted SQL.
 *
 * The heading is derived from the calls' own arguments and meta, never from
 * George's prose — see resultShape.groupHeading.
 *
 * ONE COLUMN ON A PHONE. Three figures abreast on 390px is three figures
 * nobody can read (UI rule 7).
 */
export function MetricGroup({
  heading,
  children,
}: {
  heading?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      {heading && (
        <p className="mb-3 text-[11px] uppercase tracking-wider text-george-muted">{heading}</p>
      )}
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- comparison -- */

/**
 * The delta beside a figure — the arrow, the percentage, and what it is against.
 *
 * NO COLOUR CARRIES THE DIRECTION. Down is not red and up is not green: this
 * app has one meaningful colour and it means "needs you". A fall in sales is
 * information, and whether it is bad depends on the question. The arrow and the
 * sign say which way it went; the reader decides what that is worth.
 *
 * The percentage is `change_pct` off the row, printed. It is not recomputed
 * from value and baseline, because the tool's rounding is the tool's to own.
 */
export function Delta({ row }: { row: ComparisonRow }) {
  const arrow = row.direction === 'up' ? '↑' : '↓';
  return (
    <p className="mt-2 text-[13px] tabular-nums text-george-slate">
      <span aria-hidden>{arrow}</span>{' '}
      <span className="text-george-navy">{Math.abs(row.changePct).toLocaleString('en-PH')}%</span>
      {row.baseline !== undefined && (
        <>
          {' from '}
          {unitPrefix(row.unit)}
          {fmt(row.baseline)}
        </>
      )}
    </p>
  );
}

/**
 * A result whose rows arrived with their own deltas.
 *
 * One subject per row: the figure, then how it moved. Read down, because these
 * are usually stores and a reader scans a list of names — the group above reads
 * across because those are different measures of one thing.
 */
export function Comparison({
  shape,
  size = 'default',
}: {
  shape: Extract<Shape, { kind: 'comparison' }>;
  size?: MetricSize;
}) {
  return (
    <div className="space-y-5">
      {shape.rows.map((row, i) => (
        <div key={`${row.subject}-${i}`}>
          {row.subject && (
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-george-muted">
              {row.subject}
            </p>
          )}
          <p
            className={`font-george-serif leading-none tabular-nums text-george-navy ${
              FIGURE[shape.rows.length > 1 ? 'grouped' : size]
            }`}
          >
            {unitPrefix(row.unit)}
            {fmt(row.value)}
          </p>
          <Delta row={row} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- table -- */

/**
 * A small table.
 *
 * Stacks on a phone rather than scrolling: each row becomes a block and each
 * cell is labelled with its column, so nothing is truncated and no figure
 * ends up off the right edge. Same treatment a markdown table gets in an
 * answer — see proseTable.ts for why the two differ only in who supplies the
 * labels.
 *
 * Lifted out of PinTile unchanged, so a table on a page and a table in an
 * answer are now the same table rather than two that agreed.
 */
export function ResultTable({
  shape,
  fullCount,
}: {
  shape: Extract<Shape, { kind: 'table' }>;
  fullCount?: number;
}) {
  const shown = shape.rows.length;
  const label = (c: string) => c.replace(/_/g, ' ');
  return (
    <div>
      <table className="w-full text-[13px]">
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-george-line text-left text-[11px] uppercase tracking-wide text-george-muted">
            {shape.columns.map((c) => (
              <th key={c} className="py-1.5 pr-3 font-medium">{label(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shape.rows.map((r, i) => (
            <tr
              key={i}
              className="block border-b border-george-line/60 py-2 last:border-0 sm:table-row sm:py-0"
            >
              {shape.columns.map((c, j) => (
                <td
                  key={c}
                  className="flex items-baseline justify-between gap-3 py-0.5 tabular-nums text-george-navy sm:table-cell sm:py-1.5 sm:pr-3"
                >
                  {/* The column name travels with the cell on a phone, where
                      the header row is gone. */}
                  <span className="text-[11px] uppercase tracking-wide text-george-muted sm:hidden">
                    {label(c)}
                  </span>
                  <span className={j === 0 ? 'font-medium sm:font-normal' : ''}>{fmt(r[c])}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {fullCount !== undefined && fullCount > shown && (
        // Never let a partial list read as a total.
        <p className="mt-2 text-[11px] text-george-muted">
          {shown} of {fullCount.toLocaleString('en-PH')} rows
        </p>
      )}
    </div>
  );
}
