/**
 * A reopened thread, made drawable.
 *
 * Moved here from `workspace/composition.ts` on 2026-09-12 when the retired
 * `/w2` renderer was deleted: this was the only function in that module the
 * room still used, and everything else it exported is in `room/data.ts`.
 */
import type { ActionOffer, Arrangement, CompositionBlock as Block, BobTurn, ReadingFrame, ToolCall, ToolMeta } from '../types/bob';
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
 * the composition lives on the answer post. So for each Bob turn that has
 * a post, this reads `payload.charted` back onto the calls by seq, and
 * `payload.composition` onto the turn — both exactly as the loop stored them,
 * nothing reconstructed. A turn whose post kept neither draws as it did: the
 * prose, and whatever the calls still carry.
 */
export function restoreFromPosts(turns: BobTurn[], posts: Post[]): BobTurn[] {
  const byId = new Map(posts.map((p) => [p.id, p] as const));
  return turns.map((t) => {
    if (t.role !== 'bob' || !t.post?.answer_post_id) return t;
    const payload = byId.get(t.post.answer_post_id)?.payload as
      { charted?: unknown; reading?: unknown; actions?: unknown;
        composition?: { blocks?: unknown; default_blocks?: unknown; arrangement?: unknown } }
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
    const arranged = payload.composition?.arrangement;
    const laidOut = arranged && typeof arranged === 'object' && !Array.isArray(arranged)
      ? arranged as Arrangement : null;
    const seeded = Array.isArray(payload.composition?.default_blocks)
      ? payload.composition!.default_blocks as Block[] : null;
    // AND WHAT HE SAID, IN ITS THREE SLOTS (P1.f). Stored with the snapshot,
    // so a reopened thread draws the caveat above the figures and the next
    // sentence under them exactly as they were drawn live — rather than one
    // undifferentiated paragraph where the live turn had three parts.
    const said = payload.reading;
    const reading = said && typeof said === 'object' && !Array.isArray(said)
      ? said as ReadingFrame : null;
    // AND WHAT HE OFFERED TO DO ABOUT A ROW (P2.d). Read back rather than
    // re-derived: `costs` was worked out from the definitions at the moment
    // the offer was made, and deriving it again now could disagree with what
    // the person was actually shown.
    const offered = Array.isArray(payload.actions)
      ? payload.actions as ActionOffer[] : null;
    return {
      ...t, toolCalls,
      actions: offered?.length ? offered : t.actions,
      // AND HOW HE LAID THEM OUT (P3.p). Stored with the blocks it arranges;
      // without it a reopened thread packs a page he had designed — twelve
      // blocks in two columns, which is the board the owner reopened on
      // 2026-09-21. The packing is still the fallback for a post that carries
      // none, which is every post written before today.
      composition: blocks?.length
        ? { seq: -1, blocks, rejected: [],
            ...(laidOut ? { arrangement: laidOut } : {}) }
        : t.composition,
      defaultComposition: seeded?.length
        ? { seq: -1, blocks: seeded, rejected: [], default: true } : t.defaultComposition,
      reading: reading ?? t.reading,
    };
  });
}

/** One replay the record kept, as this module reads it back. */
export interface RecordedReplay {
  post: string;
  /** The answer turn the call belongs to, so the redraw lands on its object. */
  turn: number;
  seq: number;
  argument: string;
  value: unknown;
}

/**
 * THE REPLAYS A REOPENED THREAD HAS TO RUN AGAIN (P1.j).
 *
 * P1.i appended every change to the answer post and nothing read it back, so
 * a reload drew the STORED window under figures a person had moved — which is
 * the exact divergence `recorded` was added to prevent, built half way. This
 * is the other half.
 *
 * THE NEWEST CHANGE PER CALL, AND ONLY ON THE NEWEST ANSWER. The record is
 * append-only and ordered, so the last entry for a seq is where the person
 * left it; the earlier ones are the road there and running them would be
 * watching the board walk backwards. Only the newest answer's, because that is
 * the one the room draws — an older turn is folded to a line and a read nobody
 * can see is not worth a read.
 *
 * RUN AGAIN, NEVER RESTORED FROM A COPY. The record keeps the change and not
 * the rows: a figure drawn from a stored copy would wear the read time of the
 * original read, and a number on this screen wears the time it was read (UI
 * rule 6). A refusal that has appeared since comes back as a refusal, which is
 * the truth about that window today.
 */
export function replaysToRestore(
  turns: BobTurn[], posts: Post[], max: number,
): RecordedReplay[] {
  let newest = -1;
  for (let i = 0; i < turns.length; i += 1) {
    if (turns[i].role === 'bob') newest += 1;
  }
  // The index of the newest answer among ANSWERS, which is how the board
  // names a turn — and the turn itself, which is how its post is found.
  const answer = [...turns].reverse().find((t) => t.role === 'bob');
  const post = answer && answer.role === 'bob' ? answer.post?.answer_post_id : null;
  if (!post || newest < 0) return [];
  const payload = posts.find((p) => p.id === post)?.payload as
    { replays?: unknown } | null | undefined;
  const kept = Array.isArray(payload?.replays) ? payload!.replays : [];

  const bySeq = new Map<number, RecordedReplay>();
  for (const entry of kept) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (e.status !== 'ok' || typeof e.seq !== 'number' || typeof e.argument !== 'string') continue;
    bySeq.set(e.seq, { post, turn: newest, seq: e.seq, argument: e.argument, value: e.value });
  }
  return [...bySeq.values()].slice(0, Math.max(0, max));
}
