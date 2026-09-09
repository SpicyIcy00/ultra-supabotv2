/**
 * One subject, opened: the figure that was asked about and what the
 * definitions say moves it.
 *
 * THE SHAPE IS THE DEFINITION'S. Net sales sits above its two declared
 * drivers because `metrics.net_sales.drivers` names them and George recorded
 * the identity; a metric that declares none is drawn as the figure it is,
 * with nothing invented beneath it. The identity line is the definitions'
 * relationship said in the reader's words — the display names the meta
 * carries — and it is drawn only when George actually recorded one.
 *
 * "MOVED MORE" IS A READING OF TWO FIGURES, NOT A SHARE. The heavier driver
 * is the one whose measured change is larger in magnitude; where they are
 * close, or either is missing, neither is marked. Splitting a change in a
 * product of two factors has no unique answer, so no percentage of a decline
 * is ever attributed here (metrics.yaml investigation.attribution_math).
 *
 * The bars diverge from a drawn zero and the signed figure is printed beside
 * each, so the direction reads with no colour at all.
 */
import type { AnatomyPlan, Figure } from './deskCompose';
import { baselineText, deltaText, figureText } from './deskCompose';

function barClass(direction: Figure['direction']): string {
  if (direction === 'up') return 'bg-george-data-up';
  if (direction === 'down') return 'bg-george-data-down';
  return 'bg-george-muted';
}

/** One driver: its name, its delta, and a bar that diverges from the zero line. */
function Driver({ figure, stronger, extent }: { figure: Figure; stronger: boolean; extent: number }) {
  const pct = figure.changePct;
  const negative = (pct ?? 0) < 0;
  return (
    <div className="desk-driver min-w-0 flex-1" data-driver data-stronger={stronger ? 'true' : undefined}>
      <p className={`text-[13px] ${stronger ? 'font-medium text-george-navy' : 'text-george-slate'}`}>
        {figure.label}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-george-serif text-[26px] leading-none tabular-nums text-george-navy">
          {figureText(figure)}
        </span>
        <span className={`text-[13px] tabular-nums ${stronger ? 'font-medium text-george-navy' : 'text-george-slate'}`}>
          {deltaText(figure)}
        </span>
      </p>
      {/* A shared percentage axis: the two bars are read against each other. */}
      <div className="relative mt-2 h-[10px]" role="img" aria-label={`${figure.label} ${deltaText(figure)}`}>
        <div className="absolute inset-y-0 left-1/2 w-px bg-george-slate/60" aria-hidden />
        <div
          className={`absolute top-0 h-full rounded-[3px] ${barClass(figure.direction)}`}
          style={{
            left: negative ? `${50 - extent * 50}%` : '50%',
            width: `${Math.max(extent * 50, extent > 0 ? 0.8 : 0)}%`,
          }}
        />
      </div>
      {stronger && <p className="desk-label mt-1.5 text-george-slate">moved more</p>}
    </div>
  );
}

/** The definitions' identity, in the reader's words. Drawn only when recorded. */
export function identityWords(anatomy: AnatomyPlan): string | null {
  if (!anatomy.identity || anatomy.drivers.length < 2) return null;
  return `${anatomy.headline.label} is ${anatomy.drivers[0].label.toLowerCase()} × ${anatomy.drivers[1].label.toLowerCase()}`;
}

export function Anatomy({ anatomy, conclusion = null, size = 'lead' }: {
  anatomy: AnatomyPlan;
  /**
   * George's reading, between the figure and the drivers it is about — so the
   * sentence and the figures explain each other rather than sitting in two
   * different parts of the screen. It carries no numeral by construction
   * (conclusion.ts); the figures it describes are directly beneath it.
   */
  conclusion?: string | null;
  size?: 'lead' | 'abreast';
}) {
  const deltas = anatomy.drivers.map((d) => Math.abs(d.changePct ?? 0));
  const largest = Math.max(0, ...deltas);
  const identity = identityWords(anatomy);
  const baseline = baselineText(anatomy.headline);

  return (
    <section className="desk-anatomy" data-anatomy={anatomy.subject.label} aria-label={anatomy.subject.label}>
      <p className="desk-label">{anatomy.subject.label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {/* The figure over a soft field of its own direction's light. The
            wash sits BEHIND the type and never touches its contrast: navy on
            cream, whatever the direction. */}
        <span
          className={`desk-figure font-george-serif leading-none tabular-nums text-george-navy ${
            anatomy.headline.direction === 'up' ? 'desk-figure--up'
              : anatomy.headline.direction === 'down' ? 'desk-figure--down' : ''
          } ${size === 'lead' ? 'text-[56px] md:text-[68px]' : 'text-[38px]'}`}
        >
          {figureText(anatomy.headline)}
        </span>
        <span className="text-[16px] tabular-nums text-george-navy">{deltaText(anatomy.headline)}</span>
        <span className="text-[13px] text-george-slate">
          {anatomy.headline.label}
          {baseline && ` · from ${baseline}`}
        </span>
      </p>

      {/* THE READING, WITH THE FIGURES IT READS. One sentence, no numeral in
          it, immediately above the drivers it is about. */}
      {conclusion && (
        <p data-conclusion className={`mt-4 max-w-2xl leading-relaxed text-george-navy ${
          size === 'lead' ? 'text-[16px]' : 'text-[14px]'
        }`}>
          {conclusion}
        </p>
      )}

      {anatomy.drivers.length > 0 && (
        <>
          <div className={`mt-7 flex gap-8 ${size === 'lead' ? '' : 'gap-5'}`}>
            {anatomy.drivers.map((d, i) => (
              <Driver
                key={d.label}
                figure={d}
                stronger={anatomy.stronger === i}
                extent={largest === 0 ? 0 : Math.abs(d.changePct ?? 0) / largest}
              />
            ))}
          </div>
          {identity && (
            <p className="mt-4 text-[11px] text-george-muted">
              {identity} — the definitions' relationship, not a split of the change.
            </p>
          )}
        </>
      )}
    </section>
  );
}
