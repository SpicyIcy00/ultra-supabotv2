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
import { ComparisonCoverage, DeltaRanking, Performance, SubjectComparison } from './Instruments';
import { coverageFromComparison, performanceMembers } from './instrumentShape';
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
function Body({
  result, lead, large, onSubject,
}: { result: ShapedResult; lead: boolean; large: boolean; onSubject?: (r: ShapedResult, s: string) => void }) {
  const { shape, source } = result;
  const ask = onSubject ? (s: string) => onSubject(result, s) : undefined;
  switch (shape.kind) {
    case 'number':
      return <Metric shape={shape} size={lead ? (large ? 'lead' : 'default') : 'grouped'} />;
    case 'comparison':
      // One subject: a figure with its delta. Several: a dense comparison —
      // seven stores are seven rows, not seven paragraphs.
      return shape.rows.length > 1 ? (
        <SubjectComparison shape={shape} meta={source.meta} onSubject={ask} />
      ) : (
        <Comparison shape={shape} size={lead ? (large ? 'lead' : 'default') : 'grouped'} />
      );
    case 'ranking':
      return <DeltaRanking shape={shape} onSubject={ask} />;
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
  onSubject,
}: {
  blocks: ResultBlock[];
  /** The first section of a page: a lone figure or chart is set larger. */
  large?: boolean;
  /** A subject row's own follow-up, when the definitions allow one. */
  onSubject?: (result: ShapedResult, subject: string) => void;
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
              <Body result={block.result} lead large={large} onSubject={onSubject} />
              {/* How much of a comparison was actually measured, from its own
                  meta — the caveat's shape, beside the figure it qualifies.
                  The notice above the answer still says it in words. */}
              {(block.result.shape.kind === 'comparison' || block.result.shape.kind === 'ranking') && (
                <ComparisonCoverage
                  meta={block.result.source.meta}
                  coverage={coverageFromComparison(block.result.source.meta)}
                />
              )}
              <ReceiptsBlock meta={block.result.source.meta} />
            </>
          ) : (
            performanceMembers(block.members) ? (
            // One subject's compared headline set — "how did it do" — is one
            // instrument, not three figures abreast, whether or not George
            // recorded which was primary (composeWork routes the sectioned
            // case; this is the adjacency case).
            <>
              {block.heading && (
                <p className="mb-3 text-[11px] uppercase tracking-wider text-george-muted">{block.heading}</p>
              )}
              <Performance members={block.members} large={large} />
              {block.sharedMeta ? (
                <ReceiptsBlock meta={block.sharedMeta} scopeInHeading={Boolean(block.heading)} />
              ) : (
                block.members.map((m) => <ReceiptsBlock key={m.source.seq} meta={m.source.meta} scopeInHeading={Boolean(block.heading)} />)
              )}
            </>
          ) : (
            <>
              <MetricGroup heading={block.heading}>
                {block.members.map((m) => (
                  <div key={m.source.seq}>
                    <Body result={m} lead={false} large={false} onSubject={onSubject} />
                    {/* Each figure keeps its own receipts unless the whole
                        group provably shares one. */}
                    {!block.sharedMeta && (
                      <ReceiptsBlock meta={m.source.meta} scopeInHeading={Boolean(block.heading)} />
                    )}
                  </div>
                ))}
              </MetricGroup>
              {/* The heading above already names the window and the store
                  scope, from the same arguments this line would repeat. */}
              {block.sharedMeta && (
                <ReceiptsBlock meta={block.sharedMeta} scopeInHeading={Boolean(block.heading)} />
              )}
            </>
          ))}
        </div>
      ))}
    </div>
  );
}
