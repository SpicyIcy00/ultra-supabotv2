/**
 * How a piece of work composes when George has said what each read WAS.
 *
 * THE LAYER THAT WAS MISSING. resultShape decides how several results compose
 * from their scope alone — adjacency, and nothing else — because until
 * 2026-09-08 that was all anybody knew about them. An investigation verifies a
 * premise, decomposes it into drivers and localizes it to products: four
 * `get_sales` calls, drawn as four blocks in a row, indistinguishable from four
 * unrelated figures. The structure existed only in the model's prose, so George
 * explained his structure in paragraphs.
 *
 * Now the loop emits a `finding` frame — a validated role per call — and this
 * turns roles into SECTIONS. Nothing else changes: each section's blocks are
 * still built by resultShape from the same sources, still grouped by the same
 * scopeKey, still drawn by the same primitives. A role decides WHERE a result
 * sits; it never decides what the result is.
 *
 * WHAT A ROLE MAY NOT DO. It is one of four words on a call that ran. It cannot
 * supply a figure, a label, a colour, a component, a layout, a threshold or an
 * ordering — the loop validated every role against the executed set and
 * metrics.yaml, and the frame has no field for anything else (agent/findings.py).
 * The section headings below are the DEFINITIONS' words for the ladder's rungs,
 * never the model's; and within a section, order is call order, which is the
 * only order this layer is entitled to.
 *
 * NO FINDINGS IS THE V1 SURFACE, BYTE FOR BYTE. A turn that recorded no roles
 * — every turn before this existed, and every turn where George read one thing
 * and answered — composes as adjacency exactly as it did, through the same
 * function. The equivalence is held by the suite.
 *
 * A ROLE ON A RESULT THAT WAS NOT DRAWN IS DROPPED SILENTLY. The loop only
 * charts a result it could send whole; a role on a call whose rows never
 * reached the client points at nothing, and a section with nothing in it is
 * not drawn. The frame still records the role, which is right: the model said
 * it, and the receipts should say so.
 */
import type { Finding } from '../../types/george';
import { driverSplitMembers } from './instrumentShape';
import { resultBlocks, type ResultBlock, type ResultSource } from './resultShape';

export type SectionRole = Finding['role'];

/**
 * The rungs, in the order a reader climbs them — and the order the definitions
 * name them (metrics.yaml investigation.ladder: verify, decompose, localize).
 * `context` has no rung; it is what was read beside the ladder.
 */
export const SECTION_ORDER: readonly SectionRole[] = ['primary', 'driver', 'breakdown', 'context'];

/**
 * What each section is CALLED. The definitions' word for the rung, in the
 * reader's language. Never taken from the model, never taken from prose.
 */
export const SECTION_LABEL: Record<SectionRole, string> = {
  primary: 'The figure',
  driver: 'What moved it',
  breakdown: 'Where it sits',
  context: 'Also read',
};

export interface WorkSection {
  role: SectionRole;
  label: string;
  blocks: ResultBlock[];
  /**
   * The instrument this section is drawn with, when one applies.
   *
   * `driver_split`: the driver section, when resultShape grouped its members
   * into one group of single compared figures that all carry a numeric
   * change_pct (instrumentShape.driverSplitMembers). Decided HERE, from the
   * blocks and the role, never from the model — a role says where a result
   * sits, and this is the one case where "where" changes the drawing.
   */
  instrument?: 'driver_split';
  /** The definitions' identity for the drivers, off the primary finding. */
  identity?: string | null;
}

/** The two things a surface can be, and the flag that says which. */
export type Composition =
  | { kind: 'adjacent'; blocks: ResultBlock[] }
  | { kind: 'structured'; sections: WorkSection[] };

/**
 * Whether these findings can structure these sources at all.
 *
 * A structure needs a primary that was actually drawn. Without one there is no
 * ladder to hang anything on — a driver of nothing is not a driver — and the
 * honest rendering is adjacency, which is what a turn with no findings gets.
 */
export function canStructure(sources: ResultSource[], findings: Finding[] | undefined): boolean {
  if (!findings || findings.length === 0) return false;
  const drawn = new Set(sources.map((s) => s.seq));
  return findings.some((f) => f.role === 'primary' && drawn.has(f.seq));
}

/**
 * The surface, composed.
 *
 * Roles partition the sources; resultShape composes each partition. The
 * partition is by seq — the same conversation-global number on the tool_call
 * frame, the tool_result frame and the stored `charted` entry — so a stored
 * post and the live turn it came from compose identically (workUnit.ts).
 */
export function composeWork(
  sources: ResultSource[],
  findings: Finding[] | undefined,
): Composition {
  if (!canStructure(sources, findings)) {
    return { kind: 'adjacent', blocks: resultBlocks(sources) };
  }

  const roleOf = new Map<number, SectionRole>();
  for (const f of findings!) roleOf.set(f.seq, f.role);

  // A source with no role is context: it was read, it was drawn, and George
  // said nothing about what it was. Showing it beside the ladder is truer than
  // dropping it, and "Also read" is exactly what it is.
  const partition = new Map<SectionRole, ResultSource[]>();
  for (const role of SECTION_ORDER) partition.set(role, []);
  for (const source of sources) {
    partition.get(roleOf.get(source.seq) ?? 'context')!.push(source);
  }

  const identity = findings!.find((f) => f.role === 'primary')?.identity ?? null;
  const sections: WorkSection[] = [];
  for (const role of SECTION_ORDER) {
    const members = partition.get(role)!;
    if (members.length === 0) continue;
    const blocks = resultBlocks(members);
    const section: WorkSection = { role, label: SECTION_LABEL[role], blocks };
    if (
      role === 'driver' &&
      blocks.length === 1 &&
      blocks[0].kind === 'group' &&
      driverSplitMembers(blocks[0].members)
    ) {
      section.instrument = 'driver_split';
      section.identity = identity;
    }
    sections.push(section);
  }
  return { kind: 'structured', sections };
}

/** Every block on a surface, whichever way it composed, in reading order. */
export function compositionBlocks(composition: Composition): ResultBlock[] {
  return composition.kind === 'adjacent'
    ? composition.blocks
    : composition.sections.flatMap((s) => s.blocks);
}
