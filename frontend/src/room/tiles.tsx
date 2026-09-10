/**
 * The things on the board.
 *
 * Every one is a tile lit from inside by its own figure: the hue says up or
 * down, the brightness says how hard, and neither is ever chosen by hand — see
 * `intensity()` in data.ts. A tile that carries no measurement (George's own
 * words, a table of rows) burns at nothing and stays dark, which is what makes
 * the ones that moved read across the room.
 *
 * None of these components computes a business figure. They pick a row, read a
 * value the tool already returned, and format it.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { GeorgeNotice } from '../types/george';
import type { BoardObject, Local } from './board';
import type { ToolCall } from '../types/george';
import {
  callOf, changeOf, dimensionOf, fmt, intensity, measureOf, pct, receiptsLine,
  rowFor, rowsOf, sorted, splitCaveat, subjectOf, tone, valueOf,
  type AnswerTurn, type Change, type Dimension,
} from './data';
import { directionRgb, hueFor, type Rgb } from './identity';
import { ObjectPanel, kindOf } from './ObjectPanel';

export interface TileActions {
  /** Bring it forward and give it the room. */
  open(key: string): void;
  /** Put it in the selection, so the next thing said is about it. */
  pick(subject: string, dimension: Dimension | null): void;
  /** Ask George about this one thing, now. */
  why(subject: string, dimension: Dimension | null): void;
  aside(key: string): void;
  patch(key: string, local: Local): void;
  /**
   * Re-run the read an object draws from with ONE scope argument changed.
   * No model turn: this is the desk replay's path, which is why a control
   * costs a second rather than forty. Optional, so a surface that has not
   * wired it simply draws no control.
   */
  retune?(key: string, argument: string, value: string | number): void;
}

export interface TileProps {
  o: BoardObject;
  /**
   * A re-run of the read this object draws, after somebody moved a control.
   *
   * KEYED BY THE READ, NOT BY THE OBJECT, and that is the semantics: changing
   * the window on a read changes EVERY object drawn from it, because they are
   * all showing the same figures through different shapes. Absent means the
   * turn's own call, exactly as before controls existed.
   */
  retuned?: ToolCall | null;
  turn: AnswerTurn;
  local: Local;
  landing: boolean;
  delay: number;
  focused: boolean;
  selected: boolean;
  earlier: boolean;
  on: TileActions;
  notices?: GeorgeNotice[];
  /** What the person has picked, so a comparison can mark its own subjects. */
  selection?: string[];
}

/* ------------------------------------------------------------------ shell */

/**
 * The tile every object sits in.
 *
 * `hue` is WHAT THIS IS — from identity.ts, the same every time you see it.
 * `change` only sets how brightly that hue burns. The two never trade places,
 * which is what lets a shop keep its colour through a bad week.
 */
function Shell({ hue, change, quiet, solid, george, landing, delay, picked, children, onOpen }: {
  hue?: Rgb;
  change?: Change | null;
  quiet?: boolean;
  /** A name and a figure: fully coloured, the way the reference tiles are. */
  solid?: boolean;
  george?: boolean;
  landing: boolean;
  delay: number;
  picked?: boolean;
  children: ReactNode;
  onOpen?: () => void;
}) {
  const i = change ? intensity(change) : 0;
  const cls = [
    'r-tile',
    solid ? 'r-tile--solid' : '',
    george ? 'r-tile--george' : '',
    quiet && !solid ? 'r-tile--quiet' : '',
    picked ? 'r-tile--picked' : '',
    landing ? 'r-landing' : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      style={{
        ...(george ? {} : { '--hue': hue, '--i': i.toFixed(3) }),
        '--d': `${delay}ms`,
      } as CSSProperties}
      {...(onOpen ? { 'data-open': true, role: 'button', tabIndex: 0,
        onClick: onOpen,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
        } } : {})}
    >
      {children}
    </div>
  );
}

function Delta({ change }: { change: Change }) {
  if (change.status && change.status !== 'ok') {
    const word = change.status === 'no_baseline' ? 'new'
      : change.status === 'no_current' ? 'none now' : 'was zero';
    const long = change.status === 'no_baseline' ? 'new — nothing to compare against'
      : change.status === 'no_current' ? 'nothing this period' : 'the previous period was zero';
    return <span className="r-delta r-delta--none" title={long}>{word}</span>;
  }
  if (change.pct === null) return null;
  if (change.pct === 0) return <span className="r-delta r-delta--none">no change</span>;
  // The sign is always drawn, so direction survives being the same green as
  // the shop called Greenhills.
  return (
    <span className="r-delta" style={{ '--dir': directionRgb(tone(change)) } as CSSProperties}>
      {change.pct > 0 ? '▲' : '▼'} {pct(change.pct)}
    </span>
  );
}

function Receipts({ meta }: { meta: Parameters<typeof receiptsLine>[0] }) {
  const line = receiptsLine(meta);
  if (!line) return null;
  return <p className="r-src" style={{ marginTop: 12 }}>{line}</p>;
}

/**
 * The three things the owner asked to be able to do to an object without
 * typing a sentence. Two are instant and local; only `why` costs a turn,
 * because only `why` needs a new fact.
 */
function Acts({ subject, dimension, o, on }: {
  subject: string | null; dimension: Dimension | null; o: BoardObject; on: TileActions;
}) {
  return (
    <div className="r-acts" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="r-act" onClick={() => on.open(o.key)}>open</button>
      {subject && (
        <>
          <button type="button" className="r-act" onClick={() => on.pick(subject, dimension)}>compare</button>
          <button type="button" className="r-act" onClick={() => on.why(subject, dimension)}>why</button>
        </>
      )}
      <button type="button" className="r-act" onClick={() => on.aside(o.key)}>set aside</button>
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <div className="r-tile r-tile--quiet">
      <p className="r-note">George composed this from {what}, which this read does not carry.</p>
    </div>
  );
}

/**
 * WHAT KIND OF THING A READ IS ABOUT, from the tool that produced it. A table
 * of purchase orders is not the same kind of object as a table of shops, and
 * on a board of ten tiles that difference is worth a colour.
 */
/**
 * The call an object draws from: the re-tuned one if a control moved, else the
 * turn's own. One function so no tile can disagree with another about which
 * figures are on screen.
 */
function callFor(p: TileProps): ToolCall | null {
  return p.retuned ?? callOf(p.turn, p.o.seq);
}


function kindOfRead(tool?: string | null): string {
  if (!tool) return 'product';
  if (tool.includes('purchas')) return 'supplier';
  if (tool.includes('replenish') || tool.includes('movement')) return 'delivery';
  if (tool.includes('stock') || tool.includes('dead')) return 'stock';
  if (tool.includes('product') || tool.includes('cost')) return 'product';
  return 'category';
}

/* ------------------------------------------------------------- the objects */

/**
 * A SUBJECT — a shop, a product, a supplier. The workhorse of the board, and
 * the thing the owner said he wants first: is it up or down, and by how much.
 * `hero` and `figure` are this tile at different sizes.
 */
export function SubjectTile(p: TileProps & { size?: 'lead' | 'normal' | 'small' }) {
  const call = callFor(p);
  const rows = rowsOf(call);
  const row = p.o.subject ? rowFor(rows, p.o.subject) : rows[0] ?? null;
  if (!row) return <Missing what={p.o.subject ?? 'a row'} />;

  const change = changeOf(row);
  const v = valueOf(row);
  const label = p.o.subject ?? subjectOf(row) ?? '';
  const dimension = dimensionOf(rows, label);
  const size = p.size ?? (p.o.weight === 'lead' ? 'lead' : p.o.weight === 'quiet' ? 'small' : 'normal');
  const figure = size === 'lead' ? 46 : size === 'small' ? 24 : 32;
  /*
   * COLOUR FOLLOWS ATTENTION. A board keeps objects across turns, so putting
   * every subject on a saturated field means six questions in you are looking
   * at a fruit salad. What is live and leading burns; what has gone quiet or
   * came from an earlier turn cools to paper and keeps its hue only on the
   * edge — still findable, no longer shouting.
   *
   * Seven shops asked about at once are all live, so "how are we doing" still
   * lights the whole board. Ask about a supplier next and they cool while the
   * draft lights up.
   */
  const lit = !p.earlier && p.o.weight !== 'quiet';

  return (
    <>
    <Shell hue={hueFor(label, dimension, p.o.kind)} change={change}
           solid={lit} quiet={!lit}
           landing={p.landing} delay={p.delay} picked={p.focused || p.selected}
           onOpen={() => p.on.open(p.o.key)}>
      <p className="r-label">{label}{p.earlier ? ' · from earlier' : ''}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        <span className="r-num" style={{ '--size': `${figure}px` } as CSSProperties}>
          {v ? fmt(v.key, v.value) : '—'}
        </span>
        <Delta change={change} />
      </div>
      {v && <p className="r-label" style={{ marginTop: 9 }}>{measureOf(call?.result?.meta, v.key)}</p>}
      <Acts subject={label} dimension={dimension} o={p.o} on={p.on} />
      <Receipts meta={call?.result?.meta} />
    </Shell>
    {/* OPENED — BELOW THE TILE, NOT INSIDE IT. Focusing a subject no longer
        just makes it bigger; it loads the object. The panel sits outside the
        Shell for two reasons that are both bugs otherwise: a tile clips its
        content (overflow:hidden, which the bloom needs), so an inside panel
        was cut off mid-table; and a lit tile is a solid colour, so body text
        and receipts inside it fought the fill. On the ground it reads. */}
    {p.focused && label && kindOf(dimension) && (
      <div onClick={(e) => e.stopPropagation()}>
        <ObjectPanel kind={kindOf(dimension) as string} name={label} />
      </div>
    )}
    </>
  );
}

/** Two to four subjects from one read, each lit by its own figure. */
export function ComparisonTile(p: TileProps) {
  const call = callFor(p);
  const rows = rowsOf(call);
  const subjects = p.o.subjects ?? [];
  if (!subjects.length) return <Missing what="the subjects" />;

  return (
    <div className={`r-tile r-tile--quiet ${p.landing ? 'r-landing' : ''}`}
         style={{ '--d': `${p.delay}ms`, padding: 0, border: 0, background: 'transparent' } as CSSProperties}>
      <p className="r-label" style={{ marginBottom: 10 }}>
        {call?.result?.meta?.metric_label ?? 'compared'}{p.earlier ? ' · from earlier' : ''}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {subjects.map((s, n) => {
          const row = rowFor(rows, s);
          const change = row ? changeOf(row) : { pct: null, direction: null } as Change;
          const v = row ? valueOf(row) : null;
          const dimension = dimensionOf(rows, s);
          return (
            <Shell key={s} hue={hueFor(s, dimension, 'subject')} change={change} solid
                   landing={p.landing} delay={p.delay + n * 90}
                   picked={p.selection?.includes(s)}
                   onOpen={() => p.on.pick(s, dimension)}>
              <p className="r-label">{s}</p>
              <div style={{ marginTop: 9 }}>
                <span className="r-num" style={{ '--size': '26px' } as CSSProperties}>
                  {v ? fmt(v.key, v.value) : '—'}
                </span>
              </div>
              <div style={{ marginTop: 9 }}><Delta change={change} /></div>
            </Shell>
          );
        })}
      </div>
      <Receipts meta={call?.result?.meta} />
    </div>
  );
}

/**
 * George's own words. Warm white, dim, never a performance colour.
 *
 * CLAMPED, AND THAT IS THE POINT. He writes at length, and the board keeps
 * every turn's reading — so two turns of unclamped prose is two essays, which
 * is exactly what the last three builds looked like. What is on screen is the
 * top of the thought; the rest is one word away. A reading from an earlier
 * turn clamps harder still: it is context now, not the answer.
 */
export function TextTile(p: TileProps) {
  const [open, setOpen] = useState(false);
  const lines = p.earlier ? 2 : p.o.weight === 'lead' ? 6 : 4;
  const text = p.turn.text ?? '';
  // Only offer the toggle when there is genuinely more — roughly the
  // characters that fit, not a character count anyone reads.
  const long = text.length > lines * 62;
  return (
    <Shell george landing={p.landing} delay={p.delay}>
      {p.notices && p.notices.length > 0 && (
        <div style={{ marginBottom: 15 }}><Caveats notices={p.notices} /></div>
      )}
      <p
        className={`r-say ${p.o.weight === 'lead' && !p.earlier ? 'r-say--lead' : ''}`}
        style={{
          whiteSpace: 'pre-wrap',
          ...(open || !long ? {} : {
            display: '-webkit-box',
            WebkitLineClamp: lines,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }),
        }}
      >
        {text}
      </p>
      {long && (
        <button type="button" className="r-act" style={{ marginTop: 10 }}
                onClick={() => setOpen((v) => !v)}>
          {open ? 'less' : 'read the rest'}
        </button>
      )}
    </Shell>
  );
}

export function TableTile(p: TileProps) {
  const call = callFor(p);
  const all = rowsOf(call);
  const sort = p.local.sort;
  const rows = sorted(all, sort).slice(0, 40);
  const open = p.local.open ?? (p.o.weight !== 'quiet' || all.length <= 8);
  if (!rows.length) return <Missing what="rows" />;
  const meta = call?.result?.meta;

  // A column with one value on every row is a fact about the TABLE, not a
  // column. Said once, above it, it is the scope.
  const keys = Object.keys(rows[0]).filter(
    (k) => !k.endsWith('_id') && !['seq', 'call_seq', 'direction', 'baseline_status'].includes(k));
  const constant: string[] = [];
  const cols: string[] = [];
  for (const k of keys) {
    const distinct = new Set(rows.map((r) => String(r[k] ?? '')));
    if (rows.length >= 3 && distinct.size === 1 && String(rows[0][k] ?? '').length <= 24
        && !/sales|revenue|value|total|cost|price/i.test(k)) {
      constant.push(fmt(k, rows[0][k]));
    } else {
      cols.push(k);
    }
  }
  const money = /sales|revenue|price|cost|peso/i.test(String(meta?.metric_label ?? ''))
    || rows.some((r) => String(r.unit ?? '').toUpperCase() === 'PHP');
  const cell = (c: string, row: Record<string, unknown>) =>
    (money && (c === 'change' || c === 'baseline') ? fmt('net_sales', row[c]) : fmt(c, row[c]));

  // WHAT THE ROW IS ABOUT, WHAT IT IS, AND WHICH WAY IT WENT — in that order,
  // and at most five. A board packs tiles into columns, so a table that keeps
  // all seven columns wraps product names over three lines and cuts the last
  // figure in half. Baseline and absolute change are the first to go: the
  // value and the percentage already carry the movement, and the full set is
  // one tap away in the read's own receipts.
  const RANK: Record<string, number> = {
    product: 0, store: 0, category: 0, name: 0, supplier: 0, label: 0, day: 0, week: 0, month: 0,
    sku: 1, value: 2, change_pct: 3, change: 6, baseline: 7,
  };
  const shown = cols
    .slice()
    .sort((a, b) => (RANK[a] ?? 4) - (RANK[b] ?? 4) || cols.indexOf(a) - cols.indexOf(b))
    .slice(0, 5);
  const title = meta?.metric_label ?? p.o.tool?.replace(/^get_/, '').replace(/_/g, ' ') ?? 'rows';

  return (
    <Shell quiet hue={hueFor(null, null, kindOfRead(p.o.tool))} landing={p.landing} delay={p.delay}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <p className="r-label">
          {[title, `${all.length} rows`, ...constant].join(' · ')}{p.earlier ? ' · from earlier' : ''}
        </p>
        {all.length > 8 && (
          <button type="button" className="r-act" onClick={() => p.on.patch(p.o.key, { open: !open })}>
            {open ? 'less' : 'show'}
          </button>
        )}
      </div>
      {open && (
        <div className="r-scroll" style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="r-rows">
            <thead>
              <tr>
                {shown.map((c) => (
                  <th key={c} className={typeof rows[0][c] === 'number' ? 'n' : ''}
                      style={{ cursor: 'pointer' }}
                      aria-sort={sort?.column === c ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                      onClick={() => p.on.patch(p.o.key,
                        { sort: { column: c, desc: sort?.column === c ? !sort.desc : true } })}>
                    {c.replace(/_/g, ' ')}{sort?.column === c ? (sort.desc ? ' ▾' : ' ▴') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, n) => (
                <tr key={n}>
                  {shown.map((c) => (
                    <td key={c} className={typeof row[c] === 'number' ? 'n' : ''}>
                      {c === 'change_pct' ? <Delta change={changeOf(row)} /> : cell(c, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Receipts meta={meta} />
    </Shell>
  );
}

/** A series or a ranked set, read as shape. Each dot lit by its own move. */
export function DistributionTile(p: TileProps) {
  const call = callFor(p);
  const rows = rowsOf(call);
  if (!rows.length) return <Missing what="the series" />;
  const changes = rows.map(changeOf);
  const values = rows.map((r, n) => changes[n].pct ?? valueOf(r)?.value ?? 0);
  const peak = Math.max(1, ...values.map(Math.abs));

  return (
    <Shell quiet hue={hueFor(null, null, kindOfRead(p.o.tool))} landing={p.landing} delay={p.delay}>
      <p className="r-label">
        {call?.result?.meta?.metric_label ?? 'over time'}{p.earlier ? ' · from earlier' : ''}
      </p>
      <div className="r-dots" style={{ marginTop: 12 }}>
        {rows.map((row, n) => {
          const v = values[n];
          const t = tone(changes[n]);
          return (
            <i key={n} title={`${subjectOf(row) ?? ''}: ${pct(v)}`}
               style={{
                 '--d': `${7 + (Math.abs(v) / peak) * 11}px`,
                 '--c': `var(--${t})`,
                 '--y': `${-(v / peak) * 11}px`,
               } as CSSProperties} />
          );
        })}
      </div>
      <p className="r-label" style={{ marginTop: 8 }}>
        {subjectOf(rows[0]) ?? ''} → {subjectOf(rows[rows.length - 1]) ?? ''}
      </p>
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}

export function ChartTile(p: TileProps) {
  const call = callFor(p);
  const rows = rowsOf(call).slice(0, 60);
  if (!rows.length) return <Missing what="the series" />;
  const values = rows.map((r) => valueOf(r)?.value ?? 0);
  const max = Math.max(1, ...values);
  const W = 560, H = 130, pad = 8;
  const x = (n: number) => pad + (n / Math.max(1, rows.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = values.map((v, n) => `${x(n)},${y(v)}`).join(' ');

  const hue = hueFor(p.o.subject, null, kindOfRead(p.o.tool));
  return (
    <Shell quiet hue={hue} landing={p.landing} delay={p.delay}>
      <p className="r-label">
        {call?.result?.meta?.metric_label ?? 'series'}{p.earlier ? ' · from earlier' : ''}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ marginTop: 10, display: 'block' }}
           role="img" aria-label={call?.result?.meta?.metric_label ?? 'series'}>
        <defs>
          <linearGradient id={`fill-${p.o.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`rgb(${hue})`} stopOpacity="0.30" />
            <stop offset="100%" stopColor={`rgb(${hue})`} stopOpacity="0" />
          </linearGradient>
        </defs>
        {p.o.form === 'bar'
          ? values.map((v, n) => (
              <rect key={n} x={x(n) - (W / rows.length) * 0.3} y={y(v)}
                    width={(W / rows.length) * 0.6} height={H - pad - y(v)}
                    fill={`rgb(${hue})`} opacity={0.75} rx={2} />
            ))
          : (
            <>
              <polygon fill={`url(#fill-${p.o.key})`}
                       points={`${pad},${H - pad} ${line} ${x(rows.length - 1)},${H - pad}`} />
              <polyline fill="none" stroke={`rgb(${hue})`} strokeWidth={1.6} points={line} />
              <circle cx={x(rows.length - 1)} cy={y(values[values.length - 1])} r={3.5}
                      fill={`rgb(${hue})`} />
            </>
          )}
      </svg>
      <p className="r-label" style={{ marginTop: 6 }}>
        {subjectOf(rows[0]) ?? ''} → {subjectOf(rows[rows.length - 1]) ?? ''}
      </p>
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}

/**
 * A DRAFT — an order George produced. The quantity a person nudges is theirs
 * and lives here until they say to keep it; nothing is sent by nudging, and
 * the suggested figure stays beside it so an edit is always an edit OF
 * something.
 */
export function DraftTile(p: TileProps) {
  const call = callFor(p);
  const rows = rowsOf(call);
  const [qty, setQty] = useState<Record<number, number>>({});
  if (!rows.length) return <Missing what="the draft" />;
  const meta = call?.result?.meta as (Record<string, unknown> & { supplier?: string; cover_days?: number }) | undefined;
  const suggested = (row: Record<string, unknown>) =>
    Number(row.suggested_order_qty ?? row.requested_ship_qty ?? 0) || 0;
  const total = rows.reduce((s, row, n) => s + (qty[n] ?? suggested(row)), 0);

  return (
    <Shell hue={hueFor(meta?.supplier, null, 'supplier')} landing={p.landing} delay={p.delay}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <p className="r-label">draft order{meta?.supplier ? ` · ${meta.supplier}` : ''}</p>
          <p className="r-say" style={{ fontSize: 17, marginTop: 7 }}>
            {meta?.cover_days ? `Enough to last ${meta.cover_days} days` : 'What is running out'}
          </p>
        </div>
        <span className="r-delta r-delta--none">nothing sent</span>
      </div>

      <div className="r-scroll" style={{ overflowX: 'auto', marginTop: 16 }}>
        <table className="r-rows">
          <thead>
            <tr>
              <th>product</th><th className="n">per day</th>
              <th className="n">on hand</th><th className="n">order</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 30).map((row, n) => (
              <tr key={n}>
                <td>
                  <div style={{ color: 'var(--ink)' }}>{String(row.product ?? row.sku ?? '')}</div>
                  <div className="r-src" style={{ marginTop: 3 }}>
                    {row.days_of_cover !== undefined && row.days_of_cover !== null
                      ? `${fmt('days', row.days_of_cover)} days of cover` : ''}
                    {Number(row.days_with_nothing ?? 0) > 0
                      ? ` · out ${fmt('d', row.days_with_nothing)} days` : ''}
                  </div>
                </td>
                <td className="n">{fmt('units_per_day', row.units_per_day)}</td>
                <td className="n">{fmt('on_hand', row.on_hand)}</td>
                <td className="n">
                  <input
                    value={qty[n] ?? suggested(row)}
                    onChange={(e) => setQty((q) => ({ ...q, [n]: Math.max(0, Number(e.target.value) || 0) }))}
                    style={{
                      width: 62, textAlign: 'right', background: 'transparent', color: 'var(--ink)',
                      border: 0, borderBottom: '1px solid var(--edge)', outline: 0,
                      font: '400 13px/1.4 var(--sans)', fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                    marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--edge)' }}>
        <div>
          <p className="r-label">units to order</p>
          <div style={{ marginTop: 7 }}>
            <span className="r-num" style={{ '--size': '30px' } as CSSProperties}>
              {total.toLocaleString('en-PH')}
            </span>
          </div>
        </div>
        <p className="r-label" style={{ textAlign: 'right' }}>
          {rows.length} products{rows.length > 30 ? ' · showing 30' : ''}
        </p>
      </div>
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}

/** Where a process stands. */
export function StateTile(p: TileProps) {
  const call = callFor(p);
  const meta = call?.result?.meta as (Record<string, unknown> & {
    run?: { run_date?: string; age_days?: number; stores_covered?: number; lines?: number };
  }) | undefined;
  const label = p.o.label ?? 'pending';
  return (
    <Shell solid hue={hueFor(null, null, 'order')} landing={p.landing} delay={p.delay}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p className="r-label">{label}</p>
        <span className="r-delta r-delta--none">{label}</span>
      </div>
      {meta?.run && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
            <span className="r-num" style={{ '--size': '28px' } as CSSProperties}>
              {String(meta.run.age_days ?? '—')}
            </span>
            <span className="r-label">days since this ran</span>
          </div>
          <p className="r-note" style={{ marginTop: 7 }}>
            run of {meta.run.run_date} · {meta.run.stores_covered} shops · {meta.run.lines?.toLocaleString()} lines
          </p>
        </>
      )}
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}

/* ---------------------------------------------------------------- caveats */

function Caveat({ notice }: { notice: GeorgeNotice }) {
  const [open, setOpen] = useState(false);
  const { head, detail } = splitCaveat(notice.message);
  return (
    <p className="r-caveat">
      {head}
      {detail && (
        <>
          {' '}
          <button type="button" className="r-more" onClick={() => setOpen((o) => !o)}>
            {open ? 'less' : detail.includes(';') ? 'which ones' : 'more'}
          </button>
          {open && <span className="r-caveat-detail">{detail}</span>}
        </>
      )}
    </p>
  );
}

export function Caveats({ notices }: { notices?: GeorgeNotice[] }) {
  if (!notices || notices.length === 0) return null;
  return (
    <div className="r-caveats" data-caveats={notices.length}>
      {notices.map((n, i) => <Caveat key={`${n.kind}-${i}`} notice={n} />)}
    </div>
  );
}

/* ---------------------------------------------------------------- timeline
 *
 * WHEN something happened, in order. A chart is for the shape of a series and
 * a table for precision; this is for a sequence — eight weeks of a shop, an
 * order history, the day stock crossed to zero.
 *
 * IT DRAWS ONLY WHAT THE READ CARRIES. The date column is found in the rows,
 * never assumed, and a read with no date at all says so rather than inventing
 * an order for things that have none.
 */
const DATEISH = /(date|day|week|month|_at$|when|period|sold|created)/i;

function timeOf(row: Record<string, unknown>, column: string): number | null {
  const raw = row[column];
  if (raw == null) return null;
  const at = new Date(String(raw)).getTime();
  return Number.isFinite(at) ? at : null;
}

export function TimelineTile(p: TileProps) {
  const call = callFor(p);
  const rows = rowsOf(call);
  if (!rows.length) return <Missing what="rows" />;

  const column = Object.keys(rows[0]).find(
    (k) => DATEISH.test(k) && timeOf(rows[0], k) !== null,
  );
  if (!column) return <Missing what="a date to lay out in time" />;

  const points = rows
    .map((row) => ({ row, at: timeOf(row, column) }))
    .filter((point): point is { row: Record<string, unknown>; at: number } => point.at !== null)
    .sort((a, b) => a.at - b.at);
  if (!points.length) return <Missing what="a date to lay out in time" />;

  const first = points[0].at;
  const last = points[points.length - 1].at;
  const span = Math.max(1, last - first);
  const label = (row: Record<string, unknown>) =>
    String(row.product ?? row.store ?? row.subject ?? row.what ?? row.name ?? row.basis ?? '');
  const v = (row: Record<string, unknown>) => valueOf(row);

  return (
    <Shell quiet hue={hueFor(null, null, kindOfRead(p.o.tool))}
           landing={p.landing} delay={p.delay}>
      <p className="r-label">
        {call?.result?.meta?.metric_label ?? 'in time'} · {points.length} points
        {p.earlier ? ' · from earlier' : ''}
      </p>
      <div className="r-time">
        <div className="r-time-axis" />
        {points.map((point, n) => {
          const at = ((point.at - first) / span) * 100;
          const figure = v(point.row);
          return (
            <div key={n} className="r-time-point" style={{ left: `${at}%` }}>
              <i />
              <span className="r-time-when">
                {new Date(point.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              {(label(point.row) || figure) && (
                <span className="r-time-what">
                  {label(point.row)}
                  {figure ? ` · ${fmt(figure.key, figure.value)}` : ''}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}

/* ---------------------------------------------------------- recommendation
 *
 * ONE thing George thinks should be done, over the read that makes the case.
 *
 * THE VERB IS HIS AND THE NUMBER IS THE TOOL'S, and the block has no field for
 * a figure, so it cannot be otherwise. "Order 806 units" is get_purchase_plan's
 * quantity beside George's chosen word; "order about 800" is unrepresentable.
 */
const ACTS: Record<string, string> = {
  order: 'Order', investigate: 'Look into', check: 'Check',
  hold: 'Hold off on', switch_on: 'Switch on', leave_it: 'Leave',
};

export function RecommendationTile(p: TileProps) {
  const call = callFor(p);
  const rows = rowsOf(call);
  const subject = p.o.subject ?? '';
  const row = rowFor(rows, subject);
  const figure = row ? valueOf(row) : null;
  const dimension = dimensionOf(rows, subject);
  const lit = !p.earlier && p.o.weight !== 'quiet';

  return (
    <Shell hue={hueFor(subject, dimension, 'subject')} solid={lit} quiet={!lit}
           landing={p.landing} delay={p.delay} picked={p.focused || p.selected}
           onOpen={() => p.on.open(p.o.key)}>
      <p className="r-label">{ACTS[p.o.action ?? ''] ?? 'Consider'}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        <span className="r-num" style={{ '--size': '30px' } as CSSProperties}>
          {figure ? fmt(figure.key, figure.value) : subject}
        </span>
        {figure && <span className="r-label">{subject}</span>}
      </div>
      {figure && <p className="r-label" style={{ marginTop: 9 }}>{measureOf(call?.result?.meta, figure.key)}</p>}
      <Acts subject={subject} dimension={dimension} o={p.o} on={p.on} />
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}

/* ----------------------------------------------------------------- control
 *
 * A HANDLE ON A READ THAT IS ALREADY ON SCREEN. Change the window and every
 * object drawn from that read re-runs — no model turn, nothing read that the
 * person did not ask for. This is the same path the desk replay takes, which
 * is why it costs a second rather than forty.
 *
 * SCOPE ONLY. There is no control that changes a threshold, because a
 * threshold is a definition and lives in metrics.yaml where it was measured.
 * The vocabulary makes that structural rather than a matter of restraint.
 */
const WINDOWS = ['yesterday', 'last_week', 'last_month', 'last_30_days'];
const COUNTS = [5, 10, 25];

export function ControlTile(p: TileProps) {
  const call = callFor(p);
  const argument = p.o.argument ?? 'date_range';
  const current = String(
    (call?.arguments as Record<string, unknown> | undefined)?.[argument] ?? '',
  );
  const options: (string | number)[] = argument === 'top_n' ? COUNTS : WINDOWS;

  return (
    <Shell quiet hue={hueFor(null, null, 'order')} landing={p.landing} delay={p.delay}>
      <p className="r-label">
        {argument === 'top_n' ? 'how many' : 'window'}
        {p.o.tool ? ` · ${p.o.tool.replace(/^get_/, '')}` : ''}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {options.map((option) => (
          <button
            key={String(option)}
            type="button"
            className="r-chip"
            aria-pressed={String(option) === current}
            style={String(option) === current
              ? { borderColor: 'rgba(17,24,39,.32)', color: 'var(--ink)' }
              : undefined}
            onClick={() => p.on.retune?.(p.o.key, argument, option)}
          >
            {String(option).replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {/* No receipts: a control states no figure. What it changes carries its
          own, and re-runs them when it moves. */}
    </Shell>
  );
}

/* ------------------------------------------------------------------ system
 *
 * SOMETHING THAT RUNS: a saved rule, a standing question, a watch. Drawn over
 * view_automations, which is the read that returns them.
 *
 * The states are not interchangeable and are never collapsed into "on": a
 * watch that is quiet LOOKED and found nothing; one that is not switched on is
 * not looking; one that has never been backtested cannot start. Three
 * different facts about a thing you might be relying on.
 */
export function SystemTile(p: TileProps) {
  const call = callFor(p);
  const rows = rowsOf(call);
  const subject = p.o.subject ?? '';
  const row = rowFor(rows, subject) ?? {};
  const state = String(row.state ?? '');
  const when = row.when ? new Date(String(row.when)) : null;

  return (
    <Shell quiet hue={hueFor(null, null, 'order')} landing={p.landing} delay={p.delay}
           picked={p.focused} onOpen={() => p.on.open(p.o.key)}>
      <p className="r-label">{subject}{p.earlier ? ' · from earlier' : ''}</p>
      <p className="r-note" style={{ marginTop: 8 }}>{state || 'no state recorded'}</p>
      {row.by ? (
        <p className="r-label" style={{ marginTop: 8, opacity: 0.8 }}>{String(row.by)}</p>
      ) : null}
      {when && !Number.isNaN(when.getTime()) && (
        <p className="r-label" style={{ marginTop: 6, opacity: 0.75 }}>
          last {when.toLocaleString()}
        </p>
      )}
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}
