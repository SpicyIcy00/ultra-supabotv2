/**
 * The desk: five regions, and only one of them transforms.
 *
 *   the line     the mark, the business and the subject in focus, the counts
 *   the trail    how we got here, George's reading, what else is in progress
 *   the workspace the business — the only region that changes
 *   the inspector what is behind a figure, when something is opened
 *   the line     where you talk to George, showing what it will send
 *
 * THE PROPORTIONS ARE THE PRODUCT. The workspace has the room; the trail is a
 * quiet column of words; the inspector is not there until it is wanted. Below
 * `lg` the trail collapses to the reading above the workspace and the
 * inspector becomes a sheet, so the workspace is the screen — the phone layout
 * is the real layout with the sides given back on a desktop.
 *
 * NOTHING HERE DECIDES ANYTHING. What the workspace draws is `composeDesk`'s;
 * what a person may do is `deskActions`'; what a question carries is
 * `deskContextFor`'s. This file places them and holds no state of its own.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DeskLine } from './DeskLine';
import { Inspector } from './Inspector';
import { ShellLine } from './ShellLine';
import { Stage } from './Stage';
import { TimeRibbon } from './TimeRibbon';
import { Trail } from './Trail';
import type { DeskActionItem } from './deskActions';
import type { useDesk } from './useDesk';
import { useMotionMode, MOTION_CLASS } from './motion';
import { CompactNotices } from '../george/NoticeBanner';
import { GreetingUnavailable } from '../george/Greeting';
import { getGreeting } from '../../services/greetingApi';

export interface DeskProps {
  desk: ReturnType<typeof useDesk>;
  busy: boolean;
  onCancel: () => void;
  onOpenWork: (threadId: string) => void;
  onHistory: () => void;
  draft: string | null;
  draftKey: number;
  onAction: (action: DeskActionItem) => void;
}

/**
 * What George says before he is asked anything.
 *
 * The brief's own sentence, with its caveats named beneath it — the greeting
 * rule unchanged: the sentence leads, and each caveat says which it is
 * without a tap (UI rule 4's amendment). Three outcomes, three renderings.
 */
function Opening() {
  const greeting = useQuery({ queryKey: ['greeting'], queryFn: () => getGreeting(), staleTime: 5 * 60_000, retry: 1 });
  if (greeting.isPending) {
    return <p className="text-[14px] text-george-muted">Reading this morning…</p>;
  }
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

export function Desk({ desk, busy, onCancel, onOpenWork, onHistory, draft, draftKey, onAction }: DeskProps) {
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

  return (
    <div className={`desk-ground ${MOTION_CLASS[motion]} flex h-dvh flex-col text-george-navy`} data-desk>
      <ShellLine scope={layout.scope} onHistory={onHistory} />

      <div className="flex min-h-0 flex-1">
        {/* The trail: a quiet column of words. */}
        <div className="hidden w-64 shrink-0 lg:block">
          <Trail
            surface={desk.surface}
            stepIndex={state.stepIndex}
            onStep={(i) => dispatch({ type: 'step', index: i })}
            inProgress={desk.inProgress}
            onOpen={onOpenWork}
            narration={desk.narration}
          />
        </div>

        {/* The workspace. */}
        <main className="min-w-0 flex-1 overflow-y-auto px-5 pb-6 md:px-10">
          <div className="mx-auto w-full max-w-5xl">
            {desk.atRest && (
              <div className="pb-8 pt-2">
                <Opening />
              </div>
            )}

            {/* The title of the work, and time as a control over it. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-5 pt-2">
              <p className="desk-label" data-title>
                {desk.atRest ? 'The business' : layout.title}
              </p>
              <TimeRibbon
                windows={desk.windows}
                current={state.window ?? (layout.anchor?.window ? { kind: 'preset', name: layout.anchor.window.name } : null)}
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
                <p className="text-[14px] leading-relaxed text-george-navy">
                  Couldn’t read that just now. Nothing is lost.
                </p>
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

            {!desk.loading && !desk.failed && !desk.unavailable && (
              <Stage
                layout={layout}
                selection={state.selection}
                onSelect={desk.onSelect}
                reading={desk.reading}
                asList={state.listView}
              />
            )}

            {/* The reading, on a phone, where there is no trail column. */}
            {desk.surface?.latest.prose && (
              <div className="mt-8 lg:hidden">
                <p className="desk-label mb-2">George</p>
                <p className="whitespace-pre-wrap font-george-serif text-[15px] leading-relaxed text-george-navy">
                  {desk.surface.latest.prose}
                </p>
              </div>
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
        actions={desk.actions}
        onAction={onAction}
        draft={draft}
        draftKey={draftKey}
      />
    </div>
  );
}
