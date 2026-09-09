/**
 * A composition, as the `compose` frame delivers it and as the workspace draws it.
 *
 * NOTHING HERE IS A FIGURE OR A PIXEL. A block names a read by seq, a subject
 * by the name a row carries, a kind from a closed vocabulary and a weight. The
 * loop validated all of it before it was sent (agent/compose.py); this file
 * only types it and resolves each block against the turn's results.
 */
import type { CompositionBlock, GeorgeTurn, ToolCall, ToolMeta } from '../types/george';
import type { Post } from '../types/river';

export type Block = CompositionBlock;
export type WidgetKind = Block['kind'];
export type Weight = Block['weight'];

export type AnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;

/** A block joined to the result it draws from. */
export interface Resolved {
  block: Block;
  call: ToolCall | null;
  rows: Record<string, unknown>[];
}

export function resolve(turn: AnswerTurn, block: Block): Resolved {
  const call = block.seq === undefined ? null
    : turn.toolCalls.find((c) => c.seq === block.seq) ?? null;
  return { block, call, rows: call?.result?.rows ?? [] };
}

/**
 * The composition to draw for a turn.
 *
 * George's, when he made one. Otherwise a plain fallback so a turn from before
 * this existed — or one where every block was refused — still shows what it
 * read: the prose leads and each successful read is a table. The fallback is
 * deliberately dull: a screen George did not compose should look like one.
 */
export function compositionFor(turn: AnswerTurn): Block[] {
  if (turn.composition?.blocks?.length) return turn.composition.blocks;
  const blocks: Block[] = [{ kind: 'text', key: 'reading', weight: 'lead' }];
  for (const c of turn.toolCalls) {
    if (!c.result || c.result.error || !c.result.rows?.length || c.duplicate_of !== undefined) continue;
    if (c.tool.startsWith('record_') || c.tool === 'compose') continue;
    blocks.push({ kind: 'table', key: `read-${c.seq}`, weight: 'quiet', seq: c.seq, tool: c.tool });
  }
  return blocks;
}

/** The subject column of a row, by the conventions the tools use. */
export function subjectOf(row: Record<string, unknown>): string | null {
  for (const k of ['store', 'label', 'product', 'name', 'subject', 'supplier', 'category']) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

export function rowFor(rows: Record<string, unknown>[], subject: string): Record<string, unknown> | null {
  const want = subject.trim().toLowerCase();
  return rows.find((r) => Object.values(r).some(
    (v) => typeof v === 'string' && v.trim().toLowerCase() === want)) ?? null;
}

/** The first numeric column that is not a change, for a headline figure. */
export function valueOf(row: Record<string, unknown>): { key: string; value: number } | null {
  const skip = new Set(['change', 'change_pct', 'baseline', 'seq', 'call_seq', 'row_count']);
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k) || k.endsWith('_id')) continue;
    if (typeof v === 'number' && Number.isFinite(v)) return { key: k, value: v };
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return { key: k, value: Number(v) };
  }
  return null;
}

export function changeOf(row: Record<string, unknown>): { pct: number | null; direction: 'up' | 'down' | 'flat' | null; status?: string } {
  const pct = typeof row.change_pct === 'number' ? row.change_pct
    : typeof row.change_pct === 'string' && row.change_pct !== '' ? Number(row.change_pct) : null;
  const direction = (row.direction as 'up' | 'down' | 'flat' | undefined) ?? (pct === null ? null : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat');
  return { pct: Number.isFinite(pct as number) ? pct : null, direction, status: row.baseline_status as string | undefined };
}

/** A result an answer post kept, as the loop stores it (`payload.charted`). */
interface Charted {
  seq: number;
  tool: string;
  arguments: Record<string, unknown>;
  rows: Record<string, unknown>[];
  meta: ToolMeta;
}

/**
 * A reopened thread, made drawable.
 *
 * A stored chat turn keeps its calls but not their rows (chat_history.py), and
 * the composition lives on the answer post. So for each George turn that has
 * a post, this reads `payload.charted` back onto the calls by seq, and
 * `payload.composition` onto the turn — both exactly as the loop stored them,
 * nothing reconstructed. A turn whose post kept neither draws as it did: the
 * prose, and whatever the calls still carry.
 */
export function restoreFromPosts(turns: GeorgeTurn[], posts: Post[]): GeorgeTurn[] {
  const byId = new Map(posts.map((p) => [p.id, p] as const));
  return turns.map((t) => {
    if (t.role !== 'george' || !t.post?.answer_post_id) return t;
    const payload = byId.get(t.post.answer_post_id)?.payload as
      { charted?: unknown; composition?: { blocks?: unknown } } | null | undefined;
    if (!payload) return t;
    const charted = (Array.isArray(payload.charted) ? payload.charted : []) as Charted[];
    const toolCalls: ToolCall[] = t.toolCalls.map((c) => {
      const ch = charted.find((x) => x.seq === c.seq);
      if (!ch || c.result?.rows?.length) return c;
      return { ...c, result: { ...(c.result ?? { row_count: ch.rows.length, source_table: ch.meta?.source_table ?? null, truncated: false, duration_ms: 0, error: null }), rows: ch.rows, rows_complete: true, meta: ch.meta } };
    });
    for (const ch of charted) {
      if (toolCalls.some((c) => c.seq === ch.seq)) continue;
      toolCalls.push({ seq: ch.seq, tool: ch.tool, arguments: ch.arguments, result: { row_count: ch.rows.length, source_table: ch.meta?.source_table ?? null, truncated: false, duration_ms: 0, error: null, rows: ch.rows, rows_complete: true, meta: ch.meta } });
    }
    toolCalls.sort((a, b) => a.seq - b.seq);
    const blocks = Array.isArray(payload.composition?.blocks) ? payload.composition!.blocks as Block[] : null;
    return { ...t, toolCalls, composition: blocks?.length ? { seq: -1, blocks, rejected: [] } : t.composition };
  });
}
