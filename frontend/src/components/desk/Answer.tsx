/**
 * ONE ANSWER.
 *
 * George does not draw a picture and then explain it somewhere else. An answer
 * is one object, read top to bottom, and each part is there because the part
 * above it needs it:
 *
 *   caveat        only when it costs the reader something (caveats.ts)
 *   the figure    what was asked about, large, with its delta and its baseline
 *   the reading   one sentence saying what the figures mean — no numeral in it,
 *                 because the figures are an inch away
 *   the drivers   the figures that sentence is about
 *   the visual    the same finding as a shape, with a line on how to read it
 *                 when it is one a person has not met
 *   the context   what the data singles out, in words
 *   George        what he would check next, and the move that does it
 *
 * THE WORDS AND THE VISUAL EXPLAIN EACH OTHER. The reading names the drivers
 * the driver figures print and the visual arranges; the recommendation names
 * the evidence the reading just gave. Nothing here is a caption bolted onto a
 * chart, and nothing is a chart bolted onto a paragraph.
 *
 * MINIMUM SUFFICIENT, STILL. Every part is null when the evidence does not
 * support it: no drivers, no reading; no plane, no guidance; no grounded next
 * step, no recommendation. George does not fill the screen because there is
 * screen.
 */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Anatomy } from './Anatomy';
import { Compare } from './Compare';
import { Field } from './Field';
import { Caveats } from './CaveatNotes';
import { FindingList } from './FindingList';
import type { DeskFinding } from './findings';
import type { DeskActionItem } from './deskActions';
import type { DeskLayout, FieldPlan, Receded } from './deskCompose';
import { leadAndRest } from './conclusion';
import type { Recommendation } from './initiative';
import type { Subject } from './subject';
import { ReceiptsBlock } from '../george/ReceiptsBlock';
import { ResultSurface } from '../george/ResultSurface';
import { WorkSectionView } from '../george/entryParts';

export interface AnswerProps {
  layout: DeskLayout;
  selection: Subject[];
  onSelect: (subject: Subject, additive: boolean) => void;
  reading?: Subject[];
  asList?: boolean;
  /** George's own prose for this work, when he has written any. */
  prose?: string;
  recommendation: Recommendation | null;
  moves: DeskActionItem[];
  onAction: (action: DeskActionItem) => void;
  onInspect: () => void;
  /** What the rows singled out, each with its own figures (findings.ts). */
  findings?: DeskFinding[];
  /** Open a finding's subject on the workspace. */
  onOpenSubject?: (subject: Subject) => void;
  /** Ask a finding's own next question. */
  onAskQuestion?: (question: string) => void;
  /** The move that investigates one finding further, when the ladder has one. */
  moveFor?: (finding: DeskFinding) => { label: string; question: string } | null;
}

/**
 * The field the stage came out of, kept where a person can still reach it.
 *
 * CONTEXT RECEDES; IT DOES NOT LEAVE. Focusing a store must not take the
 * other six away — a person building a comparison needs the shop they have not
 * clicked yet. Smaller and quieter, every object still live, and it brightens
 * on hover and on focus-within so a keyboard reaches it on the same terms.
 */
function Band({ field, selection, onSelect, reading }: {
  field: FieldPlan;
  selection: Subject[];
  onSelect: (s: Subject, additive: boolean) => void;
  reading: Subject[];
}) {
  return (
    <div className="desk-receded mt-10 focus-within:opacity-100 hover:opacity-100" data-band={field.dimension}>
      <p className="desk-label mb-1">
        {field.caption}
        {field.within ? ` · ${field.within}` : ''}
      </p>
      <Field field={field} selection={selection} onSelect={onSelect} reading={reading} height={170} />
    </div>
  );
}

/** What was read beside the work and is not what was asked. Named, never dropped. */
function Folded({ sections }: { sections: Extract<Receded, { kind: 'section' }>[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (sections.length === 0) return null;
  return (
    <div className="mt-8 space-y-3" data-receded>
      {sections.map(({ section }) => {
        const key = `section:${section.role}`;
        const isOpen = open === key;
        return (
          <div key={key} className={isOpen ? undefined : 'desk-receded'}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : key)}
              aria-expanded={isOpen}
              data-receded-item={key}
              className="flex min-h-touch items-center gap-1.5 text-[12px] text-george-slate hover:text-george-navy"
            >
              <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden />
              {section.label} — outside this work&apos;s scope
            </button>
            {isOpen && <div className="mt-3"><WorkSectionView section={section} large={false} /></div>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * George's own prose: the lead sentence with the figures, the rest on request.
 *
 * NOT A COLUMN AND NOT A BUBBLE. His reading is worth having and is not worth
 * a paragraph before the figures. The first sentence sits under them; anything
 * more opens where somebody asked for it.
 */
function Prose({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const { lead, rest } = leadAndRest(text);
  if (!lead) return null;
  return (
    <div data-prose className="mt-5 max-w-2xl">
      <p className="font-george-serif text-[15px] leading-relaxed text-george-navy">{lead}</p>
      {rest && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-1.5 flex min-h-touch items-center gap-1.5 text-[12px] text-george-muted hover:text-george-slate"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
            {open ? 'Less' : 'More'}
          </button>
          {open && (
            <p className="whitespace-pre-wrap font-george-serif text-[14px] leading-relaxed text-george-slate">
              {rest}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * What George would check next, and the move that does it.
 *
 * GROUNDED OR ABSENT. A recommendation exists only because a tool established
 * the fact behind it (initiative.ts, `grounded_in`), and it carries the action
 * that performs it so nobody has to retype his suggestion. It is drawn as
 * George speaking — quiet, one line, one button — and never as a banner.
 */
function Suggestion({ recommendation, onAction }: {
  recommendation: Recommendation;
  onAction: (a: DeskActionItem) => void;
}) {
  return (
    <div
      data-recommendation={recommendation.ground}
      className="desk-reading-in mt-8 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-l-2 border-george-line pl-4"
    >
      <p className="max-w-xl text-[14px] leading-relaxed text-george-navy">{recommendation.text}</p>
      <button
        type="button"
        onClick={() => onAction(recommendation.action)}
        data-action={recommendation.action.id}
        title={recommendation.action.question}
        className="min-h-touch shrink-0 rounded-full bg-george-navy px-3.5 py-1.5 text-[12px] text-george-cream"
      >
        {recommendation.action.label}
      </button>
    </div>
  );
}

export function Answer({
  layout, selection, onSelect, reading = [], asList = false, prose = '',
  recommendation, moves, onAction, onInspect,
  findings = [], onOpenSubject, onAskQuestion, moveFor,
}: AnswerProps) {
  const stage = layout.stage;

  return (
    <div data-answer data-stage={stage.kind} data-level={layout.level}>
      {/* A caveat, only where it costs the reader something. */}
      <Caveats caveats={layout.caveats} onInspect={onInspect} />

      <div className="desk-stage" key={`${stage.kind}:${layout.scope.join('|')}`}>
        {stage.kind === 'field' && (
          <>
            <Field
              field={stage.field}
              selection={selection}
              onSelect={onSelect}
              reading={reading}
              asList={asList}
              guidance={layout.guidance}
            />
            {/* The reading of a field is what the data singles out; a field of
                many subjects has no single anatomy to read. */}
          </>
        )}

        {stage.kind === 'anatomy' && (
          <>
            <Anatomy anatomy={stage.anatomy} conclusion={layout.conclusion} />
            {stage.breakdown && (
              <div className="mt-12" data-breakdown>
                <p className="desk-label mb-3">{stage.breakdown.caption}</p>
                <Field
                  field={stage.breakdown}
                  selection={selection}
                  onSelect={onSelect}
                  reading={reading}
                  asList={asList}
                  guidance={layout.guidance}
                  height={320}
                />
              </div>
            )}
          </>
        )}

        {stage.kind === 'compare' && (
          <Compare
            subjects={stage.subjects}
            fields={stage.fields}
            selection={selection}
            onSelect={onSelect}
            reading={reading}
            asList={asList}
            guidance={layout.guidance}
          />
        )}

        {/* THE FALLBACK, AND IT SAYS SO. A time series or a mixed result the
            desk grammar cannot place is still drawn — dropping a read the
            receipts record would be hiding work that happened — but through
            the older primitives, whose visual language is not this one. It is
            named rather than passed off as the workspace's own drawing. */}
        {stage.kind === 'figures' && (
          <div data-figures-fallback>
            <ResultSurface blocks={stage.blocks} large />
          </div>
        )}

        {/* NOTHING IS DRAWN YET, AND THAT IS A STATE OF ITS OWN (UI rule 8).
            It is reached while a piece of work is still reading and before its
            first result lands. The workspace above keeps whatever it had, so
            this is never the whole screen; it exists so the region is never
            silently empty. */}
        {stage.kind === 'statement' && !prose && (
          <p className="py-6 text-[13px] text-george-muted" data-statement>
            Nothing drawn yet.
          </p>
        )}
      </div>

      {/* WHAT GEORGE FOUND. The same per-subject marks the attention line used
          to join into one sentence, drawn as the findings they are — each with
          the subject's own figures and its own next move. The line remains for
          the case findings cannot serve: a single subject on screen, where the
          anatomy above already says everything a finding would. */}
      {findings.length > 0 && onOpenSubject ? (
        <div className="mt-8">
          <FindingList
            findings={findings}
            onOpen={onOpenSubject}
            onAsk={onAskQuestion}
            moveFor={moveFor}
          />
        </div>
      ) : (
        layout.attentionLine && (
          <p data-attention-line className="mt-6 max-w-2xl border-l-2 border-george-navy pl-3 text-[14px] leading-relaxed text-george-navy">
            {layout.attentionLine}
          </p>
        )
      )}

      {/* George's own words, briefly. */}
      {prose && <Prose text={prose} />}

      {/* What he would check next. */}
      {recommendation && <Suggestion recommendation={recommendation} onAction={onAction} />}

      {/* The few other moves the evidence supports. */}
      {moves.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5" data-moves>
          {moves.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onAction(m)}
              title={m.question ?? m.label}
              data-action={m.id}
              data-kind={m.kind}
              className="min-h-touch rounded-full bg-george-paper px-3.5 py-1.5 text-[12px] text-george-navy transition-shadow desk-lift hover:shadow-md"
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* The field the stage came out of: quieter, smaller, still live. */}
      {layout.receded
        .filter((r): r is Extract<Receded, { kind: 'field' }> => r.kind === 'field')
        .map((r) => (
          <Band
            key={`${r.field.dimension}:${r.field.within ?? ''}`}
            field={r.field}
            selection={selection}
            onSelect={onSelect}
            reading={reading}
          />
        ))}

      <Folded sections={layout.receded.filter((r): r is Extract<Receded, { kind: 'section' }> => r.kind === 'section')} />

      {/* Where these figures came from, and when they were read (UI rules 3, 6). */}
      {layout.headlineMeta && <ReceiptsBlock meta={layout.headlineMeta} />}
    </div>
  );
}
