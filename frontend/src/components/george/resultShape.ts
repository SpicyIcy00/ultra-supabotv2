/**
 * How a turn's results compose into ONE surface.
 *
 * inferShape decides what a single result is (pinShape.ts). This decides what
 * several results are TOGETHER — which is the whole difference between a chat
 * message with some figures stuck to it and an answer that reads as one thing.
 *
 * THE ONLY COMPOSITION IT PERFORMS IS ADJACENCY. Results that measure the same
 * scope are placed side by side under one heading. Nothing is summed, ratioed,
 * ranked or differenced across them, and no figure is created that no tool
 * returned. A fourth number derived from three others is a DEFINITION, and
 * definitions live in metrics.yaml behind vetted SQL (architecture rule 3) —
 * the same reasoning that keeps a workflow from joining its own steps
 * (architecture rule 6).
 *
 * SCOPE IS PROVED, NOT ASSUMED. Two figures are grouped only when their calls
 * agree on the window, on every filter that was applied, and on the store
 * argument they were called with. If any of those differ they stay separate
 * blocks, because "Rockwell this week" and "all stores this week" under one
 * heading is a heading that lies about both.
 *
 * IT READS meta AND arguments, NEVER PROSE. The heading comes from
 * meta.window and from the arguments the model actually passed to the tool —
 * structured values the loop echoed back — so the label above a figure is the
 * query that produced it. Nothing here is parsed out of what George wrote.
 *
 * ONE FUNCTION, TWO INPUTS. A live turn carries ToolCalls; a stored post
 * carries `charted`. Both are adapted to ResultSource here, so an answer in a
 * thread and the same answer after a reload go through one selection path and
 * cannot diverge (UI rule 3).
 */
import type { ToolCall, ToolMeta } from '../../types/george';
import type { PinCallResult } from '../../types/pins';
import { inferShape, resultFromToolCall, type Shape } from './pinShape';

/** One tool result, as much of it as the surface needs. */
export interface ResultSource {
  seq: number;
  tool: string;
  /** What the model passed. Absent on a stored post, which keeps rows and meta. */
  arguments?: Record<string, unknown>;
  rows: Record<string, unknown>[];
  meta: ToolMeta;
}

export interface ShapedResult {
  source: ResultSource;
  shape: Shape;
}

/**
 * A block on the surface.
 *
 * `group` is two or more figures of one scope read across; `single` is
 * everything else, drawn by the primitive its shape names.
 */
export type ResultBlock =
  | {
      kind: 'group';
      heading?: string;
      members: ShapedResult[];
      /**
       * The one meta that describes every member, when they share one exactly.
       * Undefined means the members' receipts differ and each carries its own —
       * never a merged summary, which would be a claim about provenance nobody
       * made.
       */
      sharedMeta?: ToolMeta;
    }
  | { kind: 'single'; result: ShapedResult };

/** Figures per group. Beyond this they stop being readable across a column. */
export const MAX_GROUP_MEMBERS = 4;

/* ----------------------------------------------------------------- adapters -- */

/** The chartable results of a live turn, in the order the calls were made. */
export function sourcesFromCalls(calls: ToolCall[]): ResultSource[] {
  return calls.flatMap((call) => {
    const result = resultFromToolCall(call);
    if (!result) return [];
    return [
      {
        seq: call.seq,
        tool: call.tool,
        arguments: call.arguments,
        rows: result.rows ?? [],
        meta: result.meta ?? {},
      },
    ];
  });
}

/**
 * The same, from a stored post's `charted` payload.
 *
 * The loop stores a result only when it could send it WHOLE (rows_complete),
 * so anything here is already safe to draw — the prefix problem was settled
 * before it was written. Rows that are not an array are dropped rather than
 * rendered as an empty result, which would look like a zero.
 */
export function sourcesFromCharted(charted: unknown): ResultSource[] {
  if (!Array.isArray(charted)) return [];
  return charted.flatMap((entry, i) => {
    const e = entry as Partial<ResultSource> | null;
    if (!e || !Array.isArray(e.rows) || e.rows.length === 0) return [];
    return [
      {
        seq: typeof e.seq === 'number' ? e.seq : i,
        tool: typeof e.tool === 'string' ? e.tool : '',
        rows: e.rows as Record<string, unknown>[],
        meta: (e.meta ?? {}) as ToolMeta,
      },
    ];
  });
}

/**
 * The same, from a pin run.
 *
 * THE THIRD WAY ONTO THE SURFACE. A tile used to draw its first result alone,
 * through inferShape directly, so a pin of three figures showed one. Now a
 * run is adapted here like a turn and a stored post are, and a page reaches
 * the same composition — the same grouping, the same receipts rule — that
 * the answer it was pinned from went through.
 *
 * Only ok results with rows are sources; what the others are is the tile's
 * business (pinShape.replayState), and it says so rather than drawing over
 * the gap. `seq` is the call's position in the pin, which is the order it
 * was stored and the only order this layer is entitled to. The arguments
 * come along because a group's heading reads the store scope from them.
 */
export function sourcesFromPinRun(results: PinCallResult[]): ResultSource[] {
  return results.flatMap((r, i) => {
    if (r.status !== 'ok' || !Array.isArray(r.rows) || r.rows.length === 0) return [];
    return [{ seq: i, tool: r.tool, arguments: r.arguments, rows: r.rows, meta: r.meta ?? {} }];
  });
}

/* ------------------------------------------------------------------- scope -- */

/** The store the call was scoped to, if the model named one. */
export function storeArgument(source: ResultSource): string | undefined {
  const filters = source.arguments?.filters;
  if (!filters || typeof filters !== 'object') return undefined;
  const store = (filters as Record<string, unknown>).store;
  return typeof store === 'string' && store.trim() ? store.trim() : undefined;
}

/**
 * The window a result covers, as a label.
 *
 * A preset prints its NAME with the underscores opened out — the name is the
 * thing metrics.yaml defines and the thing the receipts cite, so it is what a
 * heading should say. An explicit window prints its own bounds. A result with
 * no window gets no label rather than a guessed one.
 */
export function windowLabel(meta: ToolMeta): string | undefined {
  const w = meta.window;
  if (!w) return undefined;
  if (w.kind === 'preset' && w.name) {
    const words = w.name.replace(/_/g, ' ').trim();
    return words ? words[0].toUpperCase() + words.slice(1) : undefined;
  }
  if (w.start && w.end) return `${w.start} → ${w.end}`;
  return undefined;
}

/**
 * The signature two results must share to sit under one heading.
 *
 * Window, every applied filter, and the store argument. Deliberately strict:
 * a heading covers everything under it, so anything that could make it untrue
 * of one member has to break the group.
 */
export function scopeKey(source: ResultSource): string {
  const w = source.meta.window;
  return JSON.stringify({
    window: w ? [w.kind ?? '', w.name ?? '', w.start ?? '', w.end ?? ''] : null,
    filters: source.meta.filters_applied ?? [],
    store: storeArgument(source) ?? null,
  });
}

/** The heading over a group: its store scope, then its window. */
export function groupHeading(members: ShapedResult[]): string | undefined {
  const first = members[0];
  if (!first) return undefined;
  const parts = [storeArgument(first.source), windowLabel(first.source.meta)].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/**
 * The one meta describing every member, or undefined.
 *
 * Identical means identical: same table, same read, same filters. Two figures
 * from two tables get two receipts lines, because one line over both would
 * name a source that produced only half of what is on screen.
 */
export function sharedMeta(members: ShapedResult[]): ToolMeta | undefined {
  const key = (m: ToolMeta) =>
    JSON.stringify([m.source_table ?? null, m.snapshot_timestamp ?? null, m.filters_applied ?? []]);
  const first = members[0]?.source.meta;
  if (!first) return undefined;
  return members.every((m) => key(m.source.meta) === key(first)) ? first : undefined;
}

/* ------------------------------------------------------------------ blocks -- */

/**
 * A turn's results as an ordered surface.
 *
 * Order is the order the calls were made, because that is the order George did
 * the work in and the only order this layer is entitled to. Adjacent figures of
 * one scope collapse into a group; everything else stands alone.
 */
export function resultBlocks(sources: ResultSource[]): ResultBlock[] {
  const shaped: ShapedResult[] = sources.flatMap((source) => {
    // inferShape reads only `rows` and `meta`; the rest of PinCallResult is a
    // tile's run state, which neither a live turn nor a stored post has an
    // equivalent of. Filled with what is true rather than left undefined: the
    // call succeeded, or its rows would not be here.
    //
    // `rowsComplete` is true by construction — the loop sends and stores rows
    // only when it could send them WHOLE — but it is passed explicitly so
    // inferShape's refusal to chart a prefix stays in the picture rather than
    // resting on that invariant holding forever.
    const shape = inferShape(
      {
        tool: source.tool,
        arguments: source.arguments ?? {},
        status: 'ok',
        duration_ms: 0,
        rows: source.rows,
        meta: source.meta,
        notices: [],
      },
      undefined,
      true,
    );
    return shape ? [{ source, shape }] : [];
  });

  const blocks: ResultBlock[] = [];
  let run: ShapedResult[] = [];

  const flush = () => {
    if (run.length === 0) return;
    if (run.length === 1) {
      blocks.push({ kind: 'single', result: run[0] });
    } else {
      blocks.push({
        kind: 'group',
        heading: groupHeading(run),
        members: run,
        sharedMeta: sharedMeta(run),
      });
    }
    run = [];
  };

  for (const item of shaped) {
    // A bare figure, or ONE compared figure — a total with its delta, which
    // is a figure that also says how it moved. A comparison of several
    // subjects stays whole: it is already a list read down. Whether two
    // compared figures share a scope is still scopeKey's decision, and a
    // compared result carries its baseline window in filters_applied, so a
    // compared figure never sits beside an uncompared one under a heading
    // that would be true of only one of them.
    const groupable =
      item.shape.kind === 'number' ||
      (item.shape.kind === 'comparison' && item.shape.rows.length === 1);
    if (!groupable) {
      flush();
      blocks.push({ kind: 'single', result: item });
      continue;
    }
    const sameScope =
      run.length > 0 &&
      run.length < MAX_GROUP_MEMBERS &&
      scopeKey(run[0].source) === scopeKey(item.source);
    if (!sameScope) flush();
    run.push(item);
  }
  flush();

  return blocks;
}

/** Every shaped result on a surface, group members included, in order. */
export function blockResults(blocks: ResultBlock[]): ShapedResult[] {
  return blocks.flatMap((b) => (b.kind === 'group' ? b.members : [b.result]));
}

/** Whether a surface has anything to draw at all. */
export function hasResults(blocks: ResultBlock[]): boolean {
  return blocks.length > 0;
}

/**
 * The one line an earlier post's figures wait behind.
 *
 * Names WHAT is there, so nothing is hidden behind a control that gives no
 * hint of its contents — the failure UI rule 4 is written against. Charts are
 * named as charts when that is all there is, because that is the word a reader
 * has for them; a mixed surface says "figures", which covers a table and a
 * metric without claiming either.
 */
export function quietLabel(blocks: ResultBlock[]): string {
  const results = blockResults(blocks);
  const n = results.length;
  if (results.every((r) => r.shape.kind === 'chart')) {
    return n === 1 ? 'Chart' : `${n} charts`;
  }
  return n === 1 ? 'Figure' : `${n} figures`;
}

/* -------------------------------------------------------------- shorthands -- */

/**
 * The two ways a surface is reached, named once.
 *
 * Every caller goes through one of these rather than composing the adapter and
 * the block builder itself — the turn, the stored post, and the page deciding
 * how wide the column has to be all read the same result the same way.
 */
export function blocksFromCalls(calls: ToolCall[]): ResultBlock[] {
  return resultBlocks(sourcesFromCalls(calls));
}

export function blocksFromCharted(charted: unknown): ResultBlock[] {
  return resultBlocks(sourcesFromCharted(charted));
}

export function blocksFromPinRun(results: PinCallResult[]): ResultBlock[] {
  return resultBlocks(sourcesFromPinRun(results));
}
