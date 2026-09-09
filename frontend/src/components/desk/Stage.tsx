/**
 * The workspace: the one region that transforms.
 *
 * READING ORDER, AND WHAT MAY NEVER BE QUIETER (UI rules 3, 4 and 6):
 *
 *   caveats     above the figures they qualify, whole, never collapsible
 *   the stage   the business, in the grammar the state of the work derives
 *   attention   what the data itself singles out — rows characterised, no figure
 *   receded     what the stage replaced, named and still reachable
 *   receipts    where these figures came from and when they were read
 *
 * THE STAGE IS CHOSEN BY THE COMPOSER, NOT HERE. This file draws what
 * `composeDesk` decided; it holds no state but the disclosure of what has
 * receded, and it decides nothing about which figure leads.
 */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Anatomy } from './Anatomy';
import { Compare } from './Compare';
import { Field } from './Field';
import type { DeskLayout, FieldPlan, Receded } from './deskCompose';
import type { Subject } from './subject';
import { NoticeBanner } from '../george/NoticeBanner';
import { ReceiptsBlock } from '../george/ReceiptsBlock';
import { ResultSurface } from '../george/ResultSurface';
import { WorkSectionView } from '../george/entryParts';

/**
 * The field the stage came out of, kept where a person can still reach it.
 *
 * CONTEXT RECEDES; IT DOES NOT LEAVE. Focusing a store must not take the
 * other six away — the whole point of a field is that the estate is one
 * object you keep touching, and a person building a comparison needs the
 * shop they have not clicked yet. So the field stays below the stage, smaller
 * and quieter, and every object in it is still live: clicking one moves the
 * focus, shift-clicking one adds it to the comparison.
 *
 * It brightens on hover and on focus-within, so a keyboard reaches it on the
 * same terms a mouse does.
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
      <Field field={field} selection={selection} onSelect={onSelect} reading={reading} height={190} />
    </div>
  );
}

/**
 * What was read beside the work and is not what was asked: named, folded, and
 * never dropped — a read the receipts record is work that happened.
 */
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
            {isOpen && (
              <div className="mt-3">
                <WorkSectionView section={section} large={false} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Stage({
  layout, selection, onSelect, reading = [], asList = false,
}: {
  layout: DeskLayout;
  selection: Subject[];
  onSelect: (subject: Subject, additive: boolean) => void;
  reading?: Subject[];
  asList?: boolean;
}) {
  const stage = layout.stage;
  return (
    <div data-stage={stage.kind} data-level={layout.level}>
      {/* Caveats first, above the figures they qualify. */}
      {layout.notices.length > 0 && (
        <div className="mb-6">
          <NoticeBanner notices={layout.notices} />
        </div>
      )}

      <div className="desk-stage" key={`${stage.kind}:${layout.scope.join('|')}`}>
        {stage.kind === 'field' && (
          <Field field={stage.field} selection={selection} onSelect={onSelect} reading={reading} asList={asList} />
        )}

        {stage.kind === 'anatomy' && (
          <>
            <Anatomy anatomy={stage.anatomy} />
            {stage.breakdown && (
              <div className="mt-12" data-breakdown>
                <p className="desk-label mb-3">{stage.breakdown.caption}</p>
                <Field
                  field={stage.breakdown}
                  selection={selection}
                  onSelect={onSelect}
                  reading={reading}
                  asList={asList}
                  height={340}
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
          />
        )}

        {stage.kind === 'figures' && <ResultSurface blocks={stage.blocks} large />}
      </div>

      {/* What the data singles out: a characterisation of rows, no figure. */}
      {layout.attentionLine && (
        <p data-attention-line className="mt-6 border-l-2 border-george-navy pl-3 text-[14px] leading-relaxed text-george-navy">
          {layout.attentionLine}
        </p>
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
