/**
 * The business as objects you can touch.
 *
 * WHY A FIELD AND NOT A BAR CHART. Seven stores on the two DRIVERS of net
 * sales shows every store's driver mix at once — who is selling more baskets,
 * who is selling dearer ones, who is doing neither — and a bar chart of net
 * sales cannot show that at all. That is the information advantage the rule
 * asks for. Where there is none the same rows are one control away as the
 * conventional instrument, and a single-axis field is a dot plot with its
 * labels intact rather than an invented shape.
 *
 * EVERY ENCODING IS A ROW'S. The centre of an object is a position the tool
 * computed; its AREA is a value; its HUE is the tool's own `direction`; a ring
 * is the composer's attention or the person's selection. The figure and its
 * delta are PRINTED beside every object, so a reader who sees no colour at all
 * loses nothing (metrics.yaml surface.desk.field). The glow is rendering: it
 * encodes nothing, and removing it removes no information.
 *
 * THE LUMINOUS BODY, AND WHY IT IS SAFE. Each object is a soft radial cloud
 * over a small dense core. The core is `george-data-up` / `george-data-down`
 * exactly — the pair measured for protan and deutan separation on this cream —
 * so the part the eye fixes and every printed mark keep the contrast the
 * palette was validated for. The cloud is the same hue dissolving outward.
 * The approvals colour appears nowhere: a figure never needs you (UI rule 5).
 *
 * OBJECTS MOVE, THEY DO NOT REMOUNT. Each is keyed by its subject, so a window
 * change slides the same shop to its new place and a focus carries it to the
 * centre. Under prefers-reduced-motion they arrive instead of travelling, and
 * the interaction model is untouched (index.css).
 */
import { memo } from 'react';
import type { FieldObject, FieldPlan } from './deskCompose';
import { deltaText, fieldRows, figureText } from './deskCompose';
import { axisEnds, labelsFit, layoutField, type Placed } from './fieldLayout';
import { sameSubject, subjectKey, type Subject } from './subject';
import { useSize } from './useSize';
import { DeltaRanking, SubjectComparison } from '../george/Instruments';

/** Past this many objects the soft body is dropped: the same field, drawn cheaply. */
export const SOFT_LIMIT = 24;

export interface FieldProps {
  field: FieldPlan;
  selection: Subject[];
  onSelect: (subject: Subject, additive: boolean) => void;
  /** Subjects George is reading right now, as a light under them. */
  reading?: Subject[];
  /**
   * Force the ranked rows. The composer already chose `ranked` for anything a
   * plane would not separate; this is the person overriding the rare case
   * where it chose a plane.
   */
  asList?: boolean;
  /** How to read the drawing, when it is one a person has not met. */
  guidance?: string | null;
  height?: number;
}

type Tone = 'up' | 'down' | 'flat';

function toneOf(direction: FieldObject['figure']['direction']): Tone {
  return direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'flat';
}

/**
 * The ramps, the softening blur and the reading light, defined once per field.
 *
 * Ids are namespaced by the field so two fields side by side in a comparison
 * cannot borrow each other's gradients.
 */
function Defs({ id, soft }: { id: string; soft: boolean }) {
  const ramp = (tone: Tone, core: string, mid: string, edge: string) => (
    <radialGradient key={tone} id={`${id}-${tone}`} cx="38%" cy="34%" r="72%">
      <stop offset="0%" stopColor={edge} stopOpacity="0.95" />
      <stop offset="42%" stopColor={mid} stopOpacity="0.85" />
      <stop offset="100%" stopColor={core} stopOpacity="0.72" />
    </radialGradient>
  );
  return (
    <defs>
      {ramp('up', 'var(--desk-up-core)', 'var(--desk-up-mid)', 'var(--desk-up-edge)')}
      {ramp('down', 'var(--desk-down-core)', 'var(--desk-down-mid)', 'var(--desk-down-edge)')}
      {ramp('flat', 'var(--desk-flat-core)', 'var(--desk-flat-mid)', 'var(--desk-flat-edge)')}
      <radialGradient id={`${id}-reading`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--desk-ink)" stopOpacity="0.16" />
        <stop offset="100%" stopColor="var(--desk-ink)" stopOpacity="0" />
      </radialGradient>
      {soft && (
        <filter id={`${id}-soften`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      )}
    </defs>
  );
}

/** One object: the cloud, its core, its rings, and its name and figure beside it. */
const Objekt = memo(function Objekt({
  id, placed, selected, attention, reading, soft, onSelect,
}: {
  id: string;
  placed: Placed;
  selected: boolean;
  attention: boolean;
  reading: boolean;
  soft: boolean;
  onSelect: (subject: Subject, additive: boolean) => void;
}) {
  const { object, x, y, r, labelSide } = placed;
  // The label may have been nudged clear of a neighbour's. The OBJECT never
  // moves — its position is the measurement — so the offset is applied to the
  // text alone, and a leader line is drawn when the two have parted.
  const labelDy = (placed.labelY ?? y) - y;
  const tone = toneOf(object.figure.direction);
  const label = object.subject.label;
  const figure = figureText(object.figure);
  const delta = deltaText(object.figure);
  const anchor = labelSide === 'left' ? 'end' : 'start';
  const dx = labelSide === 'left' ? -(r + 9) : r + 9;

  return (
    <g
      className="desk-object"
      data-object={subjectKey(object.subject)}
      data-tone={tone}
      data-selected={selected ? 'true' : undefined}
      data-attention={attention ? 'true' : undefined}
      data-reading={reading ? 'true' : undefined}
      transform={`translate(${x} ${y})`}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${label}: ${figure}${delta ? `, ${delta}` : ''}${attention ? ', singled out' : ''}`}
      onClick={(e) => onSelect(object.subject, e.shiftKey || e.metaKey || e.ctrlKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(object.subject, e.shiftKey);
        }
      }}
    >
      {/* George is reading here: a diffuse light, only while a call naming
          this object is in flight. */}
      {reading && (
        <circle className="desk-object__light" r={r + 22} fill={`url(#${id}-reading)`} style={{ fill: `url(#${id}-reading)` }} />
      )}
      {/* The luminous body. Blurred where the field is small enough to
          afford it; the same colour, unblurred, where it is not. */}
      <circle
        className="desk-object__body"
        r={r}
        fill={`url(#${id}-${tone})`}
        style={soft ? { filter: `url(#${id}-soften)` } : { filter: 'none' }}
      />
      {/* The dense centre: the exact position, in the validated token. */}
      <circle
        className="desk-object__core"
        r={Math.max(3, r * 0.34)}
        fill={`var(--desk-${tone}-core)`}
      />
      {attention && <circle className="desk-object__ring" r={r + 7} />}
      {selected && <circle className="desk-object__selected" r={r + 7} />}
      {Math.abs(labelDy) > 2 && (
        <line
          className="desk-object__leader"
          x1={labelSide === 'left' ? -r : r}
          y1={0}
          x2={dx}
          y2={labelDy - 6}
          aria-hidden
        />
      )}
      <text className="desk-object__name" x={dx} y={labelDy - 2} textAnchor={anchor}>{label}</text>
      <text className="desk-object__figure" x={dx} y={labelDy + 14} textAnchor={anchor}>
        {figure}
        {delta && <tspan className="desk-object__delta" dx="7">{delta}</tspan>}
      </text>
    </g>
  );
});

/** The zero line and what its ends mean, in the tool's words. */
function Axes({ geometry, field }: { geometry: ReturnType<typeof layoutField>; field: FieldPlan }) {
  const { plot, zeroX, zeroY } = geometry;
  const x = axisEnds(field.x.key);
  return (
    <g aria-hidden>
      {zeroX !== null && (
        <line className="desk-axis__zero" x1={zeroX} y1={plot.top - 8} x2={zeroX} y2={plot.top + plot.height + 8} />
      )}
      {zeroY !== null && (
        <line className="desk-axis__zero" x1={plot.left - 8} y1={zeroY} x2={plot.left + plot.width + 8} y2={zeroY} />
      )}
      <text className="desk-axis__label" x={plot.left} y={plot.top + plot.height + 22} textAnchor="start">
        ◂ {field.x.label} {x.low}
      </text>
      <text className="desk-axis__label" x={plot.left + plot.width} y={plot.top + plot.height + 22} textAnchor="end">
        {field.x.label} {x.high} ▸
      </text>
      {field.y && (
        <text className="desk-axis__label" x={plot.left} y={plot.top - 12} textAnchor="start">
          ▴ {field.y.label} rose
        </text>
      )}
    </g>
  );
}

/**
 * The subjects the tool could not place, named rather than drawn at zero.
 *
 * A product that vanished has no change, and a dot at the origin would read
 * as "no change" — the opposite of what happened to it.
 */
function Unranked({ objects, onSelect, selection }: {
  objects: FieldObject[];
  onSelect: FieldProps['onSelect'];
  selection: Subject[];
}) {
  if (objects.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-george-slate" data-unranked>
      <span className="desk-label">Not placed</span>
      {objects.map((o) => (
        <button
          key={subjectKey(o.subject)}
          type="button"
          onClick={(e) => onSelect(o.subject, e.shiftKey)}
          className={`min-h-touch hover:text-george-navy ${
            selection.some((s) => sameSubject(s, o.subject)) ? 'text-george-navy underline underline-offset-4' : ''
          }`}
        >
          {o.subject.label}
          <span className="ml-1.5 text-george-muted">{deltaText(o.figure) || 'nothing to compare'}</span>
        </button>
      ))}
    </p>
  );
}

export function Field({
  field, selection, onSelect, reading = [], asList = false, guidance = null, height = 420,
}: FieldProps) {
  const { ref, size } = useSize<HTMLDivElement>({ width: 720, height });
  const id = `f-${field.dimension}-${field.headline.source.seq}`;
  // Laid out first, because whether the plane can be READ is a property of
  // the geometry and not a preference. Cheap, pure, and the same call the
  // drawing makes below.
  const geometry = layoutField(field, size.width, size.height);

  // The composer's choice, unless the person overrode it — OR the labels
  // cannot be separated inside the plot. A plane whose names sit on top of
  // each other has stopped saying which shop is which, and a ranked list
  // says the same thing with one row per subject and no overlap possible.
  // A simpler drawing that communicates beats an interesting one that does
  // not, so legibility is allowed to overrule the representation.
  const illegible = !labelsFit(geometry, size.height);
  const ranked = asList || field.representation === 'ranked' || illegible;

  if (ranked) {
    // THE CONVENTIONAL INSTRUMENT, AND THE DEFAULT. One row per subject with
    // its label, its bar, its figure and its delta — read in seconds, and
    // nothing about it needs explaining. Clicking a subject opens it, exactly
    // as clicking an object on a plane does, so the interaction is the same
    // whichever drawing the composer chose.
    const shape = field.headline.shape;
    const all = [...field.objects, ...field.unranked];
    const pick = (name: string, additive: boolean) => {
      const object = all.find((o) => o.subject.label === name);
      if (object) onSelect(object.subject, additive);
    };
    const selected = (name: string) =>
      selection.some((s) => all.some((o) => o.subject.label === name && sameSubject(s, o.subject)));
    return (
      <div
        data-field
        data-view="ranked"
        data-representation="ranked"
        data-fallback={illegible && field.representation === 'plane' ? 'labels_collide' : undefined}
      >
        {shape.kind === 'ranking' ? (
          // The tool ranked by CHANGE, so the bars diverge from a zero line in
          // the metric's own unit — never by percentage.
          <DeltaRanking shape={shape} onSubject={(n) => pick(n, false)} isSelected={selected} />
        ) : shape.kind === 'comparison' ? (
          <SubjectComparison
            shape={{ kind: 'comparison', rows: fieldRows(field), label: field.headline.source.meta.metric_label }}
            meta={field.headline.source.meta}
            onSubject={(n) => pick(n, false)}
            isSelected={selected}
          />
        ) : (
          <ul className="space-y-1.5">
            {all.map((o) => (
              <li
                key={subjectKey(o.subject)}
                data-subject={o.subject.label}
                data-selected={selection.some((s) => sameSubject(s, o.subject)) ? 'true' : undefined}
                className="flex items-baseline justify-between gap-4 text-[14px]"
              >
                <button type="button" onClick={() => onSelect(o.subject, false)} className="min-h-touch text-george-navy hover:underline">
                  {o.subject.label}
                </button>
                <span className="tabular-nums text-george-navy">
                  {figureText(o.figure)}
                  <span className="ml-2 text-george-slate">{deltaText(o.figure)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* Shift-clicking is how a comparison is built, and a control nobody
            knows about is a control that does not exist. */}
        {all.length > 1 && (
          <p data-hint className="mt-2 text-[11px] text-george-muted">
            Click one to open it; shift-click to compare.
          </p>
        )}
      </div>
    );
  }

  const soft = field.objects.length <= SOFT_LIMIT;

  return (
    <div data-field data-view="field" data-representation="plane" data-encoding={field.encoding}>
      {/* HOW TO READ IT, ATTACHED TO IT. A plane is the one drawing here a
          person may not have met, so it says what each axis means, what size
          means and what a click does — in one line, always visible, never a
          modal and never a paragraph (metrics.yaml representation.guidance). */}
      {guidance && (
        <p data-guidance className="mb-2 max-w-2xl text-[12px] leading-relaxed text-george-slate">
          {guidance}
        </p>
      )}
      <div ref={ref} style={{ height }} className="w-full">
        <svg
          className="desk-field h-full w-full overflow-visible"
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="group"
          aria-label={`${field.caption}. ${field.objects.length} ${field.dimension}s.`}
        >
          <Defs id={id} soft={soft} />
          <Axes geometry={geometry} field={field} />
          {geometry.placed.map((placed) => (
            <Objekt
              key={subjectKey(placed.object.subject)}
              id={id}
              placed={placed}
              soft={soft}
              selected={selection.some((s) => sameSubject(s, placed.object.subject))}
              attention={placed.object.attention !== null}
              reading={reading.some((s) => sameSubject(s, placed.object.subject))}
              onSelect={onSelect}
            />
          ))}
        </svg>
      </div>
      <Unranked objects={field.unranked} onSelect={onSelect} selection={selection} />
    </div>
  );
}
