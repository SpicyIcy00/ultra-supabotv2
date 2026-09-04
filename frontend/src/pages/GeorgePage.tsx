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
import { useQueryClient } from '@tanstack/react-query';
import { PanelLeft } from 'lucide-react';
import { useGeorgeStream } from '../hooks/useGeorgeStream';
import { GeorgeConversation } from '../components/george/GeorgeConversation';
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
import { getChat } from '../services/chatsApi';
import { errorMessage } from '../services/pinsApi';

export default function GeorgePage() {
  const { turns, state, ask, cancel, busy, threadId, open, reset } = useGeorgeStream();
  const qc = useQueryClient();
  const [leftOpen, setLeftOpen] = useState(false);   // collapsed by default
  const [rightOpen, setRightOpen] = useState(false);
  const [centre, setCentre] = useState<Centre>({ kind: 'chat' });
  const [loadError, setLoadError] = useState<string | null>(null);

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
            />
          </div>

          <AttentionButton count={0} onClick={() => setRightOpen(true)} />
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
            {/* Centre stage. The slot keeps its height when the mark docks,
                so nothing below it moves. */}
            {centre.kind === 'chat' && (
              <div className="flex h-[124px] items-start justify-center md:h-[152px]">
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
                  />
                </div>
              </div>
            )}

            {centre.kind === 'chat' ? (
              <GeorgeConversation turns={turns} />
            ) : (
              <PinnedPage page={centre.page} onBack={() => setCentre({ kind: 'chat' })} />
            )}
          </div>
        </div>

        {centre.kind === 'chat' && (
          <GeorgeInput onAsk={ask} onCancel={cancel} busy={busy} />
        )}
      </main>

      <RightRail open={rightOpen} onClose={() => setRightOpen(false)} />
    </div>
  );
}
