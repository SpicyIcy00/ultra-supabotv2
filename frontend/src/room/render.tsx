/**
 * Draw the board.
 *
 * Keyed by George's own key, so an edit to a key already on screen changes
 * that node in place — that is the whole of "the workspace transforms". An
 * object nobody touched is not re-rendered into something new; it keeps
 * drawing the read it has always drawn, from the turn it came from.
 *
 * Notices belong to a TURN, not to the board: they qualify the figures that
 * just arrived, so they sit above everything from the newest turn only —
 * which since P1.c means above the READING, one region further up the page.
 * `turnNotices` is which ones still have to be said; the drawing is there.
 */
import {
  useEffect, useLayoutEffect, useRef, useState, type CSSProperties,
} from 'react';
import type { BoardObject, Local } from './board';
import { inOrder } from './board';
import { retunedKey } from './tokenShape';
import { FIGURE_GAP, columnsFor, placeFigures, revealAt } from './beside';
import { readIndexes } from './work';
import { PROCESS, type AnswerTurn, type Dimension } from './data';
import type { ToolCall } from '../types/george';
import {
  ControlTile, DraftTile, MemoryTile, SpecTile, StateTile, SystemTile,
  ownNotices, type TileActions, type TileProps,
} from './tiles';
import { MarkBlock } from './marks';
import type { ActionOffer, GeorgeNotice } from '../types/george';

export interface BoardProps {
  /** Every answer turn, oldest first. An object names its own by index. */
  answers: AnswerTurn[];
  board: BoardObject[];
  local: Record<string, Local>;
  focused: string | null;
  selection: string[];
  /** True while George is still working — drives the landing sequence. */
  live: boolean;
  /**
   * Reads re-run by a token or a control, keyed `turn:seq` (`retunedKey`).
   * Every object drawn from that read follows.
   *
   * KEYED BY THE TURN AS WELL AS THE SEQ since P1.j. `seq` restarts at 0 on
   * every turn, so a bare seq meant a replay on turn three's first read
   * redrew turn one's object with turn three's rows — a figure under somebody
   * else's label, which is the one thing the board may not do.
   */
  retuned: Record<string, ToolCall>;
  on: TileActions;
  /**
   * WHICH OFFERS EACH OBJECT MAY CARRY, keyed by object (P2.d).
   *
   * Decided once by `room/actions.placement` and handed down rather than
   * worked out here, because the FOOT needs the other half of the same
   * decision — what was left over — and two places deciding it separately is
   * how an offer ends up drawn twice or nowhere.
   */
  offers?: Map<string, ActionOffer[]>;
  /**
   * The index of the first answer the person has not seen (history.ts).
   * Objects touched from there on arrive with the landing glow, so what
   * changed since they last looked is what comes to the centre.
   */
  seenUpTo?: number;
}


/**
 * THE CAVEATS THIS TURN STILL HAS TO SAY — computed here because it is a
 * question about the BOARD (which notices are already drawn on an object),
 * and drawn above the reading, because a caveat comes before the answer it
 * qualifies and before every figure that answer is about (UI rule 4).
 *
 * Two are taken out. A notice an object already carries: a caveat shown twice
 * is a caveat people learn to skip, and this one is meant for what has no
 * object of its own. And the loop's own warnings about his edits —
 * "rockwell-hours: a block carries a kind or a spec, never both" is process,
 * not a caveat on a figure. The refusal is already enforced and already
 * conveyed to him; drawing it above the answer made three readings wear a
 * sentence about a shape he learnt to compose on the third try. A tool's
 * notice still surfaces, always; this is not one.
 */
export function turnNotices(p: {
  answers: AnswerTurn[];
  board: BoardObject[];
  local: Record<string, Local>;
  focused: string | null;
}): GeorgeNotice[] {
  const newest = p.answers.length - 1;
  const all = (p.answers[newest]?.notices ?? []).filter((n) => !PROCESS.has(n.kind));
  const onObjects = new Set(
    inOrder(p.board, p.local, p.focused).flatMap((o) => (
      o.seq === undefined ? []
        : ownNotices(p.answers[o.turn]?.toolCalls.find((c) => c.seq === o.seq)?.result?.meta)
    )).map((n) => n.kind),
  );
  return all.filter((n) => !onObjects.has(n.kind));
}

/**
 * THE FIGURES, FLOWING (P2S.1(c)).
 *
 * The design's beside room, not a board of tiles. His words, 2026-09-16: *"if
 * theres open space with the answer it should fill it"*, *"charts should go
 * from left to right then down"*, *"it still feels like its in squares"*. So:
 *
 *   NO LEAD ROW AND NO PACK. One flow, in George's order. How many columns is
 *   decided by how many figures there are (`columnsFor`); each figure goes to
 *   whichever column is shortest (`placeFigures`).
 *
 *   PLACED ON A GRID, NOT MOVED BETWEEN COLUMNS. A figure changing column must
 *   not remount — it would lose an opened panel and replay its arrival — so
 *   every figure is a child of ONE grid, told its column, and spans as many
 *   1px rows as it is tall. Items given a column stack in order within it.
 *
 *   NO BOX, NO CONTROLS ON IT. The frame is gone (`Shell`), and so are drag,
 *   resize, keep and set aside — the owner, 2026-09-17: *"remove"*. A hand-
 *   placed figure breaks the flow he asked for. Keeping still works by saying
 *   so, and by the thread's Page view.
 *
 *   IT ARRIVES, IT IS NOT NARRATED. A figure new to the board lands at 200ms,
 *   the next 260ms after, each drawing itself (`revealAt`). A figure already
 *   on screen stays put when the answer around it changes.
 */
export function Board(p: BoardProps) {
  const objects = inOrder(p.board, p.local, p.focused);
  const newest = p.answers.length - 1;
  const width = useViewport();
  const columns = columnsFor(objects.length, width);
  const keys = objects.map((o) => o.key).join('|');

  // HOW TALL EACH FIGURE IS, measured — the one input the placement needs.
  // Unmeasured is 0, which still places in order (ties go to fewest figures).
  const [heights, setHeights] = useState<Record<string, number>>({});
  const nodes = useRef(new Map<string, HTMLElement>());
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const seen = new ResizeObserver((entries) => {
      setHeights((was) => {
        let next = was;
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const key = el.dataset.figure ?? '';
          const body = el.firstElementChild as HTMLElement | null;
          const h = Math.round(body ? body.getBoundingClientRect().height : e.contentRect.height);
          if (key && was[key] !== h) {
            if (next === was) next = { ...was };
            next[key] = h;
          }
        }
        return next;
      });
    });
    nodes.current.forEach((n) => {
      seen.observe(n);
      if (n.firstElementChild) seen.observe(n.firstElementChild);
    });
    return () => seen.disconnect();
  }, [keys]);
  const placed = placeFigures(objects.map((o) => heights[o.key] ?? 0), columns);

  // WHICH FIGURES HAVE ARRIVED. Keyed, so an answer that transforms a figure
  // in place does not make it arrive again.
  const arrived = useArrival(objects.map((o) => o.key));

  // While he is still reading, what has landed is evidence — he has not said
  // where any of it goes yet.
  const settling = p.live && !p.answers[newest]?.composition;

  return (
    <div className="r-board r-flow" data-board={objects.length} data-columns={columns}
         style={{ '--cols': columns } as CSSProperties}>
      {objects.map((o, n) => {
        const turn = p.answers[o.turn];
        const index = readNumber(turn, o);
        const out = (o as BoardObject & { ruled_out?: boolean }).ruled_out === true;
        const h = heights[o.key] ?? 0;
        return (
          <div
            key={o.key}
            ref={(el) => { if (el) nodes.current.set(o.key, el); else nodes.current.delete(o.key); }}
            data-figure={o.key}
            data-col={placed[n]}
            data-arrived={arrived.has(o.key) ? 'yes' : 'no'}
            className={['r-fig', out ? 'r-fig--out' : '', p.focused === o.key ? 'r-fig--open' : '']
              .filter(Boolean).join(' ')}
            style={{ gridColumn: placed[n] + 1, gridRowEnd: `span ${Math.max(1, h + FIGURE_GAP)}` }}
          >
            <div className="r-fig-body">
              {/* WHICH READ THIS IS — the number his words' superscripts point
                  at, so a figure and the sentence citing it match by eye. Off
                  the turn's own calls, never a rank. `ruled out` is drawn when
                  a block says so; nothing sets it until P2S.3. */}
              <p className="r-fig-lbl">
                read{index !== null ? ` ${index}` : ''}
                {out && <> · <s>ruled out</s></>}
              </p>
              <Piece
                o={o}
                turn={turn}
                local={p.local[o.key] ?? {}}
                landing={(settling && o.turn === newest) || (p.live && o.touched === newest)
                  || (p.seenUpTo !== undefined && o.touched >= p.seenUpTo)}
                delay={n * 110}
                focused={p.focused === o.key}
                selected={Boolean(o.subject && p.selection.includes(o.subject))}
                selection={p.selection}
                earlier={o.touched < newest}
                retuned={o.seq === undefined ? null : p.retuned[retunedKey(o.turn, o.seq)] ?? null}
                on={p.on}
                offers={p.offers?.get(o.key)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The read's number in its turn — the same count the superscripts use. */
function readNumber(turn: AnswerTurn | undefined, o: BoardObject): number | null {
  if (!turn) return null;
  const seq = o.seq ?? o.seqs?.[0];
  if (seq === undefined) return null;
  return readIndexes(turn.toolCalls).get(seq) ?? null;
}

/** The window's width, kept current — the column count reads it. */
function useViewport(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1920 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export function reducedMotion(): boolean {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/**
 * THE KEYS THAT HAVE ARRIVED. A key seen for the first time is scheduled by
 * its place among the NEW keys, so a second answer's figures arrive in their
 * own order and the first answer's stay where they are.
 */
function useArrival(keys: string[]): Set<string> {
  const [arrived, setArrived] = useState<Set<string>>(() => new Set());
  const scheduled = useRef(new Set<string>());
  const joined = keys.join('|');
  useEffect(() => {
    const fresh = joined.split('|').filter((k) => k && !scheduled.current.has(k));
    if (!fresh.length) return undefined;
    const reduced = reducedMotion();
    const timers = fresh.map((key, i) => {
      scheduled.current.add(key);
      return window.setTimeout(() => {
        setArrived((was) => (was.has(key) ? was : new Set(was).add(key)));
      }, revealAt(i, reduced));
    });
    return () => {
      // An unmount mid-reveal un-schedules what had not landed, so the next
      // mount schedules it again rather than leaving it invisible for good.
      timers.forEach((t) => window.clearTimeout(t));
      for (const key of fresh) scheduled.current.delete(key);
    };
  }, [joined]);
  return arrived;
}

/**
 * WHAT DRAWS A BLOCK.
 *
 * Since P1.e there are three answers, not fourteen. A composed shape draws its
 * own tree. FIVE kinds are objects you do something to rather than readings of
 * a read, and they keep their tiles — `catalogue.NOT_A_MARK` says which and
 * why, and `catalogue.test.ts` holds this switch to that list so a kind cannot
 * quietly fall out of both. Everything else is a READING, and every reading is
 * one of the six marks: `MarkBlock` asks the catalogue which, and draws it
 * inside the one frame — claim-title, subtitle off `meta`, the mark, its
 * source line.
 */
function Piece(props: TileProps) {
  if (!props.turn) return null;
  // A composed shape has no `kind` — it carries its own tree instead.
  if (props.o.spec) return <SpecTile {...props} />;
  switch (props.o.kind) {
    case 'draft': return <DraftTile {...props} />;
    case 'state': return <StateTile {...props} />;
    case 'control': return <ControlTile {...props} />;
    case 'system': return <SystemTile {...props} />;
    case 'memory': return <MemoryTile {...props} />;
    default: return <MarkBlock {...props} />;
  }
}

export type { TileActions, Dimension };
