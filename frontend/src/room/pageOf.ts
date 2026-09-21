/**
 * THE PAGE IS THE DEFAULT, NOT THE REWARD (P6.k, 2026-09-21).
 *
 * The canvas drew only when Bob sent an `arrangement`. Everything else — a
 * turn where he composed his blocks and left the layout alone, and every
 * thread reopened from a post written before the arrangement was stored —
 * fell back to the packing: a two-column grid of tiles with relation labels
 * over them. The owner, of exactly that board: *"did we reach our goal?"* No:
 * that is the "here's this and here's that" he has refused from the start.
 *
 * So a board he composed is laid out as a page whether or not he said how.
 * This invents no meaning: it keeps HIS order, pairs neighbours that are the
 * same shape (two figures, two rankings — the design's own rhythm), gives
 * everything else the width, and puts the plan last. What it cannot do is
 * decide that one block explains another; that is `arrangement`, and his own
 * beats this every time.
 *
 * The packing is still what draws a board that is ONLY the machine's — reads
 * he never wrote up, which are folded behind one line anyway.
 */
import type { Arrangement } from '../types/bob';

/** What a block has to carry for this to place it. */
export interface Placeable {
  key: string;
  kind?: string | null;
  /** True for the loop's own default composition — never laid out as a page. */
  default?: boolean;
  /** What he said about it. A block he wrote up leads; one he did not follows. */
  claim?: string | null;
  question?: string | null;
}

/**
 * Shapes that read well two-up: a number beside a number, a ranking beside a
 * ranking. A chart, a table or a list takes the width — squeezing a week of
 * days into half a column is the defect this whole card exists to remove.
 */
const PAIRABLE = new Set(['figure', 'contributors', 'ranked', 'list']);

export function pageOf(blocks: Placeable[]): Arrangement | null {
  const his = blocks.filter((b) => !b.default);
  // One block is not a page, and two is a judgement call the packer already
  // makes well (side by side, and it measures them). Three is a page.
  if (his.filter((b) => (b.claim ?? '').trim() || (b.question ?? '').trim()).length < 3) return null;

  // WHAT HE WROTE UP IS THE PAGE; what he drew and said nothing about follows
  // it, above the plan — the same place the room already puts the reads he
  // never wrote up. A claimless table opening the page would be the machine
  // talking first.
  const said = (b: Placeable) => Boolean((b.claim ?? '').trim() || (b.question ?? '').trim());
  const order = [...his.filter(said), ...his.filter((b) => !said(b))];

  const children: Arrangement[] = [];
  for (let i = 0; i < order.length; i += 1) {
    const here = order[i];
    const next = order[i + 1];
    const kind = here.kind ?? '';
    if (next && kind && PAIRABLE.has(kind) && (next.kind ?? '') === kind
        && said(here) === said(next)) {
      children.push({ layout: 'row', children: [{ block: here.key }, { block: next.key }] });
      i += 1;
    } else {
      children.push({ block: here.key });
    }
  }
  // The plan closes the page, as it does when he places it himself.
  children.push({ next: true });
  return { layout: 'stack', children };
}
