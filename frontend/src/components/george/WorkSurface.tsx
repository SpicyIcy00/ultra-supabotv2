/**
 * A piece of work, as ONE evolving object.
 *
 * WHAT CHANGED, AND WHAT DID NOT. Until this existed a refinement was drawn
 * beneath the work it refined — attached, indented, one avatar — and its
 * figures were its own. That was still a second answer. A surface is drawn
 * from a `SurfacePlan` composed across every step of the work
 * (surfaceCompose.ts), so "Why?" adds the drivers UNDER the figure it explains,
 * "compare it with Rockwell" recomposes the same object around both shops, and
 * "show me the products" deepens it again. The posts underneath are untouched
 * and separate; a reload rebuilds the same object from the same posts.
 *
 * READING ORDER, AND WHAT MAY NEVER BE QUIETER (UI rule 4, the shell rules):
 *
 *   intent        what you asked, then each refinement as a quiet trail
 *   caveats       above the figures they qualify, as the data state they are
 *   the work      the primary rung, then what supports it; context folded
 *                 behind a line that NAMES it, never dropped
 *   attention     what the data itself singles out — a characterisation of
 *                 rows, never a number (CLAUDE.md, annotations)
 *   the reading   George's latest prose, under the evidence it interprets;
 *                 earlier readings kept, quieter, behind a line that says so
 *   notes         what each step wrote — a pin, a save, a page change, a stop
 *   next          what the definitions allow from here, and the one save gesture
 *
 * NOTHING HERE DECIDES. Which result leads, which folds, what is offered next,
 * what deserves attention — every one of those is on the plan, made by a pure
 * function the suite holds. This file draws the plan with the same primitives
 * an ordinary entry uses (entryParts.tsx), so a figure cannot look like one
 * thing here and another there.
 */
import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ActivityDisclosure } from './ActivityDisclosure';
import { caveatPlans, type CaveatPlan } from './caveatShape';
import { CoverageCaveat } from './Instruments';
import { NoticeBanner } from './NoticeBanner';
import { KIND_LABEL } from './noticeLabel';
import { PageChangeNote } from './PageChangeNote';
import { PageContextBlock } from './PageContextBlock';
import { Prose } from './Prose';
import { ReceiptsBlock } from './ReceiptsBlock';
import { ResultActions } from './ResultActions';
import type { ShapedResult } from './resultShape';
import { subjectRefinement } from './surfaceEvents';
import type { SurfaceAttention, SurfaceSectionPlan } from './surfaceModel';
import type { Surface } from './surfaceCompose';
import type { Activity } from './turnShape';
import { WorkSpine } from './WorkSpine';
import {
  EntryTime, FollowUpChips, MarkAvatar, Narration, NextActions, PinnedNote, SavedNote,
  StoppedNote, SupersededAnswer, UtteranceView, WorkSectionView,
} from './entryParts';

/* --------------------------------------------------------------- sections -- */

/**
 * A context section that reaches outside the work's subject, behind one line
 * that names it. Folded is not hidden: the line is always on screen, says what
 * it holds, and opens with one tap. Once opened it stays.
 */
function FoldedSection({ section, onSubject }: { section: SurfaceSectionPlan; onSubject?: (r: ShapedResult, s: string) => void }) {
  const [open, setOpen] = useState(false);
  const label = `${section.label} — outside this work's scope`;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false} data-folded={section.role}
        className="flex min-h-touch items-center gap-1.5 text-[12px] text-george-muted">
        <ChevronRight className="h-3 w-3" aria-hidden />
        {label}
      </button>
    );
  }
  return <div data-folded-open={section.role}><WorkSectionView section={section} large={false} onSubject={onSubject} /></div>;
}

function Sections({ sections, onSubject }: { sections: SurfaceSectionPlan[]; onSubject?: (r: ShapedResult, s: string) => void }) {
  if (sections.length === 0) return null;
  return (
    <div className="space-y-6" data-surface-work>
      {sections.map((section, i) =>
        section.folded ? (
          <FoldedSection key={section.role} section={section} onSubject={onSubject} />
        ) : (
          <div key={section.role} data-rank={section.rank}>
            <WorkSectionView section={section} large={i === 0 && section.rank === 'primary'} onSubject={onSubject} />
          </div>
        ),
      )}
    </div>
  );
}

/* -------------------------------------------------------------- attention -- */

/**
 * What the data singles out, in words. A CHARACTERISATION OF ROWS: it names
 * the subject and the fact the tool established about it, and carries no
 * figure — the figure is on the instrument beside it.
 */
export function attentionLine(attention: SurfaceAttention[]): string | null {
  if (attention.length === 0) return null;
  const against = attention.filter((a) => a.reason === 'against_the_majority');
  const first = attention.filter((a) => a.reason === 'ranked_first');
  const parts: string[] = [];
  if (against.length > 0) {
    const names = against.map((a) => a.subject);
    const verb = against.every((a) => a.direction === 'down') ? 'fell' : against.every((a) => a.direction === 'up') ? 'rose' : 'moved';
    parts.push(`${joinNames(names)} ${verb} while the rest moved the other way.`);
  }
  for (const a of first) {
    parts.push(`${a.subject} is the largest measured ${a.direction === 'down' ? 'fall' : a.direction === 'up' ? 'rise' : 'change'}.`);
  }
  return parts.join(' ');
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function Attention({ attention }: { attention: SurfaceAttention[] }) {
  const line = attentionLine(attention);
  if (!line) return null;
  return (
    <p data-attention className="border-l-2 border-george-navy pl-3 text-[13px] leading-relaxed text-george-navy">
      {line}
    </p>
  );
}

/* ------------------------------------------------------------ the surface -- */

export interface WorkSurfaceProps {
  surface: Surface;
  quiet?: boolean;
  narration?: { detail: string; cognition: string } | null;
  onAsk?: (question: string) => void;
  onOpenThread?: (threadId: string) => void;
  onShare?: (postId: string) => void;
  sharingId?: string | null;
}

export function WorkSurfaceView({ surface, quiet = false, narration = null, onAsk, onOpenThread, onShare, sharingId = null }: WorkSurfaceProps) {
  const { plan, latest, steps } = surface;
  const live = latest.state === 'streaming';
  const activity: Activity = useMemo(() => ({
    toolCalls: latest.calls, thinking: latest.thinking, narration: latest.narration,
    done: latest.iterations === undefined ? undefined : { iterations: latest.iterations, cache_hit: Boolean(latest.cacheHit) },
    cancelled: latest.state === 'stopped', error: latest.error,
  }), [latest.calls, latest.thinking, latest.narration, latest.iterations, latest.cacheHit, latest.state, latest.error]);

  const plans = useMemo(() => caveatPlans(plan.notices, plan.evidence), [plan.notices, plan.evidence]);
  const banners = plans.filter((p) => p.kind === 'banner').map((p) => p.notice);
  const coverages = plans.filter((p): p is Extract<CaveatPlan, { kind: 'coverage' }> => p.kind === 'coverage');
  const hasFigures = plan.sections.length > 0;
  const earlier = steps.slice(0, -1).filter((s) => s.unit.prose.trim().length > 0);
  const onSubject = onAsk
    ? (r: ShapedResult, s: string) => { const a = subjectRefinement(r, s, plan.anchor); if (a) onAsk(a.question); }
    : undefined;

  return (
    <article data-work data-surface data-surface-id={surface.id} data-goal={plan.goal} className="flex gap-2.5">
      <div className="flex w-7 shrink-0 flex-col items-center">
        <MarkAvatar />
        <WorkSpine calls={latest.calls} findings={latest.findings} settled={latest.state !== 'streaming'} live={live} />
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        {/* The intent, and the trail of refinements that grew the work. */}
        {steps[0].intent && <UtteranceView item={steps[0].intent} onOpenThread={onOpenThread} onShare={onShare} sharing={sharingId === steps[0].intent.id} />}
        {steps.length > 1 && (
          <ol data-trail className="ml-1 space-y-1 border-l-2 border-george-line pl-3">
            {steps.slice(1).map((step) => step.intent && (
              <li key={step.intent.id} data-intent data-continues="true" data-entry-id={step.intent.id} className="font-george-serif text-[14px] leading-snug text-george-slate">
                <span className="mr-1 text-george-muted" aria-hidden>↳</span>{step.intent.text}
              </li>
            ))}
          </ol>
        )}
        {hasFigures && (
          <p data-surface-title className="text-[11px] uppercase tracking-wider text-george-muted">{plan.title}</p>
        )}

        {narration && <Narration {...narration} />}
        {latest.view?.label && <p className="text-[11px] uppercase tracking-wide text-george-muted">{latest.view.label}</p>}
        <ActivityDisclosure turn={activity} live={live} />

        {/* Caveats, above the figures they qualify. */}
        {banners.length > 0 && <NoticeBanner notices={banners} />}
        {coverages.map((c, i) => (
          <CoverageCaveat key={`${c.notice.kind}-${i}`} coverage={c.coverage}
            label={KIND_LABEL[c.notice.kind] ?? c.notice.kind.replace(/_/g, ' ')}
            message={c.notice.message} source={c.notice.source} />
        ))}

        {/* THE WORK. */}
        <Sections sections={plan.sections} onSubject={onSubject} />
        <Attention attention={plan.attention} />

        {/* The reading: the latest prose interprets what is on screen. */}
        {latest.prose && (
          <Prose text={latest.prose} lede={!hasFigures && (latest.view ? latest.view.kind === 'answer' : true)} quiet={quiet} />
        )}
        {!latest.prose && latest.superseded && <SupersededAnswer text={latest.superseded} />}
        {earlier.length > 0 && <EarlierReadings steps={earlier} />}

        {/* What each step wrote or could not finish. Never folded. */}
        {steps.map((step) => (
          <div key={step.unit.id} data-entry-id={step.unit.id} className="contents">
            <StepNotes unit={step.unit} />
          </div>
        ))}

        {plan.sections.length === 0 && <ReceiptsBlock meta={plan.receipts} />}
        {latest.post && onAsk && <FollowUpChips post={latest.post} onAsk={onAsk} />}

        {(plan.refinements.length > 0 || latest.pinnable) && latest.state !== 'streaming' && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {onAsk ? <NextActions actions={plan.refinements} onAsk={onAsk} /> : <span />}
            {latest.pinnable && <ResultActions calls={latest.pinnable} question={latest.question} conversationId={latest.conversationId} />}
          </div>
        )}

        {latest.post && (
          <div className="flex items-center gap-2">
            <EntryTime iso={latest.at} />
            {latest.view?.canShare && onShare && (
              <button type="button" onClick={() => onShare(latest.post!.id)} disabled={sharingId === latest.id} className="text-[11px] text-george-slate hover:text-george-navy disabled:opacity-50">
                {sharingId === latest.id ? 'Sharing…' : 'Share to the river'}
              </button>
            )}
            {onOpenThread && (
              <button type="button" onClick={() => onOpenThread(latest.post!.thread_id)} className="text-[11px] text-george-slate hover:text-george-navy">Open</button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** The readings before the latest, quieter and behind a line that names them. */
function EarlierReadings({ steps }: { steps: Surface['steps'] }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-earlier-readings>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-touch items-center gap-1.5 text-[12px] text-george-muted">
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
        {steps.length === 1 ? 'Earlier in this work' : `Earlier in this work · ${steps.length} readings`}
      </button>
      {open && (
        <div className="mt-2 space-y-3 border-l-2 border-george-line pl-3">
          {steps.map((s) => (
            <div key={s.unit.id}>
              {s.intent && <p className="text-[11px] uppercase tracking-wider text-george-muted">{s.intent.text}</p>}
              <Prose text={s.unit.prose} lede={false} quiet />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepNotes({ unit }: { unit: Surface['latest'] }) {
  return (
    <>
      {unit.error && <p className="rounded-lg border border-george-line bg-george-paper px-3 py-2.5 text-[13px] text-george-navy">{unit.error}</p>}
      {unit.state === 'stopped' && <StoppedNote said={unit.prose.trim().length > 0 || unit.calls.length > 0} />}
      {unit.pinned.map((p) => <PinnedNote key={p.pin_id} pin={p} />)}
      {unit.saved.map((s) => <SavedNote key={`${s.workflow_id}-${s.version}`} saved={s} />)}
      {unit.pageChanges.map((c, i) => <PageChangeNote key={`${c.page_id}-${i}`} change={c} />)}
      <PageContextBlock context={unit.pageContext} />
    </>
  );
}
