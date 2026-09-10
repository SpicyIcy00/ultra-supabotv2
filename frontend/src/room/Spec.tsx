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
import { callOf, changeOf, fmt, rowsOf, sorted } from './data';
import { directionRgb, hueFor, NEUTRAL } from './identity';

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
 * The hue for one row.
 *
 * `colour` names a COLUMN, and what that column CONTAINS decides the hue: a
 * direction becomes the semantic up/down, anything else is looked up as an
 * identity (a shop's own colour). A hue George picked would be a claim he
 * made rather than one a row carries, which is why the grammar has no way to
 * express one.
 */
function hueOf(node: SpecNode, row: Record<string, unknown>): string {
  if (!node.colour) return NEUTRAL;
  const value = row[node.colour];
  if (value === 'up' || value === 'down' || value === 'flat') {
    return directionRgb(value as 'up' | 'down' | 'flat');
  }
  return hueFor(typeof value === 'string' ? value : null, null, null);
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
function litness(node: SpecNode, row: Record<string, unknown>): number {
  if (!node.emphasise) return 1;
  const want = node.emphasise.trim().toLowerCase();
  const hit = Object.values(row).some(
    (v) => typeof v === 'string' && v.trim().toLowerCase() === want);
  return hit ? 1 : 0.28;
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

  switch (node.mark) {
    case 'prose':
      // His words, from the turn — never from the spec, which cannot carry any.
      return <p className="r-note">{p.turn.text}</p>;

    case 'value': {
      if (!first || !node.field) return null;
      const size = node.weight === 'lead' ? 40 : node.weight === 'quiet' ? 18 : 26;
      return (
        <span className="r-num" style={{ '--size': `${size}px` } as CSSProperties}>
          {fmt(node.field, first[node.field])}
        </span>
      );
    }

    case 'label':
      if (!first || !node.field) return null;
      return <p className="r-label">{fmt(node.field, first[node.field])}</p>;

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
            <div key={n} className="r-spec-bar">
              <span className="r-spec-bar-name">{nameOf(node, row)}</span>
              <span className="r-spec-bar-track">
                <i style={{ width: `${(values[n] / most) * 100}%`,
                            background: `rgb(${hueOf(node, row)})`,
                            opacity: litness(node, row) }} />
              </span>
              <span className="r-spec-bar-figure">{fmt(node.field!, row[node.field!])}</span>
              {/* The note sits on the row it is about, not under the chart. */}
              {node.note && litness(node, row) === 1 && node.emphasise && (
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
      return (
        <div className={node.mark === 'line' ? 'r-spec-line' : 'r-spec-points'}>
          {node.mark === 'line' && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                points={rows.map((_, n) =>
                  `${(n / Math.max(rows.length - 1, 1)) * 100},${100 - at(values[n])}`).join(' ')}
                fill="none" stroke={`rgb(${hueOf(node, rows[0])})`} strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          <div className="r-spec-axis">
            {rows.map((row, n) => (
              <span key={n} className="r-spec-point" title={nameOf(node, row)}>
                <i style={{ background: `rgb(${hueOf(node, row)})`,
                            bottom: `${at(values[n])}%`,
                            opacity: litness(node, row) }} />
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
                  style={{ background: `rgba(${hueOf(node, row)}, ${(0.12 + (Math.abs(values[n]) / high) * 0.7) * litness(node, row)})` }}>
              <em>{nameOf(node, row)}</em>
              <b>{fmt(node.field!, row[node.field!])}</b>
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
                    {fmt(c, row[c])}
                  </td>))}
                </tr>
              ))}
            </tbody>
          </table>
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
