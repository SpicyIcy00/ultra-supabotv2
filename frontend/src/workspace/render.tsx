/**
 * Draw a composition.
 *
 * One function, one place. It takes the turn (for results by seq, the prose
 * and the notices) and the blocks George chose, and returns the widgets in the
 * order and at the weight he gave them. Blocks are keyed by George's key, so a
 * follow-up that composes the same key is the same DOM node changing — which
 * is the whole of "the workspace transforms".
 *
 * Notices are not George's to place: they render above the lead, always, as
 * the rules require. The text widget carries them when it leads; otherwise
 * they sit as their own first row.
 */
import { compositionFor, resolve, type AnswerTurn, type Block } from './composition';
import {
  ChartWidget, ComparisonWidget, DistributionWidget, DraftWidget, FigureWidget,
  HeroWidget, StateWidget, SubjectWidget, TableWidget, TextWidget, Wrap,
} from './widgets';

export interface RenderProps {
  turn: AnswerTurn;
  selection: string[];
  onSelect: (subject: string) => void;
  live: boolean;
}

export function Composition({ turn, selection, onSelect, live }: RenderProps) {
  const blocks = compositionFor(turn);
  const lead = blocks.find((b) => b.weight === 'lead');
  const textLeads = lead?.kind === 'text';
  const hasText = blocks.some((b) => b.kind === 'text');
  const notices = turn.notices ?? [];

  return (
    <div className="ws-grid" data-composition>
      {/* Caveats first, always, unless the text block leads and carries them. */}
      {!textLeads && notices.length > 0 && (
        <div className="ws-w-lead" key="__notices">
          <div style={{ display: 'grid', gap: 8 }}>
            {notices.map((n, i) => (
              <p key={`${n.kind}-${i}`} className="ws-note" style={{ borderLeft: '2px solid var(--ws-ink)', paddingLeft: 12 }}>{n.message}</p>
            ))}
          </div>
        </div>
      )}
      {/* Prose George did not place still shows, after the lead. */}
      {!hasText && turn.text && (
        <Wrap key="__text" weight={lead ? 'supporting' : 'lead'} live={live}>
          <TextWidget text={turn.text} weight={lead ? 'supporting' : 'lead'} live={live} />
        </Wrap>
      )}
      {blocks.map((block) => (
        <Wrap key={block.key} weight={block.weight} live={live}>
          <Widget block={block} turn={turn} selection={selection} onSelect={onSelect} live={live} textLeads={textLeads} />
        </Wrap>
      ))}
    </div>
  );
}

function Widget({ block, turn, selection, onSelect, live, textLeads }: {
  block: Block; turn: AnswerTurn; selection: string[]; onSelect: (s: string) => void; live: boolean; textLeads: boolean;
}) {
  const r = resolve(turn, block);
  const selected = Boolean(block.subject && selection.includes(block.subject));
  const props = { r, selected, onSelect };
  switch (block.kind) {
    case 'text': return <TextWidget text={turn.text} weight={block.weight} notices={textLeads ? turn.notices : undefined} live={live} />;
    case 'figure': return <FigureWidget {...props} />;
    case 'hero': return <HeroWidget {...props} />;
    case 'subject': return <SubjectWidget {...props} />;
    case 'comparison': return <ComparisonWidget {...props} />;
    case 'table': return <TableWidget {...props} />;
    case 'chart': return <ChartWidget {...props} />;
    case 'distribution': return <DistributionWidget {...props} />;
    case 'draft': return <DraftWidget {...props} />;
    case 'state': return <StateWidget {...props} />;
  }
}
