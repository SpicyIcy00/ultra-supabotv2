/**
 * George's initiative: what he offers without being asked, and what grounds it.
 *
 * ONE RECOMMENDATION, AND IT NAMES ITS EVIDENCE. A recommendation is produced
 * only by a fact a tool established — the two declared drivers went opposite
 * ways, a subject moved against the direction the rest did, the tool's own
 * ranking put something first, or the metric permits a breakdown nobody has
 * read. `metrics.yaml surface.desk.initiative.recommend.grounded_in` is that
 * list, and a recommendation with no entry in it is not made. That is the
 * whole defence against "generic suggestions to appear intelligent": there is
 * no path from an empty screen to a suggestion.
 *
 * IT CARRIES AN ACTION, AND THE ACTION CARRIES CONTEXT. A recommendation the
 * person has to retype is not one, so each comes with the semantic action that
 * performs it — a question in business words, with the desk's selection
 * travelling beside it as it does for anything else.
 *
 * WHAT THIS DOES NOT DO. It does not ask questions. Only the model can notice
 * that the business intent is missing, and the prompt is what tells it when a
 * question is worth more than a guess; `initiative.ask.enforced_by: prompt`
 * records that this is behaviour and not a mechanism.
 */
import { localizeQuestion, type DeskActionItem } from './deskActions';
import type { DeskLayout, FieldPlan } from './deskCompose';
import { instructionLabel, instructionQuestion } from '../george/surfaceEvents';
import type { SurfaceAnchor } from '../george/surfaceModel';
import { sameSubject, type Subject } from './subject';

/** What produced a recommendation. The closed list the definitions name. */
export type Ground = 'drivers_diverge' | 'against_the_majority' | 'ranked_first' | 'no_breakdown_yet';

export interface Recommendation {
  /** What George says, in one sentence. Names the evidence, not the tool. */
  text: string;
  /** The fact that produced it, so a test can hold it to the definitions. */
  ground: Ground;
  /** The move that performs it. Never a suggestion the person must retype. */
  action: DeskActionItem;
}

/**
 * Whether a breakdown by this dimension exists and is not already on screen.
 *
 * NOT THE HEADLINE METRIC'S OWN `valid_group_by`. Net sales is transaction
 * grain and refuses a product grouping, while the investigation ladder
 * localizes by product through product revenue — so "does a product breakdown
 * exist here" is a question about the DEFINITIONS, and the server answers it
 * (`breakdown_dimensions` on the desk definitions). A client deciding it from
 * the headline's own permissions would silently never offer the one move the
 * ladder is built around.
 */
function canBreakDown(available: string[], dimension: string, shown: string | null): boolean {
  return available.includes(dimension) && shown !== dimension;
}

/** The subjects the composer singled out, that are not the one in focus. */
function others(layout: DeskLayout, focus: Subject | null): { subject: string; reason: string }[] {
  return layout.attention
    .filter((a) => !focus || a.subject !== focus.label)
    .map((a) => ({ subject: a.subject, reason: a.reason }));
}

function move(id: string, label: string, question: string): DeskActionItem {
  return { id, label, kind: 'ask', question };
}

/**
 * The one thing George would look at next, or nothing.
 *
 * Ordered by how much the evidence supports it, not by how much there is to
 * say. The first ground that applies wins, and at most one recommendation is
 * ever returned (`initiative.recommend.max`).
 */
export function recommendationFor(
  layout: DeskLayout,
  anchor: SurfaceAnchor | undefined,
  breakdownShown: string | null,
  /** The dimensions the definitions permit a breakdown by, from the server. */
  available: string[] = [],
): Recommendation | null {
  const meta = layout.headlineMeta;
  if (!meta) return null;
  const stage = layout.stage;
  const focus = layout.focus;

  // 1. The drivers went opposite ways: more transactions and smaller baskets,
  //    or the reverse. What is behind that is a product question, and it is
  //    offered only where the definitions have a product breakdown at all.
  if (stage.kind === 'anatomy' && stage.anatomy.drivers.length === 2) {
    const [a, b] = stage.anatomy.drivers;
    const diverging = (a.direction === 'up' && b.direction === 'down')
      || (a.direction === 'down' && b.direction === 'up');
    if (diverging && canBreakDown(available, 'product', breakdownShown)) {
      const rising = a.direction === 'up' ? a : b;
      const store = stage.anatomy.subject.dimension === 'store' ? stage.anatomy.subject.label : null;
      return {
        text: `${rising.label} ${rising.direction === 'up' ? 'rose' : 'fell'} while the other driver went the other way. `
          + `I'd look at which products are behind it.`,
        ground: 'drivers_diverge',
        action: move('recommend:products', 'Check products', localizeQuestion('product', store, meta)),
      };
    }
  }

  // 2. Something moved against the rest. Whether that is this shop or the
  //    whole estate is exactly what a comparison settles.
  const singled = others(layout, focus).filter((o) => o.reason === 'against_the_majority');
  if (focus && singled.length > 0 && anchor) {
    const subject = singled[0].subject;
    return {
      text: `${subject} moved the other way. Comparing the two would show whether this is ${focus.label}'s own or the estate's.`,
      ground: 'against_the_majority',
      action: move(
        'recommend:compare',
        `Compare with ${subject}`,
        instructionQuestion({ op: 'compare_selection', subjects: [focus.label, subject] }, meta,
          { ...anchor, subjects: [] }),
      ),
    };
  }

  // 3. The tool's own change ranking put something first, and nobody has
  //    opened it.
  const first = layout.attention.find((a) => a.reason === 'ranked_first');
  if (first && stage.kind !== 'anatomy' && anchor) {
    return {
      text: `${first.subject} is the largest measured ${first.direction === 'down' ? 'fall' : 'change'}. `
        + `Opening it would show what moved.`,
      ground: 'ranked_first',
      action: move(
        'recommend:focus',
        `Open ${first.subject}`,
        instructionQuestion({ op: 'focus_subject', subject: first.subject }, meta, anchor),
      ),
    };
  }

  // 4. A subject is open, it MOVED, a breakdown exists, and nobody has read
  //    one. The weakest ground, so it is last — and it needs a measured
  //    change, because localizing is a rung under a change: "which products
  //    moved" is about a movement, and a bare figure has none. Without that
  //    condition this is the generic suggestion the definitions forbid.
  const moved = stage.kind === 'anatomy' && stage.anatomy.headline.changePct !== null;
  if (moved && stage.kind === 'anatomy' && canBreakDown(available, 'product', breakdownShown)) {
    const store = stage.anatomy.subject.dimension === 'store' ? stage.anatomy.subject.label : null;
    return {
      text: `Nothing here says which products moved. That is the next thing I would read.`,
      ground: 'no_breakdown_yet',
      action: move('recommend:products', 'Check products', localizeQuestion('product', store, meta)),
    };
  }

  return null;
}

/**
 * How to read a representation a person has not met before.
 *
 * ONE LINE, ATTACHED TO THE DRAWING. It says what each axis means, what size
 * means, and what a click does — because a control nobody knows about is a
 * control that does not exist. A conventional representation gets nothing:
 * a ranked bar chart explains itself, and a caption on it is noise.
 */
export function guidanceFor(field: FieldPlan): string | null {
  if (field.representation !== 'plane' || !field.y) return null;
  return `Further right, ${field.x.label.toLowerCase()} rose; higher up, ${field.y.label.toLowerCase()} rose. `
    + `Size is ${field.size.label.toLowerCase()}. Click one to open it, shift-click to compare.`;
}

/** Whether a subject is among a selection — for the moves that act on one. */
export function inSelection(selection: Subject[], subject: Subject): boolean {
  return selection.some((s) => sameSubject(s, subject));
}

export { instructionLabel };
