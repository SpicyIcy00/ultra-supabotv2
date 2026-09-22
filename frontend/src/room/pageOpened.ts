/**
 * "BUILD ME A DASHBOARD" OPENS THE DASHBOARD (W2.4, 2026-09-22).
 *
 * A dashboard request was answered as a report: a page of his prose about the
 * business, with nothing to keep. It is a KEPT PAGE now — `george.pages`, live
 * analyses that re-run every time it opens — built with create_page (or
 * changed with edit_page), and the room opens THAT page where the report would
 * have been, instead of drawing the turn's board.
 *
 * WHICH PAGE, FROM WHAT WAS WRITTEN, NEVER FROM WHAT HE SAID. The committed
 * write's own frame (`page_changed`) when the turn is live; the write call's
 * own result row (its `page_id`) when the thread was reopened, because a
 * reopened turn keeps its calls and not its frames. A page he only talked
 * about opens nothing.
 */
import type { AnswerTurn } from './data';

const PAGE_WRITES = new Set(['create_page', 'edit_page']);

/** The kept page this turn built or changed, or null when it wrote none. */
export function pageOpened(turn: AnswerTurn | null | undefined): string | null {
  if (!turn) return null;
  const frames = turn.pageChanges ?? [];
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    if (frames[i]?.page_id) return frames[i].page_id;
  }
  const calls = turn.toolCalls ?? [];
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const c = calls[i];
    if (!PAGE_WRITES.has(c.tool) || !c.result || c.result.error) continue;
    const row = c.result.rows?.[0] as { page_id?: unknown } | undefined;
    const id = row?.page_id ?? (c.result.meta as { page_id?: unknown } | null | undefined)?.page_id;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}
