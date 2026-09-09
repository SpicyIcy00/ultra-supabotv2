/**
 * What a result lets you do next — and only what the definitions permit.
 *
 * OPERABLE OUTPUT WITHOUT A SECOND DATA PATH. An action here is a pre-typed
 * QUESTION in business words, asked through the ordinary loop, so its answer
 * arrives with receipts, notices and a pin like any other. Nothing runs a
 * tool directly and nothing bypasses validation.
 *
 * VALID BY DEFINITIONS, OR ABSENT. get_sales puts `valid_group_by` and
 * `drivers` on its meta, read from metrics.yaml. "By store" is offered only
 * when the metric may be grouped by store; "Why?" only when the metric
 * declares drivers and was compared. A follow-up the definitions would refuse
 * is not offered — absent, not present-and-refusing. Nothing here is decided
 * from a name, a guess, or prose.
 *
 * ONE SEAM (2026-09-09). The decision and the wording now live in
 * surfaceEvents.ts as semantic instructions; this is the same list for a
 * caller that holds ONE result and no surface. The anchor it hands over is the
 * result's own store scope, so a lone entry and a surface phrase the same
 * question identically.
 */
import type { ShapedResult } from './resultShape';
import { storeArgument } from './resultShape';
import { refinementsFor, subjectRefinement } from './surfaceEvents';
import type { SurfaceAnchor } from './surfaceModel';

export interface ContextAction {
  label: string;
  question: string;
}

/** The anchor one result implies: its store scope, and nothing guessed. */
function anchorOfResult(result: ShapedResult): SurfaceAnchor {
  const store = storeArgument(result.source);
  return {
    business: 'retail_sales',
    subjects: store ? [store] : [],
    subjectDimension: store ? 'store' : null,
    window: result.source.meta.window ?? null,
    filters: {},
  };
}

/** The actions for one PRIMARY result. */
export function actionsFor(result: ShapedResult): ContextAction[] {
  return refinementsFor(result, anchorOfResult(result)).map(({ label, question }) => ({ label, question }));
}

/** A row's own action: the same question, narrowed to that subject. */
export function subjectAction(result: ShapedResult, subject: string): ContextAction | null {
  const r = subjectRefinement(result, subject, anchorOfResult(result));
  return r ? { label: r.label, question: r.question } : null;
}
