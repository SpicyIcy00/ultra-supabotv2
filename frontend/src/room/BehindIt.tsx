/**
 * BEHIND IT — every read this thread stands on, with its receipts.
 *
 * Hex gives one object three views: the agent you talked to, the notebook
 * underneath, the app it becomes. George's middle view is this, and the one
 * rule it has is what it is NOT: **reads with receipts, never code.** No tool
 * name, no argument list, no SQL the client assembled, no model text. A person
 * who opens this is asking "where did these numbers come from", and the honest
 * answer is the source, the filters the definitions applied and the moment it
 * was read — not the call that fetched them.
 *
 * IT IS A VIEW ON THE THREAD, not on the turn. The board shows the newest
 * finding and folds the rest to a line; the evidence does not fold, because
 * "what have we actually looked at today" is a question about the whole
 * conversation. P2.a makes this one of three named views with a header; it is
 * a view now so that card has something to promote rather than something to
 * invent.
 *
 * A DECLINED READ STAYS IN THE LIST, drawn as declined, claiming no receipts
 * it does not have. Three facts, three renderings (UI rule 8): a read that
 * landed, a read that was refused, and a read whose receipts the record did
 * not keep are not one another.
 *
 * NOTHING HERE IS A FIGURE. Row counts and durations are counts and clocks;
 * the rows themselves are on the board, where they carry their own marks.
 */
import { useEffect, useRef } from 'react';

import type { AnswerTurn } from './data';
import { receiptsLine } from './data';
import { durationWords, filtersOf, readsOf, type Read } from './work';

/** When the answer this read belongs to was given. */
function when(at: string): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString('en-PH', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function Entry({ read, focused }: { read: Read; focused: boolean }) {
  const el = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (focused) el.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused]);
  const line = read.meta ? receiptsLine(read.meta) : '';
  const filters = filtersOf(read.meta);
  return (
    <li ref={el} className={`r-behind-read${focused ? ' r-behind-read--here' : ''}`}
        data-read={read.key}>
      <p className="r-behind-what">
        {read.words}
        {read.rows !== null && (
          <span className="r-work-n">{read.rows === 1 ? '1 row' : `${read.rows} rows`}</span>
        )}
        {read.ms !== null && <span className="r-work-n">{durationWords(read.ms)}</span>}
        <span className="r-work-n">{when(read.at)}</span>
      </p>
      {/* The tool's own sentence, which is written to be read. A read that was
          refused has no source and no filters, and does not draw empty ones. */}
      {read.declined && <p className="r-behind-declined">{read.declined}</p>}
      {line && <p className="r-src">{line}</p>}
      {read.meta?.source_table && (
        <p className="r-src">from {read.meta.source_table}</p>
      )}
      {filters.length > 0 && (
        <ul className="r-behind-filters">
          {filters.map((f, n) => (
            <li key={n}>
              {/* THE DEFINITION ON THE LINE, THE PREDICATE UNDER IT. The
                  filter is what a person came for; the SQL the tool wrote is
                  kept because it is the receipt, and put second because it is
                  not what anybody is reading. */}
              <span className="r-behind-filter">{f.label}</span>
              {f.detail && <span className="r-src">{f.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      {/* A LANDED READ WITH NO FILTERS SAYS SO. Silence here would read as a
          read with nothing applied to it, which is the same shape as a read
          whose receipts went missing. */}
      {!read.declined && !filters.length && read.meta && (
        <p className="r-src">no filters applied</p>
      )}
    </li>
  );
}

export function BehindIt({ answers, focus, onBack }: {
  answers: AnswerTurn[];
  /** The read to land on, `turn:seq`, when a figure was tapped to get here. */
  focus?: string | null;
  onBack: () => void;
}) {
  const reads = readsOf(answers);
  return (
    <section className="r-behind">
      <p className="r-behind-head">
        <span className="r-label">behind it</span>
        <button type="button" className="r-workline-behind" onClick={onBack}>
          back to the answer
        </button>
      </p>
      {reads.length === 0 ? (
        // A LOADED EMPTINESS, and it is a real one: this thread has answers
        // and none of them read anything. Drawn from the list, never from a
        // guess that one has not arrived (UI rule 8).
        <p className="r-work r-work--done">nothing has been read in this conversation yet</p>
      ) : (
        <ol className="r-behind-list">
          {reads.map((read) => (
            <Entry key={read.key} read={read} focused={focus === read.key} />
          ))}
        </ol>
      )}
    </section>
  );
}
