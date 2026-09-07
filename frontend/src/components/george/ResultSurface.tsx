/**
 * A turn's figures, as one surface.
 *
 * Before this, an answer drew each chartable result in its own bordered box
 * and drew nothing at all for a result that was not a chart — so a question
 * answered with three figures produced three sentences and no figures, and a
 * question answered with two charts produced two panels that did not know
 * about each other. This places every result the turn produced, in the order
 * the calls were made, as one thing.
 *
 * SEPARATORS, NOT CARDS. One hairline between blocks. No panel, no tint, no
 * shadow, no icon beside a figure: a page of bordered boxes is the shape of an
 * admin dashboard, which is the thing PinTile's own note describes moving away
 * from. Hierarchy comes from size and space.
 *
 * RECEIPTS PER RESULT, ALWAYS (UI rules 3 and 6). Each block carries the meta
 * of the call behind it. A group carries ONE receipts line only when every
 * member shares one exactly — same table, same read, same filters; otherwise
 * each figure keeps its own, because a merged line would name a source that
 * produced half of what is on screen.
 *
 * NOTICES ARE NOT DRAWN HERE. They belong above the answer, whole and never
 * collapsible (UI rule 4), and the turn and the post each place them there
 * before they reach this. Putting them beside a figure would put a caveat
 * below the sentence it qualifies.
 */
import { GeorgeChart } from './GeorgeChart';
import { ReceiptsBlock } from './ReceiptsBlock';
import { Comparison, Metric, MetricGroup, ResultTable } from './ResultBlocks';
import type { ResultBlock, ShapedResult } from './resultShape';

/**
 * One shaped result, drawn by the primitive its shape names.
 *
 * `lead` is a block standing alone; `large` is the surface being the first
 * section of a page, which sets a lone figure and a lone chart bigger. A
 * grouped figure is never large: its members are peers read across.
 */
function Body({ result, lead, large }: { result: ShapedResult; lead: boolean; large: boolean }) {
  const { shape, source } = result;
  switch (shape.kind) {
    case 'number':
      return <Metric shape={shape} size={lead ? (large ? 'lead' : 'default') : 'grouped'} />;
    case 'comparison':
      return <Comparison shape={shape} size={lead && large ? 'lead' : 'default'} />;
    case 'chart':
      return (
        <GeorgeChart shape={shape} meta={source.meta} height={lead ? (large ? 220 : 200) : 160} />
      );
    case 'table':
      return <ResultTable shape={shape} fullCount={source.meta.row_count} />;
  }
}

export function ResultSurface({
  blocks,
  large = false,
}: {
  blocks: ResultBlock[];
  /** The first section of a page: a lone figure or chart is set larger. */
  large?: boolean;
}) {
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => (
        <div
          key={block.kind === 'group' ? `g-${block.members[0].source.seq}` : block.result.source.seq}
          className={i > 0 ? 'border-t border-george-line pt-4' : undefined}
        >
          {block.kind === 'single' ? (
            <>
              <Body result={block.result} lead large={large} />
              <ReceiptsBlock meta={block.result.source.meta} />
            </>
          ) : (
            <>
              <MetricGroup heading={block.heading}>
                {block.members.map((m) => (
                  <div key={m.source.seq}>
                    <Body result={m} lead={false} large={false} />
                    {/* Each figure keeps its own receipts unless the whole
                        group provably shares one. */}
                    {!block.sharedMeta && <ReceiptsBlock meta={m.source.meta} />}
                  </div>
                ))}
              </MetricGroup>
              {block.sharedMeta && <ReceiptsBlock meta={block.sharedMeta} />}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
