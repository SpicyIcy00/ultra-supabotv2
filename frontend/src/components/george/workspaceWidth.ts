/**
 * How wide the workspace is, decided by what is in it.
 *
 * THE COLUMN IS SIZED FOR THE CONTENT, NOT FOR THE QUESTION. A thread of prose
 * wants a measure a person can read — roughly 70 characters — and a desktop
 * that stretches it to 1200px is worse to read, not better. A table of seven
 * stores and a four-month chart want the opposite. So the column has two
 * widths and the RESULT chooses, from its shape and nothing else. No question
 * text is inspected, no per-question rule exists, and there is no list of
 * topics that get the wide layout.
 *
 * WHY NOT BREAK THE RESULT OUT OF A FIXED COLUMN. Because the composer sits at
 * the bottom edge of the same column, and a block that escapes it would leave
 * the box hanging under a table it no longer spans. Widening the whole column
 * keeps the page one column at every width — and on a phone it changes nothing
 * at all, because a max-width above the viewport is not a width. Mobile stays
 * the real layout (UI rule 7); the desktop is that layout with room either
 * side, and this decides how much.
 */
import type { Shape } from './pinShape';
import type { ResultBlock } from './resultShape';

export type WorkspaceWidth = 'reading' | 'wide';

/** Figures abreast before a group needs the room to be read across. */
export const WIDE_GROUP_MEMBERS = 3;

/**
 * The width one result asks for.
 *
 * A figure and a comparison read down a narrow column perfectly well — a
 * comparison is a list of subjects, and lists want a measure. A chart and a
 * table are the two that genuinely lose information when squeezed: axis ticks
 * collide, and columns wrap until the figures are unreadable.
 */
export function widthForShape(shape: Shape): WorkspaceWidth {
  return shape.kind === 'chart' ||
    shape.kind === 'table' ||
    shape.kind === 'ranking' ||
    (shape.kind === 'comparison' && shape.rows.length > 1)
    ? 'wide'
    : 'reading';
}

/** The width one block asks for. A group of three or more is read across. */
export function widthForBlock(block: ResultBlock): WorkspaceWidth {
  if (block.kind === 'single') return widthForShape(block.result.shape);
  return block.members.length >= WIDE_GROUP_MEMBERS ? 'wide' : 'reading';
}

/** The widest any block asks for. One column, so one answer. */
export function workspaceWidth(blocks: ResultBlock[]): WorkspaceWidth {
  return blocks.some((b) => widthForBlock(b) === 'wide') ? 'wide' : 'reading';
}

/**
 * The widest width across several surfaces — a whole thread, say.
 *
 * A thread does not narrow again when a wide answer scrolls up: the column
 * would jump under the reader's hands as they scrolled, and the composer with
 * it. Once something in view needs the room, the column keeps it.
 */
export function widestWidth(widths: WorkspaceWidth[]): WorkspaceWidth {
  return widths.includes('wide') ? 'wide' : 'reading';
}
