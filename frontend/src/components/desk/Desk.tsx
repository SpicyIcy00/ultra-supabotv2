/**
 * The desk: navigation, the investigation's trail, one answer, and the line.
 *
 *   sidebar      George, the business, and the states of his environment
 *   work trail   where this investigation has been; clicking a step restores it
 *   the answer   the only region that transforms — words, figures, visual,
 *                moves and George's next suggestion as ONE object
 *   inspector    what is behind a figure, when something is opened
 *   the line     where you talk to George, showing what it will send
 *
 * THE PROPORTIONS ARE THE PRODUCT. The answer has the room. The sidebar is a
 * short column of words and holds no reading, no summary and no receipts —
 * those all belong with the work, and this column is where they drifted to
 * before. Below `lg` the sidebar becomes a header row and the answer is the
 * screen; the inspector is a sheet from `xl` down.
 *
 * NOTHING HERE DECIDES ANYTHING. What the answer draws is `composeDesk`'s,
 * what George suggests is `recommendationFor`'s, what a caveat costs is
 * `levelCaveats`', and what a question carries is `deskContextFor`'s.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Answer } from './Answer';
import { DeskLine } from './DeskLine';
import { Inspector } from './Inspector';
import { Sidebar } from './Sidebar';
import { TimeRibbon } from './TimeRibbon';
import { WorkTrail } from './TrailBar';
import type { DeskActionItem } from './deskActions';
import type { useDesk } from './useDesk';
import { workSentence } from './workLine';
import { useMotionMode, MOTION_CLASS } from './motion';
import { CompactNotices } from '../george/NoticeBanner';
import { GreetingUnavailable } from '../george/Greeting';
import { getGreeting } from '../../services/greetingApi';

export interface DeskProps {
  desk: ReturnType<typeof useDesk>;
  busy: boolean;
  onCancel: () => void;
  onHistory: () => void;
  historyOpen: boolean;
  draft: string | null;
  draftKey: number;
  onAction: (action: DeskActionItem) => void;
}

/**
 * What George says before he is asked anything.
 *
 * The brief's own sentence, with its caveats named beneath it — the sentence
 * leads, and each caveat says which it is without a tap (UI rule 4's
 * amendment). Three outcomes, three renderings.
 */
function Opening() {
  const greeting = useQuery({ queryKey: ['greeting'], queryFn: () => getGreeting(), staleTime: 5 * 60_000, retry: 1 });
  if (greeting.isPending) return <p className="text-[14px] text-george-muted">Reading this morning…</p>;
  if (greeting.isError || !greeting.data) return <GreetingUnavailable />;
  return (
    <div className="space-y-2.5">
      <p className="max-w-3xl font-george-serif text-[19px] leading-relaxed text-george-navy md:text-[21px]">
        {greeting.data.headline}
      </p>
      <CompactNotices notices={greeting.data.notices} />
    </div>
  );
}

/**
 * WHAT WAS ASKED, AND WHAT GEORGE IS DOING ABOUT IT.
 *
 * The instruction is drawn the instant it is submitted — before the request
 * has opened — because the one thing a person must never have to guess is
 * whether they were heard. Beneath it, one line of what he has read and is
 * reading, every word of it derived from frames that arrived (workLine.ts).
 *
 * NEITHER OF THESE IS THE ANSWER. They sit above the workspace, which keeps
 * drawing what it has and then FORMS as each result lands. Nothing is
 * replaced by a spinner and nothing is hidden while he works.
 */
function Working({ asked, sentence }: { asked: string | null; sentence: string | null }) {
  if (!asked && !sentence) return null;
  return (
    <div className="mb-8 border-l-2 border-george-line pl-4" data-working>
      {asked && (
        <p className="max-w-3xl font-george-serif text-[18px] leading-relaxed text-george-navy" data-asked>
          {asked}
        </p>
      )}
      {sentence && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-george-slate" data-work-line>
          {sentence}
        </p>
      )}
    </div>
  );
}

export function Desk({
  desk, busy, onCancel, onHistory, historyOpen, draft, draftKey, onAction,
}: DeskProps) {
  const motion = useMotionMode();
  const { layout, state, dispatch } = desk;

  // Escape closes what is open, then clears the selection, then the window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
      if (e.key === 'Escape' && !typing) dispatch({ type: 'back' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const business = desk.definitions.data?.business.short ?? 'AJI';

  return (
    <div className={`desk-ground ${MOTION_CLASS[motion]} flex h-dvh flex-col text-george-navy lg:flex-row`} data-desk>
      {/* Navigation. A short column of words, and nothing that belongs in the work. */}
      <div className="shrink-0 lg:w-52">
        <Sidebar business={business} onHistory={onHistory} historyOpen={historyOpen} />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto px-5 pb-6 md:px-10">
            <div className="mx-auto w-full max-w-5xl">
              {desk.atRest && (
                <div className="pb-8 pt-3">
                  <Opening />
                </div>
              )}

              {/* Where this investigation has been, and time as a control over it. */}
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-6 pt-3">
                <WorkTrail steps={desk.trail} activeId={desk.activeStepId} onStep={desk.onStep} />
                <TimeRibbon
                  windows={desk.windows}
                  current={state.window ?? (layout.anchor?.window ? { kind: 'preset', name: layout.anchor.window.name } : null)}
                  pending={desk.pendingWindow}
                  compared={desk.compared}
                  onChoose={desk.onWindow}
                  busy={desk.replaying}
                />
              </div>

              {/* Four outcomes, four renderings, and the first three may never
                  borrow the fourth's words (UI rule 8). */}
              {desk.loading && <p className="py-16 text-center text-[13px] text-george-muted">Laying out the business…</p>}
              {desk.unavailable && !desk.loading && (
                <div className="py-16 text-center">
                  <p className="text-[14px] text-george-navy">That work isn’t available.</p>
                  <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-george-slate">
                    It may have been deleted, or it may be somebody else’s. Your own work is on the desk.
                  </p>
                </div>
              )}
              {desk.failed && !desk.loading && !desk.unavailable && (
                <div className="py-16 text-center">
                  <p className="text-[14px] leading-relaxed text-george-navy">Couldn’t read that just now. Nothing is lost.</p>
                  <button
                    type="button"
                    onClick={() => void desk.retry()}
                    className="mt-3 min-h-touch rounded-full bg-george-paper px-3.5 py-1.5 text-[12px] text-george-slate desk-lift hover:text-george-navy"
                  >
                    Try again
                  </button>
                </div>
              )}
              {desk.replayFailed && (
                <p className="mb-4 text-[13px] text-george-navy">
                  That window could not be read. The figures below are the ones before it.
                </p>
              )}

              {/* The instruction, immediately; then the work, as it happens. */}
              <Working asked={desk.asked} sentence={workSentence(desk.work)} />

              {!desk.loading && !desk.failed && !desk.unavailable && (
                <Answer
                  layout={layout}
                  selection={state.selection}
                  onSelect={desk.onSelect}
                  reading={desk.reading}
                  asList={state.listView}
                  prose={desk.surface?.latest.prose ?? ''}
                  recommendation={desk.recommendation}
                  moves={desk.actions}
                  onAction={onAction}
                  onInspect={() => dispatch({ type: 'inspect', target: { kind: 'notices' } })}
                  findings={desk.findings}
                  onOpenSubject={(subject) => desk.onSelect(subject, false)}
                  onAskQuestion={desk.ask}
                  moveFor={desk.moveFor}
                />
              )}
            </div>
          </main>

          {/* The inspector: only while something is opened. */}
          {state.inspector && (
            <div className="hidden w-80 shrink-0 xl:block">
              <Inspector target={state.inspector} layout={layout} onClose={() => dispatch({ type: 'inspect', target: null })} />
            </div>
          )}
        </div>

        <DeskLine
          onAsk={desk.ask}
          onCancel={onCancel}
          busy={busy}
          context={desk.contextWords}
          narration={desk.narration}
          draft={draft}
          draftKey={draftKey}
        />
      </div>
    </div>
  );
}
