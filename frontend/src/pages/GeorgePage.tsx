/**
 * /george — George's home.
 *
 * Three columns. The centre is the conversation and is the ONLY thing that
 * exists on a phone; both rails become dismissable overlays there (UI rule 7).
 * The left rail is collapsed by default on desktop, so the resting state is
 * app-sidebar + centre + attention rail rather than four columns of chrome.
 *
 * The centre shows either a CHAT (the current one, live or reopened) or a
 * PAGE of pins. Those are different things — a chat is a session, a page is a
 * collection of pins — and the left rail lists them in two sections.
 *
 * This route is George's home, not the only place he lives — see the rule-1
 * reading in CLAUDE.md. The per-page affordance reuses these same components
 * and the same useGeorgeStream hook.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PanelLeft } from 'lucide-react';
import { useGeorgeStream } from '../hooks/useGeorgeStream';
import { GeorgeConversation } from '../components/george/GeorgeConversation';
import { Greeting, GreetingUnavailable } from '../components/george/Greeting';
import { PinnedPage } from '../components/george/PinnedPage';
import { GeorgeInput } from '../components/george/GeorgeInput';
import { ReactiveMark } from '../components/george/ReactiveMark';
import {
  AttentionButton,
  LeftRail,
  LeftRailStub,
  RightRail,
  type Centre,
} from '../components/george/Rails';
import { approvalsView } from '../components/george/approvalState';
import { getChat } from '../services/chatsApi';
import { getGreeting } from '../services/greetingApi';
import { errorMessage } from '../services/pinsApi';
import { listApprovals } from '../services/workflowsApi';

export default function GeorgePage() {
  const { turns, state, ask, cancel, busy, threadId, open, reset } = useGeorgeStream();
  const qc = useQueryClient();
  const [leftOpen, setLeftOpen] = useState(false);   // collapsed by default
  const [rightOpen, setRightOpen] = useState(false);
  const [centre, setCentre] = useState<Centre>({ kind: 'chat' });
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * Whether George opened the chat on screen.
   *
   * True for a chat that STARTED here, and it stays true once the user
   * replies: his opening line is the top of the thread, and having it vanish
   * as you answer it would be the page taking back what it just said. False
   * for a reopened chat, which already has its own beginning.
   */
  const [spokeFirst, setSpokeFirst] = useState(true);

  /**
   * The brief, once per mount. Not refetched on focus: George says this at the
   * top of a conversation, and a greeting that silently rewrote itself while
   * the thread scrolled beneath it would be a different claim under the same
   * receipts. `retry: false` because the failure line is a real answer.
   */
  const greeting = useQuery({
    queryKey: ['george-greeting'],
    queryFn: () => getGreeting(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  /**
   * The approval queue.
   *
   * Unlike the greeting, this one SHOULD change while you look at it: a
   * version promoted in another tab, or one saved in this conversation, has to
   * stop or start needing you without a reload. So it refetches on focus and
   * goes stale quickly — the opposite of the greeting's staleTime: Infinity,
   * and for the opposite reason.
   *
   * Retried ONCE, and the count matters. A failed lookup here is not a real
   * answer the way an unreachable brief is — "something may be waiting and I
   * could not find out" is worth a second attempt. But the default three
   * retries with backoff leave the rail saying "Checking…" for the better part
   * of ten seconds, and a state that honest is still one nobody can act on.
   * One retry, then say plainly that it failed.
   */
  const approvals = useQuery({
    queryKey: ['workflow-approvals'],
    queryFn: () => listApprovals(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  /**
   * What the rail says, and what the button announces. Derived in one place so
   * the two can never disagree — and `count` is null while unknown, which is
   * what keeps "nothing needs you" from being said before anyone has asked
   * (UI rule 8).
   */
  const approvalsState = useMemo(
    () =>
      approvalsView(
        approvals.isPending
          ? { status: 'pending' }
          : approvals.isError
            ? { status: 'error' }
            : { status: 'success', approvals: approvals.data ?? [] },
      ),
    [approvals.isPending, approvals.isError, approvals.data],
  );

  /** Tools still in flight, for the mark's subtitle. */
  const running = useMemo(() => {
    const last = turns[turns.length - 1];
    if (last?.role !== 'george') return [];
    return last.toolCalls.filter((c) => !c.result).map((c) => c.tool);
  }, [turns]);

  /** Tool results landed this turn. Each one beats the mark. */
  const toolResults = useMemo(() => {
    const last = turns[turns.length - 1];
    if (last?.role !== 'george') return 0;
    return last.toolCalls.filter((c) => c.result).length;
  }, [turns]);

  /**
   * The most recent call that has come back, for the narration line.
   *
   * Highest seq rather than array position: parallel calls land out of order,
   * and the newest RESULT is what George would be reacting to. Null once the
   * answer starts — by then the answer is the narration, and a stale "came
   * back" line under a finished turn would describe work that is over.
   */
  const lastResult = useMemo(() => {
    const last = turns[turns.length - 1];
    if (last?.role !== 'george') return null;
    const done = last.toolCalls.filter((c) => c.result);
    if (done.length === 0) return null;
    const newest = done.reduce((a, b) => (b.seq > a.seq ? b : a));
    return {
      tool: newest.tool,
      rowCount: newest.result?.row_count ?? null,
      error: newest.result?.error ?? null,
    };
  }, [turns]);

  /** The reasoning arriving right now, for the line under the mark. */
  const thinking = useMemo(() => {
    const last = turns[turns.length - 1];
    return last?.role === 'george' ? last.thinking : '';
  }, [turns]);

  /**
   * The hero mark docks to the header once it has been scrolled past.
   *
   * A threshold on the scroll container, not a scroll-linked transform: the
   * hero keeps a FIXED-HEIGHT slot whether it is shown or docked, so the
   * crossfade moves no layout and the thread never jumps under the reader.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setDocked(el.scrollTop > 40);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const newChat = useCallback(() => {
    reset();
    setLoadError(null);
    setCentre({ kind: 'chat' });
    setLeftOpen(false);
    setSpokeFirst(true);
  }, [reset]);

  /**
   * Reopen a stored chat. Fetched fresh each time — a chat gains turns while
   * it is open elsewhere, and a cached copy would reopen it short.
   */
  const openChat = useCallback(
    async (threadId: string) => {
      setLoadError(null);
      try {
        const chat = await qc.fetchQuery({
          queryKey: ['chat', threadId],
          queryFn: () => getChat(threadId),
          staleTime: 0,
        });
        open(chat);
        setCentre({ kind: 'chat' });
        setLeftOpen(false);
        // A reopened chat begins with the question that started it.
        setSpokeFirst(false);
      } catch (err) {
        setLoadError(errorMessage(err));
      }
    },
    [open, qc],
  );

  return (
    // Negative margins cancel Layout's <main> padding so George owns the full
    // viewport width; the app chrome above it is untouched.
    <div className="-m-3 sm:-m-4 lg:-m-6 flex h-[calc(100dvh-3.5rem)] bg-george-cream font-sans text-george-navy">
      {leftOpen ? (
        <LeftRail
          open={leftOpen}
          onClose={() => setLeftOpen(false)}
          centre={centre}
          activeThreadId={threadId}
          onNewChat={newChat}
          onOpenChat={openChat}
          onChatDeleted={(id) => {
            // The chat on screen is gone server-side; continuing it would 404.
            if (id === threadId) newChat();
          }}
          onSelectPage={(page) => {
            setCentre({ kind: 'page', page });
            setLeftOpen(false);
          }}
        />
      ) : (
        <LeftRailStub onOpen={() => setLeftOpen(true)} />
      )}

      {/* ---- centre: the whole screen on a phone ---- */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-george-line px-3 py-2.5 md:px-6">
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            aria-label="Open chats and pages"
            className="flex h-9 w-9 min-h-touch min-w-touch items-center justify-center rounded-lg text-george-slate lg:hidden"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          {/* The header is deliberately bare until the hero is scrolled past:
              George's presence is the centred mark below, not chrome up here. */}
          <div
            className={`min-w-0 flex-1 transition-opacity duration-300 ${
              docked || centre.kind === 'page' ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={!(docked || centre.kind === 'page')}
          >
            <ReactiveMark
              variant="inline"
              state={state}
              running={running}
              toolResults={toolResults}
              thinking={thinking}
              lastResult={lastResult}
            />
          </div>

          <AttentionButton count={approvalsState.count} onClick={() => setRightOpen(true)} />
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-6"
        >
          <div className="mx-auto max-w-3xl">
            {loadError && (
              <p className="mb-4 rounded-lg border border-george-line bg-george-paper px-3 py-2.5 text-[13px] text-george-navy">
                Could not open that chat: {loadError}
              </p>
            )}
            {/* Centre stage. The slot keeps its height when the mark docks, so
                nothing below it moves — and it is tall enough for the two-line
                cognition slot the mark reserves whether or not it is thinking,
                so the thread does not move as a turn starts or ends either. */}
            {centre.kind === 'chat' && (
              <div className="flex h-[164px] items-start justify-center md:h-[192px]">
                <div
                  className={`origin-top transition-all duration-300 ${
                    docked ? 'pointer-events-none scale-75 opacity-0' : 'scale-100 opacity-100'
                  }`}
                >
                  <ReactiveMark
                    variant="hero"
                    state={state}
                    running={running}
                    toolResults={toolResults}
                    thinking={thinking}
                    lastResult={lastResult}
                  />
                </div>
              </div>
            )}

            {/* George speaks first. Directly under the mark, so the first
                frame of the page is him and something he has to say — not a
                mark above an empty box. */}
            {centre.kind === 'chat' && spokeFirst && (
              <div className="mb-6">
                {greeting.data ? (
                  <Greeting greeting={greeting.data} onAsk={ask} />
                ) : greeting.isError ? (
                  <GreetingUnavailable />
                ) : null}
              </div>
            )}

            {centre.kind === 'chat' ? (
              <GeorgeConversation
                turns={turns}
                busy={busy}
                showEmptyState={!(spokeFirst && greeting.data)}
              />
            ) : (
              <PinnedPage page={centre.page} onBack={() => setCentre({ kind: 'chat' })} />
            )}
          </div>
        </div>

        {centre.kind === 'chat' && (
          <GeorgeInput onAsk={ask} onCancel={cancel} busy={busy} />
        )}
      </main>

      <RightRail
        open={rightOpen}
        onClose={() => setRightOpen(false)}
        view={approvalsState}
      />
    </div>
  );
}
