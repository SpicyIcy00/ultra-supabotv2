/**
 * THE PAGE IS A DOCUMENT (P7, 2026-09-21).
 *
 * The owner, of the page laid out as blocks in rows: *"it feels like it has to
 * fit the stuff in columns and rows or a grid but an artifact/page isnt like
 * that. it makes its own ... i want it like an artifact claude can make."*
 * The target is ops/ideal/the-page-bob-writes.html.
 *
 * What this file holds is what a document has and a board did not:
 *
 *   A FIGURE INSIDE A SENTENCE. He writes `{key}`; the page draws the row's own
 *   value, `{key.change}` its movement, `{key.was}` its baseline — tappable for
 *   the read's receipt. His words still carry no digit (agent/compose.py), so
 *   rule 9 holds exactly as it did: definition → vetted SQL → the row → here.
 *
 *   A FIGURE BALANCED AGAINST ITS WORDS. A figure set beside its words is a float,
 *   and whoever writes the page cannot measure pixels: a figure taller than the
 *   words beside it leaves a hole under them. So a section tries the figure at
 *   the size it was given, then at the other, and if neither lets the words
 *   reach (nearly) as far as the figure does, sets it UNDER its words instead.
 *
 *   TABS. One space, the same question read at two scopes, switched by the
 *   person — no read, no turn.
 */
import {
  useEffect, useLayoutEffect, useRef, useState, type ReactNode,
} from 'react';
import type { BoardObject } from './board';
import {
  callOf, changeOf, fmt, pct, readAt, receiptsLine, rowUnderClaim, rowsOf, type AnswerTurn,
} from './data';
import { colourOf, figureOf } from './catalogue';
import { paint } from './markParts';

/** `{key}`, `{key.change}`, `{key.was}` — the same shape the loop validates. */
const REF = /\{([a-z0-9][a-z0-9_-]*)(?:\.([a-z_]+))?\}/g;

/** Every block a line points at, so the page does not draw it a second time. */
export function refsOf(text: string): string[] {
  return [...text.matchAll(REF)].map((m) => m[1]);
}

/* ------------------------------------------------------------ inline figure */

/**
 * ONE VALUE OF ONE ROW, IN THE SENTENCE. The row is chosen exactly as the
 * `figure` mark chooses it (`rowUnderClaim`, or the read's only row), and the
 * number is formatted by the same `fmt` — so the figure in his sentence and
 * the figure in a block can never disagree.
 */
export function InlineFigure({ o, turn, part }: {
  o: BoardObject; turn: AnswerTurn | undefined; part?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  const call = turn ? callOf(turn, o.seq ?? o.seqs?.[0]) : null;
  const rows = rowsOf(call);
  const meta = call?.result?.meta ?? null;
  const row = o.subject ? rowUnderClaim(rows, o.subject) : rows[0] ?? null;
  const v = row ? figureOf(row, meta) : null;
  // A reference the rows cannot answer is drawn as missing, never as a guess.
  if (!row || !v) return <span className="r-inl r-inl--missing" data-ref={o.key}>—</span>;

  if (part === 'change') {
    const change = changeOf(row);
    if (change.pct === null) return null;
    return (
      <span className="r-inl-d" data-ref={o.key} style={{ color: paint(colourOf(change, true)) }}>
        {change.pct > 0 ? '▲' : change.pct < 0 ? '▼' : ''} {pct(change.pct)}
      </span>
    );
  }
  const shown = part === 'was' ? Number(row.baseline) : v.value;
  if (part === 'was' && !Number.isFinite(shown)) {
    return <span className="r-inl r-inl--missing" data-ref={o.key}>—</span>;
  }
  return (
    <span className="r-inl-wrap" ref={box}>
      <button type="button" className="r-inl" data-ref={o.key} aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); setOpen((x) => !x); }}>
        {fmt(v.key, shown, v.unit)}
      </button>
      {/* THE RECEIPT, WHERE YOU TAPPED (UI rule 3): the read, its scope and
          when it was read (rule 6) — in place, no route and no modal. */}
      {open && (
        <span className="r-inl-receipt" role="note">
          <b>{o.claim?.trim() || meta?.metric_label || 'this figure'}</b>
          <span>{receiptsLine(meta) || readAt(meta?.snapshot_timestamp) || 'no receipt on this read'}</span>
        </span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------- prose */

/** A line of his, with every `{reference}` drawn as the live figure it names. */
export function Prose({ text, figure }: {
  text: string;
  /** The live figure for a reference, or null when the page cannot resolve it. */
  figure(key: string, part: string | undefined, at: number): ReactNode;
}) {
  // A FIGURE NEVER BREAKS FROM WHAT TOUCHES IT. A live figure is an atomic
  // inline, and a line may break on either side of one whatever the characters
  // are — so "(" ended a line with its figure on the next, and a comma could
  // start one. What touches a figure with no space between — a bracket, a
  // comma, its own `.change` — is set in one unbreakable run with it.
  const out: ReactNode[] = [];
  let run: ReactNode[] = [];
  let last = 0;
  let n = 0;
  const close = () => {
    if (run.length) out.push(<span key={`run-${n}-${out.length}`} className="r-inl-run">{run}</span>);
    run = [];
  };
  for (const m of text.matchAll(REF)) {
    const at = m.index ?? 0;
    const between = text.slice(last, at);
    if (between) {
      // what trails the figure before (",", ")") closes its run; what leads
      // this one ("(") opens the next.
      const trail = run.length ? /^\S*/.exec(between)?.[0] ?? '' : '';
      const lead = /\S*$/.exec(between.slice(trail.length))?.[0] ?? '';
      if (trail) run.push(trail);
      const middle = between.slice(trail.length, between.length - lead.length);
      if (middle || !run.length) { close(); if (middle) out.push(middle); }
      if (lead) run.push(lead);
    }
    run.push(figure(m[1], m[2], n) ?? <span key={`r-${n}`} className="r-inl r-inl--missing">—</span>);
    last = at + m[0].length;
    n += 1;
  }
  const rest = text.slice(last);
  const trail = run.length ? /^\S*/.exec(rest)?.[0] ?? '' : '';
  if (trail) run.push(trail);
  close();
  if (rest.length > trail.length) out.push(rest.slice(trail.length));
  return <>{out}</>;
}

/* ------------------------------------------------------------------ section */

/** Past this many pixels of nothing under the words, it may read as a hole. */
const HOLE = 96;
/**
 * ...AND ONLY WHERE THE WORDS ARE SHORT BESIDE THE FIGURE. White under the last
 * paragraph of a section is how a section ends; it is a hole when three lines
 * sit beside a figure five times their height. The first rule was the pixels
 * alone, and it set a seven-shop comparison under two full paragraphs at the
 * width of the page — long empty tracks, the "empty spaces" the owner named.
 */
const FILL = 0.45;

/** A section of the page: a head and what stands under it. It contains its own floats. */
export function Section({ children }: { children: ReactNode }) {
  return <section className="r-doc-sec">{children}</section>;
}

/**
 * A FIGURE AND THE WORDS IT SITS BESIDE, BALANCED AS ONE THING.
 *
 *   phase 0 — the figure at the size it was given, beside the words
 *   phase 1 — at the other size: wider, so the words run narrower and longer
 *   phase 2 — under its words, at the text measure
 *
 * It only ever moves forward, so it cannot oscillate; a new width starts it
 * over. jsdom measures nothing, so a test sees phase 0 — which is the markup.
 *
 * THE UNIT IS THE PAIR, NOT THE SECTION. The first build balanced a section
 * and, when the figure went under its words, sent it to the section's END —
 * past the tabs and any full-width figure after it; at phone width his caveat
 * went with it, below the figures it qualifies. A pair holds one figure and
 * the paragraphs that follow it, and nothing else on the page moves.
 *
 * THE WIDTH IT LISTENS TO IS THE PAGE'S, NEVER ITS OWN. The first build
 * watched the section, the section sat shrink-to-fit in a flex column, and so
 * its width was a function of its own phase: every balance changed the width,
 * every width change started the balance over, and the page never came to
 * rest (2026-09-21 — the renderer hung). And should a container ever answer to
 * its content again, a width that keeps changing is being changed by THIS: it
 * stops asking and takes the layout that cannot be wrong.
 */
export function Pair({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(0);
  const width = useRef(0);
  const restarts = useRef<number[]>([]);

  useLayoutEffect(() => {
    const pair = ref.current;
    if (!pair) return undefined;
    const check = () => {
      const fig = pair.querySelector<HTMLElement>(':scope > .r-doc-fig[data-beside]');
      const words = pair.querySelectorAll<HTMLElement>(':scope > .r-doc-p');
      if (!fig || !words.length) return;
      const box = fig.getBoundingClientRect();
      const end = words[words.length - 1].getBoundingClientRect().bottom;
      const tall = end - words[0].getBoundingClientRect().top;
      if (box.bottom - end > HOLE && tall < box.height * FILL) setPhase((p) => Math.min(2, p + 1));
    };
    check();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const room = pair.closest<HTMLElement>('.r-doc-sec')?.parentElement ?? pair.parentElement ?? pair;
    const seen = new ResizeObserver(() => {
      const w = Math.round(room.clientWidth);
      // A NEW WIDTH IS A NEW QUESTION; a new height is only the answer landing.
      if (width.current && Math.abs(w - width.current) > 8) {
        width.current = w;
        const now = Date.now();
        restarts.current = [...restarts.current.filter((t) => now - t < 2000), now];
        setPhase(restarts.current.length > 4 ? 2 : 0);
        return;
      }
      width.current = w;
      check();
    });
    seen.observe(room);
    seen.observe(pair);
    pair.querySelectorAll(':scope > *').forEach((n) => seen.observe(n));
    return () => seen.disconnect();
  }, [phase]);

  return <div ref={ref} className="r-doc-pair" data-phase={phase}>{children}</div>;
}

/* --------------------------------------------------------------------- tabs */

/** One space, several views; the person switches, and nothing is read. */
export function Tabs({ labels, children }: { labels: string[]; children: ReactNode[] }) {
  const [at, setAt] = useState(0);
  const shown = Math.min(at, children.length - 1);
  return (
    <div className="r-doc-tabs">
      <div className="r-doc-ctl">
        <span className="r-doc-seg" role="group" aria-label="which view">
          {labels.map((label, n) => (
            <button key={label} type="button" aria-pressed={n === shown}
                    onClick={(e) => { e.stopPropagation(); setAt(n); }}>
              {label}
            </button>
          ))}
        </span>
      </div>
      {children[shown]}
    </div>
  );
}
