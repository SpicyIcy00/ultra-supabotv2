/**
 * A reopened thread, made drawable.
 *
 * Moved here from `workspace/composition.ts` on 2026-09-12 when the retired
 * `/w2` renderer was deleted: this was the only function in that module the
 * room still used, and everything else it exported is in `room/data.ts`.
 */
import type { CompositionBlock as Block, GeorgeTurn, ToolCall, ToolMeta } from '../types/george';
import type { Post } from '../types/river';

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
      { charted?: unknown; composition?: { blocks?: unknown; default_blocks?: unknown } }
      | null | undefined;
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
    // AND THE DEFAULT THAT STOOD BESIDE IT (P1.b). A reopened thread composes
    // exactly as it composed live — his blocks over the reads he named, the
    // loop's over the ones he did not — rather than the two reading one way
    // in the room and another after a reload, which is the divergence the
    // receipts contract exists to prevent.
    const seeded = Array.isArray(payload.composition?.default_blocks)
      ? payload.composition!.default_blocks as Block[] : null;
    return {
      ...t, toolCalls,
      composition: blocks?.length ? { seq: -1, blocks, rejected: [] } : t.composition,
      defaultComposition: seeded?.length
        ? { seq: -1, blocks: seeded, rejected: [], default: true } : t.defaultComposition,
    };
  });
}
