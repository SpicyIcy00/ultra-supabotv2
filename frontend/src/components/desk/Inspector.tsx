/**
 * What is behind a figure, without leaving the work.
 *
 * UI RULE 3, WHERE IT LANDS. "Clicking any figure shows its receipts in the
 * same panel — no new route, no modal stack." The inspector is that panel: it
 * opens beside the workspace, closes on Escape, and the workspace does not
 * move while it is open. Nothing here is a new source of anything — the
 * receipts are the tool's own meta, drawn by the one component every surface
 * renders them through.
 */
import { X } from 'lucide-react';
import type { DeskLayout } from './deskCompose';
import { deltaText, figureText } from './deskCompose';
import type { Inspect } from './deskState';
import { sameSubject, type Subject } from './subject';
import { NoticeBanner } from '../george/NoticeBanner';
import { ReceiptsBlock } from '../george/ReceiptsBlock';

function subjectFigures(layout: DeskLayout, subject: Subject) {
  const stage = layout.stage;
  const fields = stage.kind === 'field' ? [stage.field]
    : stage.kind === 'anatomy' ? (stage.breakdown ? [stage.breakdown] : [])
      : stage.kind === 'compare' ? stage.fields : [];
  for (const field of fields) {
    const object = [...field.objects, ...field.unranked].find((o) => sameSubject(o.subject, subject));
    if (object) return { object, field };
  }
  if (stage.kind === 'anatomy' && sameSubject(stage.anatomy.subject, subject)) {
    return { anatomy: stage.anatomy };
  }
  return null;
}

export function Inspector({ target, layout, onClose }: {
  target: Inspect;
  layout: DeskLayout;
  onClose: () => void;
}) {
  return (
    <aside
      className="desk-lift-2 flex h-full flex-col gap-4 overflow-y-auto rounded-l-2xl bg-george-paper px-5 py-5"
      role="complementary"
      aria-label="Details"
      data-inspector={target.kind}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="desk-label">
          {target.kind === 'receipts' ? 'Where this came from' : target.kind === 'notices' ? 'Caveats' : target.subject.label}
        </p>
        <button type="button" onClick={onClose} aria-label="Close" className="min-h-touch text-george-muted hover:text-george-navy">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {target.kind === 'notices' && <NoticeBanner notices={layout.notices} />}

      {target.kind === 'receipts' && (
        <>
          {layout.headlineMeta ? (
            <ReceiptsBlock meta={layout.headlineMeta} />
          ) : (
            <p className="text-[13px] text-george-slate">No figure is open.</p>
          )}
        </>
      )}

      {target.kind === 'subject' && (() => {
        const found = subjectFigures(layout, target.subject);
        if (!found) return <p className="text-[13px] text-george-slate">Nothing on screen is about {target.subject.label}.</p>;
        if ('anatomy' in found && found.anatomy) {
          return (
            <div className="space-y-4">
              <Figure label={found.anatomy.headline.label} text={figureText(found.anatomy.headline)} delta={deltaText(found.anatomy.headline)} />
              {found.anatomy.drivers.map((d) => (
                <Figure key={d.label} label={d.label} text={figureText(d)} delta={deltaText(d)} />
              ))}
              <ReceiptsBlock meta={found.anatomy.headline.meta} />
            </div>
          );
        }
        const { object, field } = found as { object: NonNullable<ReturnType<typeof subjectFigures>>['object']; field: NonNullable<ReturnType<typeof subjectFigures>>['field'] };
        if (!object || !field) return null;
        return (
          <div className="space-y-4">
            <Figure label={object.figure.label} text={figureText(object.figure)} delta={deltaText(object.figure)} />
            {object.drivers.map((d) => (
              <Figure key={d.label} label={d.label} text={figureText(d)} delta={deltaText(d)} />
            ))}
            {object.attention && (
              <p className="text-[12px] leading-relaxed text-george-slate">
                {object.attention === 'against_the_majority'
                  ? 'Singled out because it moved against the direction the rest moved in.'
                  : 'Singled out because the tool ranked it first by change.'}
              </p>
            )}
            <ReceiptsBlock meta={field.headline.source.meta} />
          </div>
        );
      })()}
    </aside>
  );
}

function Figure({ label, text, delta }: { label: string; text: string; delta: string }) {
  return (
    <div>
      <p className="desk-label">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-george-serif text-[28px] leading-none tabular-nums text-george-navy">{text}</span>
        <span className="text-[13px] tabular-nums text-george-slate">{delta}</span>
      </p>
    </div>
  );
}
