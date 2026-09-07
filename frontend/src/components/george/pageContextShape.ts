/**
 * What an answer says about the page it read, as a decision the suite holds.
 *
 * DERIVED FROM THE FRAME, THEREFORE TRUE. Every word here comes from the
 * `page_context` frame the loop emitted after a view_page call — how many
 * pins the page holds, how many were inspected, which reproduced, which did
 * not and why. Nothing is taken from the model's prose, and no business
 * figure ever appears: a count of pins is a fact about the read.
 *
 * ONE LINE, THEN THE DETAIL. The line is what a reader sees without doing
 * anything — "Read 5 of 7 saved analyses · 2 not inspected" — and it is
 * never quieter than the answer (UI rule 4: a caveat about what was and was
 * not considered is a caveat). The pins, their statuses and their snapshot
 * times sit behind the same disclosure the receipts use.
 *
 * EVERY STATE KEEPS ITS OWN WORD. Available, empty, refused, failed, no
 * longer runnable, not read for the time limit, definitions only, and not
 * inspected for the bound are different facts, and the wording may simplify
 * them only as far as the structure underneath still tells them apart.
 */
import type { PageContextFrame, PageContextPin } from '../../types/george';
import { UNGROUPED_NAME } from './pageShape';

/** The tool whose call produces a page_context frame. Its rows are pins, not figures. */
export const PAGE_READ_TOOL = 'view_page';

/** The page's name for a reader; the only place null becomes a word. */
export function pageName(ctx: PageContextFrame): string {
  return ctx.page ?? UNGROUPED_NAME;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-PH')} ${n === 1 ? one : many}`;
}

/** The pins that were asked for and did not come back whole. */
export function failedPins(ctx: PageContextFrame): PageContextPin[] {
  return ctx.pins.filter(
    (p) => p.status !== 'ok' && !(p.status === 'not_read' && p.reason === 'figures_not_requested'),
  );
}

/**
 * The line above the disclosure.
 *
 *   Read 5 of 7 saved analyses · 2 not inspected
 *   Read 3 of 3 saved analyses · 1 could not be reproduced
 *   Looked at what is pinned: 4 of 4 saved analyses, figures not read
 */
export function pageContextLine(ctx: PageContextFrame): string {
  const analyses = ctx.pins_inspected === 1 ? 'saved analysis' : 'saved analyses';
  const parts: string[] = [];
  if (!ctx.figures) {
    parts.push(
      `Looked at what is pinned: ${ctx.pins_inspected} of ${ctx.pins_total} ${analyses}, figures not read`,
    );
  } else {
    parts.push(`Read ${ctx.pins_inspected} of ${ctx.pins_total} ${analyses}`);
    const failed = failedPins(ctx).length;
    if (failed > 0) parts.push(`${failed} could not be reproduced`);
  }
  const missed = ctx.not_inspected.length;
  if (missed > 0) parts.push(`${missed} not inspected`);
  if (ctx.unavailable.length > 0) {
    parts.push(`${plural(ctx.unavailable.length, 'id', 'ids')} not on this page`);
  }
  return parts.join(' · ');
}

/** One pin's state, in a reader's words. The structure keeps the exact state. */
export function pinStatusLabel(pin: PageContextPin): string {
  switch (pin.status) {
    case 'ok':
      return 'reproduced';
    case 'refused':
      return 'George declined this one';
    case 'failed':
      return 'failed to run';
    case 'unrunnable':
      return 'can no longer run';
    case 'not_read':
      return pin.reason === 'deadline'
        ? 'not read — the time limit passed first'
        : pin.reason === 'figures_not_requested'
          ? 'definitions only'
          : `not read${pin.reason ? ` — ${pin.reason}` : ''}`;
    default:
      return pin.status;
  }
}

/** Whether the read said anything a reader has to take on board. */
export function hasCaveat(ctx: PageContextFrame): boolean {
  return ctx.partial || ctx.truncated;
}
