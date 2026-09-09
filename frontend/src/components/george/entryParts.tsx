/**
 * The parts an entry and a surface are both drawn from.
 *
 * WHY THEY MOVED HERE. RiverEntry draws ONE piece of work; WorkSurface draws a
 * piece of work that has been refined several times and composed into one
 * object. They are two arrangements of the same parts — the intent, the
 * figures, the notes a write left behind, the time — and the two must not be
 * allowed to drift, because a figure that looks like one thing in an answer and
 * another on a surface is the divergence UI rule 3 exists to prevent.
 *
 * Nothing here decides anything. Every decision was made in a pure module
 * (resultShape, composeWork, surfaceCompose, caveatShape); these are the
 * drawings of those decisions and they hold no state but disclosure.
 */
import { useEffect, useState } from 'react';
import { ChevronRight, Pin as PinIcon, Save as SaveIcon } from 'lucide-react';
import type { Post } from '../../types/river';
import type { PinnedFrame, SavedFrame } from '../../types/george';
import type { Composition, WorkSection } from './composeWork';
import { DriverSplit, Performance } from './Instruments';
import { MARK_PATH } from './markState';
import { ReceiptsBlock } from './ReceiptsBlock';
import { ResultSurface } from './ResultSurface';
import { quietLabel, type ResultBlock, type ShapedResult } from './resultShape';
import { subjectRefinement } from './surfaceEvents';
import type { SurfaceAnchor } from './surfaceModel';
import { TIME_UNKNOWN } from './postShape';
import type { Utterance } from './workUnit';

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

export function EntryTime({ iso }: { iso: string }) {
  if (!iso) return <span className="text-[11px] text-george-muted">{TIME_UNKNOWN}</span>;
  const d = new Date(iso);
  const label = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
  return <time dateTime={iso} className="text-[11px] tabular-nums text-george-muted">{label}</time>;
}

export function FollowUpChips({ post, onAsk }: { post: Post; onAsk: (q: string) => void }) {
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
 * ordinary loop; absent where the definitions would refuse (surfaceEvents.ts).
 */
export function NextActions({ actions, onAsk }: { actions: { label: string; question: string }[]; onAsk: (q: string) => void }) {
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
 * One rung. THE LABEL IS THE DEFINITIONS' WORD FOR THE RUNG, never the model's.
 * A primary that is a set of headline metrics is drawn as the Performance
 * instrument; the drivers as the split; everything else through the surface.
 */
export function WorkSectionView({ section, large, onSubject }: {
  section: Pick<WorkSection, 'role' | 'label' | 'blocks' | 'instrument' | 'identity'>;
  large: boolean;
  onSubject?: (r: ShapedResult, s: string) => void;
}) {
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

/**
 * The figures. FIGURES NEVER COLLAPSE ON THEIR OWN: `quiet` may only ever open
 * this; once on screen they stay.
 */
export function Figures({
  blocks, composition, quiet, large, onAsk, anchor,
}: {
  blocks: ResultBlock[];
  composition: Composition;
  quiet: boolean;
  large: boolean;
  onAsk?: (q: string) => void;
  anchor?: SurfaceAnchor;
}) {
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
    ? (r: ShapedResult, s: string) => { const a = subjectRefinement(r, s, anchor); if (a) onAsk(a.question); }
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

export function SupersededAnswer({ text }: { text: string }) {
  return (
    <div aria-live="off">
      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-george-muted">Rewriting this answer</p>
      <p className="whitespace-pre-wrap font-george-serif text-[15px] leading-relaxed text-george-slate opacity-70">{text}</p>
    </div>
  );
}

export function PinnedNote({ pin }: { pin: PinnedFrame }) {
  const n = pin.tool_calls.length;
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Pinned <span className="text-george-navy">“{pin.title}”</span>{' '}{pin.page ? <>to <span className="text-george-navy">{pin.page}</span></> : 'with no page'}. The tile re-runs {n === 1 ? 'its call' : `its ${n} calls`} each time it loads.</span>
    </p>
  );
}

export function SavedNote({ saved }: { saved: SavedFrame }) {
  const n = saved.steps.length;
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <SaveIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Saved <span className="text-george-navy">“{saved.name}”</span> as version <span className="tabular-nums text-george-navy">{saved.version}</span>{n > 0 && ` with ${n === 1 ? 'one step' : `${n} steps`}`}.{' '}{saved.awaiting_promotion ? 'It runs when asked; it will not run unattended until an administrator promotes it.' : 'It is promoted.'}</span>
    </p>
  );
}

export function StoppedNote({ said }: { said: boolean }) {
  return (
    <p className="rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <span className="text-george-navy">Stopped</span>{said ? ' before George finished — this is where he got to, not an answer.' : '.'}{' '}If he completed it anyway, the answer will appear in the thread.
    </p>
  );
}

export function Narration({ detail, cognition }: { detail: string; cognition: string }) {
  return (
    <div>
      <p className="h-[18px] truncate text-[13px] leading-[18px] text-george-slate">{detail}</p>
      <p className="h-[16px] truncate font-george-serif text-[12px] italic leading-4 text-george-muted" aria-hidden>{cognition}</p>
    </div>
  );
}

/**
 * What you asked. A RULE AND A LINE OF SERIF, NOT A BUBBLE.
 *
 * The right-aligned navy bubble said "message sent". This says "the work begins
 * here": a small eyebrow naming where you are when that is known (the page the
 * thread is bound to — never a title the model made up), the question in serif,
 * and its time. A refinement is the same, smaller and indented under the work
 * it continues, with an arrow that says so.
 */
export function UtteranceView({ item, onOpenThread, onShare, sharing }: {
  item: Utterance;
  onOpenThread?: (t: string) => void;
  onShare?: (p: string) => void;
  sharing: boolean;
}) {
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
