/**
 * THE SIX MARKS.
 *
 * One drawing each, and every one of them framed the same way: a title, a
 * subtitle off `meta`, the mark, and its own source line. The catalogue that
 * decides WHICH is `catalogue.ts`; this is only how each one is drawn.
 *
 * WHAT CHANGED, AND WHY, in the owner's own five failures (dogfood log,
 * 2026-09-13):
 *
 *   2. seven shops, seven hues     → colour is DIRECTION here. Identity keeps
 *                                    its hue where identity is the point; a
 *                                    row label already says which shop it is,
 *                                    so a hue per row was spent on nothing.
 *   3. a caption decoding the bars → the dumbbell. Two dots joined by a line
 *                                    reads without a sentence under it, which
 *                                    "the track is the period before · the
 *                                    fill is this one" did not.
 *   4. ₱556.6 / ₱545.91            → direct labels, on the mark, no legends.
 *   5. four tiles at equal weight  → the reading leads (P1.c) and these are
 *                                    its evidence; the one that matters is
 *                                    lit and the rest cool.
 *
 * NOTHING HERE COMPUTES A BUSINESS FIGURE. Every number drawn is a value a
 * tool returned, formatted; every length is that value against the largest
 * value in the same read; every colour is a direction the tool declared. The
 * one arithmetic on this page is a percentage of a maximum, which is a
 * geometry and not a figure — nobody reads it and no answer cites it.
 */
import type { CSSProperties } from 'react';
import type { ToolMeta } from '../types/george';
import {
  changeOf, fmt, measureOf, rowsOf, sorted, subjectOf, unitOf, valueOf,
  type Change,
} from './data';
import {
  changeIfAny, colourOf, figureOf, hasBaseline, markFor, subtitleFor, timeKeyOf, titleFor,
  type DataColour, type Mark,
} from './catalogue';
import {
  Delta, Missing, OwnCaveat, Receipts, Shell, callFor, isLit, kindOfRead,
  type TileProps,
} from './tiles';
import { ObjectPanel, kindOf } from './ObjectPanel';
import { dimensionOf } from './data';
import { hueFor } from './identity';

type Row = Record<string, unknown>;
/** The read's own `meta` — every subtitle and source line comes off it. */
type Meta = ToolMeta | null;

/** `rgb(var(--up))` and friends — the only colours a mark may paint with. */
function paint(c: DataColour): string {
  return `rgb(var(--${c}))`;
}

/** How brightly a cooled row sits. A row nobody pointed at is still readable. */
const COOL = 0.5;

/* ------------------------------------------------------------------ figure */

/**
 * ONE NUMBER, WHAT IT IS IN, AND WHICH WAY IT WENT.
 *
 * Where the read carried a before, the movement is drawn under it as a
 * one-row dumbbell rather than described — same mark, same reading, one row.
 */
function Figure(p: TileProps & { rows: Row[]; meta: Meta }) {
  const { rows, meta } = p;
  const row = p.o.subject ? rows.find((r) => Object.values(r).some(
    (v) => typeof v === 'string' && v.trim().toLowerCase() === p.o.subject!.trim().toLowerCase(),
  )) ?? rows[0] : rows[0];
  if (!row) return <Missing what={p.o.subject ?? 'a row'} />;
  const v = figureOf(row, meta);
  const change = changeOf(row);
  const size = p.o.weight === 'lead' ? 44 : p.o.weight === 'quiet' ? 26 : 34;
  return (
    <>
      <div className="r-mk-figure">
        <span className="r-num r-mk-num" style={{ '--size': `${size}px` } as CSSProperties}>
          {v ? fmt(v.key, v.value, v.unit) : '—'}
        </span>
        <Delta change={change} />
      </div>
      {v && measureOf(meta, v.key) && <p className="r-mk-measure">{measureOf(meta, v.key)}</p>}
      {hasBaseline([row]) && <Dumbbell rows={[row]} meta={meta} o={p.o} />}
    </>
  );
}

/* ---------------------------------------------------------------- dumbbell */

/**
 * BEFORE → AFTER, one row each: a hollow dot where it was, a filled dot where
 * it is, a line between them. The standard form for a paired change, and the
 * reason it is here is that it needs no caption to decode.
 *
 * THE BAND IS THE NOISE FLOOR, and only where the tool sent one. It is the one
 * threshold in this system that is a definition rather than a guess, so it may
 * be drawn — labelled "usual", never "healthy", because a range is where a
 * thing sits and not whether that is good.
 */
function Dumbbell({ rows, meta, o }: { rows: Row[]; meta: Meta; o: TileProps['o'] }) {
  const at = (r: Row) => Number(valueOf(r)?.value ?? 0);
  const before = (r: Row) => Number(r.baseline);
  const ends = rows.flatMap((r) => [at(r), before(r)]).filter(Number.isFinite);
  const low = Math.min(0, ...ends);
  const high = Math.max(1, ...ends);
  const span = high - low || 1;
  const x = (n: number) => `${(((n - low) / span) * 100).toFixed(2)}%`;
  const unit = unitOf(rows[0]) ?? unitOf(meta);
  const key = valueOf(rows[0])?.key ?? 'value';

  return (
    <div className="r-mk r-mk-dumbbells">
      {rows.map((r, n) => {
        const change = changeIfAny(r);
        const lit = isLit(o, r);
        const c = colourOf(change, lit);
        const a = before(r);
        const b = at(r);
        const name = subjectOf(r) ?? measureOf(meta, key) ?? '';
        const t = r.threshold_applied as { pct_threshold?: number; absolute_floor?: number } | undefined;
        const band = t ? Math.max(Math.abs(a) * (Number(t.pct_threshold) || 0) / 100,
                                  Number(t.absolute_floor) || 0) : 0;
        return (
          <div key={n} className="r-mk-row" data-lit={lit ? 'yes' : 'no'}
               style={{ opacity: lit ? 1 : COOL }}>
            <span className="r-mk-name">{name}</span>
            <span className="r-mk-track" role="img"
                  aria-label={`${name}: ${fmt(key, a, unit)} before, ${fmt(key, b, unit)} now`}>
              {band > 0 && (
                <i className="r-mk-band"
                   style={{ left: x(a - band), width: `calc(${x(a + band)} - ${x(a - band)})` }} />
              )}
              <i className="r-mk-seg"
                 style={{ left: x(Math.min(a, b)),
                          width: `calc(${x(Math.max(a, b))} - ${x(Math.min(a, b))})`,
                          background: paint(c) }} />
              <i className="r-mk-dot r-mk-dot--was" style={{ left: x(a), borderColor: paint(c) }} />
              <i className="r-mk-dot r-mk-dot--now" style={{ left: x(b), background: paint(c) }} />
            </span>
            <span className="r-mk-fig">
              <b>{fmt(key, b, unit)}</b>
              <small>was {fmt(key, a, unit)}</small>
            </span>
          </div>
        );
      })}
      {/* DIRECT LABELS, NOT A LEGEND: the two ends of the scale, named where
          they are, and the two dots explained by where they sit rather than
          by a key somewhere else on the tile. */}
      <div className="r-mk-scale">
        <span />
        <span><i>{fmt(key, low, unit)}</i><i>{fmt(key, high, unit)}</i></span>
        <span>now · was</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ ranked */

/** BARS IN CELLS — a row, its length, its figure. No axis, no legend. */
function Ranked({ rows, meta, o }: { rows: Row[]; meta: Meta; o: TileProps['o'] }) {
  const key = valueOf(rows[0])?.key ?? 'value';
  const unit = unitOf(rows[0]) ?? unitOf(meta);
  const values = rows.map((r) => Math.abs(Number(valueOf(r)?.value ?? 0)));
  const most = Math.max(1, ...values);
  return (
    <div className="r-mk r-mk-ranked">
      {rows.slice(0, 40).map((r, n) => {
        const lit = isLit(o, r);
        const c = colourOf(changeIfAny(r), lit);
        const name = subjectOf(r) ?? String(n + 1);
        return (
          <div key={n} className="r-mk-row" data-lit={lit ? 'yes' : 'no'}
               style={{ opacity: lit ? 1 : COOL }}>
            <span className="r-mk-name r-mk-name--left">{name}</span>
            <span className="r-mk-bar" role="img"
                  aria-label={`${name}: ${fmt(key, valueOf(r)?.value, unit)}`}>
              <i style={{ width: `${(values[n] / most) * 100}%`, background: paint(c) }} />
            </span>
            <span className="r-mk-fig">
              <b>{fmt(key, valueOf(r)?.value, unit)}</b>
              {/* A percentage the tool measured is a second reading of the
                  same figure, so it rides on the row rather than becoming a
                  mark of its own. Only a change in UNITS is a decomposition. */}
              <Delta change={changeOf(r)} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ contributors */

/**
 * WHAT MOVED THE THING THAT MOVED — one signed change per row, bars diverging
 * from a shared zero, the sign printed beside each.
 *
 * IT SHOWS SHARES OF NOTHING. Each bar is a change the tool measured against
 * the largest change in the same read; no bar is a percentage of the total
 * movement, because an attribution share is exactly what CLAUDE.md 10 refuses
 * and no tool computes one.
 */
function Contributors({ rows, meta, o }: { rows: Row[]; meta: Meta; o: TileProps['o'] }) {
  const signed = (r: Row) => {
    const n = typeof r.change === 'number' ? r.change : Number(r.change_pct);
    return Number.isFinite(n) ? n : 0;
  };
  const key = typeof rows[0]?.change === 'number' ? 'change' : 'change_pct';
  const unit = key === 'change' ? unitOf(rows[0]) ?? unitOf(meta) : null;
  const most = Math.max(1, ...rows.map((r) => Math.abs(signed(r))));
  return (
    <div className="r-mk r-mk-contributors">
      {rows.slice(0, 40).map((r, n) => {
        const lit = isLit(o, r);
        const change = changeIfAny(r);
        const c = colourOf(change, lit);
        const v = signed(r);
        const name = subjectOf(r) ?? String(n + 1);
        return (
          <div key={n} className="r-mk-row" data-lit={lit ? 'yes' : 'no'}
               style={{ opacity: lit ? 1 : COOL }}>
            <span className="r-mk-name r-mk-name--left">{name}</span>
            <span className="r-mk-bar r-mk-bar--split" role="img"
                  aria-label={`${name}: ${fmt(key, v, unit)}`}>
              <i style={{ width: `${(Math.abs(v) / most) * 50}%`,
                          [v < 0 ? 'right' : 'left']: '50%',
                          background: paint(c) } as CSSProperties} />
            </span>
            <span className="r-mk-fig"><b>{fmt(key, v, unit)}</b></span>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- line */

/**
 * A SERIES OVER AN ORDERED FIELD, and its baseline dotted where the tool
 * returned one. Ends and extremes are labelled on the mark itself.
 */
function Line({ rows, meta, o }: { rows: Row[]; meta: Meta; o: TileProps['o'] }) {
  const by = timeKeyOf(rows);
  const points = rows.slice(0, 60);
  const values = points.map((r) => Number(valueOf(r)?.value ?? 0));
  const bases = points.map((r) => Number(r.baseline));
  const drawnBase = hasBaseline(points);
  const all = drawnBase ? [...values, ...bases] : values;
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const key = valueOf(points[0])?.key ?? 'value';
  const unit = unitOf(points[0]) ?? unitOf(meta);
  const W = 560;
  const H = 128;
  const pad = 10;
  const x = (n: number) => pad + (n / Math.max(1, points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const path = (vs: number[]) => vs.map((v, n) => `${x(n)},${y(v)}`).join(' ');
  const iHi = values.indexOf(Math.max(...values));
  const iLo = values.indexOf(Math.min(...values));
  const last = points.length - 1;
  // The series moved the way the tool said it did on its last row; nothing
  // here works out a trend of its own.
  const c = colourOf(changeIfAny(points[last] ?? {}), isLit(o, points[last] ?? {}));
  const label = (n: number) => String(by ? points[n][by] ?? '' : subjectOf(points[n]) ?? '');

  return (
    <div className="r-mk r-mk-line">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`${measureOf(meta, key)} over ${points.length} points`}
           style={{ display: 'block', overflow: 'visible' }}>
        {drawnBase && (
          <polyline className="r-mk-baseline" fill="none" stroke="rgb(var(--flat))"
                    strokeWidth={1.2} strokeDasharray="3 4" points={path(bases)} />
        )}
        <polyline fill="none" stroke={paint(c)} strokeWidth={1.8} points={path(values)} />
        {points.length > 2 && Array.from(new Set([iHi, iLo, last])).map((i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(values[i])} r={3.4} fill={paint(c)}
                    stroke="var(--card)" strokeWidth={1.5} />
            <text x={x(i)} y={i === iLo ? y(values[i]) + 16 : y(values[i]) - 9}
                  textAnchor={x(i) > W * 0.8 ? 'end' : x(i) < W * 0.2 ? 'start' : 'middle'}
                  className="r-mk-point">
              {fmt(key, values[i], unit)}
            </text>
          </g>
        ))}
      </svg>
      <div className="r-mk-ends">
        <span>{label(0)}</span>
        {drawnBase && <span className="r-mk-key">dotted · the period before</span>}
        <span>{label(last)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- table */

/**
 * THE ROWS, when precision beats shape. What it drops and why is unchanged
 * from the tile it replaces: a column with one value on every row is a fact
 * about the table and is said once above it; a value with no reading for a
 * person is drawn as one that has none.
 */
function Rows({ rows: all, meta, o, p }: { rows: Row[]; meta: Meta; o: TileProps['o']; p: TileProps }) {
  const sort = p.local.sort;
  const rows = sorted(all, sort).slice(0, 40);
  const open = p.local.open ?? (o.weight !== 'quiet' || all.length <= 8);
  const keys = Object.keys(rows[0]).filter(
    (k) => !k.endsWith('_id') && !['seq', 'call_seq', 'direction', 'baseline_status'].includes(k));
  const readable = (v: unknown) => v === null || v === undefined || typeof v !== 'object';
  const constant: string[] = [];
  const cols: string[] = [];
  for (const k of keys) {
    const distinct = new Set(rows.map((r) => String(r[k] ?? '')));
    if (rows.length >= 3 && distinct.size === 1 && String(rows[0][k] ?? '').length <= 24
        && readable(rows[0][k])
        && !/sales|revenue|value|total|cost|price/i.test(k)) {
      constant.push(fmt(k, rows[0][k], unitOf(rows[0]) ?? unitOf(meta)));
    } else {
      cols.push(k);
    }
  }
  const unit = (row: Row) => unitOf(row) ?? unitOf(meta);
  const RANK: Record<string, number> = {
    product: 0, store: 0, category: 0, name: 0, supplier: 0, label: 0, day: 0, week: 0, month: 0,
    sku: 1, value: 2, change_pct: 3, change: 6, baseline: 7,
  };
  const shown = cols.slice()
    .sort((a, b) => (RANK[a] ?? 4) - (RANK[b] ?? 4) || cols.indexOf(a) - cols.indexOf(b))
    .slice(0, 5);

  return (
    <div className="r-mk r-mk-table">
      {(constant.length > 0 || all.length > 8) && (
        <div className="r-mk-tablehead">
          <span>{constant.join(' · ')}</span>
          {all.length > 8 && (
            <button type="button" className="r-act" onClick={() => p.on.patch(o.key, { open: !open })}>
              {open ? 'less' : 'show'}
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="r-scroll" style={{ overflowX: 'auto' }}>
          <table className="r-rows">
            <thead>
              <tr>
                {shown.map((c) => (
                  <th key={c} className={typeof rows[0][c] === 'number' ? 'n' : ''}
                      style={{ cursor: 'pointer' }}
                      aria-sort={sort?.column === c ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                      onClick={() => p.on.patch(o.key,
                        { sort: { column: c, desc: sort?.column === c ? !sort.desc : true } })}>
                    {c.replace(/_/g, ' ')}{sort?.column === c ? (sort.desc ? ' ▾' : ' ▴') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, n) => (
                <tr key={n} style={{ opacity: isLit(o, row) ? 1 : COOL }}>
                  {shown.map((c) => (
                    <td key={c} className={typeof row[c] === 'number' ? 'n' : ''}>
                      {c === 'change_pct' ? <Delta change={changeOf(row)} /> : fmt(c, row[c], unit(row))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- frame */

/**
 * EVERY BLOCK, DRAWN THE SAME WAY ROUND: the caveat its own read raised, the
 * title, the subtitle off `meta`, the mark, and the source line. UI rule 4
 * puts the caveat above the figures it qualifies; rule 6 is why the source
 * line is not optional — a number with no time on it is a claim with no
 * expiry.
 */
export function MarkBlock(p: TileProps) {
  const call = callFor(p);
  const rows = rowsOf(call);
  const meta = call?.result?.meta ?? null;
  if (!rows.length) return <Missing what="rows" />;
  const mark: Mark = markFor(p.o, rows);
  const subtitle = subtitleFor(meta, rows);
  const lit = !p.earlier && p.o.weight !== 'quiet';
  // The tile's own hue is IDENTITY and stays outside the mark: it is the edge
  // and the wash that let you find a shop on a board of ten, and nothing
  // inside the drawing takes its colour from it.
  const label = p.o.subject ?? subjectOf(rows[0] ?? {}) ?? null;
  const dimension = label ? dimensionOf(rows, label) : null;

  return (
    <>
      <Shell quiet={!lit} hue={hueFor(label, dimension, kindOfRead(p.o.tool))}
             landing={p.landing} delay={p.delay} picked={p.focused || p.selected}
             onOpen={() => p.on.open(p.o.key)}>
        <OwnCaveat meta={meta} />
        <p className="r-mk-title">{titleFor(p.o, meta)}{p.earlier ? ' · from earlier' : ''}</p>
        {subtitle && <p className="r-mk-sub">{subtitle}</p>}
        <div className="r-mk-body" data-mark={mark}>
          {mark === 'figure' && <Figure {...p} rows={rows} meta={meta} />}
          {mark === 'dumbbell' && <Dumbbell rows={rows} meta={meta} o={p.o} />}
          {mark === 'ranked' && <Ranked rows={rows} meta={meta} o={p.o} />}
          {mark === 'contributors' && <Contributors rows={rows} meta={meta} o={p.o} />}
          {mark === 'line' && <Line rows={rows} meta={meta} o={p.o} />}
          {mark === 'table' && <Rows rows={rows} meta={meta} o={p.o} p={p} />}
        </div>
        <Receipts meta={meta} tool={p.o.tool} />
      </Shell>
      {/* OPENED — below the tile, never inside it: a tile clips its content
          for the bloom, and a lit one is a solid colour that body text fights. */}
      {p.focused && label && kindOf(dimension) && (
        <div onClick={(e) => e.stopPropagation()}
             style={{ '--hue': hueFor(label, dimension, kindOfRead(p.o.tool)) } as CSSProperties}>
          <ObjectPanel kind={kindOf(dimension) as string} name={label} />
        </div>
      )}
    </>
  );
}

export type { Change };
