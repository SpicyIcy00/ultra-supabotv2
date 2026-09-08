/**
 * The work spine, drawn.
 *
 * A short vertical rail in the avatar column of a piece of work: one segment
 * per call George made, in call order. A segment is outlined while the call is
 * out, filled when its result lands, hatched when the tool declined, and dimmed
 * when it repeated an earlier call. That is the whole vocabulary, and every
 * state of it is a frame the loop actually emitted (spineShape.ts).
 *
 * NO HUE. The spine is not data; it is progress, and progress has one honest
 * colour here — the ink. A segment's state is carried by form: outline, fill,
 * hatch, opacity. The approvals colour never appears (UI rule 5) and the data
 * tokens never appear (they mean a direction of change, and a read has none).
 *
 * MOTION IS THE FILL. A segment fills once, when its result lands, over a few
 * hundred milliseconds — "George did this, therefore this changed". Under
 * prefers-reduced-motion it fills instantly (index.css). Nothing loops,
 * nothing pulses, nothing floats.
 *
 * WORDS FOR A SCREEN READER, NOT ON SCREEN. The column is 28px wide and holds
 * no text. Each segment carries its rung and its act in a visually-hidden
 * label and a title, so "What moved it: compared transactions" is available to
 * a reader who wants it and never crowds the one who does not.
 */
import type { Finding, ToolCall } from '../../types/george';
import { segmentLabel, spineSegments, spineSummary, type SpineSegment } from './spineShape';

function Segment({ segment }: { segment: SpineSegment }) {
  const label = segmentLabel(segment);
  const base = 'george-spine-segment block h-3.5 w-[3px] rounded-[2px]';
  const look =
    segment.state === 'pending'
      ? 'border border-george-line bg-transparent'
      : segment.state === 'refused'
        ? 'george-spine-segment--refused border border-george-slate'
        : segment.state === 'repeated'
          ? 'bg-george-slate opacity-40'
          : 'bg-george-navy';
  return (
    <li
      data-segment={segment.seq}
      data-state={segment.state}
      data-rung={segment.rung ?? undefined}
      title={label}
      className={`${base} ${look}`}
    >
      <span className="sr-only">{label}</span>
    </li>
  );
}

export function WorkSpine({
  calls,
  findings,
  settled,
  live,
}: {
  calls: ToolCall[];
  findings?: Finding[];
  /** The unit is over: complete, stopped, failed or stored. */
  settled: boolean;
  /** This is the unit the stream is on right now. */
  live: boolean;
}) {
  const segments = spineSegments(calls, findings, settled);
  if (segments.length === 0) return null;
  return (
    <ol
      aria-label={`George's work: ${spineSummary(segments, live)}`}
      className="mt-2 flex flex-col items-center gap-[3px]"
    >
      {segments.map((s) => (
        <Segment key={s.seq} segment={s} />
      ))}
    </ol>
  );
}
