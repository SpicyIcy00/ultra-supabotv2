/**
 * HE ANSWERS WHERE YOU ASKED (W1.4, 2026-09-22).
 *
 * Asking from the warehouse used to take you to /bob: the page you were
 * looking at was gone and the answer was somewhere else. Now the answer is
 * drawn BESIDE the page — a panel on the right on a desktop, a sheet over the
 * bottom of the screen on a phone (mobile-first: the sheet is the real
 * layout, the panel is it with room beside it) — and "Open in Bob" takes the
 * same thread to the room when you want the whole of it.
 *
 * WHAT IS DRAWN IS THE ROOM'S OWN. His words by `Reading`, the notices above
 * them (UI rule 4), the figures by `Board` with their receipts and read times
 * (rules 3 and 6), his work by `Doing` while he works. Nothing here renders a
 * figure of its own, and nothing is a new kind of answer — it is the same
 * answer, in less room. Loading, failed and loaded are three renderings
 * (rule 8): working, "could not answer" with his reason, and the answer.
 *
 * Lazy: the line is on every page, the room's renderer only once he answers.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useBob } from '../hooks/useBob';
import { readDeskDefinitions } from '../services/deskApi';
import { readStoreAppearance } from '../services/storesApi';
import type { BobTurn, DeskContext } from '../types/bob';
import type { AnswerTurn } from './data';
import { buildBoard } from './board';
import { Board, turnNotices } from './render';
import { scrollToFigure } from './FiguresArea';
import { AliveMark } from './AliveMark';
import { markStateOf } from './alive';
import { Doing } from './Working';
import { Narration, Reading, ReadingAsks, ReadingNext } from './Reading';
import { identitiesFrom } from './identity';
import { IdentityContext } from './swatch';
import { ExplainsOnlyContext, drawnOnly, explainsOnlyFrom } from './noticeDrawing';
import { asSelection, subjectOnBoard } from './subjects';
import type { TileActions } from './tiles';

/** The thread as question-and-answer pairs, oldest first. */
export function pairsOf(turns: BobTurn[]): { question: string; answer: AnswerTurn | null }[] {
  const out: { question: string; answer: AnswerTurn | null }[] = [];
  for (const t of turns) {
    if (t.role === 'user') out.push({ question: t.text, answer: null });
    else if (out.length) out[out.length - 1].answer = t as AnswerTurn;
    else out.push({ question: '', answer: t as AnswerTurn });
  }
  return out;
}

export default function HerePanel({ label, onClose, onAsk }: {
  /** What the page is called, for the head. */
  label: string;
  onClose(): void;
  /** Ask a follow-up from this page, with this page's context. */
  onAsk(question: string, extra?: { desk?: DeskContext }): void;
}) {
  const bob = useBob();
  const navigate = useNavigate();
  const bodyRef = useRef<HTMLDivElement>(null);
  const desk = useQuery({ queryKey: ['desk-definitions'], queryFn: readDeskDefinitions,
                          staleTime: Infinity, retry: false });
  const stores = useQuery({ queryKey: ['store-appearance'], queryFn: readStoreAppearance,
                            staleTime: 5 * 60_000, retry: false });
  const identities = useMemo(() => identitiesFrom(desk.data, stores.data), [desk.data, stores.data]);
  const explainsOnly = useMemo(() => explainsOnlyFrom(desk.data), [desk.data]);

  const pairs = useMemo(() => pairsOf(bob.turns), [bob.turns]);
  const latest = pairs[pairs.length - 1]?.answer ?? null;
  const mark = markStateOf({ busy: bob.busy, turn: latest, landing: 0, needsYou: undefined });

  // THE NEWEST QUESTION AT THE TOP OF THE PANEL when it is asked, so its
  // answer is read from its first line — not scrolled to its last, which put
  // "what I'd do next" in view and the answer above the fold.
  useEffect(() => {
    const el = bodyRef.current;
    const turns = el?.querySelectorAll<HTMLElement>('.r-here-turn');
    const newest = turns?.[turns.length - 1];
    if (el && newest) el.scrollTop = Math.max(0, newest.offsetTop - el.offsetTop - 12);
  }, [pairs.length]);

  // OPEN IN BOB: the same thread, in the room. Its address once its posts
  // exist (the only id a router may follow); before that the room, which is
  // already drawing this stream and moves to the address when it arrives.
  const openInBob = useCallback(() => {
    navigate(bob.storedThreadId ? `/w/${bob.storedThreadId}` : '/bob');
  }, [bob.storedThreadId, navigate]);

  return (
    <IdentityContext.Provider value={identities}>
      <ExplainsOnlyContext.Provider value={explainsOnly}>
        <aside className="r-here-panel" aria-label="Bob, beside this page" data-busy={bob.busy ? 'yes' : 'no'}>
          <header className="r-here-head">
            <span className="r-here-mark" aria-hidden="true">
              <AliveMark state={mark.state} failed={mark.failed} drawn={mark.reads} pulses={mark.reads} />
            </span>
            <span className="r-here-title">
              Bob <span className="r-here-on">on {label}</span>
            </span>
            <button type="button" className="r-act" onClick={openInBob}>Open in Bob</button>
            <button type="button" className="r-here-close" onClick={onClose} aria-label="Close">×</button>
          </header>
          <div className="r-here-body" ref={bodyRef}>
            {pairs.map((p, i) => (
              <section key={i} className="r-here-turn">
                {p.question && <p className="r-here-q">{p.question}</p>}
                {p.answer && (
                  <HereAnswer turn={p.answer} newest={i === pairs.length - 1} busy={bob.busy}
                              explains={explainsOnly} area={bodyRef} onAsk={onAsk} />
                )}
              </section>
            ))}
          </div>
        </aside>
      </ExplainsOnlyContext.Provider>
    </IdentityContext.Provider>
  );
}

function HereAnswer({ turn, newest, busy, explains, area, onAsk }: {
  turn: AnswerTurn;
  newest: boolean;
  busy: boolean;
  explains: ReadonlySet<string>;
  area: React.RefObject<HTMLDivElement | null>;
  onAsk(question: string, extra?: { desk?: DeskContext }): void;
}) {
  const live = newest && busy;
  const answers = useMemo(() => [turn], [turn]);
  // THE FIGURES OF THE NEWEST ANSWER ONLY. An earlier answer keeps its words;
  // its figures are in the room, one tap away, rather than stacked here.
  const board = useMemo(() => (newest ? buildBoard(answers) : []), [answers, newest]);
  const notices = useMemo(
    () => drawnOnly(turnNotices({ answers, board, local: {}, focused: null }), explains),
    [answers, board, explains],
  );
  const answering = Boolean((turn.text ?? '').trim());
  const onFigure = useCallback((seq: number) => scrollToFigure(area.current, 0, seq), [area]);
  // A TAP ON A ROW ASKS ABOUT IT, here — the room's `why`, with the id the row
  // carried, from this page.
  const on: TileActions = useMemo(() => {
    const about = (label: string, dimension: Parameters<TileActions['why']>[1]) => {
      const subject = subjectOnBoard({ answers, board, retuned: {}, defs: null }, label, dimension ?? 'store');
      const selection = asSelection([subject]);
      onAsk('why?', selection ? { desk: { selection } } : undefined);
    };
    return { open: () => {}, patch: () => {}, pick: about, why: about };
  }, [answers, board, onAsk]);

  if (turn.error && !answering) {
    return (
      <p className="r-say" data-state="failed">
        Bob could not answer this. <span className="r-src">{turn.error}</span>
      </p>
    );
  }
  return (
    <div className="r-here-answer" data-state={live ? 'loading' : 'loaded'}>
      <Doing turn={turn} live={live} answering={answering} />
      <Narration said={(turn as { narration?: string }).narration} live={live} answering={answering} />
      <Reading text={turn.text} notices={notices} reading={turn.reading} calls={turn.toolCalls}
               onFigure={onFigure} />
      {board.length > 0 && (
        <div className="r-here-figures">
          <Board answers={answers} board={board} local={{}} focused={null} selection={[]}
                 live={live} retuned={{}} on={on} />
        </div>
      )}
      {!live && <ReadingNext reading={turn.reading} calls={turn.toolCalls} onFigure={onFigure} />}
      {newest && <ReadingAsks reading={turn.reading} busy={busy} onAsk={(q) => onAsk(q)} />}
      {turn.cancelled && (
        <p className="r-note" data-state="stopped">Stopped. What is above is where he got to, not what he concluded.</p>
      )}
    </div>
  );
}
