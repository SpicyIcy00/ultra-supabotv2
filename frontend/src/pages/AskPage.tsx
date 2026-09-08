/**
 * /ask — the home of George's work.
 *
 * ASK: I GO TO GEORGE. This page is the canonical, persisted river of
 * user-directed work — every question asked and every answer given — read
 * from authoritative persistence on every visit. Leave for Today or Pages and
 * come back, reload, close the tab: the same work is here, reconstructed from
 * the same posts, because nothing on the client is the source of it.
 *
 * WHY IT WAS NOT (root cause, 2026-09-09). Today read the river; Ask did not.
 * The root of Ask was an EMPTY state — the mark, the box and a "Recent" list
 * of thread links — and only /ask/:threadId loaded posts, one thread's worth.
 * So work lived at an address you had to find again, Ask felt like a new-chat
 * page, and Today, holding the persisted river, felt like the real home. The
 * data was always persisted; the wrong page was reading it.
 *
 * /ask/:threadId IS A FOCUS, NOT A CHAT. The same river, with that thread's
 * posts folded in if they are older than the loaded page (the thread read is
 * filtered by the same visibility clause, so this exposes nothing the river
 * would not), scrolled to the first post of the thread, and continued from
 * there. A thread that is not the caller's is a 404, exactly as before, and
 * the river still shows their own work above it.
 *
 * THE COMPOSER CONTINUES THE NEWEST OWN THREAD at the root, so "Why?" after a
 * reload means what it meant before one. The loop is shown that thread's
 * history and nothing else's: ONE RIVER is one visible stream of work, never
 * one model context. Continuation composition (workUnit.continuesWork) keeps
 * its three structural conditions and is not loosened to make history look
 * continuous.
 *
 * NO "NEW CHAT". A question asked when the river holds no own work starts a
 * thread; every other question continues one. Threads stay underneath.
 *
 * SCROLLING BELONGS TO THE CONTAINER (useAutoFollow): the reader keeps their
 * place the moment they scroll up, and the only way back is the pill.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown } from 'lucide-react';
import { useGeorge } from '../hooks/useGeorge';
import { useAutoFollow } from '../hooks/useAutoFollow';
import { useRiver } from '../hooks/useRiver';
import { useShare } from '../hooks/useShare';
import { useThread } from '../hooks/useThread';
import { AskComposer } from '../components/george/AskComposer';
import { PageScopeLine } from '../components/george/PageScopeLine';
import { threadScope } from '../components/george/pageScope';
import { PresenceMark } from '../components/george/PresenceMark';
import { RiverEntries } from '../components/george/RiverEntry';
import { focusTarget, lastPostOf, newestOwnThread, withFocus } from '../components/george/askHome';
import { liveCognition } from '../components/george/cognition';
import { ROOT_HINT, composerHint } from '../components/george/composerHint';
import { markDetail } from '../components/george/markState';
import { riverMerge } from '../components/george/riverMerge';
import { threadHistory } from '../components/george/threadHistory';
import { blocksFromCalls, blocksFromCharted } from '../components/george/resultShape';
import { liveItems, storedItems, streamSignal, withContinuity } from '../components/george/workUnit';
import { widestWidth, workspaceWidth } from '../components/george/workspaceWidth';
import {
  SHELL_COLUMN_TRANSITION,
  SHELL_PAGE_HEIGHT,
  shellColumn,
} from '../components/shell/shellLayout';
import { listPages } from '../services/pagesApi';
import type { PageScope } from '../types/george';

interface RouteState {
  draft?: string;
  /** Where the person came from, as context — the legacy chrome sends this. */
  pageContext?: string;
  /** A George page to bind a NEW thread to. Only a page sends this. */
  pageScope?: PageScope;
}

/** The way back to the bottom, once the reader has left it. */
function FollowPill({ show, writing, onClick }: { show: boolean; writing: boolean; onClick: () => void }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto flex min-h-touch items-center gap-1.5 rounded-full border border-george-line bg-george-paper px-3.5 py-1.5 text-[12px] text-george-slate shadow-sm hover:text-george-navy"
      >
        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
        {writing ? 'George is still writing' : 'Latest'}
      </button>
    </div>
  );
}

/**
 * The river with nothing in it yet. The mark and one line; the box is below,
 * where it always is. No cards, no suggestions, no summary of the business.
 */
function NothingYet() {
  const { presence, live } = useGeorge();
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <PresenceMark
        state={presence}
        running={live.running}
        lastResult={live.lastResult}
        toolResults={live.toolResults}
        className="h-16 w-16 md:h-20 md:w-20"
      />
      <h1 className="mt-10 font-george-serif text-[26px] leading-none text-george-navy md:text-[30px]">
        Ask anything.
      </h1>
    </div>
  );
}

export default function AskPage() {
  const { threadId: focus } = useParams();
  const george = useGeorge();
  const { turns, threadId: openThread, open, ask, reset, cancel, busy, pageScope } = george;
  const location = useLocation();
  const state = (location.state ?? {}) as RouteState;
  const share = useShare();

  // THE SOURCE. The work stream of the river, from persistence, every visit.
  const river = useRiver('work');
  // The pages, for one thing only: a thread stored before 2026-09-08 knew its
  // page by title, and the title resolves against the pages that exist NOW.
  const pages = useQuery({ queryKey: ['pages'], queryFn: listPages, staleTime: 30_000 });

  // The thread the box continues: the focus, or the newest own work.
  const active = focus ?? newestOwnThread(river.posts);
  const thread = useThread(active ?? '');

  // The river, with a focused thread folded in when it is older than the page.
  const posts = useMemo(
    () => (focus ? withFocus(river.posts, thread.posts) : river.posts),
    [focus, river.posts, thread.posts],
  );

  // Load the active thread into the one stream, once — unless it is already
  // the thread the stream is on (the live turns ARE the newest truth), and
  // never while George is answering in another thread (opening this one would
  // tear that answer down; the effect re-runs when `busy` clears).
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !thread.ready || pages.isPending) return;
    if (openThread === active) {
      loadedFor.current = active;
      return;
    }
    if (busy || loadedFor.current === active) return;
    loadedFor.current = active;
    open(threadHistory(thread.posts, thread.chat, active), active, threadScope(thread.posts, pages.data ?? []));
  }, [active, thread.ready, thread.posts, thread.chat, openThread, open, busy, pages.isPending, pages.data]);

  const here = active !== null && openThread === active;
  const elsewhere = busy && !here;
  const scope = useMemo(
    () => (here ? pageScope : active ? threadScope(thread.posts, pages.data ?? []) : null),
    [here, pageScope, active, thread.posts, pages.data],
  );

  const merged = useMemo(() => riverMerge(posts, here ? turns : []), [posts, turns, here]);
  const stored = useMemo(() => storedItems(merged.posts), [merged.posts]);
  const pendingItems = useMemo(
    () => liveItems(merged.pending, scope?.title ?? null),
    [merged.pending, scope?.title],
  );
  const items = useMemo(
    () => withContinuity([...stored.map((i) => ({ ...i })), ...pendingItems.map((i) => ({ ...i }))]),
    [stored, pendingItems],
  );

  const narration = useMemo(
    () =>
      busy && here
        ? {
            detail: markDetail(george.presence, george.live.running, george.live.lastResult),
            cognition: liveCognition(george.presence, george.live.thinking),
          }
        : null,
    [busy, here, george.presence, george.live.running, george.live.lastResult, george.live.thinking],
  );

  const width = useMemo(
    () =>
      widestWidth([
        ...merged.posts.map((p) => workspaceWidth(blocksFromCharted((p.payload as { charted?: unknown } | null)?.charted))),
        ...merged.pending.map((t) => workspaceWidth(t.role === 'george' ? blocksFromCalls(t.toolCalls) : [])),
      ]),
    [merged],
  );
  const column = `${shellColumn(width)} ${SHELL_COLUMN_TRANSITION}`;

  // Following: the newest work when arriving at the root, the focused work
  // when arriving by deep link, and the stream while it runs.
  const [focused, setFocused] = useState<string | null>(null);
  const follow = useAutoFollow(
    `${merged.posts.length}:${streamSignal(merged.pending)}`,
    !river.loading && (!focus || busy),
  );
  useEffect(() => {
    if (!focus || focused === focus || river.loading || thread.loading) return;
    const target = focusTarget(posts, focus);
    const el = target ? follow.ref.current?.querySelector<HTMLElement>(`[data-entry-id="${target}"]`) : null;
    if (el && follow.ref.current) {
      follow.ref.current.scrollTop = Math.max(0, el.offsetTop - 16);
      setFocused(focus);
    }
  }, [focus, focused, posts, river.loading, thread.loading, follow.ref]);

  const onAsk = useCallback(
    (question: string) => {
      const parent = lastPostOf(posts, active);
      if (active && here) {
        // Continue the work: the reply names the post it follows.
        void ask(question, { parentId: parent?.id ?? null, pageContext: state.pageContext ?? null });
        return;
      }
      // No own work yet, or the stream is not on this thread: a question
      // starts a thread. reset() clears whatever the shared stream held.
      reset();
      void ask(question, { pageContext: state.pageContext ?? null, pageScope: state.pageScope ?? null });
    },
    [ask, reset, posts, active, here, state.pageContext, state.pageScope],
  );

  const empty = !river.loading && !river.error && items.length === 0;

  return (
    <div className={`${SHELL_PAGE_HEIGHT} flex flex-col`}>
      <div className="relative flex-1 overflow-hidden">
        <div ref={follow.ref} className="h-full overflow-y-auto overscroll-contain px-4 py-5 md:px-8">
          <div className={`${column} space-y-5`}>
            {/* Three outcomes, three renderings (UI rule 8). */}
            {river.loading && <p className="py-10 text-center text-[13px] text-george-muted">Opening your work…</p>}
            {river.error && (
              <p className="py-10 text-center text-[13px] text-george-navy">Couldn’t read your work. The work is still there.</p>
            )}
            {focus && thread.unavailable && (
              <div className="py-6 text-center">
                <p className="text-[14px] text-george-navy">That work isn’t available.</p>
                <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-george-slate">
                  It may have been deleted, or it may be somebody else’s. Your own work is here.
                </p>
              </div>
            )}
            {focus && thread.failed && (
              <div className="py-6 text-center">
                <p className="text-[14px] text-george-navy">Couldn’t open that work.</p>
                <button type="button" onClick={() => void thread.refetch()} className="mt-3 min-h-touch rounded-full border border-george-line bg-george-paper px-3 py-1.5 text-[12px] text-george-slate hover:text-george-navy">
                  Try again
                </button>
              </div>
            )}

            {river.hasOlder && (
              <div className="text-center">
                <button type="button" onClick={river.loadOlder} disabled={river.loadingOlder}
                  className="min-h-touch rounded-full border border-george-line bg-george-paper px-3 py-1.5 text-[12px] text-george-slate hover:text-george-navy disabled:opacity-50">
                  {river.loadingOlder ? 'Reading…' : 'Earlier work'}
                </button>
              </div>
            )}

            {empty && <NothingYet />}

            <RiverEntries items={items} focusLatest narration={narration} onAsk={onAsk} onShare={share.share} sharingId={share.sharingId} />

            {elsewhere && (
              <p className="text-[12px] leading-relaxed text-george-muted">
                George is still answering earlier work. This continues when he is done.
              </p>
            )}
          </div>
        </div>
        <FollowPill show={!follow.atBottom} writing={busy && here} onClick={follow.jumpToBottom} />
      </div>

      {(scope ?? state.pageScope) && (
        <div className="px-4 md:px-8">
          <PageScopeLine scope={scope ?? state.pageScope ?? null} className={`${column} mb-1.5`} />
        </div>
      )}
      <AskComposer
        onAsk={onAsk}
        onCancel={cancel}
        busy={busy}
        placeholder={items.length ? composerHint(scope, items) : ROOT_HINT}
        draft={state.draft ?? null}
        column={column}
      />
    </div>
  );
}
