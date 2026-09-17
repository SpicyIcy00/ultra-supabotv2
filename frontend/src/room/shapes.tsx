/**
 * THE ELEVEN SHAPES P2S.3 ADDED — bar, small multiples, area, stacked, pie,
 * scatter, heatmap, calendar, waterfall, treemap and gauge.
 *
 * The owner, 2026-09-16: *"it should have the ability to make all those
 * different kinds of charts and visualizations like pie and others cause if it
 * builds a dashboard it needs that"*. The design draws them as static SVG with
 * coordinates typed by hand for one scene (`ops/ideal/george-ahead-of-me.html`,
 * the `vocab` scene); here each is drawn from the rows a tool returned.
 *
 * THE SAME RULES THE SIX KEEP, and nothing looser:
 *
 *   - NOTHING HERE COMPUTES A BUSINESS FIGURE. Every number drawn is a value
 *     a tool returned, formatted. A slice's angle, a stack's length, a
 *     waterfall step's position and a cell's brightness are GEOMETRY — a
 *     value against the others in the same read — and none of them is ever
 *     printed: no share of a whole, no running total, no stack total.
 *   - COLOUR IS DIRECTION OR EMPHASIS (`catalogue.DATA_COLOURS`). Parts of a
 *     whole are told apart by STEPS of one ink, never by a hue per part; a
 *     store's hue is its swatch, beside its name (P2S.2(e)).
 *   - EVERY MARK ANSWERS A TOUCH. `data-v` on each slice, cell, dot and bar
 *     says its exact figure; the tip adds when it was read.
 *   - WHAT A READ DID NOT RETURN IS DRAWN AS NOTHING, not as zero: a day with
 *     no row is an empty cell, a pair with no row an outlined one.
 */
import type { CSSProperties } from 'react';
import {
  changeOf, dimensionOf, fmt, measureOf, subjectOf, unitOf, valueOf,
} from './data';
import {
  changeIfAny, colourOf, keysOf, nameKeyOf, orderKeyOf, type Mark,
} from './catalogue';
import { MissingRow, isLit, type TileProps } from './tiles';
import {
  COOL, RowName, beat, emphasised, moved, paint, told, wash, type Meta, type Offering, type Row,
} from './markParts';

type O = TileProps['o'];
interface ShapeProps extends Offering {
  rows: Row[];
  meta: Meta;
  o: O;
}

/* ---------------------------------------------------------------- reading */

const num = (r: Row): number => Number(valueOf(r)?.value ?? 0);

function figureKey(rows: Row[]): string {
  return valueOf(rows[0] ?? {})?.key ?? 'value';
}

function unitFor(rows: Row[], meta: Meta): string | null {
  return unitOf(rows[0]) ?? unitOf(meta);
}

/** The name a row goes by, from the column the whole read is named by. */
function nameOf(rows: Row[], r: Row): string {
  const key = nameKeyOf(rows);
  return String((key ? r[key] : null) ?? subjectOf(r) ?? '');
}

/** An order's values, ascending: numbers as numbers, dates and words as text. */
function ordered(values: unknown[]): unknown[] {
  const unique = Array.from(new Set(values.map((v) => JSON.stringify(v)))).map((v) => JSON.parse(v));
  return unique.sort((a, b) => (typeof a === 'number' && typeof b === 'number'
    ? a - b : String(a).localeCompare(String(b))));
}

/** Names in the order the tool returned them — its ranking, never ours. */
function inReadOrder(rows: Row[], key: string): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const v = String(r[key]);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function label(v: unknown): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(`${v.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? v
      : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  return String(v ?? '');
}

/**
 * A step of one ink, for the n-th part of a whole: parts told apart without a
 * hue. The ink is the one a row with no direction takes (`colourOf(null, lit)`).
 */
function step(n: number, lit: boolean): string {
  const strengths = [0.92, 0.7, 0.54, 0.42, 0.32, 0.24];
  return wash(colourOf(null, lit), strengths[Math.min(n, strengths.length - 1)]);
}

/** Brightness for a value against the largest in the read — geometry only. */
function glow(v: number, most: number, lit: boolean): string {
  return wash(colourOf(null, lit), most > 0 ? 0.08 + 0.84 * Math.max(0, v) / most : 0.08);
}

function Scale({ low, high, note }: { low: string; high: string; note?: string | null }) {
  return (
    <div className="r-mk-ends">
      <span>{low}</span>
      {note && <span className="r-mk-key">{note}</span>}
      <span>{high}</span>
    </div>
  );
}

/* -------------------------------------------------------------------- bar */

/**
 * UPRIGHT BARS IN THE READ'S OWN ORDER, the period before as a tick on each
 * where the tool returned one. A few things side by side, when who is biggest
 * is not the point — that is `ranked`.
 */
function Bar({ rows, meta, o, onPick, picked }: ShapeProps) {
  const key = figureKey(rows);
  const unit = unitFor(rows, meta);
  const befores = rows.map((r) => (typeof r.baseline === 'number' ? r.baseline : null));
  const ends = [...rows.map(num), ...befores.filter((b): b is number => b !== null)];
  const low = Math.min(0, ...ends);
  const high = Math.max(1, ...ends);
  const span = high - low || 1;
  const at = (v: number) => ((v - low) / span) * 100;
  const zero = at(0);
  return (
    <div className="r-mk r-mk-bars" data-emphasis={emphasised(o) ? 'yes' : undefined}>
      <div className="r-mk-cols" style={{ '--mk-n': rows.length } as CSSProperties}>
        {rows.map((r, n) => {
          const v = num(r);
          const b = befores[n];
          const lit = isLit(o, r);
          const change = changeIfAny(r);
          const name = nameOf(rows, r);
          return (
            <div key={n} className="r-mk-col r-mk-in" data-lit={lit ? 'yes' : 'no'}
                 style={{ opacity: lit ? 1 : COOL, ...beat(n) }}>
              <span className="r-mk-colbar" role="img"
                    aria-label={`${name}: ${fmt(key, v, unit)}`}
                    data-v={told(name, fmt(key, v, unit), b !== null && `was ${fmt(key, b, unit)}`,
                                 moved(change))}>
                <i style={{ bottom: `${Math.min(zero, at(v))}%`, height: `${Math.abs(at(v) - zero)}%`,
                            background: paint(colourOf(change, lit)) }} />
                {b !== null && <b className="r-mk-tick" style={{ bottom: `${at(b)}%` }} />}
              </span>
              <RowName name={name} className="r-mk-name r-mk-colname"
                       dimension={dimensionOf(rows, name)} pickable={Boolean(name)}
                       onPick={onPick} picked={picked?.includes(name)} />
            </div>
          );
        })}
      </div>
      <Scale low={fmt(key, low, unit)} high={fmt(key, high, unit)}
             note={befores.some((b) => b !== null)
               ? `tick · ${meta?.comparison?.display_name ?? 'the period before'}` : null} />
    </div>
  );
}

/* -------------------------------------------------------------- multiples */

/** ONE SMALL LINE PER NAME, ON ONE SHARED SCALE — every store at a glance. */
function Multiples({ rows, meta, o, onPick, picked }: ShapeProps) {
  const nameKey = nameKeyOf(rows) as string;
  const orderKey = orderKeyOf(rows) as string;
  const key = figureKey(rows);
  const unit = unitFor(rows, meta);
  const order = ordered(rows.map((r) => r[orderKey]));
  const values = rows.map(num);
  const low = Math.min(0, ...values);
  const high = Math.max(1, ...values);
  const W = 160;
  const H = 46;
  const x = (i: number) => 3 + (i / Math.max(1, order.length - 1)) * (W - 6);
  const y = (v: number) => H - 3 - ((v - low) / (high - low || 1)) * (H - 6);
  const names = inReadOrder(rows, nameKey);
  return (
    <div className="r-mk r-mk-multiples-wrap" data-emphasis={emphasised(o) ? 'yes' : undefined}>
      <div className="r-mk-multiples">
        {names.map((name, n) => {
          const mine = rows.filter((r) => String(r[nameKey]) === name);
          const points = order.map((at) => mine.find((r) => JSON.stringify(r[orderKey]) === JSON.stringify(at)))
            .map((r, i) => (r ? { i, v: num(r), at: r[orderKey] } : null))
            .filter((p): p is { i: number; v: number; at: unknown } => p !== null);
          const lit = mine.some((r) => isLit(o, r));
          const c = paint(colourOf(changeIfAny(mine[mine.length - 1] ?? {}), lit));
          const last = points[points.length - 1];
          return (
            <div key={name} className="r-mk-multiple r-mk-in" data-lit={lit ? 'yes' : 'no'}
                 style={{ opacity: lit ? 1 : COOL, ...beat(n) }}>
              <RowName name={name} className="r-mk-name" dimension={dimensionOf(rows, name)}
                       pickable onPick={onPick} picked={picked?.includes(name)} />
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
                   aria-label={`${name}: ${points.length} points`} style={{ overflow: 'visible' }}>
                <polyline className="r-mk-series-line" fill="none" stroke={c} strokeWidth={1.5}
                          pathLength={1} points={points.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} />
                {last && <circle cx={x(last.i)} cy={y(last.v)} r={2.6} fill={c} />}
                {points.map((p) => (
                  <circle key={p.i} className="r-mk-hit" cx={x(p.i)} cy={y(p.v)} r={7} fill="none"
                          data-v={told(name, label(p.at), fmt(key, p.v, unit))} />
                ))}
              </svg>
            </div>
          );
        })}
      </div>
      <Scale low={label(order[0])} high={label(order[order.length - 1])}
             note={`one scale · ${fmt(key, low, unit)} to ${fmt(key, high, unit)}`} />
    </div>
  );
}

/* ------------------------------------------------------------------- area */

/** A MEASURE OVER AN ORDER, FILLED TO ZERO — how much, over time. */
function Area({ rows, meta, o, subject }: ShapeProps & { subject: string | null }) {
  const orderKey = orderKeyOf(rows) as string;
  const key = figureKey(rows);
  const unit = unitFor(rows, meta);
  const points = [...rows].sort((a, b) => {
    const [p, q] = [a[orderKey], b[orderKey]];
    return typeof p === 'number' && typeof q === 'number' ? p - q : String(p).localeCompare(String(q));
  });
  const values = points.map(num);
  const low = Math.min(0, ...values);
  const high = Math.max(1, ...values);
  const W = 560;
  const H = 128;
  const pad = 8;
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - low) / (high - low || 1)) * (H - pad * 2);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = points[points.length - 1] ?? {};
  const c = paint(colourOf(changeIfAny(last), isLit(o, last)));
  return (
    <div className="r-mk r-mk-area">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`${measureOf(meta, key)} over ${points.length} points`}
           style={{ display: 'block', overflow: 'visible' }}>
        <polygon className="r-mk-in" fill={c} fillOpacity={0.16}
                 points={`${x(0)},${y(0)} ${line} ${x(values.length - 1)},${y(0)}`} />
        <polyline className="r-mk-series-line" fill="none" stroke={c} strokeWidth={1.6}
                  pathLength={1} points={line} />
        {points.map((r, i) => (
          <circle key={i} className="r-mk-hit" cx={x(i)} cy={y(values[i])} r={8} fill="none"
                  data-v={told(subject, label(r[orderKey]), fmt(key, values[i], unit))} />
        ))}
      </svg>
      <Scale low={label(points[0]?.[orderKey])} high={label(last[orderKey])}
             note={`to ${fmt(key, high, unit)}`} />
    </div>
  );
}

/* ---------------------------------------------------------------- stacked */

/**
 * ONE BAR PER NAME, SPLIT INTO THE PARTS OF A SECOND GROUPING. The bar's
 * length is its parts laid end to end — geometry; its total is never printed,
 * because nobody read one.
 */
function Stacked({ rows, meta, o, onPick, picked }: ShapeProps) {
  const [barKey, partKey] = keysOf(rows);
  const key = figureKey(rows);
  const unit = unitFor(rows, meta);
  const bars = inReadOrder(rows, barKey);
  const parts = inReadOrder(rows, partKey);
  // The parts in the order of their size across the read, so the biggest part
  // is the darkest step everywhere. An ORDER, not a figure: nothing is drawn.
  const weight = new Map(parts.map((p) => [p, 0]));
  rows.forEach((r) => weight.set(String(r[partKey]), (weight.get(String(r[partKey])) ?? 0) + num(r)));
  const byWeight = [...parts].sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0));
  const lengths = bars.map((b) => rows.filter((r) => String(r[barKey]) === b)
    .reduce((s, r) => s + Math.max(0, num(r)), 0));
  const longest = Math.max(1, ...lengths);
  const shownParts = byWeight.slice(0, 6);
  return (
    <div className="r-mk r-mk-stacked" data-emphasis={emphasised(o) ? 'yes' : undefined}>
      {bars.map((bar, n) => {
        const mine = rows.filter((r) => String(r[barKey]) === bar)
          .sort((a, b) => byWeight.indexOf(String(a[partKey])) - byWeight.indexOf(String(b[partKey])));
        const lit = mine.some((r) => isLit(o, r));
        return (
          <div key={bar} className="r-mk-row" data-lit={lit ? 'yes' : 'no'}
               style={{ opacity: lit ? 1 : COOL, ...beat(n) }}>
            <RowName name={bar} className="r-mk-name r-mk-name--left" dimension={dimensionOf(rows, bar)}
                     pickable onPick={onPick} picked={picked?.includes(bar)} />
            <span className="r-mk-bar r-mk-bar--stack" role="img"
                  aria-label={`${bar}: ${mine.length} parts`}>
              {mine.map((r) => {
                const part = String(r[partKey]);
                return (
                  <i key={part}
                     style={{ width: `${(Math.max(0, num(r)) / longest) * 100}%`,
                              background: step(byWeight.indexOf(part), lit) }}
                     data-v={told(bar, part, fmt(key, num(r), unit))} />
                );
              })}
            </span>
          </div>
        );
      })}
      <p className="r-mk-parts">
        {shownParts.map((part, n) => (
          <span key={part}><i style={{ background: step(n, true) }} />{part}</span>
        ))}
        {byWeight.length > shownParts.length && (
          <span><i style={{ background: step(6, true) }} />{byWeight.length - shownParts.length} more parts, faintest</span>
        )}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- pie */

function arc(cx: number, cy: number, r: number, inner: number, a0: number, a1: number): string {
  const p = (rad: number, angle: number) => [cx + rad * Math.sin(angle), cy - rad * Math.cos(angle)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r, a0);
  const [x1, y1] = p(r, a1);
  const [x2, y2] = p(inner, a1);
  const [x3, y3] = p(inner, a0);
  return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${inner},${inner} 0 ${large} 0 ${x3},${y3} Z`;
}

/**
 * EACH ROW A SLICE OF ONE WHOLE, drawn only when asked. The slices carry no
 * figure and no percentage — a share is a division nobody's tool made — and
 * the exact value is under a touch.
 */
function Pie({ rows, meta, o, onPick, picked }: ShapeProps) {
  const key = figureKey(rows);
  const unit = unitFor(rows, meta);
  const values = rows.map((r) => Math.max(0, num(r)));
  const whole = values.reduce((s, v) => s + v, 0) || 1;
  let at = 0;
  const S = 168;
  return (
    <div className="r-mk r-mk-pie" data-emphasis={emphasised(o) ? 'yes' : undefined}>
      <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img"
           aria-label={`${rows.length} parts of one whole`}>
        {rows.map((r, n) => {
          const from = at;
          at += (values[n] / whole) * Math.PI * 2;
          const name = nameOf(rows, r);
          const lit = isLit(o, r);
          const end = Math.min(at, from + Math.PI * 2 - 0.0001);
          return (
            <path key={n} className="r-mk-in" d={arc(S / 2, S / 2, S / 2 - 2, S / 2 - 30, from, end)}
                  fill={step(n, lit)} stroke="var(--ground)" strokeWidth={1.5}
                  style={beat(n)} data-v={told(name, fmt(key, values[n], unit))} />
          );
        })}
      </svg>
      <div className="r-mk-legend">
        {rows.map((r, n) => {
          const name = nameOf(rows, r);
          const lit = isLit(o, r);
          return (
            <div key={n} className="r-mk-legrow" data-lit={lit ? 'yes' : 'no'}
                 style={{ opacity: lit ? 1 : COOL }}>
              <i style={{ background: step(n, lit) }} />
              <RowName name={name} className="r-mk-name r-mk-name--left" dimension={dimensionOf(rows, name)}
                       pickable onPick={onPick} picked={picked?.includes(name)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- scatter */

/** ONE DOT PER ROW AT TWO MEASURES OF THAT SAME ROW: `field` up, `against` across. */
function Scatter({ rows, meta, o }: ShapeProps) {
  const field = o.field as string;
  const against = o.against as string;
  const unit = unitFor(rows, meta);
  const xs = rows.map((r) => Number(r[against]));
  const ys = rows.map((r) => Number(r[field]));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const W = 560;
  const H = 220;
  const pad = 14;
  const x = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - y0) / (y1 - y0 || 1)) * (H - pad * 2);
  const words = (col: string) => col.replace(/_/g, ' ');
  return (
    <div className="r-mk r-mk-scatter" data-emphasis={emphasised(o) ? 'yes' : undefined}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`${rows.length} rows by ${words(field)} and ${words(against)}`}
           style={{ display: 'block', overflow: 'visible' }}>
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--edge-strong)" />
        <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="var(--edge-strong)" />
        {rows.map((r, n) => {
          const name = nameOf(rows, r);
          const lit = isLit(o, r);
          return (
            <g key={n}>
              <circle className="r-mk-in" cx={x(xs[n])} cy={y(ys[n])} r={lit && emphasised(o) ? 5 : 3.6}
                      fill={paint(colourOf(changeIfAny(r), lit))} fillOpacity={lit ? 0.95 : 0.55}
                      style={beat(Math.min(n, 12))} />
              <circle className="r-mk-hit" cx={x(xs[n])} cy={y(ys[n])} r={8} fill="none"
                      data-v={told(name, `${words(field)} ${fmt(field, ys[n], unit)}`,
                                   `${words(against)} ${fmt(against, xs[n], unit)}`)} />
              {lit && emphasised(o) && (
                <text x={x(xs[n]) + 8} y={y(ys[n]) - 6} className="r-mk-point">{name}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="r-mk-ends">
        <span>{words(against)} {fmt(against, x0, unit)} → {fmt(against, x1, unit)}</span>
        <span>{words(field)} {fmt(field, y0, unit)} → {fmt(field, y1, unit)}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- heatmap */

/** A GRID OF TWO GROUPINGS, each cell's brightness its value — where in the day. */
function Heatmap({ rows, meta, o, onPick, picked }: ShapeProps) {
  const [rowKey, colKey] = keysOf(rows);
  const key = figureKey(rows);
  const unit = unitFor(rows, meta);
  const names = inReadOrder(rows, rowKey);
  const cols = ordered(rows.map((r) => r[colKey]));
  const most = Math.max(0, ...rows.map(num));
  const every = cols.length > 12 ? Math.ceil(cols.length / 8) : 1;
  const cell = new Map(rows.map((r) => [`${String(r[rowKey])}|${JSON.stringify(r[colKey])}`, r]));
  return (
    <div className="r-mk r-mk-heat" data-emphasis={emphasised(o) ? 'yes' : undefined}
         style={{ '--mk-cols': cols.length } as CSSProperties}>
      <span />
      {cols.map((c, i) => (
        <span key={i} className="r-mk-heat-col">{i % every === 0 ? label(c) : ''}</span>
      ))}
      {names.map((name, n) => {
        const lit = rows.some((r) => String(r[rowKey]) === name && isLit(o, r));
        return [
          <RowName key={`n-${name}`} name={name} className="r-mk-name r-mk-name--left"
                   dimension={dimensionOf(rows, name)} pickable onPick={onPick}
                   picked={picked?.includes(name)} />,
          ...cols.map((c, i) => {
            const r = cell.get(`${name}|${JSON.stringify(c)}`);
            return (
              <i key={`${name}-${i}`} className={`r-mk-cell r-mk-in${r ? '' : ' r-mk-cell--none'}`}
                 style={{ background: r ? glow(num(r), most, true) : undefined,
                          opacity: lit ? 1 : COOL, ...beat(n) }}
                 data-v={r ? told(name, `${colKey} ${label(c)}`, fmt(key, num(r), unit))
                   : told(name, `${colKey} ${label(c)}`, 'no row in this read')} />
            );
          }),
        ];
      })}
    </div>
  );
}

/* --------------------------------------------------------------- calendar */

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * THE DAYS AS WEEKS, MONDAY TO SUNDAY, each day's brightness its value. A day
 * inside the read's span with no row is drawn EMPTY — the read has nothing
 * for it, which is not the same as a zero.
 */
function Calendar({ rows, meta, o }: ShapeProps) {
  const dateKey = ['day', 'date', 'snapshot_date'].find((k) => typeof rows[0]?.[k] === 'string') as string;
  const key = figureKey(rows);
  const unit = unitFor(rows, meta);
  const byDay = new Map(rows.map((r) => [String(r[dateKey]).slice(0, 10), r]));
  const days = [...byDay.keys()].sort();
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const first = ms(days[0]);
  const last = ms(days[days.length - 1]);
  const DAY = 86_400_000;
  const monday = first - (((new Date(first).getUTCDay() + 6) % 7) * DAY);
  const most = Math.max(0, ...rows.map(num));
  const cells: { iso: string; inside: boolean }[] = [];
  for (let t = monday; t <= last || cells.length % 7 !== 0; t += DAY) {
    cells.push({ iso: new Date(t).toISOString().slice(0, 10), inside: t >= first && t <= last });
  }
  return (
    <div className="r-mk r-mk-calendar">
      {WEEKDAYS.map((d, i) => <span key={`h${i}`} className="r-mk-heat-col">{d}</span>)}
      {cells.map(({ iso, inside }, i) => {
        const r = byDay.get(iso);
        const lit = r ? isLit(o, r) : true;
        return (
          <i key={iso} className={`r-mk-day r-mk-in${!inside ? ' r-mk-day--out' : r ? '' : ' r-mk-cell--none'}`}
             style={{ background: r ? glow(num(r), most, true) : undefined, opacity: lit ? 1 : COOL,
                      ...beat(Math.floor(i / 7)) }}
             data-v={inside ? told(label(iso), r ? fmt(key, num(r), unit) : 'no row in this read') : undefined}>
            <small>{Number(iso.slice(8, 10))}</small>
          </i>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- waterfall */

/**
 * A BRIDGE: each row's signed change stepped from where the one before ended.
 * Each step's figure is the tool's own change; where the steps end is
 * geometry and is never printed as a total.
 */
function Waterfall({ rows, meta, o, onPick, picked }: ShapeProps) {
  const unit = unitOf(rows[0]) ?? unitOf(meta);
  const changes = rows.map((r) => Number(r.change));
  const starts: number[] = [];
  let run = 0;
  for (const c of changes) { starts.push(run); run += c; }
  const ends = [0, ...starts, run];
  const low = Math.min(...ends);
  const high = Math.max(...ends);
  const span = high - low || 1;
  const x = (v: number) => ((v - low) / span) * 100;
  return (
    <div className="r-mk r-mk-contributors r-mk-waterfall" data-emphasis={emphasised(o) ? 'yes' : undefined}>
      {rows.map((r, n) => {
        const lit = isLit(o, r);
        const c = changes[n];
        const [a, b] = [starts[n], starts[n] + c];
        const name = nameOf(rows, r) || String(n + 1);
        return (
          <div key={n} className="r-mk-row" data-lit={lit ? 'yes' : 'no'}
               style={{ opacity: lit ? 1 : COOL, ...beat(n) }}>
            <RowName name={name} className="r-mk-name r-mk-name--left" dimension={dimensionOf(rows, name)}
                     pickable={Boolean(nameOf(rows, r))} onPick={onPick} picked={picked?.includes(name)} />
            <span className="r-mk-bar r-mk-bar--step" role="img" aria-label={`${name}: ${fmt('change', c, unit)}`}
                  data-v={told(name, fmt('change', c, unit), moved(changeOf(r)))}>
              <b className="r-mk-zero" style={{ left: `${x(0)}%` }} />
              <i style={{ left: `${x(Math.min(a, b))}%`, width: `${Math.max(0.6, Math.abs(x(b) - x(a)))}%`,
                          background: paint(colourOf(changeIfAny(r), lit)) }} />
            </span>
            <span className="r-mk-fig"><b>{fmt('change', c, unit)}</b></span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- treemap */

interface Box { i: number; x: number; y: number; w: number; h: number }

/** Squarified rectangles for values already in descending order — geometry. */
function squarify(values: number[], W: number, H: number): Box[] {
  const out: Box[] = [];
  let [x, y, w, h] = [0, 0, W, H];
  const total = values.reduce((s, v) => s + v, 0) || 1;
  const scale = (W * H) / total;
  let row: number[] = [];
  let i = 0;
  const worst = (r: number[], side: number) => {
    const s = r.reduce((a, b) => a + b, 0) * scale;
    const [hi, lo] = [Math.max(...r) * scale, Math.min(...r) * scale];
    return Math.max((side * side * hi) / (s * s), (s * s) / (side * side * lo));
  };
  const lay = (r: number[], start: number) => {
    const s = r.reduce((a, b) => a + b, 0) * scale;
    if (w >= h) {
      const width = s / h;
      let yy = y;
      r.forEach((v, k) => { const hh = (v * scale) / width; out.push({ i: start + k, x, y: yy, w: width, h: hh }); yy += hh; });
      x += width; w -= width;
    } else {
      const height = s / w;
      let xx = x;
      r.forEach((v, k) => { const ww = (v * scale) / height; out.push({ i: start + k, x: xx, y, w: ww, h: height }); xx += ww; });
      y += height; h -= height;
    }
  };
  let start = 0;
  while (i < values.length) {
    const side = Math.min(w, h);
    const next = [...row, values[i]];
    if (!row.length || worst(next, side) <= worst(row, side)) {
      row = next; i += 1;
    } else {
      lay(row, start); start += row.length; row = [];
    }
  }
  if (row.length) lay(row, start);
  return out;
}

/** EACH ROW A RECTANGLE SIZED BY ITS VALUE — a mix, by size. Only when asked. */
function Treemap({ rows, meta, o }: ShapeProps) {
  const key = figureKey(rows);
  const unit = unitFor(rows, meta);
  const sortedRows = [...rows].sort((a, b) => num(b) - num(a)).filter((r) => num(r) > 0);
  const W = 560;
  const H = 240;
  const boxes = squarify(sortedRows.map(num), W, H);
  return (
    <div className="r-mk r-mk-treemap" data-emphasis={emphasised(o) ? 'yes' : undefined}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`${sortedRows.length} parts by size`} style={{ display: 'block' }}>
        {boxes.map((b) => {
          const r = sortedRows[b.i];
          const name = nameOf(rows, r);
          const lit = isLit(o, r);
          const fits = b.w > 54 && b.h > 20;
          return (
            <g key={b.i}>
              <rect className="r-mk-in" x={b.x} y={b.y} width={Math.max(0, b.w)} height={Math.max(0, b.h)}
                    fill={step(Math.min(b.i, 5), lit)} stroke="var(--ground)" strokeWidth={2}
                    style={beat(Math.min(b.i, 10))} data-v={told(name, fmt(key, num(r), unit))} />
              {fits && (
                <text x={b.x + 7} y={b.y + 15} className="r-mk-boxname"
                      fill={b.i < 2 ? 'var(--ground)' : 'var(--ink)'} pointerEvents="none">
                  {name.length * 6.2 > b.w - 10 ? `${name.slice(0, Math.max(1, Math.floor((b.w - 16) / 6.2)))}…` : name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ gauge */

/**
 * ONE ROW'S FIGURE AS AN ARC AND A BULLET, against a column of the SAME row —
 * its period before unless the block names another. Only when asked. Both ends
 * printed are values the tool returned; the arc's fill is geometry.
 */
function Gauge({ rows, meta, o }: ShapeProps) {
  const r = o.subject ? rows.find((x) => Object.values(x).includes(o.subject)) : rows[0];
  if (!r) return <MissingRow what={o.subject ?? 'a row'} />;
  const key = figureKey([r]);
  const unit = unitFor([r], meta);
  const against = o.against ?? 'baseline';
  const v = num(r);
  const a = Number(r[against]);
  const top = Math.max(v, a, 0) || 1;
  const c = paint(colourOf(changeIfAny(r), true));
  const turn = (f: number) => Math.PI * (1 - Math.max(0, Math.min(1, f)));
  const R = 70;
  const point = (f: number, rad = R) => [90 + rad * Math.cos(turn(f)), 84 - rad * Math.sin(turn(f))];
  const path = (f: number) => {
    const [x1, y1] = point(f);
    return `M20,84 A${R},${R} 0 0 1 ${x1},${y1}`;
  };
  const [tx0, ty0] = point(a / top, R - 9);
  const [tx1, ty1] = point(a / top, R + 9);
  const says = against === 'baseline'
    ? (meta?.comparison?.display_name ?? 'the period before') : against.replace(/_/g, ' ');
  return (
    <div className="r-mk r-mk-gauge">
      <svg viewBox="0 0 180 96" width={220} height={118} role="img"
           aria-label={`${fmt(key, v, unit)} against ${fmt(key, a, unit)}`}>
        <path d={path(1)} fill="none" stroke="var(--track)" strokeWidth={12} strokeLinecap="round" />
        <path className="r-mk-series-line" d={path(v / top)} fill="none" stroke={c} strokeWidth={12}
              strokeLinecap="round" pathLength={1}
              data-v={told(fmt(key, v, unit), `${says} ${fmt(key, a, unit)}`, moved(changeOf(r)))} />
        <line x1={tx0} y1={ty0} x2={tx1} y2={ty1} stroke="var(--ink)" strokeWidth={2} />
      </svg>
      <div className="r-mk-gauge-words">
        <span className="r-num r-mk-num" style={{ '--size': '30px' } as CSSProperties}>{fmt(key, v, unit)}</span>
        <p className="r-mk-measure">{measureOf(meta, key)} · {says} {fmt(key, a, unit)}</p>
      </div>
      <span className="r-mk-bar r-mk-bullet" role="img" aria-label="the same figure as a bullet"
            data-v={told(fmt(key, v, unit), `${says} ${fmt(key, a, unit)}`)}>
        <i style={{ width: `${(Math.max(0, v) / top) * 100}%`, background: c }} />
        <b className="r-mk-tick r-mk-tick--across" style={{ left: `${(Math.max(0, a) / top) * 100}%` }} />
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- dispatch */

/** The shapes this file draws; the six stay in marks.tsx. */
export const SHAPES: Mark[] = ['bar', 'multiples', 'area', 'stacked', 'pie', 'scatter', 'heatmap',
                               'calendar', 'waterfall', 'treemap', 'gauge'];

export function Shape(p: ShapeProps & { mark: Mark; subject: string | null }) {
  switch (p.mark) {
    case 'bar': return <Bar {...p} />;
    case 'multiples': return <Multiples {...p} />;
    case 'area': return <Area {...p} />;
    case 'stacked': return <Stacked {...p} />;
    case 'pie': return <Pie {...p} />;
    case 'scatter': return <Scatter {...p} />;
    case 'heatmap': return <Heatmap {...p} />;
    case 'calendar': return <Calendar {...p} />;
    case 'waterfall': return <Waterfall {...p} />;
    case 'treemap': return <Treemap {...p} />;
    case 'gauge': return <Gauge {...p} />;
    default: return null;
  }
}
