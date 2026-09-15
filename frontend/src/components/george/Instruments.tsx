/**
 * The instruments: Subject Comparison, Delta Ranking, Performance, Coverage.
 *
 * INSTRUMENTS, NOT CHARTS, and the difference is what they refuse. A chart
 * draws a series. Each of these draws one specific thing a tool computed and
 * declines to draw anything the tool did not: a comparison keeps the tool's
 * order and says whether that order is by level; a ranking lengths its bars
 * by change in the unit, never by percentage; a performance set puts the
 * headline metrics on one axis and never sums them into a share; a coverage
 * strip counts states and never pretends to be a gauge. The rules live in
 * instrumentShape.ts, where the suite holds them without a DOM.
 *
 * ONE ROW FORM. Subject · bar · figure · delta, on a fixed grid, so a store
 * comparison, a product ranking and a metric set all read the same way and
 * the eye learns the form once. Density comes from the grid: seven stores are
 * seven rows of one line each, not seven paragraphs.
 *
 * COLOUR REINFORCES; POSITION CARRIES. Bars diverge from a drawn zero line and
 * the signed figure is printed beside each, so a fall reads as a fall with no
 * colour at all. On a diverging bar only — never a level bar, never a bare
 * figure — a rise is `george-data-up` and a fall `george-data-down`, a pair
 * validated as separable by a reader who cannot separate red from green.
 *
 * SALIENCE IS THE DATA'S. A row is set heavier when the data establishes it
 * as the exception — it moved against the majority — or when it leads a
 * ranking by definition. Nothing else is emphasised, and no score decides.
 *
 * TEXT WEARS TEXT TOKENS. Every figure printed here is navy or slate ink,
 * tabular, beside its mark.
 */
import type { ToolMeta } from '../../types/george';
import { fmt, unitPrefix, type ComparisonRow, type Shape } from './pinShape';
import type { ShapedResult } from './resultShape';
import {
  coverageLine,
  levelCaption,
  levelLayout,
  performanceLayout,
  rankingCaption,
  rankingLayout,
  type Coverage,
} from './instrumentShape';

/* ------------------------------------------------------------ helpers -- */

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

function figure(row: ComparisonRow): string {
  return row.value === null ? '—' : `${unitPrefix(row.unit)}${fmt(row.value)}`;
}

/** The grid every row form shares: subject · bar · figures. */
const ROW_GRID = { gridTemplateColumns: 'minmax(6rem, 28%) minmax(0, 1fr) auto' } as const;

/**
 * One bar on a diverging track. The zero line is drawn once by the parent.
 */
function DivergingBar({
  zero,
  extent,
  negative,
  label,
  thick = false,
}: {
  zero: number;
  extent: number;
  negative: boolean;
  label: string;
  thick?: boolean;
}) {
  const width = extent * (negative ? zero : 1 - zero) * 100;
  const left = negative ? (zero - extent * zero) * 100 : zero * 100;
  return (
    <div className={`relative w-full ${thick ? 'h-[18px]' : 'h-[12px]'}`} role="img" aria-label={label}>
      <div
        data-bar
        data-direction={negative ? 'down' : 'up'}
        className={`absolute top-0 h-full ${
          negative ? 'rounded-l-[4px] bg-george-data-down' : 'rounded-r-[4px] bg-george-data-up'
        }`}
        style={{ left: `${left}%`, width: `${Math.max(width, extent > 0 ? 0.6 : 0)}%` }}
      />
    </div>
  );
}

/** A level bar: length is the value against the largest. Ink, never a hue. */
function LevelBar({ level, label }: { level: number; label: string }) {
  return (
    <div className="relative h-[12px] w-full" role="img" aria-label={label}>
      <div
        data-bar
        data-kind="level"
        className="absolute left-0 top-0 h-full rounded-r-[4px] bg-george-bar"
        style={{ width: `${Math.max(level * 100, level > 0 ? 0.6 : 0)}%` }}
      />
    </div>
  );
}

function ZeroLine({ zero }: { zero: number }) {
  return (
    <div
      aria-hidden
      data-zero-line
      className="pointer-events-none absolute bottom-0 top-0 w-px bg-george-slate/70"
      style={{ left: `calc(28% + (72% - 8.5rem) * ${zero})` }}
    />
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <figcaption className="mb-2.5 text-[11px] uppercase tracking-wider text-george-muted">
      {children}
    </figcaption>
  );
}

/* ------------------------------------------------- subject comparison -- */

/**
 * How subjects compare, by LEVEL.
 *
 * One row per subject: the name, a bar as long as its value is against the
 * largest, the value, and the delta the tool supplied with a small diverging
 * mark of its own. Ordered as the tool ordered — "largest first" when the
 * tool ranked by value, otherwise in its order — and captioned so, because
 * this is never a ranking by change and must not read as one.
 */
export function SubjectComparison({
  shape,
  meta,
  onSubject,
  isSelected,
}: {
  shape: Extract<Shape, { kind: 'comparison' }>;
  meta?: ToolMeta;
  /** A row's own follow-up, when the definitions allow one. */
  onSubject?: (subject: string) => void;
  /**
   * Which rows a person has selected, when this is drawn on a surface where
   * subjects can be selected (the desk). A selected row is set heavier and
   * carries `data-selected`, so the same subject reads the same whichever
   * representation the composer chose — colour is not involved.
   */
  isSelected?: (subject: string) => boolean;
}) {
  const layout = levelLayout(shape.rows, meta);
  return (
    <figure data-instrument="subject-comparison">
      <Caption>{levelCaption(layout, shape.label)}</Caption>
      <ol className="space-y-[3px]">
        {layout.bars.map((bar, i) => (
          <li
            key={`${bar.row.subject}-${i}`}
            data-subject={bar.row.subject}
            data-selected={isSelected?.(bar.row.subject) ? 'true' : undefined}
            data-exception={bar.exception ? 'true' : undefined}
            className={`grid items-center gap-x-3 rounded-sm py-[2px] ${
              isSelected?.(bar.row.subject) ? 'bg-george-paper ring-1 ring-george-navy/25' : bar.exception ? 'bg-george-paper' : ''
            }`}
            style={ROW_GRID}
          >
            <span className="min-w-0">
              {onSubject && bar.row.subject ? (
                <button
                  type="button"
                  onClick={() => onSubject(bar.row.subject)}
                  title={bar.row.subject}
                  className={`block max-w-full truncate text-left text-[13px] hover:underline ${
                    bar.exception ? 'font-medium text-george-navy' : 'text-george-navy'
                  }`}
                >
                  {bar.row.subject}
                </button>
              ) : (
                <span title={bar.row.subject} className={`block truncate text-[13px] ${bar.exception ? 'font-medium' : ''} text-george-navy`}>
                  {bar.row.subject}
                </span>
              )}
            </span>
            <LevelBar level={bar.level} label={`${bar.row.subject}: ${figure(bar.row)}`} />
            <span className="grid grid-cols-[6.5rem_4.5rem] items-baseline gap-x-2 text-right tabular-nums">
              <span className={`text-[14px] ${bar.exception ? 'font-medium' : ''} text-george-navy`}>{figure(bar.row)}</span>
              <span
                data-delta
                className={`text-[12px] ${
                  bar.row.changePct === null
                    ? 'text-george-muted'
                    : bar.exception
                      ? 'font-medium text-george-navy'
                      : 'text-george-slate'
                }`}
              >
                {bar.row.changePct === null ? missingDeltaWord(bar.row) : signedPct(bar.row.changePct)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function missingDeltaWord(row: ComparisonRow): string {
  switch (row.baselineStatus) {
    case 'no_baseline': return 'new';
    case 'zero_baseline': return 'from zero';
    case 'no_current': return 'none now';
    default: return 'n/a';
  }
}

/* ------------------------------------------------------------ ranking -- */

/**
 * Where the change is concentrated.
 *
 * Rows in the tool's order with bars diverging from one zero line, long in
 * proportion to the change in pesos. The first row leads by definition of
 * the mode and is set heavier. What could not be ranked is one compact line
 * below, named, with no bar — a bar of length zero would read as "no change",
 * the opposite of what happened to a product that vanished.
 */
export function DeltaRanking({
  shape,
  onSubject,
  isSelected,
}: {
  shape: Extract<Shape, { kind: 'ranking' }>;
  onSubject?: (subject: string) => void;
  /** Which rows are selected, on a surface where subjects can be. */
  isSelected?: (subject: string) => boolean;
}) {
  const layout = rankingLayout(shape.rows);
  const nr = shape.notRanked;
  const unranked = (nr?.counts.no_current ?? 0) + (nr?.counts.no_baseline ?? 0);
  return (
    <figure data-instrument="delta-ranking">
      <Caption>{shape.label ? `${shape.label} · ` : ''}{rankingCaption(shape)}</Caption>
      <div className="relative">
        <ZeroLine zero={layout.zero} />
        <ol className="space-y-[3px]">
          {layout.bars.map((bar, i) => (
            <li
              key={`${bar.row.subject}-${i}`}
              data-subject={bar.row.subject}
              data-selected={isSelected?.(bar.row.subject) ? 'true' : undefined}
              data-exception={bar.exception ? 'true' : undefined}
              className={`grid items-center gap-x-3 rounded-sm py-[2px] ${
                isSelected?.(bar.row.subject) ? 'bg-george-paper ring-1 ring-george-navy/25' : ''
              }`}
              style={ROW_GRID}
            >
              {onSubject && bar.row.subject ? (
                <button
                  type="button"
                  onClick={() => onSubject(bar.row.subject)}
                  title={bar.row.subject}
                  className={`block max-w-full truncate text-left text-[13px] text-george-navy hover:underline ${bar.exception ? 'font-medium' : ''}`}
                >
                  {bar.row.subject}
                </button>
              ) : (
                <span title={bar.row.subject} className={`block truncate text-[13px] text-george-navy ${bar.exception ? 'font-medium' : ''}`}>
                  {bar.row.subject}
                </span>
              )}
              <DivergingBar
                zero={layout.zero}
                extent={bar.extent}
                negative={bar.negative}
                thick={bar.exception}
                label={`${bar.row.subject}: ${signedChange(bar.row)}`}
              />
              <span className="grid grid-cols-[6.5rem_4.5rem] items-baseline gap-x-2 text-right tabular-nums">
                <span className={`text-[14px] text-george-navy ${bar.exception ? 'font-medium' : ''}`}>{signedChange(bar.row)}</span>
                <span className="text-[12px] text-george-slate">{signedPct(bar.row.changePct)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      {nr && unranked > 0 && (
        <details className="mt-2 text-[12px] text-george-slate">
          <summary className="cursor-pointer list-none">
            <span className="text-george-navy">{unranked} not ranked</span>
            {' — '}
            {[
              (nr.counts.no_baseline ?? 0) > 0 ? `${nr.counts.no_baseline} new` : null,
              (nr.counts.no_current ?? 0) > 0 ? `${nr.counts.no_current} none now` : null,
            ].filter(Boolean).join(', ')}
            <span className="ml-1.5 text-george-muted">Details</span>
          </summary>
          <div className="mt-1.5 space-y-0.5 pl-3 leading-relaxed">
            {nr.noCurrent.length > 0 && (
              <p>Nothing this period: {nr.noCurrent.map((s) => `${s.subject} (was ${unitPrefix(s.unit)}${fmt(s.baseline)})`).join(', ')}.</p>
            )}
            {nr.noBaseline.length > 0 && (
              <p>New this period: {nr.noBaseline.map((s) => `${s.subject} (${unitPrefix(s.unit)}${fmt(s.value)})`).join(', ')}.</p>
            )}
          </div>
        </details>
      )}
    </figure>
  );
}

/* ------------------------------------------------------- performance -- */

/**
 * How one subject did: its headline metrics, one axis.
 *
 * The first metric is the headline and is set large — it is the figure the
 * question was about. Under it, every metric of the set in one row form with
 * a bar on a SHARED percentage axis, so "traffic-led" or "basket-led" is a
 * comparison of two lengths and never a share. Never stacked, never summed:
 * attribution_math is not_supported. The identity under it is the
 * definitions' own sentence when there is one.
 */
export function Performance({
  members,
  identity,
  large = false,
}: {
  members: ShapedResult[];
  identity?: string | null;
  large?: boolean;
}) {
  const layout = performanceLayout(members);
  const head = layout.bars[0];
  return (
    <figure data-instrument="performance">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`font-george-serif leading-none tabular-nums text-george-navy ${large ? 'text-[54px]' : 'text-[40px]'}`}>
          {figure(head.row)}
        </span>
        <span className="text-[15px] tabular-nums text-george-navy">{signedPct(head.row.changePct)}</span>
        <span className="text-[13px] text-george-slate">
          {head.label}
          {head.row.baseline !== undefined && ` · from ${unitPrefix(head.row.unit)}${fmt(head.row.baseline)}`}
        </span>
      </div>
      <div className="relative">
        <ZeroLine zero={layout.zero} />
        <ol className="space-y-[3px]">
          {layout.bars.map((bar) => (
            <li key={bar.label} className="grid items-center gap-x-3 py-[2px]" style={ROW_GRID}>
              <span className="truncate text-[13px] text-george-navy">{bar.label}</span>
              <DivergingBar zero={layout.zero} extent={bar.extent} negative={bar.negative} label={`${bar.label}: ${signedPct(bar.row.changePct)}`} />
              <span className="grid grid-cols-[6.5rem_4.5rem] items-baseline gap-x-2 text-right tabular-nums">
                {/* The headline figure is printed large above; its row keeps
                    the bar and the delta and does not print it again. */}
                <span className="text-[13px] text-george-navy">{bar.headline ? '' : figure(bar.row)}</span>
                <span className="text-[12px] text-george-slate">{signedPct(bar.row.changePct)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      {identity && (
        <p className="mt-2.5 text-[11px] text-george-muted">
          {identity} — the definitions' identity, not a split of the change.
        </p>
      )}
    </figure>
  );
}

/** The drivers, drawn as the performance set they are. */
export function DriverSplit({ members, identity }: { members: ShapedResult[]; identity?: string | null }) {
  return <Performance members={members} identity={identity} />;
}

/* ---------------------------------------------------------- coverage -- */

export function CoverageStrip({ coverage, caption }: { coverage: Coverage; caption?: string }) {
  const id = `hatch-${coverage.total}-${coverage.measured}`;
  return (
    <figure data-instrument="coverage" className="mt-2">
      <svg role="img" aria-label={`${coverage.measured} of ${coverage.total} measured`} viewBox="0 0 100 6" preserveAspectRatio="none" className="block h-[6px] w-full">
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
              <rect key={seg.key} data-segment={seg.key} data-measured={seg.measured ? 'true' : 'false'} x={x} y="0" width={Math.max(0, w - gap)} height="6"
                fill={seg.measured ? 'currentColor' : `url(#${id})`} className={seg.measured ? 'text-george-navy' : 'text-george-slate'} />
            );
            x += w;
            return el;
          });
        })()}
      </svg>
      <figcaption className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-george-slate">
        {caption && <span className="text-george-navy">{caption}</span>}
        {coverage.segments.map((seg) => (
          <span key={seg.key}><span className="tabular-nums text-george-navy">{seg.count}</span> {seg.label}</span>
        ))}
      </figcaption>
    </figure>
  );
}

/**
 * A caveat as the data state it is: one line, the strip, the tool's full
 * sentence one tap down. Above the figure, never collapsible — what is
 * behind the tap is the LENGTH of the caveat, not the caveat.
 */
export function CoverageCaveat({ coverage, label, message, source }: { coverage: Coverage; label: string; message: string; source?: string }) {
  return (
    <div role="note" data-caveat="coverage" className="border-l-2 border-george-slate bg-george-paper px-3 py-2">
      <p className="text-[13px] text-george-navy">
        <span className="font-medium">{label}</span>
        <span className="ml-2 tabular-nums">{coverageLine(coverage)}</span>
      </p>
      <CoverageStrip coverage={coverage} />
      <details className="mt-1.5 text-[12px] text-george-slate">
        <summary className="cursor-pointer list-none text-george-muted">Details</summary>
        <p className="mt-1 leading-relaxed text-george-navy">{message}</p>
        {source && <p className="mt-1 text-[11px] text-george-muted">{source}</p>}
      </details>
    </div>
  );
}

/** For a compared block: the strip, or nothing, from its own meta. */
export function ComparisonCoverage({ meta, coverage }: { meta?: ToolMeta; coverage: Coverage | null }) {
  if (!coverage) return null;
  const label = meta?.comparison?.display_name ? `Compared ${meta.comparison.display_name}` : undefined;
  return <CoverageStrip coverage={coverage} caption={label} />;
}
