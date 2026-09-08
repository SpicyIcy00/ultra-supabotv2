/**
 * The work spine: George's work beside the piece of work it belongs to, as a
 * decision the suite can hold.
 *
 * WHAT WAS MISSING. The mark is in the shell and says what George is doing;
 * the work is in the workspace. A reader waiting on an investigation saw a
 * blossom sway in the rail and a line of words under the answer, and nothing
 * beside the answer itself said "he is doing four things and two are back".
 *
 * DERIVED FROM FRAMES, THEREFORE TRUE. One segment per tool_call frame,
 * filled when its tool_result lands, hatched when the call was refused, dimmed
 * when it repeated an earlier one. Once findings exist, each segment knows its
 * rung — the figure, what moved it, where it sits — from the validated
 * `finding` frame, so the spine is where the ladder is visible while it is
 * being climbed. None of this is the model's account of its own progress:
 * there is no stage, no plan and no checklist here, only the calls that were
 * issued and what came back.
 *
 * WHAT IT NEVER SHOWS. Chain of thought — the reasoning stays behind the
 * activity disclosure. Tool identifiers — every segment is named in words
 * (cognition.ts), and the label tool itself is not a segment: recording what
 * the reads were is not a read.
 *
 * NOT THE MARK. The mark is George's presence, one per app, drawn from the
 * stream's state by whatever renderer is in place (presenceRenderer.ts). The
 * spine is local to a unit of work and drawn from that unit's calls. They share
 * nothing but a vocabulary.
 */
import type { Finding, ToolCall } from '../../types/george';
import { actName, deedLine } from './cognition';
import { SECTION_LABEL, type SectionRole } from './composeWork';

/** The label tool records what the reads were; it is not itself a read. */
export const NOT_WORK: ReadonlySet<string> = new Set(['record_findings']);

export type SegmentState = 'pending' | 'done' | 'refused' | 'repeated';

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

export interface SpineSegment {
  seq: number;
  state: SegmentState;
  /** Its rung, once George has said what this read was. */
  rung: SectionRole | null;
  /** The rung's name for a reader, when there is one. */
  rungLabel: string | null;
  /** What the call is doing, present tense, in words. Never its identifier. */
  act: string;
  /** The same, past tense, once it is back. */
  deed: string;
}

/**
 * The segments, in call order.
 *
 * @param settled true once the unit is over — complete, stopped, failed or
 *   stored. A stored post's calls carry no results, and drawing them as
 *   pending would show a finished answer as work still in flight.
 */
export function spineSegments(
  calls: ToolCall[],
  findings: Finding[] | undefined,
  settled: boolean,
): SpineSegment[] {
  const rungOf = new Map<number, SectionRole>();
  for (const f of findings ?? []) rungOf.set(f.seq, f.role);

  return calls
    .filter((c) => !NOT_WORK.has(c.tool))
    .map((c) => {
      let state: SegmentState;
      if (typeof c.duplicate_of === 'number') state = 'repeated';
      else if (c.result?.error) state = 'refused';
      else if (c.result || settled) state = 'done';
      else state = 'pending';
      const rung = rungOf.get(c.seq) ?? null;
      return {
        seq: c.seq,
        state,
        rung,
        rungLabel: rung ? SECTION_LABEL[rung] : null,
        act: actName(c.tool),
        // deedLine capitalises for the activity button; here the deed sits
        // after a rung ("The figure: compared sales at Rockwell") or stands as
        // a title, and neither wants a capital mid-sentence.
        deed: lowerFirst(deedLine([{ tool: c.tool, arguments: c.arguments }]) || actName(c.tool)),
      };
    });
}

/**
 * The one line the spine says of itself, for its accessible name.
 *
 * Counts only, and only of what is known: how many reads, how many back. A
 * refusal is back — the tool answered, by declining — and is counted as such
 * and then named.
 */
export function spineSummary(segments: SpineSegment[], live: boolean): string {
  const n = segments.length;
  if (n === 0) return '';
  const back = segments.filter((s) => s.state !== 'pending').length;
  const refused = segments.filter((s) => s.state === 'refused').length;
  const reads = n === 1 ? '1 read' : `${n} reads`;
  let line = live && back < n ? `${back} of ${reads} back` : reads;
  if (refused) line += `, ${refused} declined`;
  return line;
}

/** What one segment says of itself: its rung if it has one, then what it did. */
export function segmentLabel(segment: SpineSegment): string {
  const prefix = segment.rungLabel ? `${segment.rungLabel}: ` : '';
  switch (segment.state) {
    case 'pending':
      return `${prefix}${segment.act}…`;
    case 'refused':
      return `${prefix}${segment.deed} — declined`;
    case 'repeated':
      return `${prefix}${segment.deed} — not re-read`;
    default:
      return `${prefix}${segment.deed}`;
  }
}
