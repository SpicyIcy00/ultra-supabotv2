/**
 * /ask — the workspace. Empty until asked; then the answer.
 *
 * THE EMPTY STATE IS ALMOST NOTHING. The mark, "Ask anything.", the box, and
 * three starting points. No caption under the mark — its behaviour says it
 * is ready, and a word saying so would be a caption on a photograph. No
 * cards, no suggestions grid, no summary of the business. The whitespace is
 * the design.
 *
 * NOTHING TO CHOOSE FIRST. There were three words under the box — Data,
 * Analyze, Automate — and they were the wrong shape for George twice over.
 * They read as modes, so they asked a person to classify their question
 * before asking it, which is work George should be doing; and they were
 * ambiguous even as prompts, because "reading sales by store" is data and
 * analysis and could end in a saved rule. George infers what kind of work a
 * question is from the question. So the box is the whole interface, and what
 * a person typed last time is the only other thing on the page.
 *
 * /ask/:threadId IS THE THREAD. The stored posts are drawn as posts, the
 * turn in flight as a pending post beneath them, and the box continues the
 * same thread. Opening a thread loads its history into the one stream so
 * "pin that" can resolve against the calls behind an earlier answer — from
 * the caller's own chat only; a George post travels as text (threadHistory).
 * The newest answer leads and earlier turns go quieter; nothing is hidden
 * and nothing is summarised (turnShape).
 *
 * Asking from the empty state names the thread in the `start` frame, and
 * the URL follows it, so the exchange has an address from its first frame.
 *
 * A THREAD'S PAGE IS THE THREAD'S. A question asked from a page binds its
 * thread to that page (the stream holds the scope, not route state); one
 * line above the box says so and links back. Reopening the thread recovers
 * the scope from what George recorded on its answers (pageScope.threadScope),
 * so a follow-up after a reload is still about the same page — and a fresh
 * Ask, or another thread, has its own scope or none.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useGeorge } from '../hooks/useGeorge';
import { useShare } from '../hooks/useShare';
import { useThread } from '../hooks/useThread';
import { AnswerTurns } from '../components/george/AnswerTurn';
import { AskComposer } from '../components/george/AskComposer';
import { PageScopeLine } from '../components/george/PageScopeLine';
import { threadScope } from '../components/george/pageScope';
import { PostCard } from '../components/george/PostCard';
import { ReactiveMark } from '../components/george/ReactiveMark';
import { groupsWith, questionFor } from '../components/george/postShape';
import { riverMerge } from '../components/george/riverMerge';
import { threadHistory } from '../components/george/threadHistory';
import { blocksFromCalls, blocksFromCharted } from '../components/george/resultShape';
import { widestWidth, workspaceWidth } from '../components/george/workspaceWidth';
import {
  SHELL_COLUMN,
  SHELL_COLUMN_TRANSITION,
  SHELL_PAGE_HEIGHT,
  shellColumn,
} from '../components/shell/shellLayout';
import { listChats } from '../services/chatsApi';
import { listPages } from '../services/pagesApi';
import type { PageScope } from '../types/george';

interface RouteState {
  draft?: string;
  /** Where the person came from, as context — the legacy chrome sends this. */
  pageContext?: string;
  /** A George page to bind the new thread to. Only a page sends this. */
  pageScope?: PageScope;
}

function EmptyAsk() {
  const { presence, live, ask, reset, cancel, busy, pageScope } = useGeorge();
  const location = useLocation();
  const state = (location.state ?? {}) as RouteState;

  const recent = useQuery({ queryKey: ['chats'], queryFn: listChats, staleTime: 30_000 });

  const onAsk = useCallback(
    (question: string) => {
      reset();
      void ask(question, {
        pageContext: state.pageContext ?? null,
        pageScope: state.pageScope ?? null,
      });
    },
    [ask, reset, state.pageContext, state.pageScope],
  );

  return (
    <div className={`${SHELL_PAGE_HEIGHT} flex flex-col overflow-y-auto px-4 md:px-8`}>
      <div className={`${SHELL_COLUMN} flex flex-1 flex-col`}>
        <div className="flex flex-1 flex-col items-center justify-center pb-10 pt-16">
          <ReactiveMark
            variant="mark"
            state={presence}
            running={live.running}
            lastResult={live.lastResult}
            toolResults={live.toolResults}
            className="h-16 w-16 md:h-20 md:w-20"
          />

          <h1 className="mt-10 font-george-serif text-[26px] leading-none text-george-navy md:text-[30px]">
            Ask anything.
          </h1>

          <div className="mt-10 w-full max-w-xl">
            {/* A question just sent from a page passes through here on its
                way to its thread; the scope it bound is named meanwhile. */}
            <PageScopeLine scope={pageScope ?? state.pageScope ?? null} className="mb-2" />
            <AskComposer
              bare
              onAsk={onAsk}
              onCancel={cancel}
              busy={busy}
              /* A draft can arrive from elsewhere — Workflows offering to run
                 a rule — and it lands in the box unsent, for the person to
                 read and send. */
              draft={state.draft ?? null}
            />
          </div>
        </div>

        {/* Low on the page, low in the hierarchy — what you asked before is
            worth reaching for and worth nothing at the top. Three states
            (UI rule 8); loading and failed are one quiet line each. */}
        <div className="pb-24 md:pb-10">
          {recent.isPending && (
            <p className="text-[12px] text-george-muted">Checking recent asks…</p>
          )}
          {recent.isError && (
            <p className="text-[12px] text-george-muted">Couldn’t read your recent asks.</p>
          )}
          {recent.data && recent.data.length > 0 && (
            <>
              <p className="text-[11px] uppercase tracking-wider text-george-muted">Recent</p>
              <ul className="mt-2 space-y-1">
                {recent.data.slice(0, 5).map((c) => (
                  <li key={c.thread_id}>
                    <Link
                      to={`/ask/${c.thread_id}`}
                      title={c.question}
                      className="block min-h-touch truncate py-2 text-[13px] text-george-slate hover:text-george-navy"
                    >
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadAsk({ threadId }: { threadId: string }) {
  const george = useGeorge();
  const { turns, threadId: openThread, open, ask, cancel, busy, pageScope } = george;
  const thread = useThread(threadId);
  const share = useShare();
  const location = useLocation();
  const state = (location.state ?? {}) as RouteState;
  // The person's pages, for one thing only: a thread stored before
  // 2026-09-08 knew its page by title, and the title resolves against the
  // pages that exist NOW, exactly, or not at all (pageScope.threadScope).
  const pages = useQuery({ queryKey: ['pages'], queryFn: listPages, staleTime: 30_000 });

  // Load the thread into the one stream, once — unless it is already the
  // thread the stream is on, in which case the live turns ARE the newest
  // truth and must not be replaced by a stored copy of themselves; and never
  // while George is still answering in ANOTHER thread, because opening this
  // one would tear that answer down. He finishes there first; then this
  // thread opens (the effect re-runs when `busy` clears).
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!thread.ready || pages.isPending) return;
    if (openThread === threadId) {
      loadedFor.current = threadId;
      return;
    }
    if (busy || loadedFor.current === threadId) return;
    loadedFor.current = threadId;
    // The thread's own scope, recovered from its stored answers — by id, or
    // by exact title for an old thread, or none.
    open(threadHistory(thread.posts, thread.chat, threadId), threadId,
         threadScope(thread.posts, pages.data ?? []));
  }, [thread.ready, thread.posts, thread.chat, threadId, openThread, open, busy,
      pages.isPending, pages.data]);

  // The stream's turns belong to THIS thread only when it is the open one.
  const here = openThread === threadId;
  const elsewhere = busy && !here;
  // The scope shown is this thread's: the stream's while it is the open
  // thread, otherwise what its stored answers say.
  const scope = useMemo(
    () => (here ? pageScope : threadScope(thread.posts, pages.data ?? [])),
    [here, pageScope, thread.posts, pages.data],
  );
  const merged = useMemo(
    () => riverMerge(thread.posts, here ? turns : []),
    [thread.posts, turns, here],
  );
  const lastPost = thread.posts[thread.posts.length - 1];

  // How wide the column has to be, decided by what is IN it. A thread of prose
  // keeps a readable measure; a table or a chart takes the room it needs. Once
  // something in the thread has asked for the room the column keeps it, so it
  // cannot narrow again under a reader who is scrolling — and the composer
  // below shares the class, so the box never hangs under a table it no longer
  // spans.
  const width = useMemo(
    () =>
      widestWidth([
        ...merged.posts.map((p) =>
          workspaceWidth(blocksFromCharted((p.payload as { charted?: unknown } | null)?.charted)),
        ),
        ...merged.pending.map((t) =>
          workspaceWidth(t.role === 'george' ? blocksFromCalls(t.toolCalls) : []),
        ),
      ]),
    [merged],
  );
  const column = `${shellColumn(width)} ${SHELL_COLUMN_TRANSITION}`;

  const onAsk = useCallback(
    (question: string) => {
      void ask(question, { parentId: lastPost?.id ?? null, pageContext: state.pageContext ?? null });
    },
    [ask, lastPost?.id, state.pageContext],
  );

  return (
    <div className={`${SHELL_PAGE_HEIGHT} flex flex-col`}>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 md:px-8">
        <div className={`${column} space-y-5`}>
          {thread.loading && (
            <p className="py-10 text-center text-[13px] text-george-muted">Opening…</p>
          )}
          {thread.unavailable && (
            <div className="py-10 text-center">
              <p className="text-[14px] text-george-navy">That thread isn’t available.</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-george-slate">
                It may have been deleted, or it may be somebody else’s.
              </p>
            </div>
          )}

          {merged.posts.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              grouped={groupsWith(merged.posts[i - 1], post)}
              onAsk={onAsk}
              onShare={share.share}
              sharing={share.sharingId === post.id}
              question={questionFor(merged.posts, post)}
              quiet={i < merged.posts.length - 1 || merged.pending.length > 0}
            />
          ))}

          {merged.pending.length > 0 && <AnswerTurns turns={merged.pending} focusLatest />}

          {elsewhere && (
            <p className="text-[12px] leading-relaxed text-george-muted">
              George is still answering in another thread. This one opens when he is done.
            </p>
          )}
        </div>
      </div>

      {scope && (
        <div className="px-4 md:px-8">
          <PageScopeLine scope={scope} className={`${column} mb-1.5`} />
        </div>
      )}
      <AskComposer
        onAsk={onAsk}
        onCancel={cancel}
        busy={busy}
        placeholder="Reply in this thread…"
        draft={state.draft ?? null}
        column={column}
      />
    </div>
  );
}

/**
 * Follows the stream: a question asked from empty gets its thread's URL.
 *
 * Only a thread that STARTED here. Arriving at /ask while an earlier thread
 * is still in the stream must not bounce straight back into it — /ask is
 * where a new question is asked.
 */
function FollowThread() {
  const { threadId } = useGeorge();
  const navigate = useNavigate();
  const arrivedWith = useRef(threadId);
  useEffect(() => {
    if (threadId && threadId !== arrivedWith.current) {
      navigate(`/ask/${threadId}`, { replace: true });
    }
  }, [threadId, navigate]);
  return null;
}

export default function AskPage() {
  const { threadId } = useParams();
  if (threadId) return <ThreadAsk threadId={threadId} />;
  return (
    <>
      <FollowThread />
      <EmptyAsk />
    </>
  );
}
