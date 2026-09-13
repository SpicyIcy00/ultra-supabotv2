/**
 * A reopened thread rebuilds the board it had.
 *
 * Salvaged on 2026-09-12 from `workspace/workspace.dom.test.tsx` when the
 * retired `/w2` renderer was deleted. Everything else that file covered is
 * covered by `room.dom.test.tsx` over the room's own board; this is the one
 * piece of live code it was the only cover for.
 */
import { describe, expect, it } from 'vitest';
import type { GeorgeTurn, ToolCall } from '../types/george';
import type { Post } from '../types/river';
import { restoreFromPosts } from './restore';
import { buildBoard } from './board';

const ROWS = [
  { sku: 'K-01', product: 'Kameda Orange Big Pack', suggested_qty: 24 },
  { sku: 'S-02', product: 'Aji Assorted', suggested_qty: 12 },
];
const META = { source_table: 'purchase_plan', filters_applied: {}, snapshot_timestamp: '2026-09-12T00:00:00Z' };

const stored = (): GeorgeTurn => ({
  role: 'george',
  text: 'x',
  toolCalls: [{ seq: 2, tool: 'get_purchase_plan', arguments: { supplier: 'Seikyo SEK001' } } as ToolCall],
  post: {
    question_post_id: 'q1', answer_post_id: 'a1', thread_id: 't',
    conversation_id: 'c', visibility: 'private', stored: true,
  },
} as unknown as GeorgeTurn);

const post = (payload: unknown): Post => ({
  id: 'a1', thread_id: 't', parent_id: 'q1', kind: 'answer', author: 'george',
  author_user: null, owner_user: 'me', visibility: 'private', mine: true, body: 'x',
  receipts: null, notices: [], conversation_id: 'c', created_at: null, payload,
} as unknown as Post);

describe('a reopened thread', () => {
  it('restores the composition and the charted rows from the answer post, and invents neither', () => {
    const [restored] = restoreFromPosts([stored()], [post({
      charted: [{ seq: 2, tool: 'get_purchase_plan', arguments: { supplier: 'Seikyo SEK001' }, rows: ROWS, meta: META }],
      composition: { blocks: [{ op: 'put', kind: 'draft', key: 'seikyo-order', weight: 'lead', seq: 2 }] },
    })]);
    if (restored.role !== 'george') throw new Error('expected george');

    expect(restored.composition?.blocks.map((b) => b.key)).toEqual(['seikyo-order']);
    expect(restored.toolCalls[0].result?.rows).toHaveLength(2);
    // And the board a reload rebuilds is the board that was there.
    expect(buildBoard([restored]).map((o) => o.key)).toEqual(['seikyo-order']);
  });

  it('restores the default that stood beside his, so the reload draws what the room drew', () => {
    // P1.b: the loop composes a default when reads land and stores it under
    // `default_blocks`. A reopened thread applies both, exactly as the room
    // did — his over the read he named, the loop's over the one he did not.
    const [restored] = restoreFromPosts([stored()], [post({
      charted: [{ seq: 2, tool: 'get_purchase_plan', arguments: { supplier: 'Seikyo SEK001' }, rows: ROWS, meta: META }],
      composition: {
        blocks: [{ op: 'put', kind: 'draft', key: 'seikyo-order', weight: 'lead', seq: 2 }],
        default_blocks: [{ op: 'put', kind: 'table', key: 'read-9', weight: 'quiet', seq: 9 }],
      },
    })]);
    if (restored.role !== 'george') throw new Error('expected george');

    expect(restored.defaultComposition?.default).toBe(true);
    expect(buildBoard([restored]).map((o) => o.key).sort()).toEqual(['read-9', 'seikyo-order']);
  });

  it('leaves a turn whose post kept nothing exactly as it was', () => {
    const [bare] = restoreFromPosts([stored()], [post(null)]);
    if (bare.role !== 'george') throw new Error('expected george');
    expect(bare.composition).toBeUndefined();
    expect(bare.toolCalls[0].result).toBeUndefined();
  });
});
