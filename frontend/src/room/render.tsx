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
import { useMemo } from 'react';
import type { BoardObject, Local } from './board';
import { inOrder } from './board';
import { retunedKey } from './tokenShape';
import { useDrag } from './drag';
import { PROCESS, callOf, dimensionOf, rowsOf, type AnswerTurn, type Dimension } from './data';
import type { ToolCall } from '../types/george';
import {
  Acts, ControlTile, DraftTile, MemoryTile, SpecTile, StateTile, SystemTile,
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

export function Board(p: BoardProps) {
  const objects = inOrder(p.board, p.local, p.focused);
  // THE DRAG LIVES HERE, not in a tile and not in the page. A tile cannot
  // own it because the thing being dragged passes over every other tile;
  // the page cannot, because what a drop means is a question about the
  // board's own two regions. The page is told where things ended up.
  const { dragging, grip, body } = useDrag(p.on);
  const on = useMemo(() => ({ ...p.on, grip }), [p.on, grip]);
  const newest = p.answers.length - 1;
  // While he is still reading, what has landed is evidence — he has not said
  // where any of it goes yet. It is drawn as it arrives, which is the whole of
  // "you can feel him working".
  const settling = p.live && !p.answers[newest]?.composition;

  // What leads sits in its own row at the top, in George's order. IT NO
  // LONGER CARRIES HIS READING WITH IT: the reading is a region above this
  // board (Reading.tsx), so the special case that dragged a text tile up
  // beside whatever led — because "the sentence explaining it ends up three
  // columns away from the thing it explains" — has nothing left to fix.
  const lead = objects.filter((o) => o.weight === 'lead' || p.focused === o.key);
  const rest = objects.filter((o) => !lead.includes(o));

  const draw = (o: (typeof objects)[number], n: number) => (
    <div
      key={o.key}
      // The key the pointer finds under itself, and the class that takes the
      // carried tile out of its own way so it finds the board beneath.
      data-drag-key={o.key}
      className={[p.focused === o.key ? 'r-w-full' : '', dragging === o.key ? 'r-dragging' : '']
        .filter(Boolean).join(' ') || undefined}
      {...body(o.key)}
    >
      <Piece
        o={o}
        turn={p.answers[o.turn]}
        local={p.local[o.key] ?? {}}
        landing={(settling && o.turn === newest) || (p.live && o.touched === newest)
          || (p.seenUpTo !== undefined && o.touched >= p.seenUpTo)}
        delay={n * 110}
        focused={p.focused === o.key}
        selected={Boolean(o.subject && p.selection.includes(o.subject))}
        selection={p.selection}
        earlier={o.touched < newest}
        retuned={o.seq === undefined ? null : p.retuned[retunedKey(o.turn, o.seq)] ?? null}
        on={on}
        offers={p.offers?.get(o.key)}
      />
      {/* WHAT YOU CAN DO TO IT — under every object, whatever shape it is.
          It is quiet until the pointer is on the object or something inside
          it has focus, so a board of ten things is ten things and not ten
          things with a toolbar each. */}
      <Acts
        subject={o.subject ?? null}
        dimension={dimensionFor(p, o)}
        o={o}
        on={on}
        local={p.local[o.key]}
      />
    </div>
  );

  return (
    // `data-rest` is how many objects are packed into columns below the lead,
    // and the page's whole measure is set from it (room.css, `--measure`). A
    // board of two things in a column built for six is the "lots of empty
    // space on the right" the owner reported on 2026-09-14.
    <div className="r-board" data-board={objects.length} data-rest={rest.length}>
      {/* THE CAVEATS ARE NOT DRAWN HERE any more. They belong to the turn,
          not to the board, and they go above the reading — which is above
          this (Room.tsx, `turnNotices`). A board that drew them too would
          show each one twice. */}
      {lead.length > 0 && <div className="r-board-lead">{lead.map(draw)}</div>}
      {rest.length > 0 && <div className="r-board-rest">{rest.map((o, n) => draw(o, n + lead.length))}</div>}
    </div>
  );
}

/**
 * Which kind of thing the subject is, for the colour and for `why`.
 *
 * Read off the ROWS, exactly as the subject tile has always read it — not
 * from the object's kind, which says what shape it is drawn as and not what
 * it is about.
 */
function dimensionFor(p: BoardProps, o: BoardObject): Dimension | null {
  if (!o.subject || o.seq === undefined) return null;
  const call = p.retuned[retunedKey(o.turn, o.seq)] ?? callOf(p.answers[o.turn], o.seq);
  return dimensionOf(rowsOf(call), o.subject);
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
