/**
 * The desk composer: from a surface plan and what the person has done to it,
 * the LAYOUT the workspace draws.
 *
 * WHAT THIS ADDS ABOVE THE SURFACE COMPOSER. surfaceCompose decides what the
 * smallest surface is — which result is the primary fact, which support it,
 * which are context, what the data singles out. It says nothing about SPACE:
 * a plan is sections in reading order, and drawn as such it is a document.
 * This file gives the plan a place: one stage in the centre, what recedes to
 * the edge, and which subject is under the person's hand.
 *
 * A CLOSED GRAMMAR, DERIVED. The workspace is in exactly one stage, and the
 * stage is read off the state of the work and the selection — never chosen
 * by the model, which has no channel here:
 *
 *   field      subjects as objects, positioned by figures the tool returned
 *   anatomy    one subject: its primary figure and the drivers the
 *              definitions declare, with a breakdown beneath when one exists
 *   compare    two or more subjects abreast, or one store's products beside
 *              another's
 *   figures    what the grammar cannot yet stage, drawn by the primitives
 *   statement  nothing was drawn; the reading stands alone
 *
 * A FIELD ENCODES ONLY WHAT ROWS CARRY (metrics.yaml surface.desk.field).
 * Position is a change the tool computed, or a value it returned; size is a
 * value; fill is the tool's own direction; a halo is the composer's attention
 * or the person's selection. Nothing on it is computed — the drivers are rows
 * of two more reads the definitions name, matched to the store by the id the
 * rows carry.
 *
 * THE CONVENTIONAL DRAWING WINS BY DEFAULT (2026-09-09). A ranked comparison
 * of seven stores is read in seconds and keeps every label; a plane costs the
 * reader two axes and a size legend before it says anything. So `ranked` is
 * the default and the plane has to EARN its second axis: it is used only when
 * the two driver changes disagree across subjects — when they fall into more
 * than one quadrant. If every subject sits in one quadrant, both drivers moved
 * the same way for everyone and the ranked list says exactly that in one
 * dimension. That is a structural test on rows, not a score: it reads the
 * SIGN of a change the tool already computed and counts the quadrants
 * (metrics.yaml surface.desk.representation).
 *
 * NOTHING IS COMPUTED AND NOTHING IS INVENTED. Every figure in a layout is a
 * row's field, reached by seq and row index. Choosing the larger of two
 * percentages the tool returned is a reading, not a calculation, and the
 * definitions say so (investigation.driver_reading: qualitative). No score,
 * no threshold, no share. This is a pure function, so a reload composes the
 * same layout from the same posts and the suite can say so.
 */
import type { GeorgeNotice, ToolMeta } from '../../types/george';
import type { ComparisonRow } from '../george/pinShape';
import {
  blockResults,
  storeArgument,
  windowLabel,
  type ResultBlock,
  type ShapedResult,
} from '../george/resultShape';
import type { Surface } from '../george/surfaceCompose';
import type {
  SurfaceAnchor,
  SurfaceAttention,
  SurfaceRefinement,
  SurfaceSectionPlan,
} from '../george/surfaceModel';
import type { SectionRole } from '../george/composeWork';
import { levelCaveats, type Caveat } from './caveats';
import { conclusionOf } from './conclusion';
import { guidanceFor } from './initiative';
import { focusOf, type DeskState } from './deskState';
import {
  dimensionOf,
  sameSubject,
  subjectFromLabel,
  subjectKey,
  subjectOfRow,
  type Dimension,
  type Subject,
} from './subject';

/* ------------------------------------------------------------------ types -- */

export type Direction = 'up' | 'down' | 'flat' | null;

/** One figure off one row: everything printed beside an object or in an anatomy. */
export interface Figure {
  label: string;
  value: number | null;
  baseline?: number;
  change?: number;
  changePct: number | null;
  direction: Direction;
  unit?: string;
  baselineStatus?: string;
  /** Where it came from: the source's seq and the row within it. */
  seq: number;
  rowIndex: number;
  meta: ToolMeta;
}

export type FieldEncoding = 'plane' | 'change' | 'level';

/**
 * How a field is DRAWN, as opposed to what it encodes.
 *
 * `ranked` is the conventional instrument — one row per subject, its label,
 * its bar, its figure and its delta — and it is the default. `plane` is the
 * spatial field, and it is used only where the second axis separates subjects
 * the first does not.
 */
export type Representation = 'ranked' | 'plane';

export interface FieldAxis {
  key: 'change_pct' | 'change' | 'value';
  /** The metric's own display name, from meta. */
  label: string;
  unit?: string;
}

export interface FieldObject {
  subject: Subject;
  /** The headline figure: what sizes the object and is printed beside it. */
  figure: Figure;
  /** The driver figures for a plane, in the definitions' order. */
  drivers: Figure[];
  /** Position, in the units of the axes; null puts the object in the unranked lane. */
  x: number | null;
  y: number | null;
  attention: SurfaceAttention['reason'] | null;
}

export interface FieldPlan {
  dimension: Dimension;
  encoding: FieldEncoding;
  /** Which drawing the composer chose, and why it is allowed to. */
  representation: Representation;
  /** Why a plane was NOT used, when one could have been. For the record. */
  planeDeclined: string | null;
  x: FieldAxis;
  y: FieldAxis | null;
  size: FieldAxis;
  objects: FieldObject[];
  /** Objects with no position: the tool could not compare them. Named, never at zero. */
  unranked: FieldObject[];
  /** The result whose rows the objects are; its meta is the field's receipts. */
  headline: ShapedResult;
  /** The driver results, for a plane. */
  driverResults: ShapedResult[];
  /** "Net sales · Last week · vs previous period" */
  caption: string;
  /** The store the field is scoped to, when it is a breakdown within one. */
  within: string | null;
  /** Every seq drawn on this field. */
  seqs: number[];
}

export interface AnatomyPlan {
  subject: Subject;
  headline: Figure;
  drivers: Figure[];
  /**
   * The driver whose measured change is larger in magnitude — a reading of
   * two figures the tool returned, never a share. Null when there are not
   * two, when either lacks a delta, or when they are equal.
   */
  stronger: number | null;
  /** The definitions' identity for the drivers, when George recorded one. */
  identity: string | null;
}

export type Stage =
  | { kind: 'field'; field: FieldPlan }
  | { kind: 'anatomy'; anatomy: AnatomyPlan; breakdown: FieldPlan | null }
  | { kind: 'compare'; subjects: AnatomyPlan[]; fields: FieldPlan[] }
  | { kind: 'figures'; blocks: ResultBlock[] }
  | { kind: 'statement' };

export type Receded =
  | { kind: 'field'; field: FieldPlan }
  | { kind: 'section'; section: SurfaceSectionPlan };

export type Level = 'business' | 'subject' | 'breakdown';

export interface DeskLayout {
  grammar: 'investigate';
  title: string;
  /**
   * George's reading of the figures, in one sentence carrying no numeral.
   * Derived from the tool's own directions and the qualitative driver
   * reading the definitions fix (conclusion.ts). Null when there is nothing
   * a reader could not see at a glance.
   */
  conclusion: string | null;
  /**
   * How to read the drawing, when it is one a person has not met. One line,
   * attached to it. Null for a conventional representation, which explains
   * itself and where a caption would be noise.
   */
  guidance: string | null;
  /** The subjects in scope, narrowest last: ["North Edsa"], ["North Edsa", "Mango Gummy"]. */
  scope: string[];
  level: Level;
  stage: Stage;
  receded: Receded[];
  attention: SurfaceAttention[];
  attentionLine: string | null;
  notices: GeorgeNotice[];
  /**
   * The notices, levelled by what they cost the reader (caveats.ts). The
   * answer draws them by level; the raw statuses stay in the inspector.
   */
  caveats: Caveat[];
  refinements: SurfaceRefinement[];
  /** The meta of the figure under the person's hand, for questions and receipts. */
  headlineMeta: ToolMeta | null;
  anchor: SurfaceAnchor | null;
  /**
   * The definitions' identity for the drivers, as George recorded it on the
   * primary read: "net_sales = transaction_count x average_transaction_value".
   * Carried here so a per-subject reading can be composed without going back
   * to the surface for it.
   */
  identity: string | null;
  focus: Subject | null;
  selection: Subject[];
  /** A deterministic summary: same posts, same fingerprint. */
  fingerprint: string;
}

/* ----------------------------------------------------------------- rows -- */

function figureOf(result: ShapedResult, rowIndex: number, label: string): Figure {
  const row = result.source.rows[rowIndex] ?? {};
  const pct = typeof row.change_pct === 'number' ? row.change_pct : null;
  const direction: Direction =
    row.direction === 'up' || row.direction === 'down' || row.direction === 'flat'
      ? row.direction
      : pct === null ? null : pct >= 0 ? 'up' : 'down';
  return {
    label,
    value: typeof row.value === 'number' ? row.value : null,
    baseline: typeof row.baseline === 'number' ? row.baseline : undefined,
    change: typeof row.change === 'number' ? row.change : undefined,
    changePct: pct,
    direction,
    unit: typeof row.unit === 'string' ? row.unit : result.source.meta.metric_unit,
    baselineStatus: typeof row.baseline_status === 'string' ? row.baseline_status : undefined,
    seq: result.source.seq,
    rowIndex,
    meta: result.source.meta,
  };
}

function metricLabel(result: ShapedResult): string {
  const meta = result.source.meta;
  if (meta.metric_label) return meta.metric_label;
  if (meta.metric) return meta.metric.replace(/_/g, ' ');
  return 'value';
}

/** The row of a result that is about a subject, by the id the rows carry. */
function rowIndexFor(result: ShapedResult, subject: Subject, dimension: Dimension): number {
  return result.source.rows.findIndex((row) => {
    const s = subjectOfRow(row, dimension);
    return s !== null && sameSubject(s, subject);
  });
}

function isRanking(result: ShapedResult): boolean {
  const mode = result.source.meta.comparison?.rank_by;
  return mode === 'biggest_drop' || mode === 'biggest_gain';
}

function hasDelta(result: ShapedResult): boolean {
  return result.source.rows.some((r) => typeof r.change_pct === 'number');
}

function captionOf(result: ShapedResult): string {
  const meta = result.source.meta;
  const parts = [metricLabel(result)];
  const w = windowLabel(meta);
  if (w) parts.push(w);
  if (meta.comparison?.baseline) parts.push(`vs ${meta.comparison.display_name ?? 'the previous period'}`);
  return parts.join(' · ');
}

/* ------------------------------------------------------- representation -- */

/** Bounds on a plane, from the definitions. Below or above, a list is better. */
export const PLANE_MIN_SUBJECTS = 3;
export const PLANE_MAX_SUBJECTS = 24;

/**
 * Which quadrant of (driver one, driver two) an object sits in.
 *
 * The SIGN of two changes the tool computed, and nothing else — no magnitude,
 * no threshold, no arithmetic on figures. A subject with either change missing
 * has no quadrant and is not counted.
 */
export function quadrantOf(object: FieldObject): string | null {
  const x = object.x;
  const y = object.y;
  if (x === null || y === null) return null;
  return `${x >= 0 ? '+' : '-'}${y >= 0 ? '+' : '-'}`;
}

/**
 * Whether a plane's second axis earns itself: do the subjects fall into more
 * than one quadrant?
 *
 * One quadrant means both drivers moved the same way for every subject, and a
 * ranked list says that in one dimension with its labels intact. Two or more
 * means the mix IS the finding — some shops selling more baskets, some selling
 * dearer ones — and that is what a plane shows and a bar cannot.
 */
export function planeEarnsItsPlace(objects: FieldObject[]): boolean {
  if (objects.length < PLANE_MIN_SUBJECTS || objects.length > PLANE_MAX_SUBJECTS) return false;
  const quadrants = new Set<string>();
  for (const o of objects) {
    const q = quadrantOf(o);
    if (q) quadrants.add(q);
  }
  return quadrants.size > 1;
}

/** Why the plane was declined, in words, when it could have been drawn. */
export function planeDeclinedReason(objects: FieldObject[]): string | null {
  if (objects.length < PLANE_MIN_SUBJECTS) return 'too few subjects to read as a field';
  if (objects.length > PLANE_MAX_SUBJECTS) return 'too many subjects to read as a field';
  if (planeEarnsItsPlace(objects)) return null;
  return 'every subject moved the same way on both drivers, so a second axis separates nothing';
}

/* ---------------------------------------------------------------- fields -- */

/**
 * A field over one dimension, from the results grouped by it.
 *
 * The headline is the primary fact where George said which; otherwise the
 * first read, which is the order he did the work in. A plane needs both
 * declared drivers present as reads over the same dimension; anything less
 * is a single axis, and a read with no comparison positions by level.
 */
export function fieldFrom(
  results: ShapedResult[],
  dimension: Dimension,
  roles: Map<number, SectionRole>,
  attention: SurfaceAttention[],
  within: string | null = null,
): FieldPlan | null {
  if (results.length === 0) return null;
  const headline = results.find((r) => roles.get(r.source.seq) === 'primary') ?? results[0];
  // Attention is the HEADLINE's: a store that moved against the rest in a
  // driver read is a fact about that driver, and the field is sized and
  // filled by the headline. The composer records the section each came from.
  const headlineRole = roles.get(headline.source.seq) ?? 'primary';
  const marks = attention.filter((a) => a.role === headlineRole);
  const declared = headline.source.meta.drivers ?? [];
  const driverResults = declared
    .map((m) => results.find((r) => r !== headline && r.source.meta.metric === m))
    .filter((r): r is ShapedResult => Boolean(r));

  const encoding: FieldEncoding =
    driverResults.length === 2 ? 'plane' : hasDelta(headline) || isRanking(headline) ? 'change' : 'level';
  const changeKey: FieldAxis['key'] = isRanking(headline) ? 'change' : 'change_pct';
  const unit = headline.source.meta.metric_unit;
  const x: FieldAxis =
    encoding === 'plane'
      ? { key: 'change_pct', label: metricLabel(driverResults[0]), unit: driverResults[0].source.meta.metric_unit }
      : encoding === 'change'
        ? { key: changeKey, label: metricLabel(headline), unit }
        : { key: 'value', label: metricLabel(headline), unit };
  const y: FieldAxis | null =
    encoding === 'plane'
      ? { key: 'change_pct', label: metricLabel(driverResults[1]), unit: driverResults[1].source.meta.metric_unit }
      : null;

  const objects: FieldObject[] = [];
  const unranked: FieldObject[] = [];
  headline.source.rows.forEach((row, i) => {
    const subject = subjectOfRow(row, dimension);
    if (!subject) return;
    const figure = figureOf(headline, i, metricLabel(headline));
    const drivers = driverResults.map((d) => {
      const j = rowIndexFor(d, subject, dimension);
      return j >= 0 ? figureOf(d, j, metricLabel(d)) : null;
    });
    let px: number | null;
    let py: number | null = null;
    if (encoding === 'plane') {
      px = drivers[0]?.changePct ?? null;
      py = drivers[1]?.changePct ?? null;
    } else if (encoding === 'change') {
      px = changeKey === 'change' ? figure.change ?? null : figure.changePct;
    } else {
      px = figure.value;
    }
    const object: FieldObject = {
      subject,
      figure,
      drivers: drivers.filter((d): d is Figure => d !== null),
      x: px,
      y: py,
      attention: marks.find((a) => a.subject === subject.label)?.reason ?? null,
    };
    if (px === null || (encoding === 'plane' && py === null)) unranked.push(object);
    else objects.push(object);
  });

  // The drawing. A plane only where its second axis separates subjects the
  // first does not; the conventional ranked comparison otherwise.
  const couldBePlane = encoding === 'plane';
  const earns = couldBePlane && planeEarnsItsPlace(objects);
  const representation: Representation = earns ? 'plane' : 'ranked';
  const planeDeclined = couldBePlane && !earns ? planeDeclinedReason(objects) : null;

  return {
    dimension,
    encoding,
    representation,
    planeDeclined,
    x,
    y,
    size: { key: 'value', label: metricLabel(headline), unit },
    objects,
    unranked,
    headline,
    driverResults,
    caption: captionOf(headline),
    within,
    seqs: [headline, ...driverResults].map((r) => r.source.seq),
  };
}

/** The larger measured move of two, as an index — or null when there is no reading. */
export function strongerDriver(drivers: Figure[]): number | null {
  if (drivers.length < 2) return null;
  const a = drivers[0].changePct;
  const b = drivers[1].changePct;
  if (a === null || b === null || Math.abs(a) === Math.abs(b)) return null;
  return Math.abs(a) > Math.abs(b) ? 0 : 1;
}

/** One subject's anatomy, sliced from a field's rows by id. */
export function anatomyFromField(field: FieldPlan, subject: Subject, identity: string | null): AnatomyPlan | null {
  const object = [...field.objects, ...field.unranked].find((o) => sameSubject(o.subject, subject));
  if (!object) return null;
  return {
    subject: object.subject,
    headline: object.figure,
    drivers: object.drivers,
    stronger: strongerDriver(object.drivers),
    identity: object.drivers.length ? identity : null,
  };
}

/**
 * One subject's anatomy from reads scoped to it: single compared figures,
 * the headline first and the declared drivers after it.
 */
export function anatomyFromScoped(
  members: ShapedResult[],
  subject: Subject,
  roles: Map<number, SectionRole>,
  identity: string | null,
): AnatomyPlan | null {
  const singles = members.filter((m) => m.source.rows.length === 1);
  if (singles.length === 0) return null;
  const headline = singles.find((m) => roles.get(m.source.seq) === 'primary') ?? singles[0];
  const declared = headline.source.meta.drivers ?? [];
  const drivers = declared
    .map((m) => singles.find((r) => r !== headline && r.source.meta.metric === m))
    .filter((r): r is ShapedResult => Boolean(r))
    .map((r) => figureOf(r, 0, metricLabel(r)));
  return {
    subject,
    headline: figureOf(headline, 0, metricLabel(headline)),
    drivers,
    stronger: strongerDriver(drivers),
    identity: drivers.length ? identity : null,
  };
}

/* ------------------------------------------------------------- attention -- */

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What the data singles out, in words. A characterisation of rows: the
 * subject and the fact the tool established, and never a figure.
 */
export function attentionWords(attention: SurfaceAttention[]): string | null {
  if (attention.length === 0) return null;
  // Each subject once per reason: the composer records a mark per section it
  // found it in, and a store singled out in three reads is one store.
  const seen = new Set<string>();
  const once = attention.filter((a) => {
    const key = `${a.reason}:${a.subject}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const against = once.filter((a) => a.reason === 'against_the_majority');
  const first = once.filter((a) => a.reason === 'ranked_first');
  const parts: string[] = [];
  if (against.length > 0) {
    const verb = against.every((a) => a.direction === 'down') ? 'fell'
      : against.every((a) => a.direction === 'up') ? 'rose' : 'moved';
    parts.push(`${joinNames(against.map((a) => a.subject))} ${verb} while the rest moved the other way.`);
  }
  for (const a of first) {
    parts.push(`${a.subject} is the largest measured ${a.direction === 'down' ? 'fall' : a.direction === 'up' ? 'rise' : 'change'}.`);
  }
  return parts.join(' ');
}

/* -------------------------------------------------------------- the desk -- */

function rolesOf(plan: Surface['plan']): Map<number, SectionRole> {
  const roles = new Map<number, SectionRole>();
  for (const section of plan.sections) {
    for (const r of blockResults(section.blocks)) roles.set(r.source.seq, section.role);
  }
  return roles;
}

/**
 * The definitions' identity for the drivers, as George recorded it on the
 * primary finding — read from metrics.yaml by the loop, never written by the
 * model (agent/findings.py). The newest step that recorded one wins; a plan
 * section carries it only when a driver split was drawn, so the findings
 * themselves are the source.
 */
function identityOf(surface: Surface): string | null {
  for (let i = surface.steps.length - 1; i >= 0; i--) {
    const found = surface.steps[i].unit.findings.find((f) => f.role === 'primary' && f.identity);
    if (found?.identity) return found.identity;
  }
  return surface.plan.sections.find((s) => s.identity)?.identity ?? null;
}

const MAX_COMPARED = 4;

/** The empty desk: nothing to draw, nothing selected. */
export function emptyLayout(): DeskLayout {
  return {
    grammar: 'investigate',
    title: '',
    conclusion: null,
    guidance: null,
    scope: [],
    level: 'business',
    identity: null,
    stage: { kind: 'statement' },
    receded: [],
    attention: [],
    attentionLine: null,
    notices: [],
    caveats: [],
    refinements: [],
    headlineMeta: null,
    anchor: null,
    focus: null,
    selection: [],
    fingerprint: 'empty',
  };
}

/**
 * The layout of a piece of work under a person's hand.
 *
 * Reads the plan's unfolded sections; folds the folded ones into `receded`,
 * named. Then, in order: products of two or more stores compare; a store
 * field with two or more stores selected compares them; a store field with
 * one store focused becomes that store's anatomy over the receded field, with
 * its breakdown beneath when one was read; reads scoped to one store are its
 * anatomy; a product field stands as a field; anything else is drawn by the
 * primitives as figures, or as a statement when nothing was drawn.
 */
export function composeDesk(surface: Surface | null, state: DeskState): DeskLayout {
  if (!surface) return emptyLayout();
  const plan = surface.plan;
  const roles = rolesOf(plan);
  const identity = identityOf(surface);
  const shown = plan.sections.filter((s) => !s.folded).flatMap((s) => blockResults(s.blocks));
  const receded: Receded[] = plan.sections.filter((s) => s.folded).map((section) => ({ kind: 'section', section }));

  const byDimension = (d: Dimension) => shown.filter((r) => dimensionOf(r.source) === d);
  const storeResults = byDimension('store');
  const productLike = [...byDimension('product'), ...byDimension('category')];
  const scoped = shown.filter((r) => r.source.rows.length === 1 && dimensionOf(r.source) === null);

  // Breakdown fields, by the store they were read within (null = the estate).
  const byStore = new Map<string | null, ShapedResult[]>();
  for (const r of productLike) {
    const key = storeArgument(r.source) ?? null;
    byStore.set(key, [...(byStore.get(key) ?? []), r]);
  }
  const breakdownFor = (store: string | null): FieldPlan | null => {
    const results = byStore.get(store);
    if (!results?.length) return null;
    const dim = dimensionOf(results[0].source) ?? 'product';
    return fieldFrom(results.filter((r) => dimensionOf(r.source) === dim), dim, roles, plan.attention, store);
  };
  // The stores with a breakdown, in the order the work reached them — the
  // evidence is numbered in step order, so the first read's store comes first
  // and "compare that with Magnolia" keeps the store it started from on the left.
  const firstSeq = (store: string) => Math.min(...(byStore.get(store) ?? []).map((r) => r.source.seq));
  const storeFields = [...byStore.keys()]
    .filter((k): k is string => k !== null)
    .sort((a, b) => firstSeq(a) - firstSeq(b));

  const focus = focusOf(state);
  const selection = state.selection;
  const multi = selection.length >= 2 ? selection : [];
  const estate = storeResults.length ? fieldFrom(storeResults, 'store', roles, plan.attention) : null;

  let stage: Stage;
  let level: Level = 'business';
  let scope: string[] = [];
  let headlineMeta: ToolMeta | null = null;

  // 1. Products of two or more stores: a comparison of fields.
  const comparedStores = multi.length && multi[0].dimension === 'store'
    ? storeFields.filter((s) => multi.some((m) => m.label === s))
    : storeFields;
  if (storeFields.length >= 2 && comparedStores.length >= 2) {
    const fields = comparedStores.slice(0, MAX_COMPARED).map((s) => breakdownFor(s)).filter((f): f is FieldPlan => f !== null);
    stage = { kind: 'compare', subjects: [], fields };
    level = 'breakdown';
    scope = comparedStores.slice(0, MAX_COMPARED);
    headlineMeta = fields[0]?.headline.source.meta ?? null;
    if (estate) receded.unshift({ kind: 'field', field: estate });
  } else if (estate && multi.length >= 2 && multi[0].dimension === 'store') {
    // 2. Two or more stores selected on the estate: abreast.
    const subjects = multi
      .map((s) => anatomyFromField(estate, s, identity))
      .filter((a): a is AnatomyPlan => a !== null)
      .slice(0, MAX_COMPARED);
    if (subjects.length >= 2) {
      stage = { kind: 'compare', subjects, fields: [] };
      level = 'subject';
      scope = subjects.map((s) => s.subject.label);
      headlineMeta = estate.headline.source.meta;
      receded.unshift({ kind: 'field', field: estate });
    } else {
      stage = { kind: 'field', field: estate };
      headlineMeta = estate.headline.source.meta;
    }
  } else if (estate && focus?.dimension === 'store') {
    // 3. One store focused on the estate: its anatomy, the estate receded.
    // Reads scoped to the store come first when George made them — they
    // carry the roles he recorded — and the estate's own rows otherwise, so a
    // click needs no read at all.
    const anatomy =
      anatomyFromScoped(scoped.filter((r) => storeArgument(r.source) === focus.label), focus, roles, identity) ??
      anatomyFromField(estate, focus, identity);
    if (anatomy) {
      const breakdown = breakdownFor(focus.label) ?? breakdownFor(null);
      stage = { kind: 'anatomy', anatomy, breakdown };
      level = breakdown ? 'breakdown' : 'subject';
      scope = [anatomy.subject.label];
      headlineMeta = anatomy.headline.meta;
      receded.unshift({ kind: 'field', field: estate });
    } else {
      stage = { kind: 'field', field: estate };
      headlineMeta = estate.headline.source.meta;
    }
  } else if (estate) {
    stage = { kind: 'field', field: estate };
    headlineMeta = estate.headline.source.meta;
  } else if (scoped.length > 0) {
    // 4. Reads scoped to one store: its anatomy, with its breakdown beneath.
    const label = storeArgument(scoped[0].source) ?? plan.anchor.subjects[0] ?? null;
    const subject = label ? subjectFromLabel('store', label) : null;
    const anatomy = subject ? anatomyFromScoped(scoped, subject, roles, identity) : null;
    if (anatomy && subject) {
      const breakdown = breakdownFor(subject.label) ?? breakdownFor(null);
      const productFocus = focus?.dimension === 'product' || focus?.dimension === 'category' ? focus : null;
      const productMulti = multi.length && multi[0].dimension !== 'store' ? multi : [];
      if (breakdown && productMulti.length >= 2) {
        const subjects = productMulti
          .map((s) => anatomyFromField(breakdown, s, null))
          .filter((a): a is AnatomyPlan => a !== null)
          .slice(0, MAX_COMPARED);
        stage = subjects.length >= 2
          ? { kind: 'compare', subjects, fields: [] }
          : { kind: 'anatomy', anatomy, breakdown };
        level = 'breakdown';
        scope = [subject.label, ...subjects.map((s) => s.subject.label)];
        headlineMeta = breakdown.headline.source.meta;
        receded.unshift({ kind: 'field', field: breakdown });
      } else if (breakdown && productFocus) {
        const inner = anatomyFromField(breakdown, productFocus, null);
        stage = inner ? { kind: 'anatomy', anatomy: inner, breakdown: null } : { kind: 'anatomy', anatomy, breakdown };
        level = 'breakdown';
        scope = inner ? [subject.label, inner.subject.label] : [subject.label];
        headlineMeta = inner ? inner.headline.meta : anatomy.headline.meta;
        receded.unshift({ kind: 'field', field: breakdown });
      } else {
        stage = { kind: 'anatomy', anatomy, breakdown };
        level = breakdown ? 'breakdown' : 'subject';
        scope = [subject.label];
        headlineMeta = anatomy.headline.meta;
      }
    } else {
      stage = { kind: 'figures', blocks: plan.sections.filter((s) => !s.folded).flatMap((s) => s.blocks) };
      headlineMeta = shown[0]?.source.meta ?? null;
    }
  } else if (byStore.size > 0) {
    // 5. A breakdown with nothing above it: a field over products or categories.
    const within = storeFields[0] ?? null;
    const field = breakdownFor(within);
    if (field) {
      const productMulti = multi.length && multi[0].dimension === field.dimension ? multi : [];
      const productFocus = focus && focus.dimension === field.dimension ? focus : null;
      if (productMulti.length >= 2) {
        const subjects = productMulti
          .map((s) => anatomyFromField(field, s, null))
          .filter((a): a is AnatomyPlan => a !== null)
          .slice(0, MAX_COMPARED);
        stage = subjects.length >= 2 ? { kind: 'compare', subjects, fields: [] } : { kind: 'field', field };
        receded.unshift({ kind: 'field', field });
      } else if (productFocus) {
        const inner = anatomyFromField(field, productFocus, null);
        stage = inner ? { kind: 'anatomy', anatomy: inner, breakdown: null } : { kind: 'field', field };
        if (inner) receded.unshift({ kind: 'field', field });
      } else {
        stage = { kind: 'field', field };
      }
      level = within ? 'breakdown' : 'business';
      scope = within ? [within] : [];
      headlineMeta = field.headline.source.meta;
    } else {
      stage = { kind: 'figures', blocks: plan.sections.filter((s) => !s.folded).flatMap((s) => s.blocks) };
      headlineMeta = shown[0]?.source.meta ?? null;
    }
  } else if (shown.length > 0) {
    stage = { kind: 'figures', blocks: plan.sections.filter((s) => !s.folded).flatMap((s) => s.blocks) };
    headlineMeta = shown[0]?.source.meta ?? null;
    scope = plan.anchor.subjects.slice(0, 3);
  } else {
    stage = { kind: 'statement' };
    scope = plan.anchor.subjects.slice(0, 3);
  }

  // The drawing on the stage, for the guidance that has to be attached to it.
  const drawn: FieldPlan | null =
    stage.kind === 'field' ? stage.field
      : stage.kind === 'anatomy' ? stage.breakdown
        : stage.kind === 'compare' ? stage.fields[0] ?? null
          : null;

  // The dimension a caveat's subjects are of, so it can name them.
  const dimension = drawn?.dimension ?? (stage.kind === 'anatomy' ? stage.anatomy.subject.dimension : null);

  const layout: DeskLayout = {
    grammar: 'investigate',
    title: plan.title,
    // George's reading of the anatomy on screen — one sentence, no numeral.
    conclusion:
      stage.kind === 'anatomy' ? conclusionOf(stage.anatomy)
        : stage.kind === 'compare' && stage.subjects.length > 0 ? conclusionOf(stage.subjects[0])
          : null,
    guidance: drawn ? guidanceFor(drawn) : null,
    scope,
    level,
    stage,
    receded,
    attention: plan.attention,
    attentionLine: attentionWords(plan.attention),
    notices: plan.notices,
    caveats: levelCaveats(plan.notices, plan.evidence.map((e) => e.meta), dimension),
    refinements: plan.refinements,
    headlineMeta,
    anchor: plan.anchor,
    identity,
    focus,
    selection,
    fingerprint: '',
  };
  layout.fingerprint = fingerprintOf(layout);
  return layout;
}

/** The layout, summarised deterministically: stage, subjects in order, scope, level, title. */
export function fingerprintOf(layout: DeskLayout): string {
  const stage = layout.stage;
  const subjects =
    stage.kind === 'field' ? stage.field.objects.map((o) => subjectKey(o.subject))
    : stage.kind === 'anatomy' ? [subjectKey(stage.anatomy.subject), ...(stage.breakdown?.objects.map((o) => subjectKey(o.subject)) ?? [])]
    : stage.kind === 'compare' ? [...stage.subjects.map((s) => subjectKey(s.subject)), ...stage.fields.flatMap((f) => f.objects.map((o) => subjectKey(o.subject)))]
    : stage.kind === 'figures' ? blockResults(stage.blocks).map((r) => String(r.source.seq))
    : [];
  const representation =
    stage.kind === 'field' ? stage.field.representation
      : stage.kind === 'anatomy' ? stage.breakdown?.representation ?? 'anatomy'
        : stage.kind === 'compare' ? stage.fields[0]?.representation ?? 'compare'
          : stage.kind;
  return JSON.stringify([stage.kind, representation, layout.level, layout.title, layout.scope, subjects,
    layout.receded.map((r) => (r.kind === 'field' ? `field:${r.field.dimension}` : `section:${r.section.role}`))]);
}

/* --------------------------------------------------------- reading light -- */

/**
 * The subjects George is reading RIGHT NOW, from the calls in flight.
 *
 * A call scoped to one store names that store; a call grouped by the field's
 * own dimension names every object on it; anything else names nothing. Read
 * off `tool_call` frames and their arguments — never a guess, never a name
 * from prose — so the light on the desk is where George actually is, and
 * there is no light when no call is out (metrics.yaml surface.desk.presence).
 */
export function readingSubjects(
  running: { tool: string; arguments?: Record<string, unknown> }[],
  field: FieldPlan | null,
): Subject[] {
  if (!field || running.length === 0) return [];
  const all = [...field.objects, ...field.unranked].map((o) => o.subject);
  const out = new Map<string, Subject>();
  for (const call of running) {
    const args = call.arguments ?? {};
    const g = args.group_by;
    const groups = Array.isArray(g) ? g.map(String) : typeof g === 'string' && g ? [g] : [];
    if (groups.includes(field.dimension)) {
      for (const s of all) out.set(subjectKey(s), s);
      continue;
    }
    const filters = args.filters;
    if (filters && typeof filters === 'object') {
      for (const value of Object.values(filters as Record<string, unknown>)) {
        if (typeof value !== 'string') continue;
        const hit = all.find((s) => s.label === value);
        if (hit) out.set(subjectKey(hit), hit);
      }
    }
  }
  return [...out.values()];
}

/* ------------------------------------------------------------- the list -- */

/** A field's objects as the rows of its list equivalent, in the tool's order. */
export function fieldRows(field: FieldPlan): ComparisonRow[] {
  const shape = field.headline.shape;
  if (shape.kind === 'comparison' || shape.kind === 'ranking') return shape.rows;
  return [...field.objects, ...field.unranked].map((o) => ({
    subject: o.subject.label,
    value: o.figure.value,
    baseline: o.figure.baseline,
    change: o.figure.change,
    changePct: o.figure.changePct,
    direction: o.figure.direction,
    baselineStatus: o.figure.baselineStatus,
    unit: o.figure.unit,
    row: field.headline.source.rows[o.figure.rowIndex] ?? {},
  }));
}

/** Every object's text equivalent: label, figure, delta. What a reader with no colour sees. */
export function fieldText(field: FieldPlan): { subject: string; figure: string; delta: string }[] {
  return [...field.objects, ...field.unranked].map((o) => ({
    subject: o.subject.label,
    figure: figureText(o.figure),
    delta: deltaText(o.figure),
  }));
}

/* ------------------------------------------------------------ formatting -- */

function money(v: number, unit?: string): string {
  const prefix = unit === 'PHP' ? '₱' : '';
  const s = Number.isInteger(v)
    ? v.toLocaleString('en-PH')
    : v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${prefix}${s}`;
}

export function figureText(f: Figure): string {
  return f.value === null ? '—' : money(f.value, f.unit);
}

export function deltaText(f: Figure): string {
  if (f.changePct === null) {
    switch (f.baselineStatus) {
      case 'no_baseline': return 'new';
      case 'zero_baseline': return 'from zero';
      case 'no_current': return 'none now';
      default: return f.change === undefined ? '' : signedChange(f);
    }
  }
  if (f.direction === 'flat') return 'no change';
  const sign = f.changePct < 0 ? '−' : '+';
  return `${sign}${Math.abs(f.changePct).toLocaleString('en-PH')}%`;
}

export function signedChange(f: Figure): string {
  if (typeof f.change !== 'number') return '';
  const sign = f.change < 0 ? '−' : f.change > 0 ? '+' : '';
  return `${sign}${money(Math.abs(f.change), f.unit)}`;
}

export function baselineText(f: Figure): string | null {
  return f.baseline === undefined ? null : money(f.baseline, f.unit);
}
