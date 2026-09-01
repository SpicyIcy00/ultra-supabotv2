/**
 * /george — George's home.
 *
 * Three columns. The centre is the conversation and is the ONLY thing that
 * exists on a phone; both rails become dismissable overlays there (UI rule 7).
 * The left rail is collapsed by default on desktop, so the resting state is
 * app-sidebar + centre + attention rail rather than four columns of chrome.
 *
 * This route is George's home, not the only place he lives — see the rule-1
 * reading in CLAUDE.md. The per-page affordance reuses these same components
 * and the same useGeorgeStream hook.
 */
import { useMemo, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { useGeorgeStream } from '../hooks/useGeorgeStream';
import { GeorgeConversation } from '../components/george/GeorgeConversation';
import { GeorgeInput } from '../components/george/GeorgeInput';
import { ReactiveMark } from '../components/george/ReactiveMark';
import {
  AttentionButton,
  LeftRail,
  LeftRailStub,
  RightRail,
} from '../components/george/Rails';

export default function GeorgePage() {
  const { turns, state, ask, cancel, busy } = useGeorgeStream();
  const [leftOpen, setLeftOpen] = useState(false);   // collapsed by default
  const [rightOpen, setRightOpen] = useState(false);

  /** Tools still in flight, for the mark's subtitle. */
  const running = useMemo(() => {
    const last = turns[turns.length - 1];
    if (last?.role !== 'george') return [];
    return last.toolCalls.filter((c) => !c.result).map((c) => c.tool);
  }, [turns]);

  return (
    // Negative margins cancel Layout's <main> padding so George owns the full
    // viewport width; the app chrome above it is untouched.
    <div className="-m-3 sm:-m-4 lg:-m-6 flex h-[calc(100dvh-3.5rem)] bg-george-cream font-sans text-george-navy">
      {leftOpen ? (
        <LeftRail open={leftOpen} onClose={() => setLeftOpen(false)} />
      ) : (
        <LeftRailStub onOpen={() => setLeftOpen(true)} />
      )}

      {/* ---- centre: the whole screen on a phone ---- */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-george-line px-3 py-2.5 md:px-6">
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            aria-label="Open pages"
            className="flex h-9 w-9 min-h-touch min-w-touch items-center justify-center rounded-lg text-george-slate lg:hidden"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <ReactiveMark state={state} running={running} />
          </div>

          <AttentionButton count={0} onClick={() => setRightOpen(true)} />
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-6">
          <div className="mx-auto max-w-3xl">
            <GeorgeConversation turns={turns} />
          </div>
        </div>

        <GeorgeInput onAsk={ask} onCancel={cancel} busy={busy} />
      </main>

      <RightRail open={rightOpen} onClose={() => setRightOpen(false)} />
    </div>
  );
}
