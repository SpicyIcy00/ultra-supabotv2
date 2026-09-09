/**
 * WHAT GEORGE FOUND — the unit of a broad investigation.
 *
 * A broad read establishes several things about several shops out of ONE
 * grouped call. Until now the composer knew that and threw it away:
 * `plan.attention` was already a plural, per-subject, tool-derived list, and
 * `attentionWords` joined the whole of it into a single run-on sentence
 * beneath one hero chart. Ten discoveries arrived and one line went out.
 *
 * SO THIS IS NOT A NEW ABSTRACTION. It is the flattening removed. A finding
 * is one subject, the fact a tool established about it, that subject's own
 * figures, and the one move that investigates it further — assembled from
 * pieces that already existed and are already trusted:
 *
 *   the subject      off rows the tools returned (subject.ts)
 *   the ground       `plan.attention`, or the sign of two driver changes
 *   the reading      `conclusionOf`, one sentence carrying NO numeral
 *   the evidence     `anatomyFromField`, the subject's headline and drivers
 *   the move         `localizeQuestion`, the ladder's own next rung
 *
 * THE ONE-PRIMARY RULE IS UNTOUCHED. These are not several primary facts —
 * agent/findings.py rejects a second primary and is right to. They are
 * several readings of the SAME primary read, which is exactly what
 * `investigation.scope.presentation.from_the_same_primary` records.
 *
 * NOTHING HERE SCORES ANYTHING. There is no health rating, no severity, no
 * composite and no threshold. A subject is on this list because a tool
 * established a fact about it: it moved against the way the rest moved, the
 * tool's own ranking put it first, or its two declared drivers went opposite
 * ways — which is the sign of two changes the tool computed and nothing more.
 * Order is by which ground, never by magnitude, so no ranking is invented on
 * top of the one the tool performed.
 */
import type { SurfaceAttention } from '../george/surfaceModel';
import type { AnatomyPlan, Direction, FieldObject, FieldPlan } from './deskCompose';
import { anatomyFromField, quadrantOf } from './deskCompose';
import { conclusionOf } from './conclusion';
import { sameSubject, type Subject } from './subject';

/** Why a subject is worth the reader's attention. Each is a fact, not a score. */
export type FindingGround = 'against_the_majority' | 'ranked_first' | 'drivers_diverge';

export interface DeskFinding {
  /** Stable across renders: the ground and the subject that earned it. */
  id: string;
  subject: Subject;
  ground: FindingGround;
  /** Which way the subject's headline figure moved, from the tool's own row. */
  direction: Direction;
  /** Why it is here, in one sentence with no numeral. */
  why: string;
  /**
   * How its drivers behaved, in one sentence with no numeral. Null when the
   * subject has fewer than two comparable drivers — there is then nothing to
   * say that the figures beside it do not already say.
   */
  reading: string | null;
  /** Its own figures: the headline and the declared drivers. */
  anatomy: AnatomyPlan;
}

/**
 * The definitions' bound. Two to four when the figures establish that many,
 * fewer when they do not — and never one manufactured to fill the range
 * (metrics.yaml investigation.scope.presentation).
 */
export const MAX_FINDINGS = 4;

/** Strongest ground first. Not strongest MOVEMENT — that would be a ranking. */
const ORDER: FindingGround[] = ['against_the_majority', 'ranked_first', 'drivers_diverge'];

function movedWord(direction: Direction): string {
  return direction === 'up' ? 'rose' : direction === 'down' ? 'fell' : 'moved';
}

function whyOf(ground: FindingGround, subject: Subject, direction: Direction): string {
  switch (ground) {
    case 'against_the_majority':
      return `${subject.label} ${movedWord(direction)} while the rest of the estate went the other way.`;
    case 'ranked_first':
      return direction === 'down'
        ? `${subject.label} is the largest measured fall.`
        : direction === 'up'
          ? `${subject.label} is the largest measured rise.`
          : `${subject.label} is the largest measured change.`;
    case 'drivers_diverge':
      return `${subject.label} moved on both of its drivers, and they pulled against each other.`;
  }
}

/**
 * Whether a subject's two driver changes went opposite ways.
 *
 * Read off the field's own axes, which ARE the two declared driver changes
 * the tool computed — the same values `planeEarnsItsPlace` counts quadrants
 * with. It is the SIGN of two numbers a tool returned, so it establishes
 * nothing the tool did not, and there is no threshold in it.
 */
function driversDiverge(object: FieldObject): boolean {
  const q = quadrantOf(object);
  return q === '+-' || q === '-+';
}

/**
 * The findings on a field, in ground order, deduplicated by subject.
 *
 * A subject appears ONCE however many grounds it satisfies — a shop singled
 * out three ways is one shop — and it keeps the strongest ground it earned,
 * because that is the one a reader most needs to hear.
 */
export function deskFindings(
  field: FieldPlan | null,
  attention: SurfaceAttention[],
  identity: string | null,
  max: number = MAX_FINDINGS,
): DeskFinding[] {
  if (!field) return [];
  const objects = [...field.objects, ...field.unranked];

  // Ground per subject, strongest kept. The marks come from the surface, which
  // composed them from the tools' rows; divergence is read off the field.
  const grounds = new Map<string, { object: FieldObject; ground: FindingGround }>();
  const remember = (object: FieldObject, ground: FindingGround) => {
    const key = `${object.subject.dimension}:${object.subject.id || object.subject.label}`;
    const held = grounds.get(key);
    if (held && ORDER.indexOf(held.ground) <= ORDER.indexOf(ground)) return;
    grounds.set(key, { object, ground });
  };

  for (const mark of attention) {
    const object = objects.find((o) => o.subject.label === mark.subject);
    if (object) remember(object, mark.reason);
  }
  // Divergence only where the field actually carries two driver axes; on a
  // one-metric field y is null for every object and nothing is claimed.
  if (field.y) {
    for (const object of objects) {
      if (driversDiverge(object)) remember(object, 'drivers_diverge');
    }
  }

  const found: DeskFinding[] = [];
  for (const ground of ORDER) {
    for (const { object, ground: g } of grounds.values()) {
      if (g !== ground) continue;
      const anatomy = anatomyFromField(field, object.subject, identity);
      if (!anatomy) continue;
      found.push({
        id: `${ground}:${object.subject.label}`,
        subject: object.subject,
        ground,
        direction: anatomy.headline.direction,
        why: whyOf(ground, object.subject, anatomy.headline.direction),
        reading: conclusionOf(anatomy),
        anatomy,
      });
    }
  }
  return found.slice(0, max);
}

/** Whether a subject is one of the findings, so the field can mark it. */
export function isFound(findings: DeskFinding[], subject: Subject): boolean {
  return findings.some((f) => sameSubject(f.subject, subject));
}
