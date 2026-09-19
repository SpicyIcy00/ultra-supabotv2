/**
 * WHICH POINTS BELONG TO WHICH, and where that puts them.
 *
 * The owner, 2026-09-19, of the live right-hand side: *"it's just kinda like
 * widgets … evidence should relate spatially and visually. A discovery can lead
 * into supporting evidence, a comparison, a contradiction, or another
 * investigation. … The page itself is the composition."*
 *
 * The reason it read as widgets was not styling. The unit of the page was the
 * READ: one tool call, one block, one card, dropped into whichever column was
 * shortest. Nothing on the board knew how any two blocks related, so what you
 * read down the page was column heights and not his reasoning.
 *
 * So a block may now name another block's `key` as `under`, and say in what way
 * (`relation`). This file turns that into an order and a placement. It decides
 * NOTHING about what is important — `weight` already carries that, and Bob sets
 * it — and it computes no figure: every number here is a pixel.
 *
 * IT DOES NOT PACK. `beside.placeFigures` still does all the packing, and its
 * shortest-column-first arithmetic and tie rules are untouched. What changes is
 * only WHAT IS PACKED: a family — a point and everything gathered under it —
 * is placed as one item, so evidence can never land in a different column from
 * the finding it belongs to. The output shape is the same `number[]`, one
 * column per object, because every figure has to stay a direct child of the one
 * grid: a figure that remounts loses an opened panel and replays its arrival
 * (see the Board docstring in render.tsx).
 *
 * THE FALLBACK IS THE DEFAULT, NOT A SPECIAL CASE. A board where nothing names
 * an `under` — every board composed before this existed, every default
 * composition, every kept page — yields no families, and the caller runs the
 * path it ran before, byte for byte.
 *
 * ONE LEVEL, CHECKED AGAIN HERE. The server settles this already
 * (`agent/compose.py _hang`), but a board restored from a post stored before
 * that existed has never been through it, and a grandchild would force a nested
 * grid. A child that is itself named as a parent simply stands on its own.
 */
import type { BoardObject } from './board';

/**
 * The space between a point and what is gathered under it, in px.
 *
 * ONE CONSTANT, TWO USES — the sum below and the row span in render.tsx. If
 * they disagree the measured column heights drift and a family jumps column on
 * the second measuring pass, which is the remount the grid exists to avoid.
 */
export const CHILD_GAP = 14;

export type Relation = NonNullable<BoardObject['relation']>;

/** A point, and the keys of everything gathered under it, in Bob's order. */
export interface Family {
  stem: string;
  under: string[];
}

export interface Gathered {
  /** Every object, each stem immediately followed by what belongs to it. */
  order: BoardObject[];
  /** Only the stems that actually gathered something. Empty means: today. */
  families: Family[];
  /** child key -> stem key, for the ones that stood. */
  parentOf: Record<string, string>;
  /** child key -> how it sits under its stem. */
  relationOf: Record<string, Relation>;
}

/** A link only counts when it names another object of THIS board. */
function parentKey(o: BoardObject, byKey: Map<string, BoardObject>): string | null {
  const under = o.under;
  if (typeof under !== 'string' || under === '' || under === o.key) return null;
  return byKey.has(under) ? under : null;
}

export function gather(objects: readonly BoardObject[]): Gathered {
  const byKey = new Map(objects.map((o) => [o.key, o] as const));
  const direct = new Map<string, string>();
  for (const o of objects) {
    const up = parentKey(o, byKey);
    if (up) direct.set(o.key, up);
  }
  // ONE LEVEL. A point whose own parent is itself gathered is not gathered:
  // evidence hangs off a point, not off other evidence. This also disposes of
  // a cycle for free — in `a under b, b under a` both parents are themselves
  // children, so both links fall away and both stand on their own.
  const parentOf: Record<string, string> = {};
  const relationOf: Record<string, Relation> = {};
  for (const [key, up] of direct) {
    if (direct.has(up)) continue;
    parentOf[key] = up;
    const rel = byKey.get(key)?.relation;
    if (rel) relationOf[key] = rel;
  }

  const children = new Map<string, BoardObject[]>();
  for (const o of objects) {
    const up = parentOf[o.key];
    if (!up) continue;
    const kin = children.get(up);
    if (kin) kin.push(o); else children.set(up, [o]);
  }

  const order: BoardObject[] = [];
  const families: Family[] = [];
  for (const o of objects) {
    if (parentOf[o.key]) continue;            // drawn with its stem, below
    order.push(o);
    const kin = children.get(o.key);
    if (!kin?.length) continue;
    order.push(...kin);
    families.push({ stem: o.key, under: kin.map((k) => k.key) });
  }
  return { order, families, parentOf, relationOf };
}

/**
 * The runs of `order` that place as one item: a stem plus its children, or a
 * lone object. Every family is consecutive in `order` by construction.
 */
export function runsOf(g: Gathered): number[][] {
  const size = new Map(g.families.map((f) => [f.stem, f.under.length + 1] as const));
  const runs: number[][] = [];
  for (let n = 0; n < g.order.length;) {
    const span = size.get(g.order[n].key) ?? 1;
    runs.push(Array.from({ length: span }, (_, k) => n + k));
    n += span;
  }
  return runs;
}

/**
 * Place families with the packer the room already uses, then give every member
 * its family's column.
 *
 * `place` is `beside.placeFigures`, passed in rather than imported so this file
 * stays free of the frame arithmetic and can be read on its own.
 */
export function placeFamilies(
  g: Gathered,
  heights: readonly number[],
  columns: number,
  spans: readonly boolean[],
  place: (h: readonly number[], c: number, s?: readonly boolean[]) => number[],
): number[] {
  const runs = runsOf(g);
  const tall = runs.map((run) => run.reduce(
    (sum, n, k) => sum + Math.max(0, heights[n] ?? 0) + (k ? CHILD_GAP : 0), 0));
  // A family needs the width when ANY member does — the stem and its evidence
  // are one item, and half of one is not a placement.
  const wide = runs.map((run) => run.some((n) => spans[n]));
  const placed = place(tall, columns, wide);
  const out = new Array<number>(g.order.length).fill(0);
  runs.forEach((run, i) => { for (const n of run) out[n] = placed[i]; });
  return out;
}
