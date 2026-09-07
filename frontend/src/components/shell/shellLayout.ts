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
