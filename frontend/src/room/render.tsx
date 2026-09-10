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
import type { BoardObject, Local } from './board';
import { inOrder } from './board';
import type { AnswerTurn, Dimension } from './data';
import {
  Caveats, ChartTile, ComparisonTile, DistributionTile, DraftTile, StateTile,
  SubjectTile, TableTile, TextTile, type TileActions, type TileProps,
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
  on: TileActions;
}

export function Board(p: BoardProps) {
  const objects = inOrder(p.board, p.local, p.focused);
  const newest = p.answers.length - 1;
  const notices = p.answers[newest]?.notices ?? [];
  const textLeads = objects[0]?.kind === 'text';
  // While he is still reading, what has landed is evidence — he has not said
  // where any of it goes yet. It is drawn as it arrives, which is the whole of
  // "you can feel him working".
  const settling = p.live && !p.answers[newest]?.composition;

  // What leads sits in its own row at the top, in George's order. Everything
  // after it packs into columns — see the note in room.css.
  const lead = objects.filter((o) => o.weight === 'lead' || p.focused === o.key);
  const rest = objects.filter((o) => !lead.includes(o));

  const draw = (o: (typeof objects)[number], n: number) => (
    <div key={o.key} className={p.focused === o.key ? 'r-w-full' : undefined}>
      <Piece
        o={o}
        turn={p.answers[o.turn]}
        local={p.local[o.key] ?? {}}
        landing={(settling && o.turn === newest) || (p.live && o.touched === newest)}
        delay={n * 110}
        focused={p.focused === o.key}
        selected={Boolean(o.subject && p.selection.includes(o.subject))}
        earlier={o.touched < newest}
        on={p.on}
        notices={textLeads && o.kind === 'text' ? notices : undefined}
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

function Piece(props: TileProps) {
  if (!props.turn) return null;
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
    default: return null;
  }
}

export type { TileActions, Dimension };
