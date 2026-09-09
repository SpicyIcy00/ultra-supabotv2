/**
 * One entry in the river — and the only thing that draws one.
 *
 * ONE COMPONENT, TWO SOURCES. A piece of work is drawn from a WorkUnit, built
 * either from the turn streaming now or from the post the river stored
 * (workUnit.ts). The handoff between them changes `state`, never the
 * component or the DOM.
 *
 * NOT A TRANSCRIPT. Until 2026-09-09 an entry was drawn as a message: a navy
 * bubble for what you said, an avatar and a paragraph for what George said,
 * then his figures underneath. That kept the mental model "I sent George a
 * message and he replied". The workspace now reads as WORK:
 *
 *   intent      what you asked, quiet — a rule, a line of serif, no bubble
 *   caveats     as the data state they are, above the figures
 *   the work    the figures, in their structure: the figure, what moved it,
 *               where it sits — this IS the answer
 *   reading     George's interpretation, under the evidence it interprets
 *   next        what the definitions let you do from here, and Pin
 *   receipts    when nothing was drawn to carry its own
 *
 * THE LIST IS A LIST OF SURFACES (2026-09-09, Generative Workspace V3).
 * `RiverEntries` no longer draws items one by one: it groups them into the
 * pieces of work they belong to (surfaceCompose.riverSurfaces) and draws each
 * piece as ONE object (WorkSurface.tsx) that its refinements deepen and
 * recompose. `RiverEntry` — one item, on its own — remains for the callers
 * that hold one item and nothing else: a live turn in the legacy chrome, a
 * post on Today, and the suite's contract for a single entry.
 *
 * Notices sit ABOVE the figures, never in a disclosure, on every kind (UI
 * rule 4). A caveat whose substance is a data state is drawn as that state
 * with its full sentence one tap down (caveatShape.ts).
 */
import { memo, useMemo } from 'react';
import { ActivityDisclosure } from './ActivityDisclosure';
import { actionsFor } from './actionShape';
import { caveatPlans, type CaveatPlan } from './caveatShape';
import { CoverageCaveat } from './Instruments';
import { NoticeBanner } from './NoticeBanner';
import { KIND_LABEL } from './noticeLabel';
import { PageChangeNote } from './PageChangeNote';
import { PageContextBlock } from './PageContextBlock';
import { Prose } from './Prose';
import { ReceiptsBlock } from './ReceiptsBlock';
import { ResultActions } from './ResultActions';
import { riverSurfaces } from './surfaceCompose';
import type { Activity } from './turnShape';
import { WorkSpine } from './WorkSpine';
import { WorkSurfaceView } from './WorkSurface';
import {
  EntryTime, Figures, FollowUpChips, MarkAvatar, Narration, NextActions, PinnedNote, SavedNote,
  StoppedNote, SupersededAnswer, UtteranceView,
} from './entryParts';
import { groupsWithItem, latestWorkId, type RiverItem, type WorkUnit } from './workUnit';

export { MarkAvatar } from './entryParts';

/* ----------------------------------------------------------------- entries -- */

export interface EntryProps {
  item: RiverItem;
  grouped?: boolean;
  quiet?: boolean;
  onAsk?: (question: string) => void;
  onOpenThread?: (threadId: string) => void;
  onShare?: (postId: string) => void;
  sharingId?: string | null;
  narration?: { detail: string; cognition: string } | null;
}

function WorkUnitView({ unit, grouped, quiet, narration, onAsk, onOpenThread, onShare, sharing }: {
  unit: WorkUnit; grouped: boolean; quiet: boolean; narration: { detail: string; cognition: string } | null;
  onAsk?: (q: string) => void; onOpenThread?: (t: string) => void; onShare?: (p: string) => void; sharing: boolean;
}) {
  const live = unit.state === 'streaming';
  const activity: Activity = useMemo(() => ({
    toolCalls: unit.calls, thinking: unit.thinking, narration: unit.narration,
    done: unit.iterations === undefined ? undefined : { iterations: unit.iterations, cache_hit: Boolean(unit.cacheHit) },
    cancelled: unit.state === 'stopped', error: unit.error,
  }), [unit.calls, unit.thinking, unit.narration, unit.iterations, unit.cacheHit, unit.state, unit.error]);

  const plans = useMemo(() => caveatPlans(unit.notices, unit.sources), [unit.notices, unit.sources]);
  const banners = plans.filter((p) => p.kind === 'banner').map((p) => p.notice);
  const coverages = plans.filter((p): p is Extract<CaveatPlan, { kind: 'coverage' }> => p.kind === 'coverage');
  const actions = useMemo(() => (unit.primary ? actionsFor(unit.primary) : []), [unit.primary]);
  const hasFigures = unit.blocks.length > 0;
  const label = unit.view?.label ?? null;

  return (
    <article data-work data-entry-id={unit.id} data-continues={unit.continues ? 'true' : undefined} className={`flex gap-2.5 ${unit.continues ? 'mt-3' : ''}`}>
      <div className="flex w-7 shrink-0 flex-col items-center">
        {!grouped && !unit.continues && <MarkAvatar />}
        <WorkSpine calls={unit.calls} findings={unit.findings} settled={unit.state !== 'streaming'} live={live} />
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        {narration && <Narration {...narration} />}
        {label && <p className="text-[11px] uppercase tracking-wide text-george-muted">{label}</p>}
        <ActivityDisclosure turn={activity} live={live} />

        {/* Caveats, above the figures they qualify. Whole where they must
            be; as their data state where that state exists and does not
            invalidate the figure. */}
        {banners.length > 0 && <NoticeBanner notices={banners} />}
        {coverages.map((c, i) => (
          <CoverageCaveat key={`${c.notice.kind}-${i}`} coverage={c.coverage}
            label={KIND_LABEL[c.notice.kind] ?? c.notice.kind.replace(/_/g, ' ')}
            message={c.notice.message} source={c.notice.source} />
        ))}

        {/* THE WORK. This is the answer; the prose under it is the reading. */}
        <Figures blocks={unit.blocks} composition={unit.composition} quiet={quiet} large={!unit.continues} onAsk={onAsk} />

        {unit.prose && (
          <Prose text={unit.prose} lede={!hasFigures && (unit.view ? unit.view.kind === 'answer' : true)} quiet={quiet} />
        )}
        {!unit.prose && unit.superseded && <SupersededAnswer text={unit.superseded} />}

        {unit.error && <p className="rounded-lg border border-george-line bg-george-paper px-3 py-2.5 text-[13px] text-george-navy">{unit.error}</p>}
        {unit.state === 'stopped' && <StoppedNote said={unit.prose.trim().length > 0 || unit.calls.length > 0} />}
        {unit.pinned.map((p) => <PinnedNote key={p.pin_id} pin={p} />)}
        {unit.saved.map((s) => <SavedNote key={`${s.workflow_id}-${s.version}`} saved={s} />)}
        {unit.pageChanges.map((c, i) => <PageChangeNote key={`${c.page_id}-${i}`} change={c} />)}
        <PageContextBlock context={unit.pageContext} />
        {unit.blocks.length === 0 && <ReceiptsBlock meta={unit.receipts} />}
        {unit.post && onAsk && <FollowUpChips post={unit.post} onAsk={onAsk} />}

        {/* Next: what the definitions allow from here, and the one save gesture. */}
        {(actions.length > 0 || unit.pinnable) && unit.state !== 'streaming' && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {onAsk ? <NextActions actions={actions} onAsk={onAsk} /> : <span />}
            {unit.pinnable && <ResultActions calls={unit.pinnable} question={unit.question} conversationId={unit.conversationId} />}
          </div>
        )}

        {unit.post && (
          <div className="flex items-center gap-2">
            <EntryTime iso={unit.at} />
            {unit.view?.canShare && onShare && (
              <button type="button" onClick={() => onShare(unit.post!.id)} disabled={sharing} className="text-[11px] text-george-slate hover:text-george-navy disabled:opacity-50">
                {sharing ? 'Sharing…' : 'Share to the river'}
              </button>
            )}
            {onOpenThread && (
              <button type="button" onClick={() => onOpenThread(unit.post!.thread_id)} className="text-[11px] text-george-slate hover:text-george-navy">Open</button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export interface EntriesProps {
  items: RiverItem[];
  focusLatest?: boolean;
  narration?: { detail: string; cognition: string } | null;
  onAsk?: (question: string) => void;
  onOpenThread?: (threadId: string) => void;
  onShare?: (postId: string) => void;
  sharingId?: string | null;
}

/**
 * ONE list of SURFACES, so a refinement deepens the object it refines.
 *
 * The grouping is presentation (surfaceCompose.riverSurfaces): stored posts
 * keep their rows, their receipts and their audit, and the live entry and its
 * stored copy still share one id (workUnit.ts) — a surface's id is its opening
 * unit's, so the handoff changes a field, never the DOM.
 */
export function RiverEntries({ items, focusLatest = false, narration = null, onAsk, onOpenThread, onShare, sharingId = null }: EntriesProps) {
  const leader = useMemo(() => latestWorkId(items), [items]);
  const entries = useMemo(() => riverSurfaces(items), [items]);
  return (
    <>
      {entries.map((entry, i) => {
        if (entry.kind === 'surface') {
          const leads = entry.steps.some((s) => s.unit.id === leader);
          return (
            <WorkSurfaceView key={entry.id} surface={entry}
              quiet={focusLatest && !leads}
              narration={leads ? narration : null}
              onAsk={onAsk} onOpenThread={onOpenThread} onShare={onShare} sharingId={sharingId} />
          );
        }
        const item = entry.item;
        const previous = entries[i - 1];
        return (
          <RiverEntry key={item.id} item={item}
            grouped={previous?.kind === 'entry' ? groupsWithItem(previous.item, item) : false}
            quiet={focusLatest && item.kind === 'work' && item.id !== leader}
            narration={item.kind === 'work' && item.id === leader ? narration : null}
            onAsk={onAsk} onOpenThread={onOpenThread} onShare={onShare} sharingId={sharingId} />
        );
      })}
    </>
  );
}

export const RiverEntry = memo(function RiverEntry({ item, grouped = false, quiet = false, onAsk, onOpenThread, onShare, sharingId = null, narration = null }: EntryProps) {
  const sharing = sharingId === item.id;
  if (item.kind === 'utterance') return <UtteranceView item={item} onOpenThread={onOpenThread} onShare={onShare} sharing={sharing} />;
  return <WorkUnitView unit={item} grouped={grouped} quiet={quiet} narration={narration} onAsk={onAsk} onOpenThread={onOpenThread} onShare={onShare} sharing={sharing} />;
});
