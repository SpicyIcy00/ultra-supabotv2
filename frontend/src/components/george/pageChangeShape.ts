/**
 * What a page change says about itself, as a decision the suite can hold.
 *
 * DERIVED FROM THE FRAME, THEREFORE TRUE. Every line here comes from the
 * `page_changed` frame the loop emitted after create_page or edit_page
 * returned — the COMMITTED result, with the structured operations the
 * service produced. Nothing is taken from the model's prose: George may say
 * "deleted" by mistake, and this will still say "kept in Ungrouped", because
 * that is what happened.
 *
 * TWO WORDS FOR TWO ACTS, here too. `remove` is "Removed X from P · kept in
 * Ungrouped" — the wording metrics.yaml pages.workshop.remove_wording fixes —
 * and nothing George can do produces a line that says "deleted".
 *
 * NO FIGURE. A count of analyses is a fact about the write; a business
 * number never appears, because a page change carries none.
 */
import type { PageChangedFrame } from '../../types/george';
import { UNGROUPED_NAME } from './pageShape';

const q = (s: unknown) => `“${String(s ?? '')}”`;

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

/** One operation, in a reader's words. Unknown ops are named, never hidden. */
export function operationLine(op: Record<string, unknown>, page: PageChangedFrame): string {
  const title = str(op.title) ?? '';
  switch (op.op) {
    case 'create': {
      const n = page.analysis_count;
      const with_ = n > 0 ? ` with ${n === 1 ? 'one analysis' : `${n} analyses`}` : ', empty';
      return `Created page ${q(page.title)}${with_}`;
    }
    case 'add':
      return `Added ${q(title)} to ${q(page.title)}`;
    case 'remove':
      return `Removed ${q(title)} from ${q(str(op.from_page) ?? page.title)} · kept in ${UNGROUPED_NAME}`;
    case 'move_to_page': {
      const to = str(op.to_page);
      return `Moved ${q(title)} from ${q(str(op.from_page) ?? page.title)} to ${to ? q(to) : UNGROUPED_NAME}`;
    }
    case 'place': {
      const from = num(op.from_position);
      const to = num(op.position);
      const where = from !== null && to !== null ? (to < from ? ' up' : to > from ? ' down' : '') : '';
      return `Moved ${q(title)}${where}`;
    }
    case 'rename':
      return `Renamed page ${q(op.from)} to ${q(op.to)}`;
    case 'set_purpose':
      return op.to ? `Set the purpose of ${q(page.title)}` : `Cleared the purpose of ${q(page.title)}`;
    default:
      return `${String(op.op)} on ${q(page.title)}`;
  }
}

/**
 * The lines for one frame, in the order the operations were applied.
 *
 * A create's adds are folded into the create line — "Created page X with 3
 * analyses" says it once — while an edit lists each operation, because each
 * is something the person asked for.
 */
export function pageChangeLines(frame: PageChangedFrame): string[] {
  const ops = frame.operations ?? [];
  if (frame.created) {
    const create = ops.find((o) => o.op === 'create') ?? { op: 'create' };
    return [operationLine(create, frame)];
  }
  if (ops.length === 0) return [`Changed page ${q(frame.title)}`];
  return ops.map((o) => operationLine(o, frame));
}

/** Nothing here may say a saved analysis was deleted, because none can be. */
export function saysDeleted(lines: string[]): boolean {
  return lines.some((l) => /\bdelet/i.test(l));
}
