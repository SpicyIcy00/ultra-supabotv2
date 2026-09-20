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
 *   2. seven shops, seven hues     → colour is DIRECTION here. A row label
 *                                    already says which shop it is, so a hue
 *                                    per row was spent on nothing. HE ASKED
 *                                    AGAIN ON 2026-09-15, of the tile SHELL
 *                                    this card left coloured; P2.l took the
 *                                    hue off the shell too. P2S.2(e) gave it
 *                                    back on ONE channel: the swatch before a
 *                                    name. The mark stays the verdict.
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
import { useState, type CSSProperties } from 'react';
import type { ToolMeta } from '../types/bob';
import {
  changeOf, fmt, measureOf, readAt, rowUnderClaim, rowsOf, sorted, subjectOf, tableShape,
  unitFor, unitOf,
  valueOf,
  type Change,
} from './data';
import {
  changeIfAny, colourOf, figureOf, hasBaseline, markFor, timeKeyOf, titleFor,
  type Mark,
} from './catalogue';
import {
  Delta, Missing, MissingRow, OwnCaveat, Receipts, Shell, callFor, isLit,
  type TileProps,
} from './tiles';
import type { ActionOffer } from '../types/bob';
import { ObjectPanel, kindOf } from './ObjectPanel';
import { dimensionOf } from './data';
import { Swatch, useHueFor } from './swatch';
import {
  COOL, NO_TAKE, RowName, RowOffers, beat, emphasised, moved, paint, told, type Offering,
} from './markParts';
import { Shape } from './shapes';
import { Figures } from './Reading';

type Row = Record<string, unknown>;
/** The read's own `meta` — every subtitle and source line comes off it. */
type Meta = ToolMeta | null;

/* ------------------------------------------------------------------ figure */

/**
 * ONE NUMBER, WHAT IT IS IN, AND WHICH WAY IT WENT.
 *
 * Where the read carried a before, the movement is drawn under it as a
 * one-row dumbbell rather than described — same mark, same reading, one row.
 */
function Figure(p: TileProps & { rows: Row[]; meta: Meta }) {
  const { rows, meta } = p;
  // WHICH ROW A CLAIM MAY BE DRAWN FROM IS `rowUnderClaim`, and it can answer
  // none. Until 2026-09-15 this fell back to `?? rows[0]`, so a block about
  // Greenhills over a read that did not hold Greenhills drew the first row —
  // Rockwell's ₱206,800 — under Greenhills' sentence, with Rockwell's own name
  // in the dumbbell below it. Nothing was invented; it was attached to the
  // wrong claim, which rule 9 exists to prevent. A block with no subject still
  // takes the first row, because that is what a read of one thing is.
  const row = p.o.subject ? rowUnderClaim(rows, p.o.subject) : rows[0] ?? null;
  if (!row) return p.o.subject
    ? <MissingRow what={p.o.subject} />
    : <Missing what="a row" />;
  const v = figureOf(row, meta);
  const change = changeOf(row);
  // THE ANSWER IS A NUMBER, SO IT IS DRAWN AS ONE (P6.a): a lead figure at
  // the size of the answer, not of a tile. 44 → 72.
  const size = p.o.weight === 'lead' ? 72 : p.o.weight === 'quiet' ? 26 : 34;
  return (
    <>
      <div className="r-mk-figure">
        <span className="r-num r-mk-num" style={{ '--size': `${size}px` } as CSSProperties}
              data-v={v ? told(p.o.subject ?? subjectOf(row), measureOf(meta, v.key),
                                fmt(v.key, v.value, v.unit), moved(change)) : undefined}>
          {v ? fmt(v.key, v.value, v.unit) : '—'}
        </span>
        <Delta change={change} />
      </div>
      {/* SAID ONCE (P6.b, the owner: "it's the same"). The measure under the
          number repeated the source line, and the one-row dumbbell under it
          repeated the delta pill beside it — three sayings of one figure,
          which is the tile the page is trying not to be. The measure is drawn
          only where nothing above names the block; the dumbbell only where
          the row carries a before but no change to say it with — or a NOISE
          FLOOR (`threshold_applied`), which is the one thing a pill cannot
          draw and the reason the instrument exists (room.dom.test.tsx, "a
          comparison is drawn as an instrument, not only a pill"). */}
      {v && measureOf(meta, v.key) && !p.o.claim?.trim() && !p.o.question?.trim() && (
        <p className="r-mk-measure">{measureOf(meta, v.key)}</p>
      )}
      {hasBaseline([row]) && (change.pct == null || row.threshold_applied != null) && (
        <Dumbbell rows={[row]} meta={meta} o={p.o} />
      )}
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
function Dumbbell({ rows: given, meta, o, offers, seq, onTake, onPick, picked, order }:
                  { rows: Row[]; meta: Meta; o: TileProps['o']; order?: string[] } & Offering) {
  // ONE STORE ORDER ACROSS THE ANSWER, where the room asks for it: a row the
  // order names takes its place, the rest keep theirs after it. Nothing is
  // dropped and nothing is ranked by this — it is where the eye finds a store.
  const at = (r: Row) => {
    const i = order ? order.indexOf(String(subjectOf(r) ?? '')) : -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const rows = order && order.length ? [...given].sort((a, b) => at(a) - at(b)) : given;
  const now = (r: Row) => Number(valueOf(r)?.value ?? 0);
  const before = (r: Row) => Number(r.baseline);
  const ends = rows.flatMap((r) => [now(r), before(r)]).filter(Number.isFinite);
  const low = Math.min(0, ...ends);
  const high = Math.max(1, ...ends);
  const span = high - low || 1;
  const x = (n: number) => `${(((n - low) / span) * 100).toFixed(2)}%`;
  const unit = unitOf(rows[0]) ?? unitOf(meta);
  const key = valueOf(rows[0])?.key ?? 'value';

  return (
    <div className="r-mk r-mk-dumbbells" data-emphasis={emphasised(o) ? 'yes' : undefined}>
      {rows.map((r, n) => {
        const change = changeIfAny(r);
        const lit = isLit(o, r);
        const c = colourOf(change, lit);
        const a = before(r);
        const b = now(r);
        const name = subjectOf(r) ?? measureOf(meta, key) ?? '';
        const t = r.threshold_applied as { pct_threshold?: number; absolute_floor?: number } | undefined;
        const band = t ? Math.max(Math.abs(a) * (Number(t.pct_threshold) || 0) / 100,
                                  Number(t.absolute_floor) || 0) : 0;
        return (
          <div key={n} className="r-mk-row" data-lit={lit ? 'yes' : 'no'}
               style={{ opacity: lit ? 1 : COOL, ...beat(n) }}>
            <RowName name={name} className="r-mk-name"
                     dimension={subjectOf(r) ? dimensionOf(rows, name) : null}
                     pickable={Boolean(subjectOf(r))} onPick={onPick}
                     picked={picked?.includes(name)} />
            <span className="r-mk-track" role="img"
                  aria-label={`${name}: ${fmt(key, a, unit)} before, ${fmt(key, b, unit)} now`}
                  data-v={told(name, fmt(key, b, unit), `was ${fmt(key, a, unit)}`, moved(change))}>
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
            <RowOffers offers={offers} seq={seq} subject={subjectOf(r)}
                       onTake={onTake ?? NO_TAKE} />
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
function Ranked({ rows, meta, o, offers, seq, onTake, onPick, picked }:
                { rows: Row[]; meta: Meta; o: TileProps['o'] } & Offering) {
  const key = valueOf(rows[0])?.key ?? 'value';
  const unit = unitOf(rows[0]) ?? unitOf(meta);
  const values = rows.map((r) => Math.abs(Number(valueOf(r)?.value ?? 0)));
  const most = Math.max(1, ...values);
  return (
    <div className="r-mk r-mk-ranked" data-emphasis={emphasised(o) ? 'yes' : undefined}>
      {rows.slice(0, 40).map((r, n) => {
        const lit = isLit(o, r);
        const c = colourOf(changeIfAny(r), lit);
        const name = subjectOf(r) ?? String(n + 1);
        return (
          <div key={n} className="r-mk-row" data-lit={lit ? 'yes' : 'no'}
               style={{ opacity: lit ? 1 : COOL, ...beat(n) }}>
            <RowName name={name} className="r-mk-name r-mk-name--left"
                     dimension={subjectOf(r) ? dimensionOf(rows, name) : null}
                     pickable={Boolean(subjectOf(r))} onPick={onPick}
                     picked={picked?.includes(name)} />
            <span className="r-mk-bar" role="img"
                  aria-label={`${name}: ${fmt(key, valueOf(r)?.value, unit)}`}
                  data-v={told(name, fmt(key, valueOf(r)?.value, unit), moved(changeIfAny(r)))}>
              <i style={{ width: `${(values[n] / most) * 100}%`, background: paint(c) }} />
            </span>
            <span className="r-mk-fig">
              <b>{fmt(key, valueOf(r)?.value, unit)}</b>
              {/* A percentage the tool measured is a second reading of the
                  same figure, so it rides on the row rather than becoming a
                  mark of its own. Only a change in UNITS is a decomposition. */}
              <Delta change={changeOf(r)} />
            </span>
            <RowOffers offers={offers} seq={seq} subject={subjectOf(r)}
                       onTake={onTake ?? NO_TAKE} />
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
function Contributors({ rows, meta, o, offers, seq, onTake, onPick, picked }:
                      { rows: Row[]; meta: Meta; o: TileProps['o'] } & Offering) {
  const signed = (r: Row) => {
    const n = typeof r.change === 'number' ? r.change : Number(r.change_pct);
    return Number.isFinite(n) ? n : 0;
  };
  const key = typeof rows[0]?.change === 'number' ? 'change' : 'change_pct';
  const unit = key === 'change' ? unitOf(rows[0]) ?? unitOf(meta) : null;
  const most = Math.max(1, ...rows.map((r) => Math.abs(signed(r))));
  return (
    <div className="r-mk r-mk-contributors" data-emphasis={emphasised(o) ? 'yes' : undefined}>
      {rows.slice(0, 40).map((r, n) => {
        const lit = isLit(o, r);
        const change = changeIfAny(r);
        const c = colourOf(change, lit);
        const v = signed(r);
        const name = subjectOf(r) ?? String(n + 1);
        return (
          <div key={n} className="r-mk-row" data-lit={lit ? 'yes' : 'no'}
               style={{ opacity: lit ? 1 : COOL, ...beat(n) }}>
            <RowName name={name} className="r-mk-name r-mk-name--left"
                     dimension={subjectOf(r) ? dimensionOf(rows, name) : null}
                     pickable={Boolean(subjectOf(r))} onPick={onPick}
                     picked={picked?.includes(name)} />
            <span className="r-mk-bar r-mk-bar--split" role="img"
                  aria-label={`${name}: ${fmt(key, v, unit)}`}
                  data-v={told(name, fmt(key, v, unit))}
                  data-neg={v < 0 ? 'yes' : undefined}>
              <i style={{ width: `${(Math.abs(v) / most) * 50}%`,
                          [v < 0 ? 'right' : 'left']: '50%',
                          background: paint(c) } as CSSProperties} />
            </span>
            <span className="r-mk-fig"><b>{fmt(key, v, unit)}</b></span>
            <RowOffers offers={offers} seq={seq} subject={subjectOf(r)}
                       onTake={onTake ?? NO_TAKE} />
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
function Line({ rows, meta, o, subject, p }: {
  rows: Row[]; meta: Meta; o: TileProps['o'];
  /** The one thing this series is OF, where the read says so — for its key. */
  subject: string | null;
  /** The tile, for the thought a span points with and the calls it cites. */
  p: TileProps;
}) {
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
  // A POINTED ANNOTATION (P6.a): the stretch his `span` names, as a band, with
  // his thought over it. The band's ends are rows; the sentence is his; no
  // figure is drawn that the rows do not already carry.
  const span_ = (p.o as { span?: [string, string] }).span;
  const iFrom = span_ ? points.findIndex((_, n) => label(n) === span_[0]) : -1;
  const iTo = span_ ? points.findIndex((_, n) => label(n) === span_[1]) : -1;
  const banded = iFrom >= 0 && iTo >= 0 ? [Math.min(iFrom, iTo), Math.max(iFrom, iTo)] : null;

  return (
    <div className="r-mk r-mk-line">
      {banded && p.o.thought?.trim() && (
        <p className="r-mk-annotation"
           style={{ marginLeft: `${(x(banded[0]) / W) * 100}%` }}>
          <Figures text={p.o.thought.trim()} calls={p.turn.toolCalls} />
        </p>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`${measureOf(meta, key)} over ${points.length} points`}
           style={{ display: 'block', overflow: 'visible' }}>
        {banded && (
          <rect className="r-mk-span-band" x={x(banded[0])} y={0}
                width={Math.max(2, x(banded[1]) - x(banded[0]))} height={H} />
        )}
        {drawnBase && (
          <polyline className="r-mk-baseline" fill="none" stroke="rgb(var(--flat))"
                    strokeWidth={1.2} strokeDasharray="3 4" points={path(bases)} />
        )}
        {/* pathLength 1, so the line can draw itself in without measuring. */}
        <polyline className="r-mk-series-line" fill="none" stroke={paint(c)} strokeWidth={1.8}
                  pathLength={1} points={path(values)} />
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
        {/* A TOUCH ON ANY POINT, not only the three labelled: an invisible
            target per point, bigger than the point, saying its exact figure. */}
        {points.map((_, n) => (
          <circle key={`hit-${n}`} className="r-mk-hit" cx={x(n)} cy={y(values[n])} r={9}
                  fill="none" data-v={told(subject, label(n), fmt(key, values[n], unit))} />
        ))}
      </svg>
      <div className="r-mk-ends">
        <span>{label(0)}</span>
        {/* WHOSE SERIES THIS IS: its swatch and its name, in the key — the
            line itself stays the verdict (P2S.2(e)). */}
        {subject && (
          <span className="r-mk-key r-mk-series"><Swatch name={subject} dimension={dimensionOf(rows, subject) ?? 'store'} />{subject}</span>
        )}
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
  const open = p.local.open ?? (o.weight !== 'quiet' || all.length <= 8);
  // A FOLDED TABLE STILL SHOWS ITS FIRST ROWS (the log, 2026-09-17: a quiet
  // purchase plan drew only "show" and a read time, a figure that looked
  // broken). Folded is eight rows and "all N", never nothing.
  const rows = sorted(all, sort).slice(0, open ? 40 : 8);
  // ONE DEFINITION OF WHICH COLUMNS A READ DRAWS (P2.e), so the table on the
  // board and the same read at its rung in the walk agree about what is a
  // column and what is a caption.
  //
  // OVER EVERY ROW, NOT THE VISIBLE ONES (P3.k). This was handed `rows` — the
  // 8 or 40 on screen — so a column constant across the first eight was
  // captioned as constant for the whole table. Tolerable while the answer was
  // a caption; not tolerable now the same pass REMOVES a column that mirrors
  // another, which on eight rows of forty would be a deletion on a guess.
  const { constant, columns: shown } = tableShape(all, meta);
  // PER COLUMN, not per row: a read's unit says what its VALUE is measured in,
  // and applying it to every numeric cell drew the attention table's rank as
  // `₱1`. `unitFor` returns none for a column that is a position or a count.
  const unit = (row: Row, column: string) => unitFor(column, row, meta);

  return (
    <div className="r-mk r-mk-table">
      {(constant.length > 0 || all.length > 8) && (
        <div className="r-mk-tablehead">
          {/* THREE FACTS, NOT SIX (P3.k). The owner's stockout read captioned
              `sku ... product ... days negative 0 ... last observed ...
              observed days ... first observed ...` — a field dump over a
              chart, and a good part of why a block read as a card. The rest
              stay on the element, so nothing is lost, only quiet. */}
          <span title={constant.join(' · ')}>
            {constant.slice(0, 3).join(' · ')}
            {constant.length > 3 && ` · +${constant.length - 3} more`}
          </span>
          {all.length > 8 && (
            <button type="button" className="r-act" onClick={() => p.on.patch(o.key, { open: !open })}>
              {open ? 'less' : `all ${all.length}`}
            </button>
          )}
        </div>
      )}
      {rows.length > 0 && (
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
                <tr key={n} data-lit={emphasised(o) && isLit(o, row) ? 'yes' : undefined} style={{ ...beat(n) }}>
                  {shown.map((c) => {
                    // THE CELL THAT HOLDS THE ROW'S SUBJECT IS TAPPABLE, and
                    // only that one: a table of a shop's products has one
                    // column that names something Bob can be asked about
                    // and several that are measurements of it.
                    const subject = subjectOf(row);
                    const isSubject = typeof subject === 'string' && row[c] === subject;
                    return (
                      <td key={c} className={typeof row[c] === 'number' ? 'n' : ''}
                          data-v={typeof row[c] === 'number'
                            ? told(subject, c.replace(/_/g, ' '), fmt(c, row[c], unit(row, c))) : undefined}>
                        {c === 'change_pct' ? <Delta change={changeOf(row)} />
                          : isSubject ? (
                            <RowName name={subject} className="r-mk-cellname" pickable
                                     dimension={dimensionOf(all, subject)}
                                     onPick={(x) => p.on.pick(x, dimensionOf(all, x))}
                                     picked={p.selection?.includes(subject)} />
                          ) : fmt(c, row[c], unit(row, c))}
                      </td>
                    );
                  })}
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
  // THE SUBJECT AN OFFER OPENED, which is not the same as the tile being
  // focused: `open` on a ROW opens that row's object, and the tile's own
  // opened panel is about the tile's own subject. Local, because it is a
  // person looking at something and not a change to the board.
  const [revealed, setRevealed] = useState<string | null>(null);
  // WHOLE BY DEFAULT (the owner, 2026-09-20, of a seven-shop comparison drawn
  // as ONE row under the claim "every shop rang fewer transactions": *"what is
  // this new feature ... it should be like this"*, over a screenshot of all
  // seven).
  //
  // It came in with P3.j (`af2304b`) and the reasoning was sound — a thought
  // about two shops is served by their two rows and buried by seven. What it
  // could not see is the case that broke it: a claim ABOUT ALL OF THEM whose
  // sentence happens to name only the worst one. `namedIn` found "Greenhills",
  // folded the other six, and the chart then contradicted the sentence above
  // it. Folding is a reading of his prose, and a reading can be wrong; drawing
  // every row the read returned cannot be.
  //
  // So the narrowing is still here and still one tap — it is the DEFAULT that
  // was wrong. "All stores still matter" (the owner, 2026-09-15) is the older
  // form of the same instruction.
  const [whole, setWhole] = useState(true);
  const hueFor = useHueFor();
  const call = callFor(p);
  const rows = rowsOf(call);
  const meta = call?.result?.meta ?? null;
  if (!rows.length) {
    // A READ THAT RETURNED ROWS THE RECORD DID NOT KEEP is not a read that came
    // back empty (the log, 2026-09-17: a reopened page said "this read came
    // back without rows" under figures that had drawn fine live). Say which.
    const had = Number((call?.result as { row_count?: unknown } | undefined)?.row_count ?? 0);
    return had > 0 ? <NotKept /> : <Missing what="rows" />;
  }
  // THE SHAPE IS CHOSEN FROM EVERY ROW, then the named ones are drawn: two
  // shops out of seven are still a comparison of shops, not a different chart.
  const mark: Mark = markFor(p.o, rows);
  const named = p.focus?.length
    ? rows.filter((r) => p.focus?.includes(String(subjectOf(r) ?? ''))) : [];
  // A SPAN THAT NAMES ROWS THE READ HOLDS is drawn on the chart with the
  // thought pointing at it; one that does not resolve draws nothing, and the
  // thought goes where a thought always goes. Decided here, once, so the head
  // and the chart cannot disagree about where the sentence went.
  const spanOf = (p.o as { span?: [string, string] }).span;
  const spanKey = timeKeyOf(rows);
  const spanResolves = Boolean(spanOf && spanKey
    && spanOf.every((label) => rows.some((r) => String(r[spanKey] ?? '') === label)));
  // ONLY A MARK THAT DRAWS ROWS CAN FOLD THEM. A single figure over a seventeen-
  // row read is already one row of it; "15 more · show" under a number opened
  // nothing (the first frame of this, 2026-09-19).
  const drawsRows = mark === 'dumbbell' || mark === 'ranked' || mark === 'contributors'
    || mark === 'table';
  const folds = drawsRows && named.length > 0 && rows.length - named.length >= 2;
  const drawn = folds && !whole ? named : rows;
  const lit = !p.earlier && p.o.weight !== 'quiet';
  // WHAT THIS BLOCK IS ABOUT IS ITS TITLE, NOT ITS COLOUR (P2.l). The tile used
  // to wear the subject's own hue as an edge and a wash; a board of seven shops
  // was then seven hues over rows whose labels already said the names. The
  // label is still read here — an opened object is where identity is still the
  // point, and `why` needs to know what it is asking about.
  // A BLOCK ABOUT MANY ROWS HAS NO SUBJECT, AND MAY NOT BORROW ONE (his
  // report, 2026-09-15): *"why when click on a chart made for 'analyze
  // tradsanx per store' it opens greenhills for some reason"*.
  //
  // This was `p.o.subject ?? subjectOf(rows[0])`, so a chart of seven shops
  // with no declared subject fell back to **whichever row sorted first** and
  // clicking the tile opened that shop's object. Greenhills was row one. The
  // subject was not chosen by him, by Bob, or by the read — it was chosen
  // by the sort, which is the "a label the model inferred" this whole surface
  // refuses, arriving through a `??`.
  //
  // One row IS its own subject and still opens. Many rows open nothing: a row
  // is opened by tapping the ROW, which `pick`, `why` and an `open` offer all
  // already do, each carrying the row's own name.
  const label = p.o.subject ?? (rows.length === 1 ? subjectOf(rows[0] ?? {}) : null) ?? null;
  const dimension = label ? dimensionOf(rows, label) : null;
  // A SERIES IS OF ONE STORE when the block says so, or when the read was
  // filtered to one — the read's own argument, never a name inferred.
  const filters = (call?.arguments as { filters?: Record<string, unknown> } | undefined)?.filters;
  const seriesOf = label ?? (typeof filters?.store === 'string' ? filters.store : null);

  // TAKING AN OFFER IS THE SAME ACT AS DOING IT BY HAND, through the same
  // path. `why` is the question the row's own button asks, and costs the turn
  // it says it costs; `open` opens the object below the mark, which is the
  // ~1s read the tile's own tap already makes. Nothing here is a new capability
  // — an offer is Bob pointing at one of them.
  const offering = {
    offers: p.offers,
    seq: p.o.seq,
    picked: p.selection,
    // THE DIMENSION IS THE ROW'S OWN, not the tile's. `why` already resolves
    // it this way, off the row that was tapped, which is what lets a tap on a
    // product inside a shop's board travel as a product.
    onPick: (subject: string) => p.on.pick(subject, dimensionOf(rows, subject)),
    onTake: (a: ActionOffer) => {
      if (!a.target) return;
      if (a.act === 'why') p.on.why(a.target, dimensionOf(rows, a.target));
      else if (a.act === 'open') setRevealed((r) => (r === a.target ? null : a.target));
    },
  };

  return (
    <>
      {/* NO CLICK ON THE FIGURE (the log, 2026-09-17: "we dont need the
          feature where when you click the chart it rearranges"). A click made
          it the lead, moved it to the front and re-flowed the rest. A row's
          name still picks it; a row's own `open` offer still opens it. */}
      <Shell quiet={!lit}
             landing={p.landing} delay={p.delay} picked={p.focused || p.selected}>
        <OwnCaveat meta={meta} />
        {/* THE POINT AND WHAT HE THINKS OF IT ARE ONE PARAGRAPH (P3.m).
            Until 2026-09-19 these were two: a 14px title over a 15px thought
            — the point of the block set SMALLER than its elaboration, both at
            regular weight, so nothing on the page said "this sentence is the
            finding" and every block read as a captioned chart. The owner, of
            exactly that: "it still just feels like here's this and here's
            this". In the design he approved it is one paragraph: the claim in
            bold, running into what he thinks, the way a paragraph of an
            article opens — and sized by the weight he gave the block.
            WHAT HE THINKS IT SHOWS is still his sentence (2026-09-17: "if the
            ai thoughts are with the charts it feels likes your going thorugh
            it together"); any figure in it is one this turn read, with the
            superscript of the read it came out of. */}
        {/* A STEP OPENS WITH WHAT IT ASKED (P3.o). The design he approved
            calls a block a `step` and heads it with a question in bold and its
            answer running on — `Fewer visits, or smaller baskets? Smaller
            baskets.` — so the questions read down the page as the path. The
            board opened with the answer alone, so four steps of one
            investigation drew as four findings, which is what he meant by
            "still some widgets not page". Where he asked no question the head
            is exactly what it was, and every board composed before this draws
            unchanged. */}
        <p className="r-mk-say" data-step={p.o.question?.trim() ? 'yes' : undefined}>
          {p.o.question?.trim() && (
            <span className="r-mk-ask">{p.o.question.trim()}</span>
          )}
          <span className="r-mk-title">
            {titleFor(p.o, meta)}{p.earlier ? ' · from earlier' : ''}
          </span>
          {!p.told && p.o.thought?.trim() && !spanResolves && (
            <>
              {/[.!?:…]["'”’)\]]?$/.test(`${titleFor(p.o, meta)}`.trim()) ? ' ' : '. '}
              <span className="r-mk-thought">
                <Figures text={p.o.thought.trim()} calls={p.turn.toolCalls} />
              </span>
            </>
          )}
        </p>
        <div className="r-mk-body" data-mark={mark} data-read={readAt(meta?.snapshot_timestamp) ?? ''}>
          {mark === 'figure' && <Figure {...p} rows={rows} meta={meta} />}
          {mark === 'dumbbell' && <Dumbbell rows={drawn} meta={meta} o={p.o} order={p.order} {...offering} />}
          {mark === 'ranked' && <Ranked rows={drawn} meta={meta} o={p.o} {...offering} />}
          {mark === 'contributors' && <Contributors rows={drawn} meta={meta} o={p.o} {...offering} />}
          {mark === 'line' && <Line rows={rows} meta={meta} o={p.o} subject={seriesOf} p={p} />}
          {mark === 'table' && <Rows rows={drawn} meta={meta} o={p.o} p={p} />}
          {/* THE ELEVEN P2S.3 ADDED (shapes.tsx), framed exactly as the six. */}
          <Shape mark={mark} rows={rows} meta={meta} o={p.o} subject={seriesOf} {...offering} />
        </div>
        {/* THE ROWS HIS SENTENCE DID NOT NAME — one line, and it opens. The count
            is the length of a list this already holds, never a number anybody
            wrote down (UI rule 8); no accent, because it is navigation. */}
        {folds && (
          <button type="button" className="r-mk-more" aria-expanded={whole}
                  onClick={(e) => { e.stopPropagation(); setWhole((w) => !w); }}>
            {whole ? `only ${named.length === 1 ? 'the one' : 'the ones'} he names`
                   : `${rows.length - named.length} more · show`}
          </button>
        )}
        <Receipts meta={meta} tool={p.o.tool} chrome={p.chrome} omitWindow={p.period != null} />
      </Shell>
      {/* OPENED — below the tile, never inside it, because a tile clips its
          content and a panel is the one place a hue still says something: ONE
          object, named in its own heading, with nothing beside it to confuse
          the colour with. That is the only `--hue` left in the room. */}
      {/* AN OFFER'S OWN PANEL, about the ROW it named — which is not the
          tile's subject and must not be drawn as it. Below the tile for the
          same reason the focused one is: a tile clips, and a panel is the one
          place identity still says something. */}
      {revealed && kindOf(dimensionOf(rows, revealed)) && (
        <div onClick={(e) => e.stopPropagation()}
             style={{ '--hue': hueFor(revealed, dimensionOf(rows, revealed)) } as CSSProperties}>
          <ObjectPanel kind={kindOf(dimensionOf(rows, revealed)) as string} name={revealed} />
        </div>
      )}
      {p.focused && label && kindOf(dimension) && (
        <div onClick={(e) => e.stopPropagation()}
             style={{ '--hue': hueFor(label, dimension) } as CSSProperties}>
          <ObjectPanel kind={kindOf(dimension) as string} name={label} />
        </div>
      )}
    </>
  );
}

/** Rows a read returned that the conversation did not keep, said as that. */
function NotKept() {
  return (
    <div className="r-tile r-tile--quiet">
      <p className="r-note" data-not-kept="">
        This read&rsquo;s rows were not kept with the conversation, so there is nothing to draw here.
        Ask again to read it fresh.
      </p>
    </div>
  );
}

export type { Change };
