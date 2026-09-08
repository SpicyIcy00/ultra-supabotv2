/**
 * One stored post, drawn by the one renderer.
 *
 * WHAT IS LEFT OF THIS FILE. Until 2026-09-08 this drew a stored post and
 * AnswerTurn drew a live one, and the two agreed only by coincidence — so at
 * the handoff React swapped one subtree for the other and every piece of local
 * state in it reset, which is why a reader's expanded figures folded away by
 * themselves. Both now normalise to a WorkUnit (workUnit.ts) and are drawn by
 * RiverEntry, so the handoff changes a FIELD rather than a component.
 *
 * This remains as the Post-shaped door into that path, for callers that hold a
 * post and nothing else. It decides nothing: the shaping is workUnit's and the
 * drawing is RiverEntry's.
 */
import { useMemo } from 'react';
import type { Post } from '../../types/river';
import { RiverEntry } from './RiverEntry';
import { riverItems } from './workUnit';

export { MarkAvatar } from './RiverEntry';

export function PostCard({
  post,
  grouped = false,
  onAsk,
  onOpenThread,
  onShare,
  sharing = false,
  question,
  quiet = false,
}: {
  post: Post;
  grouped?: boolean;
  /** Absent where there is nowhere to ask; chips are then not offered. */
  onAsk?: (question: string) => void;
  /** Absent inside a thread, where there is nowhere further to go. */
  onOpenThread?: (threadId: string) => void;
  onShare?: (postId: string) => void;
  sharing?: boolean;
  /**
   * The question this answer replied to, when the caller has it. A pin's title
   * defaults to it. Never derived from the answer's own prose.
   */
  question?: string;
  /**
   * An earlier post in a thread whose newest answer should lead: slate prose,
   * figures behind a line that names them. Notices and receipts are untouched
   * — quieter is never a licence to drop a caveat (turnShape.ts).
   */
  quiet?: boolean;
}) {
  const item = useMemo(() => {
    const [built] = riverItems([post], []);
    // `riverItems` resolves a question from the post's parent when the parent
    // is in the list it was given. Here it is not, so the caller's own
    // `question` is the only source — and it is never taken from prose.
    return built.kind === 'work' && question ? { ...built, question } : built;
  }, [post, question]);

  return (
    <RiverEntry
      item={item}
      grouped={grouped}
      quiet={quiet}
      onAsk={onAsk}
      onOpenThread={onOpenThread}
      onShare={onShare}
      sharingId={sharing ? post.id : null}
    />
  );
}
