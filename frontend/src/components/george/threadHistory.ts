/**
 * A stored thread as the turns George is shown when somebody continues it.
 *
 * Kept apart from the components for the same reason riverMerge.ts is: what
 * George is told about a thread is a decision the suite holds, and the one
 * thing it must never do is invent provenance.
 *
 * TWO SOURCES, AND WHAT EACH IS ALLOWED TO CONTRIBUTE.
 *
 *   The caller's own chat  GET /george/chats/{thread} — the turns of the
 *                          conversations THEY had here, with the calls behind
 *                          each answer and their arguments. These are the only
 *                          calls that may travel as history, because a call
 *                          the client is replaying is one it streamed to the
 *                          screen (agent/loop.py, "Conversation history").
 *
 *   The visible posts      GET /george/river/threads/{thread} — everything in
 *                          the thread the caller may see: George's own root
 *                          post, and any exchange somebody shared. These
 *                          travel as TEXT ONLY. A George post carries no tool
 *                          arguments, so a turn built from one carries no
 *                          tool calls — an empty list, never a reconstruction
 *                          from its charted rows. "Pin that" against a brief
 *                          has nothing to hold, and George says so.
 *
 * EVERY TURN NAMES THE POST IT CAME FROM. A loaded turn carries a `post`
 * frame with the ids of the posts it was built from, so riverMerge drops it
 * from the pending list on sight: the posts are already on screen as posts,
 * and the turn exists only to be sent as history. Matched by conversation
 * id and by post id — never by text.
 *
 * ORDER IS BY TIME, IDENTITY NEVER IS. Merging two lists needs an order and
 * `created_at` is the honest one; deciding whether two things are one thing
 * is done by id alone, above.
 */
import type { GeorgeTurn, PostFrame } from '../../types/george';
import type { ChatDetail } from '../../types/chats';
import { toGeorgeTurns } from '../../types/chats';
import type { Post } from '../../types/river';

type Answer = Extract<GeorgeTurn, { role: 'george' }>;

function frameFor(thread: string, question: Post | null, answer: Post | null): PostFrame {
  return {
    question_post_id: question?.id ?? '',
    answer_post_id: answer?.id ?? null,
    thread_id: thread,
    conversation_id: question?.conversation_id ?? answer?.conversation_id ?? '',
    visibility: (answer ?? question)?.visibility ?? 'private',
    stored: true,
  };
}

/** A George post as a text-only turn. No tool calls, by construction. */
function georgeTurnFromPost(post: Post, thread: string): Answer {
  return {
    role: 'george',
    text: post.body,
    thinking: '',
    toolCalls: [],
    notices: post.notices ?? [],
    pinned: [],
    saved: [],
    receipts: post.receipts ?? undefined,
    post: frameFor(thread, null, post),
    at: post.created_at ?? new Date(0).toISOString(),
  };
}

function userTurnFromPost(post: Post): GeorgeTurn {
  return { role: 'user', text: post.body, at: post.created_at ?? new Date(0).toISOString() };
}

/**
 * The thread as turns, oldest first.
 *
 * @param posts the visible posts of the thread, oldest first.
 * @param chat the caller's own chat in this thread, or null when they have
 *   none (an org thread they have not replied to, or a 404).
 */
export function threadHistory(posts: Post[], chat: ChatDetail | null, threadId: string): GeorgeTurn[] {
  // The exchanges the caller's chat covers, by conversation id, so the turn
  // built from the chat can name the posts it corresponds to.
  const byConversation = new Map<string, { question: Post | null; answer: Post | null }>();
  for (const p of posts) {
    if (!p.conversation_id) continue;
    const entry = byConversation.get(p.conversation_id) ?? { question: null, answer: null };
    if (p.author === 'user') entry.question = p;
    else entry.answer = p;
    byConversation.set(p.conversation_id, entry);
  }

  const covered = new Set<string>();
  const fromChat: GeorgeTurn[] = [];
  if (chat) {
    const turns = toGeorgeTurns(chat.turns);
    for (const t of turns) {
      if (t.role === 'george') {
        const conv = t.done?.conversation_id;
        const pair = conv ? byConversation.get(conv) : undefined;
        if (conv && pair) {
          covered.add(conv);
          t.post = frameFor(threadId, pair.question, pair.answer);
        }
      }
      fromChat.push(t);
    }
  }

  // Everything else visible: George's own posts, and exchanges the caller's
  // chat did not cover (somebody else's, shared). Text only.
  const fromPosts: GeorgeTurn[] = [];
  for (const p of posts) {
    if (p.conversation_id && covered.has(p.conversation_id)) continue;
    if (p.author === 'user') {
      fromPosts.push(userTurnFromPost(p));
    } else {
      const turn = georgeTurnFromPost(p, threadId);
      if (p.conversation_id) {
        // A shared answer: name its question too, so the pair is dropped
        // from the pending list together.
        const pair = byConversation.get(p.conversation_id);
        turn.post = frameFor(threadId, pair?.question ?? null, p);
      }
      fromPosts.push(turn);
    }
  }

  // By time, for order only. A stable sort keeps each source's own order
  // where times tie.
  return [...fromChat, ...fromPosts].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
}
