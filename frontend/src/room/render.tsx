/**
 * Draw the board.
 *
 * Keyed by George's own key, so an edit to a key already on screen changes
 * that node in place — that is the whole of "the workspace transforms". An
 * object nobody touched is not re-rendered into something new; it keeps
 * drawing the read it has always drawn, from the turn it came from.
 *
 * Notices belong to a TURN, not to the board: they qualify the figures that
 * just arrived, so they sit above everything from the newest turn only.
 */
import { useMemo } from 'react';
import type { BoardObject, Local } from './board';
import { inOrder } from './board';
import { useDrag } from './drag';
import { callOf, dimensionOf, rowsOf, type AnswerTurn, type Dimension } from './data';
import type { ToolCall } from '../types/george';
import {
  Acts, Caveats, ChartTile, ComparisonTile, ControlTile, DistributionTile, DraftTile,
  RecommendationTile, SpecTile, StateTile, SubjectTile, SystemTile, TableTile, TextTile,
  TimelineTile, ownNotices, type TileActions, type TileProps,
} from './tiles';

export interface BoardProps {
  /** Every answer turn, oldest first. An object names its own by index. */
  answers: AnswerTurn[];
  board: BoardObject[];
  local: Record<string, Local>;
  focused: string | null;
  selection: string[];
  /** True while George is still working — drives the landing sequence. */
  live: boolean;
  /** Reads re-run by a control, by seq. Every object on that read follows. */
  retuned: Record<number, ToolCall>;
  on: TileActions;
  /**
   * The index of the first answer the person has not seen (history.ts).
   * Objects touched from there on arrive with the landing glow, so what
   * changed since they last looked is what comes to the centre.
   */
  seenUpTo?: number;
}

/** Warnings the loop raises about George's own edits — never a tool's notice. */
const PROCESS = new Set(['composition_rejected', 'findings_rejected', 'restated_figure',
                         'misstated_figure']);

export function Board(p: BoardProps) {
  const objects = inOrder(p.board, p.local, p.focused);
  // THE DRAG LIVES HERE, not in a tile and not in the page. A tile cannot
  // own it because the thing being dragged passes over every other tile;
  // the page cannot, because what a drop means is a question about the
  // board's own two regions. The page is told where things ended up.
  const { dragging, grip, body } = useDrag(p.on);
  const on = useMemo(() => ({ ...p.on, grip }), [p.on, grip]);
  const newest = p.answers.length - 1;
  // THE TURN'S notices, minus the ones now drawn on the objects they belong
  // to. A caveat shown twice is a caveat people learn to skip, and the one
  // above the board is meant for what has no object of its own.
  //
  // AND MINUS THE LOOP'S OWN WARNINGS ABOUT HIS EDITS. "rockwell-hours: a
  // block carries a kind or a spec, never both" is the loop telling George
  // an edit was refused — process, not a caveat on a figure. The refusal is
  // already enforced (the edit did not happen) and already conveyed to him;
  // drawing it above his old readings made three text tiles wear a sentence
  // about a shape he learnt to compose on the third try. A tool's notice
  // still surfaces, always (UI rule 4); this is not one.
  const all = (p.answers[newest]?.notices ?? []).filter((n) => !PROCESS.has(n.kind));
  const onObjects = new Set(
    inOrder(p.board, p.local, p.focused).flatMap((o) => (
      o.seq === undefined ? []
        : ownNotices(p.answers[o.turn]?.toolCalls.find((c) => c.seq === o.seq)?.result?.meta)
    )).map((n) => n.kind),
  );
  const notices = all.filter((n) => !onObjects.has(n.kind));
  const textLeads = objects[0]?.kind === 'text';
  // While he is still reading, what has landed is evidence — he has not said
  // where any of it goes yet. It is drawn as it arrives, which is the whole of
  // "you can feel him working".
  const settling = p.live && !p.answers[newest]?.composition;

  // What leads sits in its own row at the top, in George's order — AND HIS
  // READING GOES WITH IT, wherever he weighted it. A lead subject carries one
  // figure; on its own it stretches across the whole board for a single
  // number, and the sentence explaining it ends up three columns away from
  // the thing it explains. They belong together.
  const leading = objects.filter((o) => o.weight === 'lead' || p.focused === o.key);
  const reading = objects.find((o) => o.kind === 'text' && !leading.includes(o));
  const lead = reading ? [...leading, reading] : leading;
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
        retuned={o.seq === undefined ? null : p.retuned[o.seq] ?? null}
        on={on}
        notices={textLeads && o.kind === 'text' ? notices : undefined}
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
    <div className="r-board" data-board={objects.length}>
      {/* Caveats are the turn's, not the board's: above everything, always,
          and never inside a column where they could scroll away from the
          figures they qualify. */}
      {!textLeads && notices.length > 0 && (
        <div style={{ marginBottom: 18 }} key="__notices"><Caveats notices={notices} /></div>
      )}
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
  const call = p.retuned[o.seq] ?? callOf(p.answers[o.turn], o.seq);
  return dimensionOf(rowsOf(call), o.subject);
}

function Piece(props: TileProps) {
  if (!props.turn) return null;
  // A composed shape has no `kind` — it carries its own tree instead.
  if (props.o.spec) return <SpecTile {...props} />;
  switch (props.o.kind) {
    case 'text': return <TextTile {...props} />;
    case 'hero': return <SubjectTile {...props} size="lead" />;
    case 'figure': return <SubjectTile {...props} size="normal" />;
    case 'subject': return <SubjectTile {...props} />;
    case 'comparison': return <ComparisonTile {...props} />;
    case 'table': return <TableTile {...props} />;
    case 'chart': return <ChartTile {...props} />;
    case 'distribution': return <DistributionTile {...props} />;
    case 'draft': return <DraftTile {...props} />;
    case 'state': return <StateTile {...props} />;
    case 'timeline': return <TimelineTile {...props} />;
    case 'recommendation': return <RecommendationTile {...props} />;
    case 'control': return <ControlTile {...props} />;
    case 'system': return <SystemTile {...props} />;
    default: return null;
  }
}

export type { TileActions, Dimension };
