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
 * A follow-up that continues the work — a reply, in the same thread, over the
 * same scope — is drawn INSIDE the same visible object: its intent as a
 * sub-line, its figures appended, no second avatar. The posts underneath are
 * untouched and separate; only the presentation composes (workUnit.ts,
 * `continues`).
 *
 * Notices sit ABOVE the figures, never in a disclosure, on every kind (UI
 * rule 4). A caveat whose substance is a data state is drawn as that state
 * with its full sentence one tap down (caveatShape.ts).
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Pin as PinIcon, Save as SaveIcon } from 'lucide-react';
import type { Post } from '../../types/river';
import type { PinnedFrame, SavedFrame } from '../../types/george';
import { ActivityDisclosure } from './ActivityDisclosure';
import { actionsFor, subjectAction, type ContextAction } from './actionShape';
import { caveatPlans, type CaveatPlan } from './caveatShape';
import type { Composition, WorkSection } from './composeWork';
import { CoverageCaveat, DriverSplit, Performance } from './Instruments';
import { NoticeBanner } from './NoticeBanner';
import { KIND_LABEL } from './noticeLabel';
import { MARK_PATH } from './markState';
import { PageChangeNote } from './PageChangeNote';
import { PageContextBlock } from './PageContextBlock';
import { Prose } from './Prose';
import { ReceiptsBlock } from './ReceiptsBlock';
import { ResultActions } from './ResultActions';
import { ResultSurface } from './ResultSurface';
import { quietLabel, type ResultBlock, type ShapedResult } from './resultShape';
import type { Activity } from './turnShape';
import { TIME_UNKNOWN } from './postShape';
import { WorkSpine } from './WorkSpine';
import { groupsWithItem, latestWorkId, type RiverItem, type Utterance, type WorkUnit } from './workUnit';

/** George's mark as an avatar chip: cream on navy, one shared path. */
export function MarkAvatar({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <span className={`flex ${className} shrink-0 items-center justify-center rounded-full bg-george-navy`} aria-hidden>
      <svg viewBox="0 0 100 100" className="h-4 w-4 text-george-cream">
        <path d={MARK_PATH} fill="currentColor" fillRule="evenodd" />
      </svg>
    </span>
  );
}

function EntryTime({ iso }: { iso: string }) {
  if (!iso) return <span className="text-[11px] text-george-muted">{TIME_UNKNOWN}</span>;
  const d = new Date(iso);
  const label = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
  return <time dateTime={iso} className="text-[11px] tabular-nums text-george-muted">{label}</time>;
}

function FollowUpChips({ post, onAsk }: { post: Post; onAsk: (q: string) => void }) {
  const raw = (post.payload as { follow_ups?: unknown } | null)?.follow_ups;
  const chips = Array.isArray(raw)
    ? (raw as { label?: unknown; question?: unknown }[]).filter((c) => typeof c?.label === 'string' && typeof c?.question === 'string')
    : [];
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button key={String(c.question)} type="button" onClick={() => onAsk(String(c.question))} title={String(c.question)}
          className="min-h-touch rounded-full border border-george-line bg-george-paper px-3 py-1.5 text-[12px] text-george-slate hover:border-george-slate hover:text-george-navy">
          {String(c.label)}
        </button>
      ))}
    </div>
  );
}

/**
 * What the definitions let you do from here. Pre-typed questions through the
 * ordinary loop; absent where the definitions would refuse (actionShape.ts).
 */
function NextActions({ actions, onAsk }: { actions: ContextAction[]; onAsk: (q: string) => void }) {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" data-actions>
      {actions.map((a) => (
        <button key={a.label} type="button" onClick={() => onAsk(a.question)} title={a.question}
          className="min-h-touch rounded-full border border-george-line bg-george-paper px-3 py-1.5 text-[12px] text-george-navy hover:border-george-slate">
          {a.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The figures. FIGURES NEVER COLLAPSE ON THEIR OWN: `quiet` may only ever
 * open this; once on screen they stay.
 */
function Figures({
  blocks, composition, quiet, large, onAsk,
}: { blocks: ResultBlock[]; composition: Composition; quiet: boolean; large: boolean; onAsk?: (q: string) => void }) {
  const [shown, setShown] = useState(!quiet);
  useEffect(() => { if (!quiet) setShown(true); }, [quiet]);
  if (blocks.length === 0) return null;
  if (!shown) {
    return (
      <button type="button" onClick={() => setShown(true)} aria-expanded={false} className="flex min-h-touch items-center gap-1.5 text-[12px] text-george-muted">
        <ChevronRight className="h-3 w-3" aria-hidden />
        {quietLabel(blocks)}
      </button>
    );
  }
  const onSubject = onAsk
    ? (r: ShapedResult, s: string) => { const a = subjectAction(r, s); if (a) onAsk(a.question); }
    : undefined;
  if (composition.kind === 'adjacent') return <ResultSurface blocks={composition.blocks} large={large} onSubject={onSubject} />;
  return (
    <div className="space-y-6">
      {composition.sections.map((section, i) => (
        <WorkSectionView key={section.role} section={section} large={large && i === 0} onSubject={onSubject} />
      ))}
    </div>
  );
}

/**
 * One rung. THE LABEL IS THE DEFINITIONS' WORD FOR THE RUNG, never the
 * model's. A primary that is a set of headline metrics is drawn as the
 * Performance instrument; the drivers as the split; everything else through
 * the surface.
 */
function WorkSectionView({ section, large, onSubject }: { section: WorkSection; large: boolean; onSubject?: (r: ShapedResult, s: string) => void }) {
  const group = section.instrument ? section.blocks[0] : null;
  return (
    <section aria-label={section.label}>
      <p className="mb-2.5 text-[11px] uppercase tracking-wider text-george-muted">{section.label}</p>
      {group && group.kind === 'group' ? (
        <>
          {section.instrument === 'driver_split'
            ? <DriverSplit members={group.members} identity={section.identity} />
            : <Performance members={group.members} identity={section.identity} large={large} />}
          {group.sharedMeta ? <ReceiptsBlock meta={group.sharedMeta} /> : group.members.map((m) => <ReceiptsBlock key={m.source.seq} meta={m.source.meta} />)}
        </>
      ) : (
        <ResultSurface blocks={section.blocks} large={large} onSubject={onSubject} />
      )}
    </section>
  );
}

function SupersededAnswer({ text }: { text: string }) {
  return (
    <div aria-live="off">
      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-george-muted">Rewriting this answer</p>
      <p className="whitespace-pre-wrap font-george-serif text-[15px] leading-relaxed text-george-slate opacity-70">{text}</p>
    </div>
  );
}

function PinnedNote({ pin }: { pin: PinnedFrame }) {
  const n = pin.tool_calls.length;
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Pinned <span className="text-george-navy">“{pin.title}”</span>{' '}{pin.page ? <>to <span className="text-george-navy">{pin.page}</span></> : 'with no page'}. The tile re-runs {n === 1 ? 'its call' : `its ${n} calls`} each time it loads.</span>
    </p>
  );
}

function SavedNote({ saved }: { saved: SavedFrame }) {
  const n = saved.steps.length;
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <SaveIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Saved <span className="text-george-navy">“{saved.name}”</span> as version <span className="tabular-nums text-george-navy">{saved.version}</span>{n > 0 && ` with ${n === 1 ? 'one step' : `${n} steps`}`}.{' '}{saved.awaiting_promotion ? 'It runs when asked; it will not run unattended until an administrator promotes it.' : 'It is promoted.'}</span>
    </p>
  );
}

function StoppedNote({ said }: { said: boolean }) {
  return (
    <p className="rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <span className="text-george-navy">Stopped</span>{said ? ' before George finished — this is where he got to, not an answer.' : '.'}{' '}If he completed it anyway, the answer will appear in the thread.
    </p>
  );
}

function Narration({ detail, cognition }: { detail: string; cognition: string }) {
  return (
    <div>
      <p className="h-[18px] truncate text-[13px] leading-[18px] text-george-slate">{detail}</p>
      <p className="h-[16px] truncate font-george-serif text-[12px] italic leading-4 text-george-muted" aria-hidden>{cognition}</p>
    </div>
  );
}

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

/**
 * What you asked. A RULE AND A LINE OF SERIF, NOT A BUBBLE.
 *
 * The right-aligned navy bubble said "message sent". This says "the work
 * begins here": a small eyebrow naming where you are when that is known (the
 * page the thread is bound to — never a title the model made up), the
 * question in serif, and its time. A continuation is the same, smaller and
 * indented under the work it continues, with an arrow that says so.
 */
function UtteranceView({ item, onOpenThread, onShare, sharing }: { item: Utterance; onOpenThread?: (t: string) => void; onShare?: (p: string) => void; sharing: boolean }) {
  return (
    <div data-intent data-entry-id={item.id} data-continues={item.continues ? 'true' : undefined} className={`flex gap-2.5 ${item.continues ? 'mt-1' : ''}`}>
      <div className="w-7 shrink-0" aria-hidden>
        {item.continues && <span className="ml-3 block text-[13px] leading-none text-george-muted">↳</span>}
      </div>
      <div className={`min-w-0 flex-1 border-l-2 pl-3 ${item.continues ? 'border-george-line' : 'border-george-navy'}`}>
        {item.eyebrow && !item.continues && (
          <p className="text-[11px] uppercase tracking-wider text-george-muted">{item.eyebrow}</p>
        )}
        <p className={`font-george-serif leading-snug text-george-navy ${item.continues ? 'text-[15px]' : 'text-[17px] md:text-[19px]'}`}>
          {item.text}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {item.authorUser && <span className="text-[11px] text-george-muted">{item.authorUser}</span>}
          <EntryTime iso={item.at} />
          {item.canShare && item.post && onShare && (
            <button type="button" onClick={() => onShare(item.post!.id)} disabled={sharing} className="text-[11px] text-george-slate hover:text-george-navy disabled:opacity-50">
              {sharing ? 'Sharing…' : 'Share'}
            </button>
          )}
          {item.post && onOpenThread && (
            <button type="button" onClick={() => onOpenThread(item.post!.thread_id)} className="text-[11px] text-george-slate hover:text-george-navy">Open</button>
          )}
        </div>
      </div>
    </div>
  );
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

/** ONE list, so the live entry and its stored copy are siblings. */
export function RiverEntries({ items, focusLatest = false, narration = null, onAsk, onOpenThread, onShare, sharingId = null }: EntriesProps) {
  const leader = useMemo(() => latestWorkId(items), [items]);
  return (
    <>
      {items.map((item, i) => (
        <RiverEntry key={item.id} item={item} grouped={groupsWithItem(items[i - 1], item)}
          quiet={focusLatest && item.kind === 'work' && item.id !== leader && !item.continuedBy}
          narration={item.kind === 'work' && item.id === leader ? narration : null}
          onAsk={onAsk} onOpenThread={onOpenThread} onShare={onShare} sharingId={sharingId} />
      ))}
    </>
  );
}

export const RiverEntry = memo(function RiverEntry({ item, grouped = false, quiet = false, onAsk, onOpenThread, onShare, sharingId = null, narration = null }: EntryProps) {
  const sharing = sharingId === item.id;
  if (item.kind === 'utterance') return <UtteranceView item={item} onOpenThread={onOpenThread} onShare={onShare} sharing={sharing} />;
  return <WorkUnitView unit={item} grouped={grouped} quiet={quiet} narration={narration} onAsk={onAsk} onOpenThread={onOpenThread} onShare={onShare} sharing={sharing} />;
});
