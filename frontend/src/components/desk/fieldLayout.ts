/**
 * Where an object sits on a field, in pixels — geometry, never a metric.
 *
 * EVERY NUMBER HERE IS A RATIO OF TWO FIGURES THE TOOL RETURNED. A position
 * is a value's place between the smallest and largest of its own axis; a
 * radius is the square root of a value against the largest, so AREA is
 * proportional to the figure rather than width (a circle twice as wide is
 * four times the ink, and reads as four times the shop). Nothing here adds,
 * differences or shares two business figures, and nothing decides what is
 * important — that is the composer's, from the tool's own direction and
 * ranking.
 *
 * ZERO IS ALWAYS IN A CHANGE DOMAIN. A field of falls whose axis started at
 * the smallest fall would put the least bad shop at the origin and read as
 * "this one is fine". The zero line is drawn, and every object is placed
 * against it.
 *
 * Kept apart from the drawing for the reason pinShape.ts is: the suite holds
 * these without a DOM.
 */
import type { FieldObject, FieldPlan } from './deskCompose';

export interface Bounds {
  min: number;
  max: number;
}

export interface Placed {
  object: FieldObject;
  x: number;
  y: number;
  r: number;
  /** Which side of the object its label sits on, so labels stay inside. */
  labelSide: 'left' | 'right';
  /**
   * Where the label's text is drawn, which may be BELOW the object when a
   * neighbour's name would have overlapped it. The object never moves: its
   * position is the measurement, and only the words are nudged.
   */
  labelY?: number;
}

export interface FieldGeometry {
  placed: Placed[];
  /** The zero line in pixels, or null when the axis has no zero (a level axis). */
  zeroX: number | null;
  zeroY: number | null;
  domainX: Bounds;
  domainY: Bounds | null;
  plot: { left: number; top: number; width: number; height: number };
}

/** The smallest radius an object may be and still be a target, and the largest. */
export const MIN_RADIUS = 7;
export const MAX_RADIUS = 34;

/** Room for the axis labels around the plot. */
const PAD = { left: 18, right: 18, top: 26, bottom: 30 };

/**
 * The domain of an axis: the values it must contain, padded, with zero
 * included when the axis measures change.
 */
export function domainOf(values: number[], includeZero: boolean): Bounds {
  const present = values.filter((v) => Number.isFinite(v));
  if (present.length === 0) return { min: includeZero ? -1 : 0, max: 1 };
  let min = Math.min(...present);
  let max = Math.max(...present);
  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  } else {
    min = Math.min(min, 0);
  }
  if (min === max) {
    // One value, or every value the same: give the axis a span so the object
    // sits in the middle rather than at an edge that means nothing.
    const span = Math.abs(max) || 1;
    return { min: min - span * 0.5, max: max + span * 0.5 };
  }
  const pad = (max - min) * 0.12;
  return { min: min - pad, max: max + pad };
}

function scale(value: number, domain: Bounds, from: number, to: number): number {
  const span = domain.max - domain.min;
  if (span === 0) return (from + to) / 2;
  return from + ((value - domain.min) / span) * (to - from);
}

/** The radius for a value: area against the largest, floored so nothing vanishes. */
export function radiusOf(value: number | null, largest: number): number {
  if (value === null || !Number.isFinite(value) || largest <= 0) return MIN_RADIUS;
  const ratio = Math.min(1, Math.abs(value) / largest);
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(ratio);
}

/**
 * Every object placed, for a field of a given size.
 *
 * A plane places on both axes; a single-axis field places on x and spreads
 * the objects down the plot IN THE TOOL'S ROW ORDER — the vertical position
 * is list order and carries no measurement, which is why the axis is drawn
 * and labelled on x alone.
 */
export function layoutField(field: FieldPlan, width: number, height: number): FieldGeometry {
  const plot = {
    left: PAD.left,
    top: PAD.top,
    width: Math.max(40, width - PAD.left - PAD.right),
    height: Math.max(40, height - PAD.top - PAD.bottom),
  };
  const objects = field.objects;
  const values = objects.map((o) => o.figure.value).filter((v): v is number => v !== null);
  const largest = values.length ? Math.max(...values.map(Math.abs)) : 0;

  const xs = objects.map((o) => o.x).filter((v): v is number => v !== null);
  const isChange = field.x.key !== 'value';
  const domainX = domainOf(xs, isChange);
  const domainY = field.y ? domainOf(objects.map((o) => o.y).filter((v): v is number => v !== null), true) : null;

  const right = plot.left + plot.width;
  const bottom = plot.top + plot.height;

  const placed: Placed[] = objects.map((object, i) => {
    const x = scale(object.x ?? 0, domainX, plot.left, right);
    const y = domainY
      ? // A plane: up is more, so the domain is inverted against the pixels.
        scale(object.y ?? 0, domainY, bottom, plot.top)
      : // One axis: spread down the plot in the tool's order. Not a measurement.
        plot.top + ((i + 0.5) / Math.max(1, objects.length)) * plot.height;
    return {
      object,
      x,
      y,
      r: radiusOf(object.figure.value, largest),
      labelSide: x > plot.left + plot.width * 0.7 ? 'left' : 'right',
    };
  });

  return {
    placed: deconflict(placed),
    zeroX: isChange ? scale(0, domainX, plot.left, right) : null,
    zeroY: domainY ? scale(0, domainY, bottom, plot.top) : null,
    domainX,
    domainY,
    plot,
  };
}

/**
 * LABELS THAT COLLIDE ARE NOT A SMALLER CHART, THEY ARE A WRONG ONE.
 *
 * Each label was drawn at a fixed offset from its object with only a
 * left/right flip near the right edge, so subjects that sit close together —
 * which on a plane is exactly the interesting case, everything near the
 * origin — printed their names on top of each other. A reader then cannot
 * tell which shop is which, and the drawing has stopped saying anything.
 *
 * Two steps, in order:
 *
 *   1. NUDGE. Labels are laid out top to bottom and pushed down where one
 *      would land within a line-height of the one above it. The nudge moves
 *      the TEXT only — never the object, whose position is the measurement —
 *      so no figure is misrepresented by a pixel.
 *   2. GIVE UP HONESTLY. If nudging cannot separate them inside the plot,
 *      the geometry says so and the field falls back to the ranked list,
 *      which has one row per subject and cannot overlap at all. A simpler
 *      representation that communicates is worth more than an interesting
 *      one that does not (metrics.yaml surface.desk.representation).
 */
const LABEL_LINE = 26;

function deconflict(placed: Placed[]): Placed[] {
  const byY = [...placed].sort((a, b) => a.y - b.y || a.x - b.x);
  const sides: Placed[][] = [
    byY.filter((p) => p.labelSide === 'right'),
    byY.filter((p) => p.labelSide === 'left'),
  ];
  const moved = new Map<Placed, number>();
  for (const side of sides) {
    let floor = -Infinity;
    for (const p of side) {
      const y = Math.max(p.y, floor);
      moved.set(p, y);
      floor = y + LABEL_LINE;
    }
  }
  return placed.map((p) => ({ ...p, labelY: moved.get(p) ?? p.y }));
}

/**
 * Whether the labels still fit the plot after nudging.
 *
 * False means the field must be drawn as a ranked list instead. Read by
 * `Field` before it chooses a drawing, so the fallback is a property of the
 * geometry and not a guess made in the component.
 */
export function labelsFit(geometry: FieldGeometry, height: number): boolean {
  const lowest = Math.max(...geometry.placed.map((p) => p.labelY ?? p.y), -Infinity);
  return !Number.isFinite(lowest) || lowest <= height - 4;
}

/** The words at the ends of an axis: which way is more, in the tool's own terms. */
export function axisEnds(key: string): { low: string; high: string } {
  return key === 'value' ? { low: 'smaller', high: 'larger' } : { low: 'fell', high: 'rose' };
}
