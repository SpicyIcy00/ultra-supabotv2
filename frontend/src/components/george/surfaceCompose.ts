/**
 * The Surface Composer.
 *
 * ONE QUESTION, ASKED EVERY TIME: what is the SMALLEST surface that completely
 * answers this? Not what can be drawn — what has to be. A tool result is not
 * an entitlement to screen space, and until this existed every result that came
 * back got some, which is why "how did OPUS do" arrived as a performance
 * instrument, a chain comparison nobody asked for and four paragraphs.
 *
 * WHAT GOES IN                              WHAT COMES OUT
 *   the work units of one surface             a SurfacePlan (surfaceModel.ts)
 *   the roles George recorded per read
 *   the anchor those reads share
 *
 * FOUR DECISIONS, ALL DETERMINISTIC.
 *
 *   1. ONE FACT, ONE REPRESENTATION, ACROSS THE WHOLE SURFACE. `dedupeSources`
 *      already did this within a turn. Run across the surface's units it does
 *      something new and much more important: when "Why?" re-reads the figure
 *      it is explaining, the re-read is suppressed as a duplicate of the one
 *      already on screen, and only the drivers are added. That is what makes a
 *      refinement DEEPEN the work instead of restating it.
 *
 *   2. RANK, NOT REMOVAL. The primary rung is the answer; drivers and
 *      breakdowns support it; anything else is context. Context is named and
 *      folded — never dropped — because a read the receipts record is work that
 *      happened, and hiding it would be a different kind of lie from showing it
 *      too loudly.
 *
 *   3. BROADER THAN THE ANCHOR IS FOLDED. A surface anchored to one shop that
 *      also holds a chain-wide read shows the shop and folds the chain behind a
 *      line that names it. That is failure 2 of the dogfood, and the rule is
 *      about SCOPE, not about the number of results.
 *
 *   4. ATTENTION IS THE DATA'S, OR ABSENT. A subject is singled out only
 *      because the tool's own figures single it out: it moved against the
 *      direction the majority moved in, or the tool ranked it first under a
 *      change ranking it performed. There is no score, no threshold, no
 *      severity and no confidence anywhere in this file, and no arithmetic at
 *      all — `surfaceViolations` fails a plan carrying a numeral the evidence
 *      does not already carry.
 *
 * NOTHING IS COMPUTED AND NOTHING IS INVENTED. Every figure on the plan lives
 * inside a `ResultSource` a tool returned. This file authors labels from a
 * closed vocabulary and copies subject names, metric labels and window labels
 * verbatim. It is a pure function of its inputs, which is what lets the suite
 * assert that identical trusted input composes identically every time.
 */
import type { Finding, GeorgeNotice } from '../../types/george';
import { composeWork, SECTION_LABEL, SECTION_ORDER, type Composition, type SectionRole } from './composeWork';
import { dedupeSources } from './dedupe';
import { levelLayout, majorityDirection } from './instrumentShape';
import type { ComparisonRow } from './pinShape';
import {
  blockResults,
  storeArgument,
  windowLabel,
  type ResultBlock,
  type ResultSource,
  type ShapedResult,
} from './resultShape';
import { anchorOf, belongsToSurface, mergeAnchor } from './surfaceAnchor';
import { refinementsFor } from './surfaceEvents';
import {
  GOAL_LABEL,
  type SurfaceAnchor,
  type SurfaceAttention,
  type SurfaceGoal,
  type SurfacePlan,
  type SurfaceRank,
  type SurfaceSectionPlan,
  type SurfaceSource,
} from './surfaceModel';
import type { RiverItem, Utterance, WorkUnit } from './workUnit';

/* ------------------------------------------------------------------ pieces -- */

/** One step of a surface: what was asked, and the work that answered it. */
export interface SurfaceStep {
  intent: Utterance | null;
  unit: WorkUnit;
}

/** A living piece of work: its steps, its anchor, and how it is drawn now. */
export interface Surface {
  kind: 'surface';
  /** The id of the unit that opened it. Stable while the surface grows. */
  id: string;
  steps: SurfaceStep[];
  lead: WorkUnit;
  /** The newest unit — its prose is the reading, its state is the surface's. */
  latest: WorkUnit;
  anchor: SurfaceAnchor;
  plan: SurfacePlan;
}

/** What the river renders: a surface, or an entry that is not part of one. */
export type SurfaceEntry = Surface | { kind: 'entry'; item: RiverItem };

/* ------------------------------------------------------------- the sources -- */

export function surfaceSources(steps: SurfaceStep[]): {
  sources: SurfaceSource[];
  findings: Finding[];
} {
  const sources: SurfaceSource[] = [];
  const findings: Finding[] = [];
  let next = 0;

  for (const step of steps) {
    const remap = new Map<number, number>();
    for (const source of step.unit.sources) {
      const seq = next++;
      remap.set(source.seq, seq);
      sources.push({ ...source, seq, unitId: step.unit.id, localSeq: source.seq });
    }
    for (const finding of step.unit.findings) {
      const seq = remap.get(finding.seq);
      if (seq === undefined) continue; // a role on a result that was not drawn
      const of = finding.of === null || finding.of === undefined ? null : remap.get(finding.of) ?? null;
      findings.push({ ...finding, seq, of });
    }
  }
  return { sources, findings };
}

/**
 * The roles that stand for the SURFACE, from the roles that stood per turn.
 *
 * ONE PRIMARY, AND IT IS THE NEWEST THAT SURVIVED. "Why?" re-reads the figure
 * it is explaining; the re-read is suppressed as a duplicate of the one already
 * on screen, and its drivers are RE-HUNG on the surviving figure — the one the
 * dedupe says covers the re-read — so the surface deepens under the fact it
 * already shows. A refinement that reads something genuinely new and calls it
 * the primary — "compare it with Rockwell" — takes the lead, and the earlier
 * primary becomes context, which is exactly what recomposing means.
 *
 * A dependent whose primary is neither the surface's primary nor covered by it
 * keeps no rung to hang off and becomes context. Nothing is dropped: a role
 * that cannot stand becomes the honest one.
 */
export function surfaceFindings(
  findings: Finding[],
  drawn: Set<number>,
  suppressed: { seq: number; coveredBy: number[] }[] = [],
): Finding[] {
  // A suppressed seq resolves to the one seq that shows its fact, when there
  // is exactly one — a coarse table covered by three atoms resolves to none.
  const shownAs = new Map<number, number>();
  for (const s of suppressed) if (s.coveredBy.length === 1) shownAs.set(s.seq, s.coveredBy[0]);
  const resolve = (seq: number | null | undefined): number | null =>
    seq === null || seq === undefined ? null : drawn.has(seq) ? seq : shownAs.get(seq) ?? null;

  const primaries = findings.filter((f) => f.role === 'primary' && resolve(f.seq) !== null);
  const primary = primaries.length ? resolve(primaries[primaries.length - 1].seq) : null;

  const out: Finding[] = [];
  for (const f of findings) {
    if (!drawn.has(f.seq)) continue;
    if (f.role === 'primary') {
      out.push(f.seq === primary ? f : { ...f, role: 'context', of: null });
      continue;
    }
    if (f.role === 'driver' || f.role === 'breakdown') {
      const of = resolve(f.of);
      const stands = primary !== null && of === primary;
      out.push(stands ? { ...f, of } : { ...f, role: 'context', of: null });
      continue;
    }
    out.push(f);
  }
  return out;
}

/* -------------------------------------------------------------------- goal -- */

/**
 * What the work is doing, from what it recorded and what it drew.
 *
 * Read in the order a reader would: a decomposition is an investigation
 * whatever else is on it; a set of headline metrics for one scope is
 * performance; several subjects abreast is a comparison. Nothing consults the
 * question text.
 */
export function goalOf(sections: SurfaceSectionPlan[], anchor: SurfaceAnchor): SurfaceGoal {
  if (sections.length === 0) return 'statement';
  if (sections.some((s) => s.role === 'driver')) return 'investigation';
  const primary = sections.find((s) => s.role === 'primary') ?? sections[0];
  if (primary.instrument === 'performance') return 'performance';
  if (sections.some((s) => s.role === 'breakdown')) return 'breakdown';

  const results = blockResults(primary.blocks);
  const many = results.some(
    (r) =>
      (r.shape.kind === 'comparison' || r.shape.kind === 'ranking') && r.shape.rows.length > 1,
  );
  if (many) return 'comparison';
  if (anchor.subjects.length > 1) return 'comparison';
  return 'listing';
}

/** The heading. Closed vocabulary, a subject list, and the window's own label. */
export function surfaceTitle(goal: SurfaceGoal, anchor: SurfaceAnchor, sources: ResultSource[]): string {
  const parts: string[] = [GOAL_LABEL[goal]];
  if (anchor.subjects.length === 1) parts.push(anchor.subjects[0]);
  else if (anchor.subjects.length > 1 && anchor.subjects.length <= 3) parts.push(anchor.subjects.join(' and '));
  const window = anchor.window ? windowLabel({ window: anchor.window }) : windowLabel(sources[0]?.meta ?? {});
  if (window) parts.push(window);
  return parts.join(' · ');
}

/* --------------------------------------------------------------- sufficiency -- */

/** The subjects one result is actually about, from its arguments and its rows. */
export function sourceSubjects(source: ResultSource): string[] {
  const only = storeArgument(source);
  if (only) return [only];
  const out = new Set<string>();
  for (const row of source.rows) {
    for (const key of ['subject', 'store', 'product', 'category', 'name']) {
      const v = row[key];
      if (typeof v === 'string' && v) out.add(v);
    }
  }
  return [...out];
}

/**
 * Whether a result reaches outside the work's subject.
 *
 * A surface anchored to the whole estate cannot have anything broader than it,
 * so nothing folds there. A surface anchored to one shop folds a read that
 * covers shops it is not about — which is the chain comparison that arrived
 * uninvited under "how did OPUS do last week".
 */
export function broaderThanAnchor(source: ResultSource, anchor: SurfaceAnchor): boolean {
  if (anchor.subjects.length === 0) return false;
  const subjects = sourceSubjects(source);
  if (subjects.length === 0) return false;
  return subjects.some((s) => !anchor.subjects.includes(s));
}

const RANK_OF: Record<SectionRole, SurfaceRank> = {
  primary: 'primary',
  driver: 'supporting',
  breakdown: 'supporting',
  context: 'context',
};

/* --------------------------------------------------------------- attention -- */

function comparisonRows(result: ShapedResult): ComparisonRow[] {
  return result.shape.kind === 'comparison' || result.shape.kind === 'ranking'
    ? result.shape.rows
    : [];
}

/**
 * The subjects the data itself singles out.
 *
 * Two sources, both the tools': a row that moved against the majority
 * direction (`instrumentShape.majorityDirection`, which marks nothing when
 * there is no majority), and the first row of a ranking the TOOL performed by
 * change in the metric's unit. Anything with fewer than two rows establishes
 * no exception and produces nothing.
 */
export function attentionIn(sections: SurfaceSectionPlan[]): SurfaceAttention[] {
  const out: SurfaceAttention[] = [];
  for (const section of sections) {
    if (section.rank === 'context') continue;
    for (const result of blockResults(section.blocks)) {
      const rows = comparisonRows(result);
      if (rows.length < 2) continue;
      if (result.shape.kind === 'ranking') {
        out.push({
          subject: rows[0].subject,
          reason: 'ranked_first',
          direction: rows[0].direction,
          role: section.role,
        });
        continue;
      }
      if (majorityDirection(rows) === null) continue;
      const layout = levelLayout(rows, result.source.meta);
      for (const bar of layout.bars) {
        if (!bar.exception) continue;
        out.push({
          subject: bar.row.subject,
          reason: 'against_the_majority',
          direction: bar.row.direction,
          role: section.role,
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ notices -- */

/** Every caveat the surface's units raised, each said once. */
export function surfaceNotices(steps: SurfaceStep[]): GeorgeNotice[] {
  const seen = new Set<string>();
  const out: GeorgeNotice[] = [];
  for (const step of steps) {
    for (const notice of step.unit.notices) {
      const key = `${notice.kind} ${notice.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(notice);
    }
  }
  return out;
}

/* --------------------------------------------------------------- the plan -- */

export function composeSurface(id: string, steps: SurfaceStep[], anchor: SurfaceAnchor): SurfacePlan {
  const { sources, findings } = surfaceSources(steps);
  const { kept, suppressed } = dedupeSources(sources);
  const drawn = new Set(kept.map((s) => s.seq));
  const roles = surfaceFindings(findings, drawn, suppressed);
  const composition: Composition = composeWork(kept, roles);

  const sections: SurfaceSectionPlan[] = [];
  if (composition.kind === 'structured') {
    for (const section of composition.sections) {
      const rank = RANK_OF[section.role];
      sections.push({
        role: section.role,
        rank,
        label: section.label,
        blocks: section.blocks,
        instrument: section.instrument,
        identity: section.identity,
        folded: rank === 'context' && foldable(section.blocks, anchor),
      });
    }
  } else if (composition.blocks.length > 0) {
    // No role stood. The whole surface is one primary rung — adjacency, byte
    // for byte what it was before any of this existed.
    sections.push({
      role: 'primary',
      rank: 'primary',
      label: SECTION_LABEL.primary,
      blocks: composition.blocks,
      folded: false,
    });
  }
  sections.sort((a, b) => SECTION_ORDER.indexOf(a.role) - SECTION_ORDER.indexOf(b.role));

  const goal = goalOf(sections, anchor);
  const primarySection = sections.find((s) => s.rank === 'primary');
  const primaryResult = primarySection ? blockResults(primarySection.blocks)[0] ?? null : null;

  return {
    id,
    anchor,
    goal,
    title: surfaceTitle(goal, anchor, kept),
    sections,
    attention: composition.kind === 'structured' ? attentionIn(sections) : [],
    refinements: primaryResult ? refinementsFor(primaryResult, anchor) : [],
    notices: surfaceNotices(steps),
    evidence: kept as SurfaceSource[],
    suppressed,
    receipts: steps[steps.length - 1]?.unit.receipts,
  };
}

/** Whether every block of a context section reaches outside the anchor. */
function foldable(blocks: ResultBlock[], anchor: SurfaceAnchor): boolean {
  const results = blockResults(blocks);
  return results.length > 0 && results.every((r) => broaderThanAnchor(r.source, anchor));
}

/* -------------------------------------------------------------- the river -- */

/**
 * The river's items, grouped into the pieces of work they belong to.
 *
 * ONE PASS, IN ORDER. A work unit opens a surface. The question after it, and
 * the work that answers that question, join the surface when
 * `belongsToSurface` says so — a reply, one thread, a related anchor — and
 * otherwise open one of their own. An utterance that opens a surface is kept as
 * the surface's first intent, so nothing is rendered twice and nothing is lost.
 *
 * THE POSTS UNDERNEATH ARE UNTOUCHED. This is presentation: each post keeps its
 * own row in `george.posts`, its own receipts, its own visibility and its own
 * audit. A reload rebuilds the same grouping from the same persisted facts,
 * which is the whole reason none of it is remembered on the client.
 */
export function riverSurfaces(items: RiverItem[]): SurfaceEntry[] {
  const out: SurfaceEntry[] = [];
  let open: { steps: SurfaceStep[]; anchor: SurfaceAnchor; id: string } | null = null;
  /** The utterance waiting for the work it introduces. */
  let pendingIntent: Utterance | null = null;

  const close = () => {
    if (!open) return;
    const surface: Surface = {
      kind: 'surface',
      id: open.id,
      steps: open.steps,
      lead: open.steps[0].unit,
      latest: open.steps[open.steps.length - 1].unit,
      anchor: open.anchor,
      plan: composeSurface(open.id, open.steps, open.anchor),
    };
    out.push(surface);
    open = null;
  };

  const flushIntent = () => {
    if (pendingIntent) out.push({ kind: 'entry', item: pendingIntent });
    pendingIntent = null;
  };

  for (const item of items) {
    if (item.kind === 'utterance') {
      flushIntent();
      pendingIntent = item;
      continue;
    }
    const intent = pendingIntent;
    pendingIntent = null;

    if (open && intent && belongsToSurface(open.steps[open.steps.length - 1].unit, intent, item)) {
      open.steps.push({ intent, unit: item });
      open.anchor = item.calls.length ? mergeAnchor(open.anchor, anchorOf(item)) : open.anchor;
      continue;
    }
    close();
    open = { steps: [{ intent, unit: item }], anchor: anchorOf(item), id: item.id };
  }
  close();
  flushIntent();
  return out;
}
