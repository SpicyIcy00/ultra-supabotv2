/**
 * REPLAY — a finished investigation, walked (P2.e).
 *
 * The owner's feature 9 is that George decides where to look next instead of
 * being told every query. The bill for that arrives afterwards: you have a
 * paragraph and a board, and no way to see the ladder he climbed to get them.
 * This is the walk back down it — the steps of the thread in the order they
 * ran, one at a time, each showing what came back.
 *
 * NOTHING HERE IS RE-RUN AND NOTHING IS ASKED. Every rung is read off what
 * already arrived: the calls the loop sent as frames, and on a reopened thread
 * the log's own record of them with the answer post's `charted` rows put back.
 * There is no request on this path, no model turn, and no planner —
 * architecture rule 5 is kept by the walk having nothing to plan. THE LIST IS
 * WHAT HAPPENED, not a reconstruction of what would happen now.
 *
 * IT IS THE STEPS, NOT THE READS, and that is what makes it a different view
 * from Behind it. A compose read nothing; a pin read nothing; both are things
 * he did, and an account that leaves them out says the workspace arranged
 * itself. Behind it answers *where did these numbers come from*; this answers
 * *what did he do, and what did he see*.
 *
 * FOUR FACTS, FOUR RENDERINGS (UI rule 8). A step that landed with its rows, a
 * step that landed whose rows the record did not keep, a step that was
 * REFUSED, and a step still running are four different things and none of them
 * borrows another's drawing. A refusal shows the tool's own sentence and
 * claims no receipts it does not have.
 *
 * A NUMBER HERE STILL CARRIES ITS TIME (UI rule 6). The rows are drawn with
 * the receipts of the read that fetched them — what was measured, how it was
 * cut, over which days, when it was read — and where a record kept rows with
 * no receipts at all, the rows are NOT drawn: a table with no time on it is a
 * claim with no expiry, and the honest thing to say is that the receipts are
 * missing.
 *
 * NO TOOL NAMES AND NO ARGUMENTS, the same rule Behind it has. What he did is
 * in words; what it was scoped to is in the receipts, where the definitions
 * wrote it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { GeorgeTurn, ToolMeta } from '../types/george';
import { changeOf, fmt, receiptsLine, tableShape, unitOf } from './data';
import { Delta, OwnCaveat } from './tiles';
import { durationWords, filtersOf, walkOf, type Rung } from './work';

/** When the answer a rung belongs to was given. */
function when(at: string): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString('en-PH', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * WHETHER THE ROWS MAY BE DRAWN AT ALL.
 *
 * Rows are figures, and UI rule 6 gives a figure no exemption for being
 * evidence: without a `snapshot_timestamp` there is no moment to put beside
 * the table, so the table is not drawn and the rung says the receipts were not
 * kept instead. This is the one place the walk refuses to show something it
 * holds, and it refuses for the reason the rule exists.
 */
export function drawable(rows: Record<string, unknown>[] | null,
                         meta: ToolMeta | null): boolean {
  return Boolean(rows && rows.length && meta?.snapshot_timestamp);
}

/**
 * WHAT THE READ BROUGHT BACK, as the board draws the same read.
 *
 * The columns and the folded captions come from `tableShape`, which the
 * board's own table calls — so a column that is a caption there is a caption
 * here, and the walk cannot disagree with the screen it explains.
 */
function Brought({ rows, meta }: { rows: Record<string, unknown>[]; meta: ToolMeta | null }) {
  const { constant, columns } = tableShape(rows, meta);
  const unit = (row: Record<string, unknown>) => unitOf(row) ?? unitOf(meta);
  return (
    <div className="r-walk-rows">
      {constant.length > 0 && <p className="r-src">{constant.join(' · ')}</p>}
      <div className="r-scroll" style={{ overflowX: 'auto' }}>
        <table className="r-rows">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className={typeof rows[0][c] === 'number' ? 'n' : ''}>
                  {c.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, n) => (
              <tr key={n}>
                {columns.map((c) => (
                  <td key={c} className={typeof row[c] === 'number' ? 'n' : ''}>
                    {c === 'change_pct' ? <Delta change={changeOf(row)} /> : fmt(c, row[c], unit(row))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The rung you are standing on: what he did, what came back, and its receipts. */
function Open({ rung }: { rung: Rung }) {
  const line = rung.meta ? receiptsLine(rung.meta) : '';
  const filters = filtersOf(rung.meta);
  const shows = drawable(rung.returned, rung.meta);
  return (
    <div className="r-walk-open">
      {/* THE CAVEAT THIS READ RAISED, above the rows it qualifies (UI rule 4).
          The read's own, never the turn's: a rung is one read, and a caveat
          from a different one would be pointing at the wrong table. */}
      <OwnCaveat meta={rung.meta} />
      {rung.state === 'declined' && rung.declined && (
        // THE TOOL'S OWN SENTENCE. A refusal is a real answer in the words of
        // whoever wrote the rule, and it travels whole: nothing here
        // paraphrases it, and a refused step draws no receipts, because it has
        // none.
        <p className="r-walk-declined">{rung.declined}</p>
      )}
      {rung.state === 'running' && (
        <p className="r-walk-note">still running — nothing has come back yet</p>
      )}
      {shows && <Brought rows={rung.returned as Record<string, unknown>[]} meta={rung.meta} />}
      {/* THREE ABSENCES, NAMED. A read that returned nothing, a read whose rows
          the record did not keep, and a step that read nothing at all are not
          one another, and none of them is silence. */}
      {rung.state === 'landed' && !shows && rung.rows === 0 && (
        <p className="r-walk-note">nothing came back</p>
      )}
      {rung.state === 'landed' && !shows && rung.rows !== null && rung.rows > 0 && (
        <p className="r-walk-note">
          {rung.rows === 1 ? 'the 1 row' : `the ${rung.rows} rows`} this brought back
          {rung.meta?.snapshot_timestamp ? ' were not kept' : ' were kept without their receipts'}
          , so they are not drawn
        </p>
      )}
      {rung.state === 'landed' && rung.rows === null && (
        <p className="r-walk-note">nothing was read — this is something he did to the screen</p>
      )}
      {line && <p className="r-src">{line}</p>}
      {rung.meta?.source_table && <p className="r-src">from {rung.meta.source_table}</p>}
      {filters.length > 0 && (
        <ul className="r-behind-filters">
          {filters.map((f, n) => (
            <li key={n}>
              <span className="r-behind-filter">{f.label}</span>
              {f.detail && <span className="r-src">{f.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * THE WALK.
 *
 * One column of rungs, the one you are on open beneath its line. Mobile-first:
 * the phone layout is the real one and this is it — a list you move down, with
 * the step you are on carrying everything about it. Back and next move one
 * rung; the arrow keys do the same, because a walk is a thing you step through
 * and reaching for a button each time is not stepping.
 */
export function Replay({ turns, onBack }: {
  /** The whole thread, questions included: a rung is headed by its question. */
  turns: GeorgeTurn[];
  onBack: () => void;
}) {
  const rungs = useMemo(() => walkOf(turns), [turns]);
  const [at, setAt] = useState(0);
  // A thread that grew or shrank while this was open must not leave the walk
  // standing past its own end.
  const here = Math.min(at, Math.max(0, rungs.length - 1));
  const step = useCallback((by: number) => {
    setAt((n) => Math.min(rungs.length - 1, Math.max(0, Math.min(n, rungs.length - 1) + by)));
  }, [rungs.length]);

  useEffect(() => {
    if (!rungs.length) return undefined;
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Not while somebody is typing: the composer owns the arrow keys.
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [rungs.length, step]);

  return (
    <section className="r-walk">
      <p className="r-behind-head">
        <span className="r-label">replay</span>
        <button type="button" className="r-workline-behind" onClick={onBack}>
          back to the answer
        </button>
      </p>
      {rungs.length === 0 ? (
        // A LOADED EMPTINESS. This thread has turns and none of them did
        // anything — drawn from the list, never from a guess that one has not
        // arrived yet (UI rule 8).
        <p className="r-work r-work--done">nothing has been done in this conversation yet</p>
      ) : (
        <>
          <p className="r-walk-where">
            <span className="r-label">step {here + 1} of {rungs.length}</span>
            <button type="button" className="r-chip" disabled={here === 0}
                    onClick={() => step(-1)}>← back</button>
            <button type="button" className="r-chip" disabled={here === rungs.length - 1}
                    onClick={() => step(1)}>next →</button>
          </p>
          <ol className="r-walk-list">
            {rungs.map((rung, n) => {
              const opened = n === here;
              // The question is drawn once, above the first rung taken under
              // it: it is a heading for the run, not a label on every step.
              const heads = n === 0 || rungs[n - 1].turn !== rung.turn;
              return (
                <li key={rung.key}>
                  {heads && (
                    <p className="r-walk-asked">
                      {rung.question
                        ? rung.question.replace(/\s+/g, ' ').trim()
                        // A turn with no question in the thread — a morning
                        // brief, a standing question, a workflow's answer.
                        // Named as such rather than given somebody's words.
                        : 'asked by a schedule, not in this conversation'}
                      <span className="r-work-n">{when(rung.at)}</span>
                    </p>
                  )}
                  <div className={`r-walk-rung${opened ? ' r-walk-rung--here' : ''}`}
                       data-rung={rung.key}>
                    <button type="button" className="r-walk-line" aria-current={opened || undefined}
                            aria-expanded={opened} onClick={() => setAt(n)}>
                      <span className="r-walk-n">{n + 1}</span>
                      {rung.state === 'running' ? `${rung.words}…` : rung.words}
                      {rung.state === 'declined' && <span className="r-work-n">declined</span>}
                      {rung.rows !== null && (
                        <span className="r-work-n">
                          {rung.rows === 1 ? '1 row' : `${rung.rows} rows`}
                        </span>
                      )}
                      {/* OMITTED, NEVER ZEROED (UI rule 8): a call read back
                          out of a record that kept no clock was not instant. */}
                      {rung.ms !== null && <span className="r-work-n">{durationWords(rung.ms)}</span>}
                    </button>
                    {opened && <Open rung={rung} />}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
