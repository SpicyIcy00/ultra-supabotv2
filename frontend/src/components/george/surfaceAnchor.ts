/**
 * IDENTITY, and how it differs from SHAPE.
 *
 * THE FAILURE THIS ANSWERS. `workUnit.continuesWork` decided that a follow-up
 * continued the work above it only when the two reads agreed on the WHOLE
 * scope — window, every filter, and the comparison. That is right for what it
 * was built for (never merging unrelated work) and too strict for refinement,
 * which is the point of a work surface:
 *
 *   "Why?"                    adds compare_to and reads two more metrics
 *   "Compare it with Rockwell" drops the store filter and groups by store
 *   "Show me the products"     adds a grouping
 *
 * All three are the same piece of work. Only the first survived the old test,
 * and the other two appeared as fresh answers with their own headings — which
 * is precisely the "another assistant response" feeling this milestone exists
 * to remove.
 *
 * SO THE SCOPE IS SPLIT IN TWO.
 *
 *   IDENTITY   business, window, and every filter that is not a subject.
 *              Change one and you are measuring something else: last week and
 *              last month are two facts, not two views of one.
 *   SHAPE      the comparison, the grouping, the metric, and WHICH subjects.
 *              Change these and you are looking at the same work differently.
 *
 * SUBJECTS ARE THE SUBTLE ONE, and they are handled by RELATION rather than by
 * equality. Adding Rockwell to OPUS expands the work; narrowing the chain to
 * North Edsa focuses it; swapping OPUS for Magnolia is a different question
 * about a different shop, and Part 11 of the milestone brief says so. Two sets
 * that share nothing are `disjoint` and start their own surface.
 *
 * NOTHING HERE READS PROSE. Every value comes from the arguments a tool
 * accepted or the meta it returned. A question's TEXT is never consulted — the
 * same discipline `continuesWork` already held, kept.
 */
import type { ToolCall } from '../../types/george';
import type { SurfaceAnchor } from './surfaceModel';
import type { WorkUnit, Utterance } from './workUnit';

/**
 * Which business a read belongs to.
 *
 * `metric_domain` is on the meta of every `get_sales` result, read from
 * metrics.yaml `metric_model.registries`. Where a tool does not declare one,
 * the tool itself names the business by construction — a vending read is
 * vending because there is no other table it could have read. The map is the
 * repo's tool list (agent/loop.py TOOL_FUNCTIONS) and nothing is guessed from
 * a store name.
 */
export const TOOL_DOMAIN: Record<string, string> = {
  get_sales: 'retail_sales',
  get_stock: 'inventory',
  get_product: 'inventory',
  get_movement: 'inventory',
  get_dead_stock: 'inventory',
  get_vending: 'vending',
  get_vending_stock: 'vending',
  get_purchasing: 'purchasing',
  get_cost_history: 'purchasing',
  get_brief: 'brief',
};

/** The dimensions a subject may be. A time bucket is not a subject. */
export const SUBJECT_DIMENSIONS = ['store', 'product', 'category'] as const;

/** Filter keys that name a SUBJECT rather than narrowing the population. */
const SUBJECT_FILTERS = ['store', 'product', 'product_id', 'sku', 'category'];

function args(call: ToolCall | undefined): Record<string, unknown> {
  return call?.arguments ?? {};
}

function filtersOf(call: ToolCall | undefined): Record<string, unknown> {
  const f = args(call).filters;
  return f && typeof f === 'object' && !Array.isArray(f) ? (f as Record<string, unknown>) : {};
}

function groupsOf(call: ToolCall | undefined): string[] {
  const g = args(call).group_by;
  if (Array.isArray(g)) return g.map(String);
  if (typeof g === 'string' && g) return [g];
  return [];
}

/**
 * The reads a unit's identity may be taken from.
 *
 * The calls when the unit has them. A stored post whose calls did not survive
 * validation (postShape.storedCalls) has none, but it still DREW something,
 * and each drawn result carries the arguments the loop stored beside its
 * rows — so those stand in, with the same seqs, and the anchor is read from
 * what is on screen rather than from nothing.
 */
export function readsOf(unit: WorkUnit): ToolCall[] {
  if (unit.calls.length > 0) return unit.calls;
  return unit.sources
    .filter((s) => s.arguments !== undefined)
    .map((s) => ({ seq: s.seq, tool: s.tool, arguments: s.arguments ?? {} }));
}

/** The call a unit's identity is taken from: its primary, else its first read. */
export function anchorCall(unit: WorkUnit): ToolCall | undefined {
  const reads = readsOf(unit);
  const primarySeq = unit.findings.find((f) => f.role === 'primary')?.seq;
  return reads.find((c) => c.seq === primarySeq) ?? reads[0];
}

/**
 * The subjects a unit's reads were scoped to, across ALL of its calls.
 *
 * Both halves count, and they are different facts: a `filters.store` names one
 * subject the read was restricted to, and a grouped read over subjects names
 * every subject it returned. Reading all calls rather than the primary's is
 * deliberate — "compare OPUS with Rockwell" may arrive as two scoped reads or
 * as one grouped one, and the surface must recognise both as the same work.
 */
export function subjectsOf(unit: WorkUnit): { subjects: string[]; dimension: string | null } {
  const subjects = new Set<string>();
  let dimension: string | null = null;

  for (const call of readsOf(unit)) {
    const filters = filtersOf(call);
    for (const key of SUBJECT_FILTERS) {
      const v = filters[key];
      if (typeof v === 'string' && v) {
        subjects.add(v);
        dimension = dimension ?? (key === 'sku' || key === 'product_id' ? 'product' : key);
      }
    }
    for (const g of groupsOf(call)) {
      if ((SUBJECT_DIMENSIONS as readonly string[]).includes(g)) dimension = dimension ?? g;
    }
  }
  return { subjects: [...subjects].sort(), dimension };
}

/**
 * What a piece of work is about.
 *
 * The window comes from `meta.window` on the primary result — the tool's own
 * statement of what it measured — and falls back to nothing rather than to the
 * `date_range` argument, because a preset name is not a window and the
 * milestone's reconstruction test compares windows across a reload.
 */
export function anchorOf(unit: WorkUnit): SurfaceAnchor {
  const call = anchorCall(unit);
  const primarySeq = unit.findings.find((f) => f.role === 'primary')?.seq;
  const source =
    unit.sources.find((s) => s.seq === primarySeq) ??
    unit.sources.find((s) => s.seq === call?.seq) ??
    unit.sources[0];

  const filters = filtersOf(call);
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (!SUBJECT_FILTERS.includes(k)) rest[k] = v;
  }

  const { subjects, dimension } = subjectsOf(unit);
  const window = source?.meta.window ?? null;
  const business =
    (typeof source?.meta.metric_domain === 'string' && source.meta.metric_domain) ||
    (call ? TOOL_DOMAIN[call.tool] : undefined) ||
    (source ? TOOL_DOMAIN[source.tool] : undefined) ||
    'unknown';

  return {
    business,
    subjects,
    subjectDimension: dimension,
    window: window ? { ...window } : null,
    filters: rest,
  };
}

/** The part of an anchor that IS its identity, as a comparable value. */
export function identityKey(anchor: SurfaceAnchor): string {
  const w = anchor.window;
  return JSON.stringify([
    anchor.business,
    w ? [w.kind ?? '', w.name ?? '', w.start ?? '', w.end ?? ''] : null,
    Object.entries(anchor.filters).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

/**
 * How a later anchor stands to an earlier one.
 *
 *   same        the identical subjects (or both the whole estate)
 *   expanded    the later read covers everything the earlier did, and more —
 *               or widens to the whole estate, which covers everything
 *   narrowed    the later read is inside the earlier one
 *   disjoint    two subject sets that share nothing: a different question
 *   unrelated   a different business, window, or population filter
 */
export type AnchorRelation = 'same' | 'expanded' | 'narrowed' | 'disjoint' | 'unrelated';

export function anchorRelation(prev: SurfaceAnchor, next: SurfaceAnchor): AnchorRelation {
  if (identityKey(prev) !== identityKey(next)) return 'unrelated';

  const a = new Set(prev.subjects);
  const b = new Set(next.subjects);
  if (a.size === 0 && b.size === 0) return 'same';
  // The whole estate covers every subject in it, whichever side it is on.
  if (a.size === 0) return 'narrowed';
  if (b.size === 0) return 'expanded';

  const shared = [...b].filter((s) => a.has(s));
  if (shared.length === 0) return 'disjoint';
  if (a.size === b.size && shared.length === a.size) return 'same';
  return shared.length === a.size ? 'expanded' : 'narrowed';
}

/** The relations that keep a piece of work one piece of work. */
export const CONTINUING_RELATIONS: readonly AnchorRelation[] = ['same', 'expanded', 'narrowed'];

/**
 * Whether a question and its work belong to the SURFACE above them.
 *
 * DETERMINISTIC AND STRUCTURAL, exactly as `continuesWork` was. Three facts,
 * none of them prose: the question is a REPLY to the work it follows (its
 * post's parent, or the parent the composer sent); the two are in one thread;
 * and the anchors are related. What has changed is only the third — an anchor
 * relation instead of whole-scope equality — so a change of ANALYSIS no longer
 * ends the work while a change of SUBJECT MATTER still does.
 *
 * A unit that read NOTHING and drew nothing — George answered from figures
 * already in the conversation — has no anchor to compare. It stays on the
 * surface it replied to, because that is the work it is about, and it can
 * contribute no evidence that could mislabel it. A unit that drew figures but
 * whose calls cannot be verified against them (postShape.storedCalls returned
 * null) stands alone: a surface is composed from provenance, and a post whose
 * provenance does not reconcile is not admitted to one on the strength of
 * its reply link.
 */
export function belongsToSurface(prev: WorkUnit, question: Utterance, next: WorkUnit): boolean {
  const replyTo = question.post?.parent_id ?? question.parentId ?? null;
  if (!replyTo || replyTo !== prev.id) return false;
  if (prev.post && next.post && prev.post.thread_id !== next.post.thread_id) return false;
  if (next.calls.length === 0 && next.sources.length === 0) return true;
  if (next.calls.length === 0 || readsOf(prev).length === 0) return false;
  return CONTINUING_RELATIONS.includes(anchorRelation(anchorOf(prev), anchorOf(next)));
}

/**
 * The surface's anchor once a later unit has joined it.
 *
 * Subjects union; identity is the surface's own and never moves, because a
 * unit that changed it would not have been admitted. This is what makes
 * "compare it with Rockwell" read as one work: the anchor afterwards covers
 * both shops, so the heading, the refinements and the next continuation all
 * describe what is actually on screen.
 */
export function mergeAnchor(surface: SurfaceAnchor, joining: SurfaceAnchor): SurfaceAnchor {
  const subjects =
    surface.subjects.length === 0 || joining.subjects.length === 0
      ? []
      : [...new Set([...surface.subjects, ...joining.subjects])].sort();
  return {
    ...surface,
    subjects,
    subjectDimension: surface.subjectDimension ?? joining.subjectDimension,
  };
}
