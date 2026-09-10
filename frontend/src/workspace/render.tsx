/**
 * Draw the board.
 *
 * Every object is keyed by George's own key, so an edit to a key that is
 * already there changes that DOM node in place — that is the whole of "the
 * workspace transforms". An object nobody touched this turn is not re-rendered
 * into something new; it keeps drawing the read it has always drawn, from the
 * turn it came from.
 *
 * Notices belong to a TURN, not to the board: they qualify the figures that
 * just arrived, so they sit above everything, from the newest turn only. The
 * text object carries them when it leads.
 */
import type { BoardObject, Local } from './board';
import { inOrder } from './board';
import { resolve, type AnswerTurn, type Dimension } from './composition';
import {
  Caveats, ChartWidget, ComparisonWidget, DistributionWidget, DraftWidget, FigureWidget,
  HeroWidget, StateWidget, SubjectWidget, TableWidget, TextWidget, Wrap,
} from './widgets';

export interface BoardProps {
  /** Every answer turn, oldest first. An object names its own by index. */
  answers: AnswerTurn[];
  board: BoardObject[];
  local: Record<string, Local>;
  focused: string | null;
  selection: string[];
  live: boolean;
  onSelect: (subject: string, dimension: Dimension | null) => void;
  onFocus: (key: string) => void;
  onClose: (key: string) => void;
  onLocal: (key: string, patch: Local) => void;
}

export function Board(p: BoardProps) {
  const objects = inOrder(p.board, p.local, p.focused);
  const newest = p.answers.length - 1;
  const notices = p.answers[newest]?.notices ?? [];
  const textLeads = objects[0]?.kind === 'text';
  // WHILE HE IS STILL READING, what has landed is evidence, not composition:
  // George has not said where any of it goes yet. It is drawn as it arrives —
  // that is the whole of "you can feel him working" — and marked as what it
  // is, so nothing on screen claims to be a decision he has not made.
  const settling = p.live && !p.answers[newest]?.composition;

  return (
    <div className="ws-grid" data-composition data-objects={objects.length}>
      {!textLeads && notices.length > 0 && (
        <div className="ws-w-lead" key="__notices"><Caveats notices={notices} /></div>
      )}
      {objects.map((o) => (
        <Wrap
          key={o.key}
          kind={o.kind}
          weight={o.weight}
          live={p.live && o.touched === newest}
          earlier={o.touched < newest}
          landing={settling && o.turn === newest}
          focused={p.focused === o.key}
          onFocus={() => p.onFocus(o.key)}
          onClose={() => p.onClose(o.key)}
        >
          <OnBoard object={o} {...p} notices={textLeads && o.kind === 'text' ? notices : undefined} />
        </Wrap>
      ))}
    </div>
  );
}

/**
 * One object on the board, drawn from ITS OWN turn.
 *
 * NOT named `Object`: it was, for one commit, and shadowing the global inside
 * this module broke every render with "Object.defineProperty is not a
 * function" — React uses it internally on the same scope.
 */
function OnBoard({ object, answers, local, selection, live, onSelect, onLocal, notices }:
  BoardProps & { object: BoardObject; notices?: AnswerTurn['notices'] }) {
  const turn = answers[object.turn];
  if (!turn) return null;
  const r = resolve(turn, object);
  const mine = local[object.key] ?? {};
  const selected = Boolean(object.subject && selection.includes(object.subject));
  const props = {
    r, selected, onSelect, local: mine,
    setLocal: (patch: Local) => onLocal(object.key, patch),
  };
  switch (object.kind) {
    case 'text': return <TextWidget text={turn.text} weight={object.weight} notices={notices} live={live} />;
    case 'figure': return <FigureWidget {...props} />;
    case 'hero': return <HeroWidget {...props} />;
    case 'subject': return <SubjectWidget {...props} />;
    case 'comparison': return <ComparisonWidget {...props} />;
    case 'table': return <TableWidget {...props} />;
    case 'chart': return <ChartWidget {...props} />;
    case 'distribution': return <DistributionWidget {...props} />;
    case 'draft': return <DraftWidget {...props} />;
    case 'state': return <StateWidget {...props} />;
    default: return null;
  }
}
