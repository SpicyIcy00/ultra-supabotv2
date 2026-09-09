/**
 * WHAT GEORGE FOUND — drawn as findings, not as a chart with a caption.
 *
 * A broad investigation establishes several things at once, and until now the
 * screen said them in one joined sentence under one hero drawing. The reader
 * had to decipher the picture to find out which shop mattered.
 *
 * SO THE FINDING LEADS AND THE DRAWING SUPPORTS IT. Each one is a subject, the
 * fact a tool established about it, that subject's own figures with their
 * deltas, the driver reading in one numeral-free sentence, and the single move
 * that investigates it. The field they were all read from stays on screen
 * below, so this is a reading of ONE drawing rather than a grid of tiles —
 * which is the difference between an answer and a dashboard.
 *
 * NAMED FindingList, NOT Findings. Windows resolves `./findings` case
 * insensitively, so a component file one capital letter away from
 * findings.ts shadows it in a way that builds locally and fails nowhere
 * you can see. The repo has been bitten by exactly this twice
 * (caveats.ts/CaveatNotes.tsx, workTrail.ts/TrailBar.tsx).
 *
 * NOTHING HERE IS RANKED OR SCORED. The order is by which kind of fact
 * (findings.ts ORDER), never by magnitude, and there is no rating, severity or
 * composite anywhere: a number nobody defined would be an invention, and this
 * is the one place on the screen where inventing one would look most natural.
 */
import type { Figure } from './deskCompose';
import { deltaText, figureText } from './deskCompose';
import type { DeskFinding } from './findings';
import type { Subject } from './subject';

/** One figure, inline: what it is, what it reads, and how it moved. */
function Inline({ figure, lead = false }: { figure: Figure; lead?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap" data-figure={figure.label}>
      <span className="text-[11px] uppercase tracking-wide text-george-muted">{figure.label}</span>
      <span
        className={`tabular-nums text-george-navy ${
          lead ? 'font-george-serif text-[20px] leading-none' : 'text-[14px]'
        }`}
      >
        {figureText(figure)}
      </span>
      <span className="text-[12px] tabular-nums text-george-slate">{deltaText(figure)}</span>
    </span>
  );
}

export interface FindingsProps {
  findings: DeskFinding[];
  /** Open this subject on the workspace. The same gesture clicking it has. */
  onOpen: (subject: Subject) => void;
  /** Ask the ladder's next question about this subject, when there is one. */
  onAsk?: (question: string) => void;
  /** The question that investigates a subject further, or null. */
  moveFor?: (finding: DeskFinding) => { label: string; question: string } | null;
}

export function FindingList({ findings, onOpen, onAsk, moveFor }: FindingsProps) {
  if (findings.length === 0) return null;
  return (
    <section className="mt-2" data-findings={findings.length} aria-label="What George found">
      <ul className="space-y-7">
        {findings.map((f) => {
          const move = moveFor?.(f) ?? null;
          return (
            <li key={f.id} data-finding={f.ground} data-finding-subject={f.subject.label}>
              {/* The subject leads. It is the thing the reader has to act on. */}
              <button
                type="button"
                onClick={() => onOpen(f.subject)}
                className="text-left font-george-serif text-[17px] leading-snug text-george-navy hover:underline"
                data-open-subject={f.subject.label}
              >
                {f.subject.label}
              </button>

              {/* Why it is here: the fact a tool established. No numeral. */}
              <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-george-navy">{f.why}</p>

              {/* Its own figures, off rows already loaded (UI rules 3 and 6 —
                  the receipts for all of them sit under the shared field). */}
              <p className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
                <Inline figure={f.anatomy.headline} lead />
                {f.anatomy.drivers.map((d) => (
                  <Inline key={`${d.label}:${d.seq}`} figure={d} />
                ))}
              </p>

              {/* How the drivers behaved, in one sentence carrying no numeral —
                  the figures are an inch away (conclusion.ts). */}
              {f.reading && (
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-george-slate">{f.reading}</p>
              )}

              {move && onAsk && (
                <button
                  type="button"
                  onClick={() => onAsk(move.question)}
                  title={move.question}
                  data-finding-move={f.subject.label}
                  className="desk-lift mt-2.5 min-h-touch rounded-full bg-george-paper px-3.5 py-1.5 text-[12px] text-george-navy transition-shadow hover:shadow-md"
                >
                  {move.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
