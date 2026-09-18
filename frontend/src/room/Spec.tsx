/**
 * DRAWING A SHAPE GEORGE COMPOSED.
 *
 * The fourteen widgets are shapes I chose in advance. This draws shapes he
 * chose — a tree of layouts and marks, validated in agent/grammar.py — so the
 * workspace can become something nobody listed.
 *
 * THE GUARANTEE IS UNCHANGED, AND THIS FILE IS WHERE IT IS KEPT. A mark names
 * a read and a COLUMN. Every value below is resolved HERE, from the rows of
 * that read: `resolve(node)` reads `row[node.field]` and nothing else. There
 * is no path by which text from the spec reaches the screen as a figure, a
 * label or a colour — the grammar has no field to carry one, and this
 * renderer never looks for one.
 *
 * So an unbounded space of shapes costs nothing in trust: the numbers on a
 * shape George invented came from the same rows, with the same receipts, as
 * the numbers on one I did.
 *
 * WHICH ROW A MARK USES, stated because it is the only ambiguity in the
 * grammar. `value`, `delta` and `label` draw ONE thing, so they take the
 * first row after `order` and `limit` are applied. `bar`, `point` and `cell`
 * draw one per row. `line` connects rows in `by` order. `rows` is the table.
 */
import type { CSSProperties } from 'react';
import type { SpecNode, ToolCall } from '../types/george';
import type { AnswerTurn } from './data';
import { callOf, changeOf, fmt, rowsOf, sorted, unitOf } from './data';
import { directionRgb } from './identity';

export interface SpecProps {
  node: SpecNode;
  turn: AnswerTurn;
  /** Reads re-run by a control, by seq — a spec follows them like any object. */
  retuned: Record<number, ToolCall>;
  depth?: number;
  /**
   * The subject inherited from an ancestor.
   *
   * The validator already pushes a panel's subject down its subtree, so this
   * is belt and braces — but it is the belt that matters: a spec that reached
   * the client without inheritance (an older stored post, a hand-built
   * fixture) would otherwise draw the FIRST row inside a scoped panel, which
   * is the exact wrong-and-plausible failure the subject exists to prevent.
   */
  subject?: string;
}

const GAP: Record<string, number> = { tight: 6, normal: 14, loose: 24 };

function callFor(p: SpecProps, seq: number | undefined): ToolCall | null {
  if (seq === undefined) return null;
  return p.retuned[seq] ?? callOf(p.turn, seq);
}

/**
 * WHICH ROWS a node draws: its subject's, if it has one.
 *
 * Without this a panel per shop drew the FIRST row on every panel — seven
 * panels, identical figures, each headed with the same shop's name. Plausible
 * and wrong, which is worse than not drawing at all. The subject is inherited
 * down the tree by the validator, so a scoped panel scopes everything in it.
 */
function scoped(rows: Record<string, unknown>[], subject?: string) {
  if (!subject) return rows;
  const want = subject.trim().toLowerCase();
  const matching = rows.filter((row) => Object.values(row).some(
    (v) => typeof v === 'string' && v.trim().toLowerCase() === want));
  // A subject the validator accepted always matches something; if a re-run
  // has since changed the rows, draw nothing rather than the wrong row.
  return matching;
}

/** The rows a mark draws, after its subject, its ordering and its bound. */
function rowsFor(node: SpecNode, call: ToolCall | null): Record<string, unknown>[] {
  let rows = scoped(rowsOf(call), node.subject);
  if (node.order) rows = sorted(rows, { column: node.order, desc: true });
  else if (node.by) rows = sorted(rows, { column: node.by, desc: false });
  return node.limit ? rows.slice(0, node.limit) : rows;
}

/**
 * The colour for one row: A DIRECTION, OR NOTHING (P2.l, 2026-09-15).
 *
 * It was `hueOf` and it returned a hue; it returns a direction now, and the
 * name says so.
 *
 * `colour` names a COLUMN, and what that column CONTAINS decides it. A
 * direction the tool declared becomes the semantic up/down/flat. ANYTHING
 * ELSE IS FLAT — it used to be looked up as an IDENTITY, so `colour: store`
 * drew the seven shop hues inside a composed shape, which is the owner's
 * seven-shops-seven-hues report surviving in the grammar after P1.e took it
 * out of the six marks. A hue George picked would be a claim he made rather
 * than one a row carries, which is why the grammar cannot express one; a hue
 * his COLUMN picked was that same claim one step removed.
 */
function colourOf(node: SpecNode, row: Record<string, unknown>): string {
  if (!node.colour) return 'var(--flat)';
  const value = row[node.colour];
  if (value === 'up' || value === 'down' || value === 'flat') {
    return directionRgb(value as 'up' | 'down' | 'flat');
  }
  return 'var(--flat)';
}

/**
 * What a mark is PAINTED with: the direction its own row declared, and `--flat`
 * where it declared none.
 *
 * It used to fall back to `var(--hue)` — the TILE's identity, inherited as a
 * CSS variable, so a chart of Rockwell's hours drew in Rockwell's violet. The
 * shell carries no identity since P2.l, so there is nothing to inherit and
 * nothing that should be: a mark whose rows declare no direction is a mark
 * nobody measured one for, and grey is what that looks like.
 * Returns an `r, g, b` triple or a var(), both valid inside rgb()/rgba().
 */
function paint(node: SpecNode, row: Record<string, unknown>): string {
  return colourOf(node, row);
}

/**
 * WHETHER THIS ROW IS THE ONE.
 *
 * `emphasise` names a row that stays lit while the others cool — the same
 * thing the board already does with weight at the object level, applied
 * inside a mark. It is how a picture says "this is the one that matters"
 * without a sentence underneath saying it, and a third of George's sentences
 * were doing exactly that job.
 *
 * With nothing emphasised, every row is lit: a chart with no point to make
 * should not look like one where everything failed to matter.
 */
/**
 * WHETHER THIS IS THE ROW HE POINTED AT — true for every row when he pointed at
 * none. Never an opacity: nothing is dimmed to light something else (the owner,
 * 2026-09-18); the row gains a band (`data-lit`) and the others keep theirs.
 */
function hit(node: SpecNode, row: Record<string, unknown>): boolean {
  if (!node.emphasise) return true;
  const want = node.emphasise.trim().toLowerCase();
  const found = Object.values(row).some(
    (v) => typeof v === 'string' && v.trim().toLowerCase() === want);
  return found;
}
const litAttr = (node: SpecNode, row: Record<string, unknown>) =>
  (node.emphasise && hit(node, row) ? 'yes' : undefined);

/** An ISO date as a person says it; anything else unchanged. */
function niceDate(text: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!m) return text;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(`${m[0]}T00:00:00`);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function nameOf(node: SpecNode, row: Record<string, unknown>): string {
  const key = node.label ?? node.by;
  return key ? String(row[key] ?? '') : '';
}

/* -------------------------------------------------------------------- marks */

function Mark(p: SpecProps) {
  const node = p.node;
  const call = callFor(p, node.seq);
  const rows = rowsFor({ ...node, subject: node.subject ?? p.subject }, call);
  const first = rows[0];

  // WHAT THE FIGURES ARE IN. The row's own unit, or the read's, so a mark
  // never takes its currency from the name of a column (P1.c). `prose` is
  // gone from this switch and from the grammar with it: the reading is a
  // region above the board, not a mark inside a shape, and a spec that could
  // draw it would draw the answer twice.
  const u = (row?: Record<string, unknown>) => unitOf(row) ?? unitOf(call?.result?.meta);

  switch (node.mark) {
    case 'value': {
      if (!first || !node.field) return null;
      const size = node.weight === 'lead' ? 40 : node.weight === 'quiet' ? 18 : 26;
      return (
        <span className="r-num" style={{ '--size': `${size}px` } as CSSProperties}>
          {fmt(node.field, first[node.field], u(first))}
        </span>
      );
    }

    case 'label':
      if (!first || !node.field) return null;
      return <p className="r-label">{fmt(node.field, first[node.field], u(first))}</p>;

    case 'delta': {
      if (!first || !node.field) return null;
      const change = changeOf(first);
      const pct = typeof first[node.field] === 'number'
        ? (first[node.field] as number) : change.pct;
      if (pct === null || pct === undefined) return null;
      const way = change.direction ?? (pct >= 0 ? 'up' : 'down');
      return (
        <span className="r-delta" style={{ '--c': directionRgb(way) } as CSSProperties}>
          {way === 'up' ? '▲' : '▼'} {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
        </span>
      );
    }

    case 'bar': {
      if (!node.field || !rows.length) return null;
      const values = rows.map((r) => Math.abs(Number(r[node.field!]) || 0));
      const most = Math.max(...values, 1);
      return (
        <div className="r-spec-bars">
          {rows.map((row, n) => (
            <div key={n} className="r-spec-bar" data-lit={litAttr(node, row)}>
              <span className="r-spec-bar-name">{nameOf(node, row)}</span>
              <span className="r-spec-bar-track">
                <i style={{ width: `${(values[n] / most) * 100}%`,
                            background: `rgb(${paint(node, row)})` }} />
              </span>
              <span className="r-spec-bar-figure">{fmt(node.field!, row[node.field!], u(row))}</span>
              {/* The note sits on the row it is about, not under the chart. */}
              {node.note && hit(node, row) && node.emphasise && (
                <span className="r-spec-note">{node.note}</span>
              )}
            </div>
          ))}
        </div>
      );
    }

    case 'point':
    case 'line': {
      if (!node.field || !rows.length) return null;
      const values = rows.map((r) => Number(r[node.field!]) || 0);
      const low = Math.min(...values);
      const high = Math.max(...values);
      const span = high - low || 1;
      const at = (v: number) => 8 + ((v - low) / span) * 84;
      const iHi = values.indexOf(high);
      const iLo = values.indexOf(low);
      return (
        <div className={node.mark === 'line' ? 'r-spec-line' : 'r-spec-points'}>
          {node.mark === 'line' && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                points={rows.map((_, n) =>
                  `${(n / Math.max(rows.length - 1, 1)) * 100},${100 - at(values[n])}`).join(' ')}
                fill="none" stroke={`rgb(${paint(node, rows[0])})`} strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          <div className="r-spec-axis">
            {rows.map((row, n) => (
              <span key={n} className="r-spec-point" title={nameOf(node, row)}>
                <i style={{ background: `rgb(${paint(node, row)})`,
                            bottom: `${at(values[n])}%` }} />
                {/* A LINE NAMES ITS HIGH AND ITS LOW. Both are rows the read
                    returned, so both may be written; and a series whose
                    extremes are named is one you can read without a table. */}
                {node.mark === 'line' && rows.length > 2 && (n === iHi || n === iLo) && (
                  <b className={`r-spec-extreme ${n === iHi ? 'r-spec-extreme--hi' : 'r-spec-extreme--lo'}`}
                     style={{ bottom: `calc(${at(values[n])}% ${n === iHi ? '+' : '-'} 14px)` }}>
                    {fmt(node.field!, row[node.field!], u(row))}
                  </b>
                )}
                <em>{nameOf(node, row)}</em>
              </span>
            ))}
          </div>
        </div>
      );
    }

    case 'cell': {
      if (!node.field || !rows.length) return null;
      const values = rows.map((r) => Number(r[node.field!]) || 0);
      const high = Math.max(...values.map(Math.abs), 1);
      return (
        <div className="r-spec-cells">
          {rows.map((row, n) => (
            <span key={n} className="r-spec-cell"
                  style={{ background: `rgba(${paint(node, row)}, ${(0.12 + (Math.abs(values[n]) / high) * 0.7)})` }}>
              <em>{nameOf(node, row)}</em>
              <b>{fmt(node.field!, row[node.field!], u(row))}</b>
            </span>
          ))}
        </div>
      );
    }

    case 'rows': {
      if (!rows.length) return null;
      const cols = Object.keys(rows[0]).filter((k) => !/_id$|^receipts$/.test(k)).slice(0, 5);
      return (
        <div style={{ overflowX: 'auto' }}>
          <table className="r-rows">
            <thead>
              <tr>{cols.map((c) => (
                <th key={c} className={typeof rows[0][c] === 'number' ? 'n' : ''}>
                  {c.replace(/_/g, ' ')}
                </th>))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row, n) => (
                <tr key={n}>{cols.map((c) => (
                  <td key={c} className={typeof row[c] === 'number' ? 'n' : ''}>
                    {fmt(c, row[c], u(row))}
                  </td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    /* ---- the instruments: a second reading of the figure, never a word on it */

    case 'range': {
      // ONE ROW ON THE RANGE OF ALL THE ROWS. Every row is a dot on a track
      // from the lowest to the highest; the emphasised row — or the last, in
      // `by` order — is the marker, and carries its figure. Where, never
      // good or bad: the ends are the read's own extremes.
      if (!node.field || !rows.length) return null;
      const values = rows.map((r) => Number(r[node.field!]) || 0);
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const span = hi - lo || 1;
      const x = (v: number) => 3 + ((v - lo) / span) * 94;
      const iMark = node.emphasise
        ? rows.findIndex((r) => hit(node, r))
        : rows.length - 1;
      const mark = rows[iMark];
      return (
        <div className="r-spec-range">
          {mark && (
            <div className="r-spec-range-head">
              <span className="r-num" style={{ '--size': '28px' } as CSSProperties}>
                {fmt(node.field, mark[node.field], u(mark))}
              </span>
              <span className="r-spec-range-when">{niceDate(nameOf(node, mark))}</span>
            </div>
          )}
          {/* `--mk` is THIS MARK's colour and nothing else's: the direction the
              marked row declared, or flat. It was `--hue` — the tile's own
              identity — until P2.l, which is how a range of one shop's hours
              came to be drawn in that shop's colour. */}
          <div className="r-spec-range-track"
               style={mark ? { '--mk': paint(node, mark) } as CSSProperties : undefined}>
            {rows.map((row, n) => (
              <i key={n} className="r-spec-range-dot" style={{ left: `${x(values[n]).toFixed(1)}%` }}
                 title={`${nameOf(node, row)} · ${fmt(node.field!, row[node.field!], u(row))}`} />
            ))}
            {mark && <b className="r-spec-range-mark" style={{ left: `${x(values[iMark]).toFixed(1)}%` }} />}
          </div>
          <div className="r-spec-range-ends">
            <span>{fmt(node.field, lo, u(rows[0]))} · low</span>
            <span>high · {fmt(node.field, hi, u(rows[0]))}</span>
          </div>
          <p className="r-spec-how">every row is a dot on the range · the line is the one named</p>
        </div>
      );
    }

    case 'bullet': {
      // PART OF A WHOLE, ONE PER ROW. The field fills a track whose length is
      // `against` — both columns of the same row. Nothing is divided here
      // that the tool did not put side by side.
      if (!node.field || !node.against || !rows.length) return null;
      const fills = rows.map((r) => Math.abs(Number(r[node.field!]) || 0));
      const wholes = rows.map((r) => Math.abs(Number(r[node.against!]) || 0));
      const most = Math.max(...wholes, ...fills, 1);
      return (
        <div className="r-spec-bars">
          {rows.map((row, n) => (
            <div key={n} className="r-spec-bar r-spec-bullet" data-lit={litAttr(node, row)}>
              <span className="r-spec-bar-name">{nameOf(node, row)}</span>
              <span className="r-spec-bullet-area">
                <span className="r-spec-bullet-whole" style={{ width: `${(wholes[n] / most) * 100}%` }}>
                  <i style={{ width: `${Math.min(fills[n] / (wholes[n] || 1), 1) * 100}%`,
                              background: `rgb(${paint(node, row)})` }} />
                </span>
              </span>
              <span className="r-spec-bar-figure">
                {fmt(node.field!, row[node.field!], u(row))}
                <small> / {fmt(node.against!, row[node.against!], u(row))}</small>
              </span>
            </div>
          ))}
          <p className="r-spec-how">the track is the whole · the fill is the part</p>
        </div>
      );
    }

    case 'ring': {
      // ONE TICK PER ROW AROUND A CIRCLE, its length the field. A set of
      // things read as a pattern: many short ticks IS the finding. Zero is
      // short and dim, not red — zero is a fact, red would be a judgement.
      if (!node.field || !rows.length) return null;
      const values = rows.map((r) => Math.abs(Number(r[node.field!]) || 0));
      const most = Math.max(...values, 1);
      const n = rows.length;
      const R = 54, r0 = 26;
      return (
        <div>
        <svg className="r-spec-ring" viewBox="0 0 120 120" role="img"
             aria-label={`${n} rows around a ring`}>
          {rows.map((row, i) => {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2;
            const len = values[i] === 0 ? 4 : 6 + (values[i] / most) * (R - r0 - 6);
            const x1 = 60 + Math.cos(a) * r0, y1 = 60 + Math.sin(a) * r0;
            const x2 = 60 + Math.cos(a) * (r0 + len), y2 = 60 + Math.sin(a) * (r0 + len);
            return (
              <line key={i} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)}
                    stroke={`rgb(${paint(node, row)})`} strokeWidth={n > 60 ? 2 : 3} strokeLinecap="round"
                    opacity={(values[i] === 0 ? 0.35 : 0.95)}>
                <title>{nameOf(node, row)} · {fmt(node.field!, row[node.field!], u(row))}</title>
              </line>
            );
          })}
        </svg>
        <p className="r-spec-how" style={{ textAlign: 'center' }}>one tick per row · longer is more · dim is none</p>
        </div>
      );
    }

    case 'dots': {
      // WHEN, AND HOW MUCH. One dot per row along `by`, its size the field.
      // Sales by hour of the day: the afternoon is visibly heavier than the
      // morning without a single figure being read.
      if (!node.field || !node.by || !rows.length) return null;
      const values = rows.map((r) => Math.abs(Number(r[node.field!]) || 0));
      const most = Math.max(...values, 1);
      return (
        <div>
        <div className="r-spec-dots">
          {rows.map((row, i) => {
            const d = values[i] ? 6 + Math.sqrt(values[i] / most) * 22 : 0;
            return (
              <span key={i} className="r-spec-dot"
                    title={`${nameOf(node, row)} · ${fmt(node.field!, row[node.field!], u(row))}`}>
                <i style={{ width: d, height: d, background: `rgb(${paint(node, row)})`,
                            opacity: (0.35 + 0.65 * (values[i] / most)) }} />
                <em>{nameOf(node, row)}</em>
              </span>
            );
          })}
        </div>
        <p className="r-spec-how">size is how much</p>
        </div>
      );
    }

    case 'calendar': {
      // THE ROWS AS WEEKS. Monday to Sunday across, one cell per day, its
      // brightness the field. The rhythm of a shop — which weekday carries it
      // — with no day lit for beating another, because that comparison is
      // not one the tools make.
      if (!node.field || !node.by || !rows.length) return null;
      const dated = rows
        .map((row) => ({ row, at: new Date(`${String(row[node.by!]).slice(0, 10)}T00:00:00`),
                         v: Math.abs(Number(row[node.field!]) || 0) }))
        .filter((d) => Number.isFinite(d.at.getTime()))
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      if (!dated.length) return null;
      const most = Math.max(...dated.map((d) => d.v), 1);
      const lead = (dated[0].at.getDay() + 6) % 7;
      return (
        <div className="r-spec-cal">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
            <span key={`w${i}`} className="r-spec-cal-wd">{w}</span>
          ))}
          {Array.from({ length: lead }, (_, i) => <span key={`pad${i}`} />)}
          {dated.map((d, i) => (
            <span key={i} className="r-spec-cal-day"
                  title={`${fmt(node.by!, d.row[node.by!])} · ${fmt(node.field!, d.row[node.field!], u(d.row))}`}
                  style={{ background: `rgba(${paint(node, d.row)}, ${((0.08 + (d.v / most) * 0.85)).toFixed(3)})` }}>
              {d.at.getDate()}
            </span>
          ))}
          <p className="r-spec-how" style={{ gridColumn: '1 / -1' }}>brighter is more · weeks run Monday to Sunday</p>
        </div>
      );
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ layouts */

export function Spec(p: SpecProps) {
  const node = p.node;
  if (node.mark) {
    // A note with nothing emphasised labels the MARK rather than a row —
    // "off the shelf all window" over a chart of days.
    if (node.note && !node.emphasise) {
      return (
        <div>
          <p className="r-spec-note r-spec-note--over">{node.note}</p>
          <Mark {...p} />
        </div>
      );
    }
    return <Mark {...p} />;
  }

  const gap = GAP[node.gap ?? 'normal'];
  const subject = node.subject ?? p.subject;
  const children = (node.children ?? []).map((child, n) => (
    <Spec key={n} node={child} turn={p.turn} retuned={p.retuned}
          depth={(p.depth ?? 1) + 1} subject={subject} />
  ));

  if (node.layout === 'row') {
    return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap }}>{children}</div>;
  }
  if (node.layout === 'grid') {
    return (
      <div style={{
        display: 'grid', gap,
        gridTemplateColumns: `repeat(${node.cols ?? 2}, minmax(0, 1fr))`,
      }}>{children}</div>
    );
  }
  if (node.layout === 'panel') {
    const call = callFor(p, node.heading?.seq);
    const row = scoped(rowsOf(call), subject)[0];
    // The heading is a COLUMN's value, like everything else here.
    const heading = node.heading && row ? fmt(node.heading.field, row[node.heading.field]) : null;
    return (
      <div className="r-spec-panel">
        {heading && <p className="r-label">{heading}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap, marginTop: heading ? 10 : 0 }}>
          {children}
        </div>
      </div>
    );
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
}
