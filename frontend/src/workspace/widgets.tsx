/**
 * The closed set of things a composition may be drawn with.
 *
 * Each takes a resolved block — the block George chose and the rows of the
 * read it points at — and draws it. None takes a colour, a size or a figure
 * from anywhere but those rows. If George wants to say something new, the
 * vocabulary in metrics.yaml grows and a widget is added here; nothing is ever
 * improvised at a call site.
 */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { GeorgeNotice, ToolMeta } from '../types/george';
import { changeOf, rowFor, subjectOf, valueOf, type Resolved } from './composition';

/* ------------------------------------------------------------ formatting */

const PESO_KEYS = /sales|revenue|value|subtotal|total|cost|price|amount|_php$|peso/i;

/**
 * How many decimals a figure keeps.
 *
 * A peso figure in the hundreds of thousands does not need centavos —
 * "₱141,838.5" reads as a number that broke, not as a precise one — while a
 * rate of 3.711 units a day needs two. The threshold is the magnitude, not the
 * column name, so it holds for a figure nobody has seen before.
 */
function digits(n: number): number {
  if (Number.isInteger(n)) return 0;
  return Math.abs(n) >= 1000 ? 0 : 2;
}

export function fmt(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v))) {
    const n = Number(v);
    if (PESO_KEYS.test(key)) return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: digits(n) })}`;
    if (/pct|percent|share/i.test(key)) return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
    return n.toLocaleString('en-PH', { maximumFractionDigits: digits(n) });
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return String(v);
}

function pct(n: number | null): string {
  if (n === null) return '';
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`;
}

/**
 * THE CAVEATS, above the work, in words a person reads on the way to the number.
 *
 * A caveat stays above the figure it qualifies and never sits behind a
 * disclosure that gives no hint it is there (CLAUDE.md UI rule 4). What it may
 * not do is push the claim off the screen — the greeting amendment says exactly
 * that, in those words — and the first dogfood of this workspace was a page
 * whose top two hundred pixels were forty product SKUs and the word NULL, with
 * the answer below them.
 *
 * So the notice's own sentence is always visible, whole: the count, the reason,
 * and the fact that it happened. Where the message goes on to ENUMERATE — "…:
 * Sari Kesari BALI peanuts (INDO 2); …and 40 more" — the list sits behind one
 * word on the same line. Nothing is hidden that the sentence has not already
 * announced, and nothing is summarised here: the split is at a punctuation
 * boundary in George's own text, never a rewrite of it.
 */
export function splitCaveat(message: string): { head: string; detail: string | null } {
  const firstItem = message.indexOf(';');
  if (firstItem < 0) return { head: message, detail: null };
  const cut = message.lastIndexOf(':', firstItem);
  if (cut < 0) return { head: message, detail: null };
  const detail = message.slice(cut + 1).trim();
  // Only split when the list is the long half: a two-item list is shorter than
  // the word that would hide it.
  if (detail.length < 90) return { head: message, detail: null };
  return { head: message.slice(0, cut).trim().replace(/[:,]$/, '') + '.', detail };
}

function Caveat({ notice }: { notice: GeorgeNotice }) {
  const [open, setOpen] = useState(false);
  const { head, detail } = splitCaveat(notice.message);
  return (
    <p className="ws-caveat">
      {head}
      {detail && (
        <>
          {' '}
          <button type="button" className="ws-more" onClick={() => setOpen((o) => !o)}>
            {open ? 'less' : 'which ones'}
          </button>
          {open && <span className="ws-caveat-detail">{detail}</span>}
        </>
      )}
    </p>
  );
}

export function Caveats({ notices }: { notices?: GeorgeNotice[] }) {
  if (!notices || notices.length === 0) return null;
  return (
    <div className="ws-caveats" data-caveats={notices.length}>
      {notices.map((n, i) => <Caveat key={`${n.kind}-${i}`} notice={n} />)}
    </div>
  );
}

export function Delta({ row, light = false }: { row: Record<string, unknown>; light?: boolean }) {
  const c = changeOf(row);
  if (c.status && c.status !== 'ok') {
    const word = c.status === 'no_baseline' ? 'new — nothing to compare' : c.status === 'no_current' ? 'nothing this period' : 'previous period was zero';
    return <span className="ws-mk" style={light ? { color: 'rgba(255,255,255,.8)' } : undefined}>{word}</span>;
  }
  if (c.pct === null) return null;
  const cls = c.direction === 'up' ? 'ws-pill ws-pill--up' : c.direction === 'down' ? 'ws-pill ws-pill--down' : 'ws-pill';
  return <span className={cls} style={light ? { background: 'rgba(255,255,255,.18)', color: '#fff' } : undefined}>{c.pct === 0 ? 'no change' : pct(c.pct)}</span>;
}

function Numeral({ text, size, soft = false, white = false }: { text: string; size: number; soft?: boolean; white?: boolean }) {
  return <span className={`ws-num ${soft ? 'ws-num--soft' : ''} ${white ? 'ws-num--white' : ''}`} style={{ fontSize: size }}>{text}</span>;
}

/* ------------------------------------------------------------ receipts */

export function Receipts({ meta, compact = false }: { meta?: ToolMeta | null; compact?: boolean }) {
  if (!meta) return null;
  const when = meta.snapshot_timestamp ? new Date(meta.snapshot_timestamp).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const win = meta.window?.name ?? (meta.window?.start ? `${meta.window.start} → ${meta.window.end}` : null);
  // Set quietly, in lower case. Every card used to END in
  // NEW_TRANSACTION_ITEMS + NEW_TRANSACTIONS + PRODUCTS, because the receipts
  // wore the same shouting style as a label — the provenance every figure must
  // carry (UI rules 3 and 6) was the loudest small thing on the screen.
  return (
    <p className="ws-src" style={{ marginTop: compact ? 8 : 12 }}>
      {[meta.source_table, win?.replace(/_/g, ' '), when ? `read ${when}` : null].filter(Boolean).join(' · ')}
    </p>
  );
}

/* ------------------------------------------------------------ widgets */

export interface WidgetProps {
  r: Resolved;
  selected: boolean;
  onSelect?: (subject: string) => void;
  /** George's prose, for the text widget. */
  text?: string;
  notices?: GeorgeNotice[];
  live?: boolean;
}

export function TextWidget({ text, weight, notices, live }: { text: string; weight: string; notices?: GeorgeNotice[]; live?: boolean }) {
  return (
    <div data-widget="text">
      {notices && notices.length > 0 && (
        <div style={{ marginBottom: 16 }}><Caveats notices={notices} /></div>
      )}
      <p className={`ws-say ${weight === 'lead' ? 'ws-say--lead' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
        {text || (live ? '' : '')}
      </p>
    </div>
  );
}

export function FigureWidget({ r, selected, onSelect }: WidgetProps) {
  const row = r.block.subject ? rowFor(r.rows, r.block.subject) : r.rows[0] ?? null;
  if (!row) return <Missing what={r.block.subject ?? 'the row'} />;
  const v = valueOf(row);
  const label = r.block.subject ?? subjectOf(row) ?? '';
  return (
    <div className={`ws-card ${selected ? 'ws-card--selected' : ''}`} data-widget="figure" data-clickable onClick={() => onSelect?.(label)}>
      <p className="ws-mk">{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
        <Numeral text={v ? fmt(v.key, v.value) : '—'} size={30} />
        <Delta row={row} />
      </div>
      {v && <p className="ws-mk" style={{ marginTop: 8 }}>{measureOf(r.call?.result?.meta, v.key)}</p>}
      <Receipts meta={r.call?.result?.meta} compact />
    </div>
  );
}

export function HeroWidget({ r, selected, onSelect }: WidgetProps) {
  const row = r.block.subject ? rowFor(r.rows, r.block.subject) : r.rows[0] ?? null;
  if (!row) return <Missing what={r.block.subject ?? 'the row'} />;
  const v = valueOf(row);
  const c = changeOf(row);
  const label = r.block.subject ?? subjectOf(row) ?? '';
  const tone = c.direction === 'down' ? 'ws-hero--down' : c.direction === 'up' ? 'ws-hero--up' : 'ws-hero--flat';
  // The marker on the ruler: where this change sits between the largest fall
  // and the largest rise in the same read. A position, computed from the rows
  // George already chose among — never a threshold.
  const pcts = r.rows.map((x) => changeOf(x).pct).filter((p): p is number => p !== null);
  const lo = Math.min(0, ...pcts), hi = Math.max(0, ...pcts);
  const at = c.pct === null || hi === lo ? 50 : ((c.pct - lo) / (hi - lo)) * 100;
  return (
    <div className={`ws-hero ${tone} ${selected ? 'ws-card--selected' : ''}`} data-widget="hero" data-clickable onClick={() => onSelect?.(label)} style={{ cursor: 'pointer' }}>
      <p className="ws-mk">{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 10 }}>
        <Numeral text={v ? fmt(v.key, v.value) : '—'} size={54} white />
        <Delta row={row} light />
      </div>
      <p style={{ marginTop: 8, font: '400 13px/1.4 var(--ws-sans)', color: 'rgba(255,255,255,.85)' }}>
        {r.call?.result?.meta?.metric_label ?? (v ? v.key.replace(/_/g, ' ') : '')}
        {r.call?.result?.meta?.comparison?.baseline?.name ? ` · against ${r.call.result.meta.comparison.baseline.name.replace(/_/g, ' ')}` : ''}
      </p>
      {pcts.length > 1 && (
        <>
          <div className="ws-ruler" style={{ marginTop: 22, '--at': `${at}%` } as CSSProperties} />
          <div className="ws-ruler-ends"><span>largest fall</span><span>largest rise</span></div>
        </>
      )}
    </div>
  );
}

export function SubjectWidget({ r, selected, onSelect }: WidgetProps) {
  const row = r.block.subject ? rowFor(r.rows, r.block.subject) : null;
  if (!row) return <Missing what={r.block.subject ?? 'the row'} />;
  const v = valueOf(row);
  const label = r.block.subject ?? '';
  const quiet = r.block.weight === 'quiet';
  return (
    <div className={`ws-card ${quiet ? 'ws-card--quiet' : ''} ${selected ? 'ws-card--selected' : ''}`} data-widget="subject" data-clickable onClick={() => onSelect?.(label)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <p className="ws-say" style={{ fontSize: quiet ? 15 : 18 }}>{label}</p>
        <Delta row={row} />
      </div>
      <div style={{ marginTop: 10 }}>
        <Numeral text={v ? fmt(v.key, v.value) : '—'} size={quiet ? 20 : 28} soft={quiet} />
      </div>
      <Receipts meta={r.call?.result?.meta} compact />
    </div>
  );
}

export function ComparisonWidget({ r, selected, onSelect }: WidgetProps) {
  const subjects = r.block.subjects ?? [];
  const rows = subjects.map((s) => ({ s, row: rowFor(r.rows, s) }));
  return (
    <div className="ws-card" data-widget="comparison">
      <p className="ws-mk">{r.call?.result?.meta?.metric_label ?? 'compared'}</p>
      <div className={subjects.length === 2 ? 'ws-seam' : ''} style={{ display: 'grid', gridTemplateColumns: `repeat(${subjects.length}, 1fr)`, gap: 20, marginTop: 14 }}>
        {rows.map(({ s, row }) => {
          const v = row ? valueOf(row) : null;
          return (
            <div key={s} data-clickable onClick={() => onSelect?.(s)} style={{ cursor: 'pointer', outline: selected ? '2px solid var(--ws-george)' : 'none', borderRadius: 12, padding: 6 }}>
              <p className="ws-say" style={{ fontSize: 17 }}>{s}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                <Numeral text={v ? fmt(v.key, v.value) : '—'} size={26} />
                {row && <Delta row={row} />}
              </div>
            </div>
          );
        })}
      </div>
      <Receipts meta={r.call?.result?.meta} compact />
    </div>
  );
}

export function TableWidget({ r }: WidgetProps) {
  const rows = r.rows.slice(0, 40);
  // A small table folded to its heading is a card that reads
  // "PRODUCT REVENUE · 5 ROWS" and nothing else — quiet is not the same as
  // empty. Only a long one is worth folding away.
  const [open, setOpen] = useState(r.block.weight !== 'quiet' || r.rows.length <= 8);
  if (!rows.length) return <Missing what="rows" />;
  const meta = r.call?.result?.meta;

  // A column with one value on every row is a fact about the TABLE, not a
  // column. "PHP" seven times down the left of a table of pesos is noise; said
  // once, above it, it is the scope. Nothing is dropped — it moves.
  const keys = Object.keys(rows[0]).filter(
    (k) => !k.endsWith('_id') && !['seq', 'call_seq', 'direction', 'baseline_status'].includes(k));
  const constant: string[] = [];
  const cols: string[] = [];
  for (const k of keys) {
    const distinct = new Set(rows.map((row) => String(row[k] ?? '')));
    const only = String(rows[0][k] ?? '');
    if (rows.length >= 3 && distinct.size === 1 && only.length <= 24 && !PESO_KEYS.test(k)) {
      constant.push(fmt(k, rows[0][k]));
    } else {
      cols.push(k);
    }
  }

  // A comparison's `change` and `baseline` are in the same unit as its `value`,
  // and were the only figures on screen without their peso sign.
  const money = /sales|revenue|price|cost|peso/i.test(String(meta?.metric_label ?? ''))
    || rows.some((row) => String(row.unit ?? '').toUpperCase() === 'PHP');
  const cell = (c: string, row: Record<string, unknown>) =>
    (money && (c === 'change' || c === 'baseline') ? fmt('net_sales', row[c]) : fmt(c, row[c]));

  const shown = cols.slice(0, 7);
  const title = meta?.metric_label ?? r.block.tool?.replace(/^get_/, '').replace(/_/g, ' ') ?? 'rows';
  return (
    <div className={`ws-card ${r.block.weight === 'quiet' ? 'ws-card--quiet' : ''}`} data-widget="table">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <p className="ws-mk">{[title, `${r.rows.length} rows`, ...constant].join(' · ')}</p>
        {r.rows.length > 8 && (
          <button className="ws-word" style={{ margin: 0 }} onClick={() => setOpen((o) => !o)}>{open ? 'less' : 'show'}</button>
        )}
      </div>
      {open && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="ws-rows">
            <thead><tr>{shown.map((c) => <th key={c} className={typeof rows[0][c] === 'number' ? 'n' : ''}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>{shown.map((c) => <td key={c} className={typeof row[c] === 'number' ? 'n' : ''}>{c === 'change_pct' ? <Delta row={row} /> : cell(c, row)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Receipts meta={meta} compact />
    </div>
  );
}

export function DistributionWidget({ r }: WidgetProps) {
  const rows = r.rows;
  if (!rows.length) return <Missing what="the series" />;
  const values = rows.map((x) => changeOf(x).pct ?? (valueOf(x)?.value ?? 0));
  const peak = Math.max(1, ...values.map(Math.abs));
  return (
    <div className="ws-card" data-widget="distribution">
      <p className="ws-mk">{r.call?.result?.meta?.metric_label ?? 'over time'}</p>
      <div className="ws-dots" style={{ marginTop: 10 }}>
        {rows.map((row, i) => {
          const v = values[i];
          return (
            <i key={i} className={i === rows.length - 1 ? 'now' : undefined} title={`${subjectOf(row) ?? ''}: ${pct(v)}`}
              style={{ '--d': `${7 + (Math.abs(v) / peak) * 10}px`, '--c': v > 0 ? 'var(--ws-up)' : v < 0 ? 'var(--ws-down)' : 'var(--ws-flat)', '--y': `${-(v / peak) * 10}px` } as CSSProperties} />
          );
        })}
      </div>
      <p className="ws-mk" style={{ marginTop: 6 }}>{span(rows)} · the last is ringed</p>
      <Receipts meta={r.call?.result?.meta} compact />
    </div>
  );
}

/**
 * A DRAFT: an order George produced, with quantities you can nudge.
 *
 * The quantity a person changes is theirs and lives here until they say "keep
 * this"; nothing is sent anywhere by nudging. The suggested figure from the
 * read stays visible beside it so an edit is always an edit OF something.
 */
export function DraftWidget({ r }: WidgetProps) {
  const rows = r.rows;
  const [qty, setQty] = useState<Record<number, number>>({});
  if (!rows.length) return <Missing what="the draft" />;
  const suggested = (row: Record<string, unknown>) => Number(row.suggested_order_qty ?? row.requested_ship_qty ?? 0) || 0;
  const total = rows.reduce((s, row, i) => s + (qty[i] ?? suggested(row)), 0);
  const meta = r.call?.result?.meta;
  const supplier = (meta as { supplier?: string } | undefined)?.supplier;
  const cover = (meta as { cover_days?: number } | undefined)?.cover_days;
  return (
    <div className="ws-card" data-widget="draft" style={{ padding: '24px 26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <p className="ws-mk">draft order{supplier ? ` · ${supplier}` : ''}</p>
          <p className="ws-say" style={{ fontSize: 18, marginTop: 6 }}>{cover ? `Enough to last ${cover} days` : 'What is running out'}</p>
        </div>
        <span className="ws-pill ws-pill--chip">draft · nothing sent</span>
      </div>
      <div style={{ marginTop: 16 }}>
        <div className="ws-draft-row" style={{ paddingTop: 0 }}>
          <span className="ws-mk">product</span><span className="ws-mk" style={{ textAlign: 'right' }}>per day</span><span className="ws-mk" style={{ textAlign: 'right' }}>on hand</span><span className="ws-mk" style={{ textAlign: 'right' }}>order</span>
        </div>
        {rows.slice(0, 30).map((row, i) => (
          <div key={i} className="ws-draft-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{String(row.product ?? row.sku ?? '')}</div>
              <div className="ws-mk" style={{ marginTop: 3 }}>
                {row.sku ? `${row.sku} · ` : ''}{row.days_of_cover !== undefined && row.days_of_cover !== null ? `${fmt('days', row.days_of_cover)} days of cover` : ''}
                {Number(row.days_with_nothing ?? 0) > 0 ? ` · out of stock ${fmt('d', row.days_with_nothing)} days` : ''}
              </div>
            </div>
            <span style={{ fontSize: 13, color: 'var(--ws-ink-2)', fontVariantNumeric: 'tabular-nums' }}>{fmt('units_per_day', row.units_per_day)}</span>
            <span style={{ fontSize: 13, color: 'var(--ws-ink-2)', fontVariantNumeric: 'tabular-nums' }}>{fmt('on_hand', row.on_hand)}</span>
            <span className="ws-qty">
              <button type="button" onClick={() => setQty((q) => ({ ...q, [i]: Math.max(0, (q[i] ?? suggested(row)) - 1) }))}>−</button>
              <input value={qty[i] ?? suggested(row)} onChange={(e) => setQty((q) => ({ ...q, [i]: Math.max(0, Number(e.target.value) || 0) }))} />
              <button type="button" onClick={() => setQty((q) => ({ ...q, [i]: (q[i] ?? suggested(row)) + 1 }))}>+</button>
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--ws-hair)' }}>
        <div>
          <p className="ws-mk">units to order</p>
          <div style={{ marginTop: 6 }}><Numeral text={total.toLocaleString('en-PH')} size={34} /></div>
        </div>
        <p className="ws-mk" style={{ textAlign: 'right', lineHeight: 1.6 }}>{rows.length} products{r.rows.length > 30 ? ` · showing 30` : ''}</p>
      </div>
      <Receipts meta={meta} />
    </div>
  );
}

export function StateWidget({ r }: WidgetProps) {
  const label = r.block.label ?? 'pending';
  const at = { pending: 10, running: 55, waiting: 30, blocked: 30, done: 100 }[label];
  const meta = r.call?.result?.meta as (ToolMeta & { run?: { run_date?: string; age_days?: number; stores_covered?: number; lines?: number } }) | undefined;
  return (
    <div className="ws-card" data-widget="state">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p className="ws-mk">{label}</p>
        <span className={`ws-pill ${label === 'done' ? 'ws-pill--chip' : ''}`}>{label}</span>
      </div>
      {meta?.run ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
            <Numeral text={String(meta.run.age_days ?? '—')} size={30} />
            <span className="ws-mk">days since this ran</span>
          </div>
          <p className="ws-note" style={{ marginTop: 6 }}>run of {meta.run.run_date} · {meta.run.stores_covered} shops · {meta.run.lines?.toLocaleString()} lines</p>
        </>
      ) : null}
      <div className="ws-progress"><i className="at" style={{ '--at': `${at}%` } as CSSProperties} /><i className="end" /></div>
      <Receipts meta={meta} compact />
    </div>
  );
}

export function ChartWidget({ r }: WidgetProps) {
  const rows = r.rows.slice(0, 60);
  if (!rows.length) return <Missing what="the series" />;
  const vals = rows.map((x) => valueOf(x)?.value ?? 0);
  const max = Math.max(1, ...vals);
  const W = 560, H = 140, pad = 6;
  const x = (i: number) => pad + (i / Math.max(1, rows.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  return (
    <div className="ws-card" data-widget="chart">
      <p className="ws-mk">{r.call?.result?.meta?.metric_label ?? 'series'}</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ marginTop: 10, display: 'block' }}>
        {r.block.form === 'bar'
          ? vals.map((v, i) => <rect key={i} x={x(i) - (W / rows.length) * 0.3} y={y(v)} width={(W / rows.length) * 0.6} height={H - pad - y(v)} fill="var(--ws-up)" opacity={0.85} rx={3} />)
          : <polyline fill="none" stroke="var(--ws-ink)" strokeWidth={1.6} points={vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />}
      </svg>
      <p className="ws-mk" style={{ marginTop: 6 }}>{span(rows)}</p>
      <Receipts meta={r.call?.result?.meta} compact />
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return <div className="ws-card ws-card--quiet"><p className="ws-note">George composed this from {what}, which this read does not carry.</p></div>;
}

/**
 * What a series is CALLED, from its rows.
 *
 * It used to read "→" and nothing else whenever the series was a run of days,
 * because the subject conventions carried no date column — a card whose whole
 * caption was an arrow.
 */
function span(rows: Record<string, unknown>[]): string {
  const first = subjectOf(rows[0]);
  const last = subjectOf(rows[rows.length - 1]);
  return first && last && first !== last ? `${first} → ${last}` : first ?? last ?? '';
}

/** The measure a figure is IN, and never the column name "value". */
function measureOf(meta: ToolMeta | null | undefined, key: string): string {
  if (meta?.metric_label) return meta.metric_label;
  return /^(value|amount|total|n|count)$/.test(key) ? '' : key.replace(/_/g, ' ');
}

/** Widgets that are a scrollbar in a quarter column, whatever their weight. */
const NEEDS_ROOM = new Set(['table', 'chart', 'distribution', 'draft', 'comparison']);

export function Wrap({ weight, kind, children, live }: { weight: string; kind?: string; children: ReactNode; live?: boolean }) {
  // A FLOOR ON ROOM, NOT A CHANGE OF WEIGHT. A quiet table stays quiet — no
  // shadow, muted ground — but a table in three columns of twelve is a
  // horizontal scrollbar, which is what the first dogfood put on screen.
  const roomy = weight === 'quiet' && kind && NEEDS_ROOM.has(kind);
  return <div className={`ws-w-${weight}${roomy ? ' ws-w-roomy' : ''} ${live ? 'ws-in' : ''}`}>{children}</div>;
}
