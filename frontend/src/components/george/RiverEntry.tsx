/**
 * One entry in the river — and the only thing that draws one.
 *
 * ONE COMPONENT, TWO SOURCES. A piece of work is drawn from a WorkUnit, and a
 * WorkUnit is built either from the turn streaming now or from the post the
 * river stored (workUnit.ts). Until 2026-09-08 those were two components:
 * AnswerTurn while it streamed, PostCard once it landed. They agreed by
 * coincidence, and at the handoff React unmounted one subtree and mounted the
 * other — which is why a reader's expanded figures folded away by themselves,
 * and why the same answer could look like two different answers.
 *
 * THE HANDOFF IS NOW A FIELD. `unit.state` goes `streaming` → `complete` →
 * `stored`. The item keeps its id (the answer post's, as soon as the `post`
 * frame names it), so it keeps its place in the list, its component and its
 * DOM. Nothing is torn down and nothing resets.
 *
 * ORDER IS THE LOOP'S OWN PRIORITY AND turnShape's LEVELS:
 *
 *   narration -> ACTIVITY -> NOTICES -> answer -> figures -> stopped/error
 *   -> confirmations -> page context -> receipts -> follow-ups -> actions
 *   -> time
 *
 * Notices sit ABOVE the answer, never in a disclosure, on every kind (UI rule
 * 4). A caveat that qualifies a number has to be read before the number.
 *
 * THE MARK IS THE AVATAR, and it is the one place orange is not a summons
 * (CLAUDE.md UI rule 5, amended). It is drawn cream-on-navy from the same
 * single path the hero mark uses — see markState.ts on why the stamens are
 * knocked out rather than painted: exactly so this chip and the accent-on-cream
 * mark can be one drawing.
 *
 * EVERY ENTRY SHOWS A TIME, including one whose time was never recorded. A card
 * with no time on it is a claim with no expiry (UI rule 6), so the missing case
 * says so in words rather than rendering an empty slot.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Pin as PinIcon, Save as SaveIcon } from 'lucide-react';
import type { Post } from '../../types/river';
import type { PinnedFrame, SavedFrame } from '../../types/george';
import { ActivityDisclosure } from './ActivityDisclosure';
import { MARK_PATH } from './markState';
import { NoticeBanner } from './NoticeBanner';
import { PageChangeNote } from './PageChangeNote';
import { PageContextBlock } from './PageContextBlock';
import { Prose } from './Prose';
import { ReceiptsBlock } from './ReceiptsBlock';
import { ResultActions } from './ResultActions';
import { ResultSurface } from './ResultSurface';
import type { Composition, WorkSection } from './composeWork';
import { quietLabel, type ResultBlock } from './resultShape';
import type { Activity } from './turnShape';
import { TIME_UNKNOWN } from './postShape';
import { groupsWithItem, latestWorkId, type RiverItem, type Utterance, type WorkUnit } from './workUnit';

/** George's mark as an avatar chip: cream on navy, one shared path. */
export function MarkAvatar({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <span
      className={`flex ${className} shrink-0 items-center justify-center rounded-full bg-george-navy`}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="h-4 w-4 text-george-cream">
        <path d={MARK_PATH} fill="currentColor" fillRule="evenodd" />
      </svg>
    </span>
  );
}

/**
 * A time under an entry.
 *
 * Manila is the app's clock, as everywhere else. The unknown case is a real
 * rendering rather than an omission.
 */
function EntryTime({ iso }: { iso: string }) {
  if (!iso) return <span className="text-[11px] text-george-muted">{TIME_UNKNOWN}</span>;
  const d = new Date(iso);
  const label = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-PH', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Manila',
      });
  return (
    <time dateTime={iso} className="text-[11px] tabular-nums text-george-muted">
      {label}
    </time>
  );
}

/**
 * The obvious next questions a post offers.
 *
 * A brief post carries these in its payload (river_writer.post_brief), derived
 * from the brief's own rows. They are what "ask and I'll run it" has been
 * promising: a chip is a QUESTION, and clicking one asks George in the ordinary
 * way, so the reply arrives as its own posts with their own receipts.
 *
 * Nothing here may use the approvals colour — a question George is offering to
 * answer needs nobody.
 */
function FollowUpChips({ post, onAsk }: { post: Post; onAsk: (q: string) => void }) {
  const raw = (post.payload as { follow_ups?: unknown } | null)?.follow_ups;
  const chips = Array.isArray(raw)
    ? (raw as { label?: unknown; question?: unknown }[]).filter(
        (c) => typeof c?.label === 'string' && typeof c?.question === 'string',
      )
    : [];
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={String(c.question)}
          type="button"
          onClick={() => onAsk(String(c.question))}
          title={String(c.question)}
          className="min-h-touch rounded-full border border-george-line bg-george-paper px-3 py-1.5 text-[12px] text-george-slate hover:border-george-slate hover:text-george-navy"
        >
          {String(c.label)}
        </button>
      ))}
    </div>
  );
}

/**
 * The figures, drawn through the shared surface.
 *
 * FIGURES NEVER COLLAPSE ON THEIR OWN. `quiet` is a property of the thread and
 * it moves under the reader: sending a new question makes every earlier entry
 * quiet, so charts somebody was reading folded away with no action of theirs.
 * `quiet` may therefore only ever OPEN this. Once these figures have been on
 * screen they stay, and there is no control that closes them again — a figure
 * that has been read is not something to tidy away.
 */
function Figures({
  blocks,
  composition,
  quiet,
}: {
  blocks: ResultBlock[];
  composition: Composition;
  quiet: boolean;
}) {
  const [shown, setShown] = useState(!quiet);
  useEffect(() => {
    if (!quiet) setShown(true);
  }, [quiet]);

  if (blocks.length === 0) return null;
  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        aria-expanded={false}
        className="flex min-h-touch items-center gap-1.5 text-[12px] text-george-muted"
      >
        <ChevronRight className="h-3 w-3" aria-hidden />
        {quietLabel(blocks)}
      </button>
    );
  }
  if (composition.kind === 'adjacent') return <ResultSurface blocks={composition.blocks} />;
  return (
    <div className="space-y-6">
      {composition.sections.map((section) => (
        <WorkSectionView key={section.role} section={section} />
      ))}
    </div>
  );
}

/**
 * One rung of the ladder: the figure, what moved it, where it sits.
 *
 * THE LABEL IS THE DEFINITIONS' WORD FOR THE RUNG (composeWork.SECTION_LABEL),
 * never the model's and never parsed from prose. The blocks inside are the same
 * blocks resultShape composes for any surface; the section decides where they
 * sit and nothing about what they are. A section with nothing drawn in it is
 * not rendered at all — the composition never creates one.
 */
function WorkSectionView({ section }: { section: WorkSection }) {
  return (
    <section aria-label={section.label}>
      <p className="mb-3 text-[11px] uppercase tracking-wider text-george-muted">{section.label}</p>
      <ResultSurface blocks={section.blocks} />
    </section>
  );
}

/**
 * The answer being replaced, while it is being replaced.
 *
 * The loop asks the model to write the answer again from seven places
 * (agent/loop.py `_reset_answer`). Every one of those is right to fire. What
 * was wrong was emptying `text` on arrival, so a finished paragraph somebody
 * was reading vanished until the rewrite streamed. It is marked rather than
 * quietly left: this text is about to stop being true, and an unmarked
 * paragraph is a claim. Not a notice, and no notice chrome — nothing is being
 * caveated and nobody is being asked for anything.
 */
function SupersededAnswer({ text }: { text: string }) {
  return (
    <div aria-live="off">
      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-george-muted">
        Rewriting this answer
      </p>
      <p className="whitespace-pre-wrap font-george-serif text-[15px] leading-relaxed text-george-slate opacity-70">
        {text}
      </p>
    </div>
  );
}

/**
 * A pin George made because he was asked to, in conversation.
 *
 * The answer says the same thing in prose; this says it from the `pinned`
 * frame, so the confirmation is the write itself rather than the model's
 * account of it. Nothing here may use the approvals colour (UI rule 5).
 */
function PinnedNote({ pin }: { pin: PinnedFrame }) {
  const n = pin.tool_calls.length;
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Pinned <span className="text-george-navy">“{pin.title}”</span>{' '}
        {pin.page ? (
          <>
            to <span className="text-george-navy">{pin.page}</span>
          </>
        ) : (
          'with no page'
        )}
        . The tile re-runs {n === 1 ? 'its call' : `its ${n} calls`} each time it loads.
      </span>
    </p>
  );
}

/**
 * A workflow George saved because he was asked to. Confirmed from the `saved`
 * frame, not the prose. A saved workflow is NOT a scheduled one: it waits in
 * the approval queue, which is where "needs you" lives, so nothing here wears
 * the approvals colour.
 */
function SavedNote({ saved }: { saved: SavedFrame }) {
  const n = saved.steps.length;
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <SaveIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Saved <span className="text-george-navy">“{saved.name}”</span> as version{' '}
        <span className="tabular-nums text-george-navy">{saved.version}</span>
        {n > 0 && ` with ${n === 1 ? 'one step' : `${n} steps`}`}.{' '}
        {saved.awaiting_promotion
          ? 'It runs when asked; it will not run unattended until an administrator promotes it.'
          : 'It is promoted.'}
      </span>
    </p>
  );
}

/**
 * The person stopped this turn.
 *
 * WHAT IS KNOWN, AND ONLY THAT. The request was aborted before `done`, so the
 * text above is where George got to and not what he concluded. Whether the
 * server carried on and stored the turn is not known here — no `post` frame
 * arrived — so the note says the answer MAY appear in the thread, and never
 * that it was or was not saved. Quiet chrome: stopping needs nobody.
 */
function StoppedNote({ said }: { said: boolean }) {
  return (
    <p className="rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <span className="text-george-navy">Stopped</span>
      {said ? ' before George finished — this is where he got to, not an answer.' : '.'}{' '}
      If he completed it anyway, the answer will appear in the thread.
    </p>
  );
}

/**
 * What George is doing and what he is thinking, while he does it.
 *
 * Two lines that say different things — the first is derived from the TOOL and
 * is true by construction, the second is the model's own summarized reasoning
 * and is never evidence. Both slots are fixed height so the entry does not
 * resize under the reader as a turn progresses.
 */
function Narration({ detail, cognition }: { detail: string; cognition: string }) {
  return (
    <div>
      <p className="h-[18px] truncate text-[13px] leading-[18px] text-george-slate">{detail}</p>
      <p
        className="h-[16px] truncate font-george-serif text-[12px] italic leading-4 text-george-muted"
        aria-hidden
      >
        {cognition}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- entries -- */

export interface EntryProps {
  item: RiverItem;
  /** Whether this entry continues a visual run and needs no avatar. */
  grouped?: boolean;
  /**
   * An earlier entry, where the newest answer should lead: slate prose,
   * figures behind a line that names them. Notices and receipts are untouched
   * — quieter is never a licence to drop a caveat (turnShape.ts).
   */
  quiet?: boolean;
  /** Absent where there is nowhere to ask; chips are then not offered. */
  onAsk?: (question: string) => void;
  /** Absent inside a thread, where there is nowhere further to go. */
  onOpenThread?: (threadId: string) => void;
  onShare?: (postId: string) => void;
  sharingId?: string | null;
  /**
   * What this entry is doing right now, when it is the live one. Passed in
   * rather than read from a hook so a stored entry costs nothing and so the
   * component can be memoized on its props alone.
   */
  narration?: { detail: string; cognition: string } | null;
}

function UtteranceView({
  item,
  onOpenThread,
  onShare,
  sharing,
}: {
  item: Utterance;
  onOpenThread?: (threadId: string) => void;
  onShare?: (postId: string) => void;
  sharing: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-george-navy px-3.5 py-2.5 text-[15px] leading-relaxed text-george-cream">
        {item.text}
      </p>
      <div className="flex items-center gap-2">
        {item.authorUser && (
          <span className="text-[11px] text-george-muted">{item.authorUser}</span>
        )}
        <EntryTime iso={item.at} />
        {item.canShare && item.post && onShare && (
          <button
            type="button"
            onClick={() => onShare(item.post!.id)}
            disabled={sharing}
            className="text-[11px] text-george-slate hover:text-george-navy disabled:opacity-50"
          >
            {sharing ? 'Sharing…' : 'Share'}
          </button>
        )}
        {item.post && onOpenThread && (
          <button
            type="button"
            onClick={() => onOpenThread(item.post!.thread_id)}
            className="text-[11px] text-george-slate hover:text-george-navy"
          >
            Thread
          </button>
        )}
      </div>
    </div>
  );
}

function WorkUnitView({
  unit,
  grouped,
  quiet,
  narration,
  onAsk,
  onOpenThread,
  onShare,
  sharing,
}: {
  unit: WorkUnit;
  grouped: boolean;
  quiet: boolean;
  narration: { detail: string; cognition: string } | null;
  onAsk?: (question: string) => void;
  onOpenThread?: (threadId: string) => void;
  onShare?: (postId: string) => void;
  sharing: boolean;
}) {
  const live = unit.state === 'streaming';

  // What the activity line reads. Built here rather than stored on the unit so
  // the shape stays turnShape's and there is one definition of it.
  const activity: Activity = useMemo(
    () => ({
      toolCalls: unit.calls,
      thinking: unit.thinking,
      narration: unit.narration,
      done:
        unit.iterations === undefined
          ? undefined
          : { iterations: unit.iterations, cache_hit: Boolean(unit.cacheHit) },
      cancelled: unit.state === 'stopped',
      error: unit.error,
    }),
    [unit.calls, unit.thinking, unit.narration, unit.iterations, unit.cacheHit, unit.state, unit.error],
  );

  const showNotices = unit.notices.length > 0;
  const label = unit.view?.label ?? null;

  return (
    <article className="flex gap-2.5">
      {/* The avatar slot is held even in a grouped run, so bodies stay aligned
          down the column rather than stepping left under the first of a pair. */}
      <div className="w-7 shrink-0">{!grouped && <MarkAvatar />}</div>

      <div className="min-w-0 flex-1 space-y-3">
        {narration && <Narration {...narration} />}

        {label && (
          // Muted, always. postShape.ACCENT_KINDS is empty; if a kind ever
          // earns the colour, this is where it comes back — with the argument
          // made in postShape first.
          <p className="text-[11px] uppercase tracking-wide text-george-muted">{label}</p>
        )}

        <ActivityDisclosure turn={activity} live={live} />

        {/* Above the answer, always — and never quieter. */}
        {showNotices && <NoticeBanner notices={unit.notices} />}

        {/* The finding, then the working. See Prose. */}
        {unit.prose && (
          <Prose text={unit.prose} lede={unit.view ? unit.view.kind === 'answer' : true} quiet={quiet} />
        )}

        {!unit.prose && unit.superseded && <SupersededAnswer text={unit.superseded} />}

        <Figures blocks={unit.blocks} composition={unit.composition} quiet={quiet} />

        {unit.error && (
          <p className="rounded-lg border border-george-line bg-george-paper px-3 py-2.5 text-[13px] text-george-navy">
            {unit.error}
          </p>
        )}

        {unit.state === 'stopped' && (
          <StoppedNote said={unit.prose.trim().length > 0 || unit.calls.length > 0} />
        )}

        {unit.pinned.map((p) => (
          <PinnedNote key={p.pin_id} pin={p} />
        ))}
        {unit.saved.map((s) => (
          <SavedNote key={`${s.workflow_id}-${s.version}`} saved={s} />
        ))}
        {unit.pageChanges.map((c, i) => (
          <PageChangeNote key={`${c.page_id}-${i}`} change={c} />
        ))}

        {/* What George considered of the page, when he read one. */}
        <PageContextBlock context={unit.pageContext} />

        {/* The entry-level receipts are the LAST call's meta, and they are the
            fallback only. When the surface drew anything, every block already
            carries the meta of the call behind it — which is strictly better,
            because one line over several calls describes none of them. */}
        {unit.blocks.length === 0 && <ReceiptsBlock meta={unit.receipts} />}

        {/* Below the receipts: the chips are about what to do next, and the
            receipts are about the body above them. */}
        {unit.post && onAsk && <FollowUpChips post={unit.post} onAsk={onAsk} />}

        {/* Only the calls a pin may hold — read, never decided from a name,
            and null means no Pin rather than a Pin that guesses. */}
        {unit.pinnable && (
          <ResultActions
            calls={unit.pinnable}
            question={unit.question}
            conversationId={unit.conversationId}
          />
        )}

        {unit.post && (
          <div className="flex items-center gap-2">
            <EntryTime iso={unit.at} />
            {unit.view?.canShare && onShare && (
              <button
                type="button"
                onClick={() => onShare(unit.post!.id)}
                disabled={sharing}
                className="text-[11px] text-george-slate hover:text-george-navy disabled:opacity-50"
              >
                {sharing ? 'Sharing…' : 'Share to the river'}
              </button>
            )}
            {onOpenThread && (
              <button
                type="button"
                onClick={() => onOpenThread(unit.post!.thread_id)}
                className="text-[11px] text-george-slate hover:text-george-navy"
              >
                Thread
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * One entry, memoized.
 *
 * A live turn re-renders the whole list on every streamed delta — `patchLast`
 * replaces the turns array, and every entry above the newest one gets a new
 * render for content that did not change. Memoizing on props keeps that to the
 * entry that actually moved. It matters more the longer a thread gets, which is
 * the direction this surface is going.
 */
export interface EntriesProps {
  items: RiverItem[];
  /** Whether earlier work goes quieter so the newest leads. */
  focusLatest?: boolean;
  /** What the newest entry is doing, when one is running. */
  narration?: { detail: string; cognition: string } | null;
  onAsk?: (question: string) => void;
  onOpenThread?: (threadId: string) => void;
  onShare?: (postId: string) => void;
  sharingId?: string | null;
}

/**
 * The list — and it is ONE list, which is the point.
 *
 * A stored post and the live turn that is about to replace it must be siblings
 * in the same array under the same parent, or React reconciles them as two
 * different things however identical the components are. Rendering the posts
 * and then the pending turns as two separate blocks is what made the handoff
 * tear down a subtree; this is the fix, and it is structural rather than
 * careful.
 */
export function RiverEntries({
  items,
  focusLatest = false,
  narration = null,
  onAsk,
  onOpenThread,
  onShare,
  sharingId = null,
}: EntriesProps) {
  const leader = useMemo(() => latestWorkId(items), [items]);
  return (
    <>
      {items.map((item, i) => (
        <RiverEntry
          key={item.id}
          item={item}
          grouped={groupsWithItem(items[i - 1], item)}
          quiet={focusLatest && item.kind === 'work' && item.id !== leader}
          narration={item.kind === 'work' && item.id === leader ? narration : null}
          onAsk={onAsk}
          onOpenThread={onOpenThread}
          onShare={onShare}
          sharingId={sharingId}
        />
      ))}
    </>
  );
}

export const RiverEntry = memo(function RiverEntry({
  item,
  grouped = false,
  quiet = false,
  onAsk,
  onOpenThread,
  onShare,
  sharingId = null,
  narration = null,
}: EntryProps) {
  const sharing = sharingId === item.id;
  if (item.kind === 'utterance') {
    return (
      <UtteranceView
        item={item}
        onOpenThread={onOpenThread}
        onShare={onShare}
        sharing={sharing}
      />
    );
  }
  return (
    <WorkUnitView
      unit={item}
      grouped={grouped}
      quiet={quiet}
      narration={narration}
      onAsk={onAsk}
      onOpenThread={onOpenThread}
      onShare={onShare}
      sharing={sharing}
    />
  );
});
