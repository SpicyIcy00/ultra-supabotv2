/**
 * The first V2 instruments: Delta Ranking, Driver Split, Coverage Strip.
 *
 * INSTRUMENTS, NOT CHARTS, and the difference is what they refuse. A chart
 * draws a series. Each of these draws one specific thing a tool computed and
 * declines to draw anything the tool did not: a ranking keeps the tool's
 * order and lengths its bars by change in the metric's unit, never by
 * percentage; a driver split puts two measured movements on one axis and
 * never stacks them into a share; a coverage strip counts states and never
 * pretends to be a gauge. The rules are in instrumentShape.ts, where the suite
 * holds them without a DOM. This file draws what it is handed.
 *
 * NO COLOUR CARRIES MEANING YET. Position does: bars diverge from a drawn zero
 * line, so a fall reads as a fall by where it sits, and hatching says
 * "unmeasured". Stage 5 adds the semantic data tokens on top of that, never
 * instead of it — colour must never be the only carrier (dataviz: a legend or
 * a label, always; ~8% of men cannot separate red from green).
 *
 * TEXT WEARS TEXT TOKENS. Every figure printed here is navy or slate ink,
 * tabular, beside its mark. Nothing is printed in a series colour.
 *
 * MARKS. Thin, ends anchored to the zero line and rounded away from it, a
 * two-pixel gap between neighbours. Plain SVG and CSS rather than a charting
 * library: there is nothing here a library would decide better, and a
 * ranking of eight rows must render identically live, stored and pinned
 * (UI rule 3), which is easier to hold with no layout engine in between.
 */
import type { ToolMeta } from '../../types/george';
import { fmt, unitPrefix, type ComparisonRow, type Shape } from './pinShape';
import type { ShapedResult } from './resultShape';
import {
  driverSplitLayout,
  rankingCaption,
  rankingLayout,
  type Coverage,
} from './instrumentShape';

/** A signed change, in the row's unit, printed. */
function signedChange(row: ComparisonRow): string {
  if (typeof row.change !== 'number') return '—';
  const sign = row.change < 0 ? '−' : row.change > 0 ? '+' : '';
  return `${sign}${unitPrefix(row.unit)}${fmt(Math.abs(row.change))}`;
}

function signedPct(pct: number | null): string {
  if (pct === null) return '';
  const sign = pct < 0 ? '−' : pct > 0 ? '+' : '';
  return `${sign}${Math.abs(pct).toLocaleString('en-PH')}%`;
}

/**
 * One bar on a diverging track.
 *
 * The track is the full width; the bar is placed from the zero line outward,
 * by the extent the layout gave it. A negative bar ends at the zero line and
 * reaches left; a positive one starts there and reaches right. The zero line
 * itself is drawn once, by the parent, down the whole list.
 */
function DivergingBar({
  zero,
  extent,
  negative,
  label,
}: {
  zero: number;
  extent: number;
  negative: boolean;
  label: string;
}) {
  const width = extent * (negative ? zero : 1 - zero) * 100;
  const left = negative ? (zero - extent * zero) * 100 : zero * 100;
  return (
    <div className="relative h-[14px] w-full" role="img" aria-label={label}>
      <div
        data-bar
        data-direction={negative ? 'down' : 'up'}
        className={`absolute top-0 h-full bg-george-navy ${
          negative ? 'rounded-l-[4px]' : 'rounded-r-[4px]'
        }`}
        style={{ left: `${left}%`, width: `${Math.max(width, extent > 0 ? 0.5 : 0)}%` }}
      />
    </div>
  );
}

/* ---------------------------------------------------------- ranking -- */

/**
 * Where the change is concentrated.
 *
 * Rows in the tool's order, one line each: the subject, the bar, the change
 * and its percentage. Below the axis, the subjects the tool could not rank —
 * a product that vanished, a product that is new — named with the figure
 * they do have and given no bar, because a bar of length zero would read as
 * "no change", which is the opposite of what happened to them.
 */
export function DeltaRanking({
  shape,
  size = 'default',
}: {
  shape: Extract<Shape, { kind: 'ranking' }>;
  size?: 'lead' | 'default';
}) {
  const layout = rankingLayout(shape.rows);
  const nr = shape.notRanked;
  return (
    <figure>
      <figcaption className="mb-3 text-[11px] uppercase tracking-wider text-george-muted">
        {shape.label ? `${shape.label} · ` : ''}
        {rankingCaption(shape)}
      </figcaption>

      <div className="relative">
        {/* The zero line, once, down the whole list. */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-george-slate"
          style={{ left: `calc(${(0.3 + layout.zero * 0.45) * 100}% )` }}
        />
        <ol className="space-y-[2px]">
          {layout.bars.map((bar, i) => (
            <li
              key={`${bar.row.subject}-${i}`}
              className="grid items-center gap-x-3"
              style={{ gridTemplateColumns: '30% 45% 25%' }}
            >
              <span className="truncate text-[13px] text-george-navy">{bar.row.subject}</span>
              <DivergingBar
                zero={layout.zero}
                extent={bar.extent}
                negative={bar.negative}
                label={`${bar.row.subject}: ${signedChange(bar.row)}`}
              />
              <span
                className={`text-right tabular-nums text-george-navy ${
                  size === 'lead' ? 'text-[15px]' : 'text-[13px]'
                }`}
              >
                {signedChange(bar.row)}
                <span className="ml-1.5 text-[11px] text-george-slate">
                  {signedPct(bar.row.changePct)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {nr && (nr.noCurrent.length > 0 || nr.noBaseline.length > 0) && (
        <div className="mt-3 border-t border-george-line pt-2 text-[12px] leading-relaxed text-george-slate">
          <span className="text-george-navy">Not ranked</span>
          {' — no change to rank by. '}
          {nr.noCurrent.length > 0 && (
            <span>
              Nothing this period:{' '}
              {nr.noCurrent.map((s) => `${s.subject} (was ${unitPrefix(s.unit)}${fmt(s.baseline)})`).join(', ')}
              {(nr.counts.no_current ?? 0) > nr.noCurrent.length &&
                ` and ${(nr.counts.no_current ?? 0) - nr.noCurrent.length} more`}
              .{' '}
            </span>
          )}
          {nr.noBaseline.length > 0 && (
            <span>
              New this period:{' '}
              {nr.noBaseline.map((s) => `${s.subject} (${unitPrefix(s.unit)}${fmt(s.value)})`).join(', ')}
              {(nr.counts.no_baseline ?? 0) > nr.noBaseline.length &&
                ` and ${(nr.counts.no_baseline ?? 0) - nr.noBaseline.length} more`}
              .
            </span>
          )}
        </div>
      )}
    </figure>
  );
}

/* ----------------------------------------------------- driver split -- */

/**
 * Which driver moved more.
 *
 * One row per driver, each its own bar on a SHARED percentage axis, so the
 * eye compares two lengths and nothing else. Never stacked: a stacked bar
 * asserts the two add to the whole, and metrics.yaml records that split as
 * `attribution_math: not_supported`. Never a total, never a share. The
 * identity under the figure is the definitions' own sentence — the ATP
 * formula rearranged — and it is the only thing here the tool did not return
 * as a row.
 */
export function DriverSplit({
  members,
  identity,
}: {
  members: ShapedResult[];
  identity?: string | null;
}) {
  const layout = driverSplitLayout(members);
  return (
    <figure data-instrument="driver-split">
      <figcaption className="mb-3 text-[11px] uppercase tracking-wider text-george-muted">
        Change against the previous period · one axis
      </figcaption>
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-george-slate"
          style={{ left: `calc(${(0.3 + layout.zero * 0.45) * 100}% )` }}
        />
        <ol className="space-y-2">
          {layout.bars.map((bar) => (
            <li
              key={bar.label}
              className="grid items-center gap-x-3"
              style={{ gridTemplateColumns: '30% 45% 25%' }}
            >
              <span className="truncate text-[13px] text-george-navy">{bar.label}</span>
              <DivergingBar
                zero={layout.zero}
                extent={bar.extent}
                negative={bar.negative}
                label={`${bar.label}: ${signedPct(bar.row.changePct)}`}
              />
              <span className="text-right text-[13px] tabular-nums text-george-navy">
                {signedPct(bar.row.changePct)}
                <span className="ml-1.5 text-[11px] text-george-slate">
                  {unitPrefix(bar.row.unit)}
                  {fmt(bar.row.value)}
                  {bar.row.baseline !== undefined && ` from ${unitPrefix(bar.row.unit)}${fmt(bar.row.baseline)}`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      {identity && (
        <p className="mt-3 text-[11px] text-george-muted">
          {identity} — the definitions' identity, not a split of the change.
        </p>
      )}
    </figure>
  );
}

/* --------------------------------------------------------- coverage -- */

/**
 * How much of this was measured.
 *
 * A strip of counts. Measured segments are solid; unmeasured are hatched —
 * texture, so the state survives print, forced colours and a reader who cannot
 * separate hues — and every segment is named with its count beside the strip.
 * It is never a percentage of anything but its own rows, and it never says
 * "full".
 */
export function CoverageStrip({ coverage, caption }: { coverage: Coverage; caption?: string }) {
  const id = `hatch-${Math.abs(caption?.length ?? 0)}`;
  return (
    <figure data-instrument="coverage" className="mt-3">
      <svg
        role="img"
        aria-label={`${coverage.measured} of ${coverage.total} measured`}
        viewBox="0 0 100 6"
        preserveAspectRatio="none"
        className="block h-[6px] w-full"
      >
        <defs>
          <pattern id={id} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="3" stroke="currentColor" strokeWidth="1" className="text-george-slate" />
          </pattern>
        </defs>
        {(() => {
          let x = 0;
          return coverage.segments.map((seg, i) => {
            const w = (seg.count / coverage.total) * 100;
            const gap = i < coverage.segments.length - 1 ? 0.6 : 0;
            const el = (
              <rect
                key={seg.key}
                data-segment={seg.key}
                data-measured={seg.measured ? 'true' : 'false'}
                x={x}
                y="0"
                width={Math.max(0, w - gap)}
                height="6"
                fill={seg.measured ? 'currentColor' : `url(#${id})`}
                className={seg.measured ? 'text-george-navy' : 'text-george-slate'}
              />
            );
            x += w;
            return el;
          });
        })()}
      </svg>
      <figcaption className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-george-slate">
        {caption && <span className="text-george-navy">{caption}</span>}
        {coverage.segments.map((seg) => (
          <span key={seg.key}>
            <span className="tabular-nums text-george-navy">{seg.count}</span> {seg.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** For a comparison block: the strip, or nothing, from its own meta. */
export function ComparisonCoverage({ meta, coverage }: { meta?: ToolMeta; coverage: Coverage | null }) {
  if (!coverage) return null;
  const label = meta?.comparison?.display_name ? `Compared ${meta.comparison.display_name}` : undefined;
  return <CoverageStrip coverage={coverage} caption={label} />;
}
