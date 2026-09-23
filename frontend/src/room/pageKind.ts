/**
 * A KEPT PAGE READS LIKE WHAT IT IS (W4.1, 2026-09-23).
 *
 * The owner, of the PAGES list in the room's sidebar — Estate Dashboard, Store
 * Dashboard, Estate Week, AJI BARN Reorder: *"next thing we need to do is make
 * how each page style work idealy"*. Until this every kept page was a header
 * plus N independent boards, each one packed into the same two-column grid, so
 * a page of four single numbers and a page of five reorder lists came out
 * looking like the same page.
 *
 * WHAT A KIND MAY AND MAY NOT DO. A kind decides how the page is DRAWN. It
 * never changes what is on the page, what any figure says, or the ORDER the
 * person put the analyses in — `groupsFor` below is the whole of the grouping
 * and it is a partition of the list in place, never a sort. Nothing here
 * computes, re-computes or re-words a figure: every number on a kept page is
 * still its pin's own run, drawn by the room's own `Board` (rule 9).
 *
 * WHAT IS DECLARED WHERE, honestly stated (rule 3). The kinds, their meaning
 * and how a page's kind is DERIVED live in `definitions/metrics.yaml`
 * (`pages.kinds`) and reach the room on the page shape — `kind`, `kind_set_by`
 * and, when the server serves them, `kind_options` with the definitions' own
 * words. What lives HERE is the drawing: which analyses group, and the words
 * the control falls back to when a server older than this card serves none.
 * The drawing itself is CSS scoped by `data-page-kind` in `room.css`.
 */
import type { CompositionBlock } from '../types/bob';
import type { Page, PageKind, PageKindOption } from '../types/pins';

/** The contract's four, in the order the control offers them. */
export const PAGE_KINDS: PageKind[] = ['dashboard', 'week', 'list', 'collection'];

/**
 * THE FALLBACK WORDS, in the room's own language rather than the enum's — used
 * only when the server serves no `kind_options`. A raw "collection" in a
 * control would be the schema talking to the owner.
 */
export const KIND_WORDS: Record<PageKind, { label: string; says: string }> = {
  dashboard: { label: 'Numbers you check', says: 'The figures sit together at the top, each with when it was read.' },
  week: { label: 'How it went', says: 'One column, read top to bottom over the page’s dates.' },
  list: { label: 'A working list', says: 'The rows are the point: they take the width, and charts beside them stay small.' },
  collection: { label: 'Saved answers', says: 'A set of kept answers, each drawn as it was kept.' },
};

/** Is this one of the four? A name the room does not know is not a kind. */
export function isPageKind(value: unknown): value is PageKind {
  return typeof value === 'string' && (PAGE_KINDS as string[]).includes(value);
}

/**
 * THE PAGE'S KIND, never null. A response from before this card, a page still
 * loading, and Ungrouped (which is not a page) all read `collection` — which
 * is exactly what a kept page has always drawn as, so nothing breaks on an
 * older response.
 */
export function kindOf(page: Page | null | undefined): PageKind {
  return isPageKind(page?.kind) ? page.kind : 'collection';
}

/** The kinds to offer, in the definitions' words where the server sent them. */
export function kindOptions(page: Page | null | undefined): PageKindOption[] {
  const served = (page?.kind_options ?? []).filter((o) => isPageKind(o.value));
  if (served.length) return served;
  return PAGE_KINDS.map((value) => ({ value, label: KIND_WORDS[value].label,
                                      says: KIND_WORDS[value].says }));
}

/** The words for one kind, the server's where it sent them. */
export function wordsFor(page: Page | null | undefined, kind: PageKind): PageKindOption {
  return kindOptions(page).find((o) => o.value === kind)
    ?? { value: kind, label: KIND_WORDS[kind].label, says: KIND_WORDS[kind].says };
}

/* ------------------------------------------------------------------ shapes */

/**
 * WHAT AN ANALYSIS IS, BY WHAT IT DREW — never by a label a model inferred
 * (rule 9/10). The shape is read off the marks the pin's own run returned,
 * which the room is about to draw anyway.
 *
 *   stat   one number, from one row — a figure or a gauge
 *   rows   the rows themselves are the point — a table or a list
 *   chart  everything the catalogue draws as a shape to read
 *   mixed  more than one family in the same analysis
 *   none   nothing came back to draw (reading, failed, refused, empty)
 */
export type AnalysisShape = 'stat' | 'rows' | 'chart' | 'mixed' | 'none';

/**
 * The mark catalogue's families (metrics.yaml `composition.grammar.marks`).
 * A mark the room has not met is a chart: it is a shape to read, which is what
 * fourteen of the eighteen are.
 */
const STAT = new Set(['figure', 'gauge']);
const ROWS = new Set(['table', 'list']);

function familyOf(kind: string | null | undefined): 'stat' | 'rows' | 'chart' {
  if (STAT.has(kind ?? '')) return 'stat';
  if (ROWS.has(kind ?? '')) return 'rows';
  return 'chart';
}

export function shapeOf(blocks: CompositionBlock[] | null | undefined): AnalysisShape {
  const families = new Set((blocks ?? []).filter((b) => !b.default).map((b) => familyOf(b.kind)));
  if (families.size === 0) return 'none';
  if (families.size > 1) return 'mixed';
  const [only] = [...families];
  // ONE FIGURE IS A STAT TILE; TWO ARE NOT. A dashboard tile is a caption over
  // a number — an analysis that drew three of them is a section, not a tile.
  if (only === 'stat' && (blocks ?? []).filter((b) => !b.default).length > 1) return 'chart';
  return only;
}

/** True for the analyses a dashboard draws as tiles: a single figure, drawn. */
export function isStatTile(shape: AnalysisShape): boolean {
  return shape === 'stat';
}

/* ---------------------------------------------------------------- grouping */

/**
 * HOW THE PAGE IS BROKEN INTO ROWS. A `row` group is a RUN of consecutive
 * stat-tile analyses drawn side by side; every other group holds exactly one
 * analysis, at the full width, where it stands.
 *
 * THE ORDER NEVER MOVES. The groups are `list` cut at the boundaries between
 * tiles and everything else — flattening them returns `list`, which
 * `pageKind.test.ts` holds for every kind.
 */
export interface PinGroup<T> {
  row: boolean;
  items: T[];
  /** Where in the page's own order this group starts — the key for the row. */
  at: number;
}

export function groupsFor<T>(kind: PageKind, items: T[],
                             shapeAt: (item: T, index: number) => AnalysisShape): PinGroup<T>[] {
  const out: PinGroup<T>[] = [];
  // ONLY A DASHBOARD PUTS TWO ANALYSES ON ONE LINE. A week is one column by
  // definition, a list gives its rows the width, and a collection is what a
  // kept page has always been.
  const groups = kind === 'dashboard';
  for (let i = 0; i < items.length; i += 1) {
    if (groups && isStatTile(shapeAt(items[i], i))) {
      const run: T[] = [];
      const at = i;
      while (i < items.length && isStatTile(shapeAt(items[i], i))) { run.push(items[i]); i += 1; }
      i -= 1;
      // A RUN OF ONE IS STILL A TILE. The owner's Store Dashboard opens with a
      // single number above a chart; drawn as a section it would be a 940px
      // box around one figure.
      out.push({ row: true, items: run, at });
      continue;
    }
    out.push({ row: false, items: [items[i]], at: i });
  }
  return out;
}

/**
 * WHICH BLOCK GOES FIRST INSIDE ONE ANALYSIS, on a `week` — "comparisons
 * before lists". A stable partition of ONE analysis's own blocks: the shapes
 * you read come before the rows you scan, and two blocks of the same family
 * keep the order the composer gave them. It moves no analysis, and it is the
 * only place a kind touches anything below the page.
 */
export function blockOrderFor(kind: PageKind, blocks: CompositionBlock[]): CompositionBlock[] {
  if (kind !== 'week' || blocks.length < 2) return blocks;
  const rows = blocks.filter((b) => familyOf(b.kind) === 'rows');
  if (!rows.length || rows.length === blocks.length) return blocks;
  return [...blocks.filter((b) => familyOf(b.kind) !== 'rows'), ...rows];
}
