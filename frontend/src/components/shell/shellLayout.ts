import type { WorkspaceWidth } from '../george/workspaceWidth';

/**
 * The one number the shell and its pages have to agree on.
 *
 * A page with a composer pinned to its bottom edge fills the space the shell
 * leaves it, and that space differs by width: below `md` the shell has a
 * header and a bottom bar, from `md` to `lg` a header only, and from `lg` a
 * rail beside the content and nothing above it. Written once so the two
 * cannot drift by a pixel — which is exactly what happened when the phone
 * tab bar covered the composer (commit 94d65b4).
 *
 * Header and bar are both 3.5rem (h-14); the bar also pads by the home-bar
 * inset on a notched phone.
 */
export const SHELL_PAGE_HEIGHT =
  'h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-3.5rem)] lg:h-dvh';

/** Where a shell page's content column sits: one column, room either side. */
export const SHELL_COLUMN = 'mx-auto w-full max-w-3xl';

/**
 * The same column, widened for content that loses information when squeezed.
 *
 * Which content is workspaceWidth.ts's decision, from the RESULT and never
 * from the question. This file only owns the two numbers, for the same reason
 * it owns the page height: the scrolling area and the composer beneath it have
 * to agree, and a composer that stayed 3xl under a 5xl table would hang under
 * something it no longer spans.
 *
 * Below `md` a max-width above the viewport is not a width at all, so the
 * phone layout is untouched by either of these.
 */
export const SHELL_COLUMN_WIDE = 'mx-auto w-full max-w-5xl';

/** The column class for a width. */
export function shellColumn(width: WorkspaceWidth): string {
  return width === 'wide' ? SHELL_COLUMN_WIDE : SHELL_COLUMN;
}

/**
 * How the column changes width. Eased rather than instant, because the jump
 * happens mid-read when an answer's figures land — and not at all for a reader
 * who has asked for less motion.
 */
export const SHELL_COLUMN_TRANSITION =
  'transition-[max-width] duration-300 ease-out motion-reduce:transition-none';
