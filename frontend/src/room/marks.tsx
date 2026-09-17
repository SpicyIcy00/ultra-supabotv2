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
import type { ToolMeta } from '../types/george';
import {
  changeOf, fmt, measureOf, rowUnderClaim, rowsOf, sorted, subjectOf, tableShape, unitOf,
  valueOf,
  type Change,
} from './data';
import {
  changeIfAny, colourOf, figureOf, hasBaseline, markFor, timeKeyOf, titleFor,
  type DataColour, type Mark,
} from './catalogue';
import {
  Delta, Missing, MissingRow, Offer, OwnCaveat, Receipts, Shell, callFor, isLit,
  type TileProps,
} from './tiles';
import { onRow } from './actions';
import type { ActionOffer } from '../types/george';
import { ObjectPanel, kindOf } from './ObjectPanel';
import { dimensionOf } from './data';
import { Swatch, useHueFor } from './swatch';
import type { Dimension } from './data';

type Row = Record<string, unknown>;
/** The read's own `meta` — every subtitle and source line comes off it. */
type Meta = ToolMeta | null;

/** `rgb(var(--up))` and friends — the only colours a mark may paint with. */
function paint(c: DataColour): string {
  return `rgb(var(--${c}))`;
}

/**
 * How brightly a cooled row sits.
 *
 * 0.5 until 2026-09-15, when he looked at a board with no tile wash on it and
 * said *"all stores still matter not full focus on one"*. Half opacity on top
 * of a grey name and a flat bar was three dimmings stacked, and six shops that
 * moved read as six shops that did not. The row he named is still the loudest
 * thing in the mark — it is fully lit, bold, and in the primary ink — but the
 * others are now quieter rather than faint, and they keep their own colour.
 */
const COOL = 0.75;

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
function Dumbbell({ rows, meta, o, offers, seq, onTake, onPick, picked }:
                  { rows: Row[]; meta: Meta; o: TileProps['o'] } & Offering) {
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
    <div className="r-mk r-mk-dumbbells" data-emphasis={emphasised(o) ? 'yes' : undefined}>
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
            <RowName name={name} className="r-mk-name"
                     dimension={subjectOf(r) ? dimensionOf(rows, name) : null}
                     pickable={Boolean(subjectOf(r))} onPick={onPick}
                     picked={picked?.includes(name)} />
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

/* ------------------------------------------------------------------ offers */

/**
 * WHAT GEORGE OFFERED TO DO ABOUT THIS ROW, drawn on it.
 *
 * `room/actions.placement` already decided this object may carry these; all
 * that is left is which row. Nothing is drawn where he offered nothing, which
 * is most rows of most reads — an offer on every row would be a menu, and the
 * point of putting it here is that he chose one.
 */
function RowOffers({ offers, seq, subject, onTake }: {
  offers: ActionOffer[] | undefined;
  seq: number | undefined;
  subject: string | null;
  onTake: Take;
}) {
  const mine = onRow(offers ?? [], seq, subject);
  if (!mine.length) return null;
  return (
    <span className="r-mk-offers">
      {mine.map((a) => <Offer key={`${a.act}:${a.target}`} offer={a} onTake={onTake} />)}
    </span>
  );
}

/** What happens when one is tapped. Owned by the block, not by the mark. */
type Take = (offer: ActionOffer) => void;

/** What every row mark needs to draw an offer, and nothing else. */
interface Offering {
  offers?: ActionOffer[];
  seq?: number;
  onTake?: Take;
  /**
   * A TAP ON A ROW'S NAME PUTS IT IN THE SELECTION (the log, 2026-09-15).
   *
   * It was missing. `subjects.ts` resolved the id, the composer drew the
   * chip, `subjectOnBoard` was tested — and no mark ever called `pick`, so
   * the only way an id could reach George was by typing `@`. The owner, on
   * the live build: *"i cant click any store cause theres no tap."* He was
   * describing the code exactly.
   */
  onPick?(subject: string): void;
  /** The subjects already picked, so a row can say it is one of them. */
  picked?: string[];
}

const NO_TAKE: Take = () => {};

/** Whether a block pointed at particular rows — the only time a swatch is ringed. */
function emphasised(o: TileProps['o']): boolean {
  const e = o.emphasise;
  return Array.isArray(e) ? e.some((x) => String(x).trim()) : Boolean(String(e ?? '').trim());
}

/**
 * A ROW'S NAME, TAPPABLE WHERE THE ROW HAS ONE.
 *
 * THE `stopPropagation` IS THE OTHER HALF OF THE BUG. The tile is
 * `role="button"` with an `onClick` over the whole of it, so a click on a row
 * reached the tile's open handler and nothing else — which is why the report
 * is *"tapping doesnt work it just moves or expands the widget"* rather than
 * "nothing happens". Both halves had to go or the tap would have opened the
 * object and selected the row at once.
 *
 * A row with no subject of its own is drawn as it always was: a plain label
 * is honest about there being nothing to pick.
 */
function RowName({ name, pickable, onPick, picked, className, dimension }: {
  name: string;
  pickable: boolean;
  onPick?(subject: string): void;
  picked?: boolean;
  className: string;
  /**
   * WHAT KIND OF THING THE NAME IS, for its swatch (P2S.2(e)). The swatch is
   * the store; the mark beside it is the verdict.
   */
  dimension?: Dimension | null;
}) {
  const swatch = <Swatch name={name} dimension={dimension} />;
  if (!pickable || !onPick) return <span className={className}>{swatch}{name}</span>;
  return (
    <button
      type="button"
      className={`${className} r-mk-name--tap`}
      aria-pressed={picked ?? false}
      onClick={(e) => { e.stopPropagation(); onPick(name); }}
    >
      {swatch}{name}
    </button>
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
               style={{ opacity: lit ? 1 : COOL }}>
            <RowName name={name} className="r-mk-name r-mk-name--left"
                     dimension={subjectOf(r) ? dimensionOf(rows, name) : null}
                     pickable={Boolean(subjectOf(r))} onPick={onPick}
                     picked={picked?.includes(name)} />
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
               style={{ opacity: lit ? 1 : COOL }}>
            <RowName name={name} className="r-mk-name r-mk-name--left"
                     dimension={subjectOf(r) ? dimensionOf(rows, name) : null}
                     pickable={Boolean(subjectOf(r))} onPick={onPick}
                     picked={picked?.includes(name)} />
            <span className="r-mk-bar r-mk-bar--split" role="img"
                  aria-label={`${name}: ${fmt(key, v, unit)}`}>
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
function Line({ rows, meta, o, subject }: {
  rows: Row[]; meta: Meta; o: TileProps['o'];
  /** The one thing this series is OF, where the read says so — for its key. */
  subject: string | null;
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
  const rows = sorted(all, sort).slice(0, 40);
  const open = p.local.open ?? (o.weight !== 'quiet' || all.length <= 8);
  // ONE DEFINITION OF WHICH COLUMNS A READ DRAWS (P2.e), so the table on the
  // board and the same read at its rung in the walk agree about what is a
  // column and what is a caption.
  const { constant, columns: shown } = tableShape(rows, meta);
  const unit = (row: Row) => unitOf(row) ?? unitOf(meta);

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
                  {shown.map((c) => {
                    // THE CELL THAT HOLDS THE ROW'S SUBJECT IS TAPPABLE, and
                    // only that one: a table of a shop's products has one
                    // column that names something George can be asked about
                    // and several that are measurements of it.
                    const subject = subjectOf(row);
                    const isSubject = typeof subject === 'string' && row[c] === subject;
                    return (
                      <td key={c} className={typeof row[c] === 'number' ? 'n' : ''}>
                        {c === 'change_pct' ? <Delta change={changeOf(row)} />
                          : isSubject ? (
                            <RowName name={subject} className="r-mk-cellname" pickable
                                     dimension={dimensionOf(all, subject)}
                                     onPick={(x) => p.on.pick(x, dimensionOf(all, x))}
                                     picked={p.selection?.includes(subject)} />
                          ) : fmt(c, row[c], unit(row))}
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
  const hueFor = useHueFor();
  const call = callFor(p);
  const rows = rowsOf(call);
  const meta = call?.result?.meta ?? null;
  if (!rows.length) return <Missing what="rows" />;
  const mark: Mark = markFor(p.o, rows);
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
  // subject was not chosen by him, by George, or by the read — it was chosen
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
  // — an offer is George pointing at one of them.
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
      <Shell quiet={!lit}
             landing={p.landing} delay={p.delay} picked={p.focused || p.selected}
             onOpen={() => p.on.open(p.o.key)}>
        <OwnCaveat meta={meta} />
        <p className="r-mk-title">{titleFor(p.o, meta)}{p.earlier ? ' · from earlier' : ''}</p>
        <div className="r-mk-body" data-mark={mark}>
          {mark === 'figure' && <Figure {...p} rows={rows} meta={meta} />}
          {mark === 'dumbbell' && <Dumbbell rows={rows} meta={meta} o={p.o} {...offering} />}
          {mark === 'ranked' && <Ranked rows={rows} meta={meta} o={p.o} {...offering} />}
          {mark === 'contributors' && <Contributors rows={rows} meta={meta} o={p.o} {...offering} />}
          {mark === 'line' && <Line rows={rows} meta={meta} o={p.o} subject={seriesOf} />}
          {mark === 'table' && <Rows rows={rows} meta={meta} o={p.o} p={p} />}
        </div>
        <Receipts meta={meta} tool={p.o.tool} />
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

export type { Change };
