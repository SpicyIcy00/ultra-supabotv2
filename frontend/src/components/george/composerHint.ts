/**
 * What the composer invites, from context that is actually known.
 *
 * "Ask George…" is a chatbot's placeholder. The root of the River asks what
 * you want to WORK ON; inside a piece of work the box names what is in front
 * of you — the page the thread is bound to, or the store the last primary
 * fact was scoped to — and offers to go on from it. Every word of context is
 * deterministic: a page scope the stream holds, a store filter off a call
 * that ran. Nothing is inferred from prose and nothing is invented; with no
 * known context the hint is the general one.
 */
import type { PageScope } from '../../types/george';
import type { RiverItem } from './workUnit';

export const ROOT_HINT = 'What do you want to work on?';
export const CONTINUE_HINT = 'Go on — why, compare, which products, save this…';

/** The store the newest piece of work was scoped to, if its primary was. */
export function focusOf(items: RiverItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind !== 'work') continue;
    const primary = item.findings.find((f) => f.role === 'primary');
    const call = item.calls.find((c) => primary && c.seq === primary.seq) ?? item.calls[0];
    const f = call?.arguments?.filters;
    const store = f && typeof f === 'object' ? (f as Record<string, unknown>).store : undefined;
    return typeof store === 'string' && store ? store : null;
  }
  return null;
}

export function composerHint(scope: PageScope | null, items: RiverItem[]): string {
  if (scope?.title) return `Ask about ${scope.title} or tell George what to investigate…`;
  const focus = focusOf(items);
  if (focus) return `Ask about ${focus} or tell George what to investigate…`;
  return items.some((i) => i.kind === 'work') ? CONTINUE_HINT : ROOT_HINT;
}
