/**
 * /watches — what is watching, and the switch (W4.4, 2026-09-23).
 *
 * THERE WAS NO PAGE FOR ANY OF THIS. SYSTEMS and AUTOMATIONS · WATCHES both
 * linked to `/workflows`, which holds workflows and contains neither a
 * standing question nor a watch. `listStanding` was called once, in the
 * sidebar, so `last_asked`, `last_status` and `instructions[]` were read from
 * the server on every open and drawn nowhere; there was no latest answer, no
 * reschedule, no rewrite, no remove — and no switch outside the morning
 * question's own button, which is the one thing the owner asked for.
 *
 * TWO LISTS, ONE READING. A standing question always speaks; a watch speaks
 * only when the answer changes. They are different things and the page says
 * so — but each row answers the same five questions in the same order, so
 * they can be read down: what it asks, when it runs, whether it is on, when it
 * last ran and what it last said, and what it was told.
 *
 * RULE 7 HAS A SURFACE HERE RATHER THAN A DETOUR AROUND IT. Nothing on this
 * page creates anything: creating is Bob's, everything he creates is born off,
 * and the person switching it on is the gate. A watch with no recorded
 * backtest says so ABOVE its switch, in the service's own sentence, before
 * anybody presses it — and the switch is drawn disabled rather than hidden,
 * because "you cannot yet, and here is why" is the information.
 *
 * NO ACCENT. The colour means "needs you" and nothing else: a switch, however
 * much it feels like the important thing on the screen, is not an approval.
 * Every control here takes its weight from position and type (UI rule 5).
 *
 * SILENCE IS NORMAL. A watch that has never spoken is not a broken one, and
 * the page must not read as though it were: it says how many times it looked
 * and how many of those it spoke, from george.watch_checks, with the time of
 * the last look beside them (UI rule 6). Loading, failed and loaded are three
 * renderings and the first two never borrow the third's words (UI rule 8).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoomHead } from '../room/RoomShell';
import { useRegisterHere } from '../hooks/useHere';
import {
  anchorOf, getWatching, refusalOf, removeWatching, rescheduleWatching,
  rewriteWatching, switchWatching,
  type Watching, type WatchingRow,
} from '../services/standingApi';

export const WATCHES_KEY = 'watches';
export const WATCHES_LABEL = 'Watches · standing questions';

/** A time, in Manila, as everything that fires on its own is written. */
export function manila(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Manila',
  });
}

/** "08:00", for the time field, from the slot the service holds. */
export function slotTime(row: WatchingRow): string {
  const h = String(row.slot?.hour ?? 0).padStart(2, '0');
  const m = String(row.slot?.minute ?? 0).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * What a watch's silence means, in words, from its own two counts.
 *
 * A COUNT IS NOT A VERDICT. "Checked 11 times, spoken on none" is the record;
 * "working" and "broken" are readings of it, and the page does not make one.
 */
export function silenceOf(row: WatchingRow): string | null {
  if (row.family !== 'watch' || row.checks === null) return null;
  if (row.checks === 0) {
    return row.on
      ? 'Switched on and not checked yet — it runs at its slot.'
      : 'Not checked yet: it is switched off.';
  }
  const looks = `${row.checks} ${row.checks === 1 ? 'check' : 'checks'}`;
  if (!row.spoke) return `${looks}, and it has not spoken. Silence is normal for a watch.`;
  return `${looks}, spoken on ${row.spoke}.`;
}

function Told({ row }: { row: WatchingRow }) {
  if (!row.told.length) {
    return (
      <p className="r-note r-w-told">
        <span className="r-label">told</span>
        Nothing beyond the question itself. Ask Bob to add a standing instruction.
      </p>
    );
  }
  return (
    <div className="r-w-told">
      <p className="r-label">{row.told_by === 'condition' ? 'what it watches' : 'told'}</p>
      <ul className="r-w-list">
        {row.told.map((line, i) => <li key={i} className="r-note">{line}</li>)}
      </ul>
      {row.told_by === 'instructions' && (
        <p className="r-src">Ask Bob to add or remove a standing instruction.</p>
      )}
    </div>
  );
}

/** What it last said, in its own words, with the read behind it (UI rule 6). */
function Said({ row }: { row: WatchingRow }) {
  const ran = manila(row.last_run_at);
  if (!row.last_said) {
    const silence = silenceOf(row);
    return (
      <p className="r-note r-w-said">
        {row.family === 'watch'
          ? (silence ?? 'It has not spoken.')
          : ran ? `Last asked ${ran}; no answer is stored for it.`
            : 'It has not run yet.'}
      </p>
    );
  }
  const said = row.last_said;
  const at = manila(said.at) ?? ran;
  const read = manila(said.read_at);
  return (
    <blockquote className="r-w-said">
      <p className="r-say">{said.said}</p>
      <p className="r-src">
        {at && `said ${at}`}
        {read && ` · read ${read}`}
        {said.thread_id && <> · <Link className="r-link" to={`/w/${said.thread_id}`}>open the thread</Link></>}
      </p>
    </blockquote>
  );
}

function Row({ row }: { row: WatchingRow }) {
  const qc = useQueryClient();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [time, setTime] = useState(() => slotTime(row));
  const [asks, setAsks] = useState(row.asks);

  // One place a change lands, whichever control made it: the row that came
  // back replaces this one and nothing is guessed locally.
  const settled = (next: WatchingRow) => {
    setRefusal(null);
    qc.setQueryData<Watching>(['watching'], (was) => was && {
      questions: was.questions.map((r) => (r.id === next.id ? next : r)),
      watches: was.watches.map((r) => (r.id === next.id ? next : r)),
    });
  };
  const failed = (err: unknown) => setRefusal(refusalOf(err));

  const flip = useMutation({
    mutationFn: (on: boolean) => switchWatching(row, on),
    onSuccess: settled, onError: failed,
  });
  const move = useMutation({
    mutationFn: (at: string) => rescheduleWatching(row, {
      hour: Number(at.slice(0, 2)), minute: Number(at.slice(3, 5)),
      kind: row.slot?.kind ?? null, days_of_week: row.slot?.days_of_week ?? null,
    }),
    onSuccess: (next) => { settled(next); setChanging(false); }, onError: failed,
  });
  const word = useMutation({
    mutationFn: (q: string) => rewriteWatching(row, q),
    onSuccess: (next) => { settled(next); setChanging(false); }, onError: failed,
  });
  const forget = useMutation({
    mutationFn: () => removeWatching(row),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['watching'] }); },
    onError: failed,
  });

  const busy = flip.isPending || move.isPending || word.isPending || forget.isPending;
  // Rule 7: a watch cannot be switched on until it has been backtested, and
  // the sentence saying so is the service's own.
  const blocked = !row.on ? row.switch_on_refusal : null;

  return (
    <li className="r-item" id={anchorOf(row)}>
      <h2 className="r-item-name">{row.asks}</h2>

      {/* THE SLOT IS ALWAYS A TIME. The rail drew "off" in its place, so an
          off row and an on row said two different kinds of thing. */}
      <p className="r-say r-w-state">
        {row.when} · {row.state}
      </p>

      {/* Rule 7's sentence, ABOVE the switch it governs. */}
      {blocked && <p className="r-note r-w-gate">{blocked}</p>}
      {refusal && <p className="r-note r-w-gate">{refusal}</p>}

      <div className="r-row-acts">
        <button type="button" className="r-w-switch" aria-pressed={row.on}
                disabled={busy || !row.may.switch || Boolean(blocked)}
                onClick={() => flip.mutate(!row.on)}>
          <i className={row.on ? 'r-pip r-pip--run' : 'r-pip r-pip--off'} />
          {row.on ? 'Switch off' : 'Switch on'}
        </button>
        {(row.may.reschedule || row.may.rewrite) && (
          <button type="button" className="r-act" disabled={busy}
                  aria-expanded={changing} onClick={() => setChanging((was) => !was)}>
            {changing ? 'Done changing' : 'Change'}
          </button>
        )}
        {row.may.remove && (
          <button type="button" className="r-act" disabled={busy}
                  onClick={() => forget.mutate()}>Remove</button>
        )}
      </div>

      {changing && (
        <div className="r-w-change">
          {row.may.reschedule && (
            <p className="r-w-field">
              <label className="r-label" htmlFor={`at-${row.id}`}>slot</label>
              <input id={`at-${row.id}`} type="time" className="r-w-input"
                     value={time} onChange={(e) => setTime(e.target.value)} />
              <button type="button" className="r-act" disabled={busy || time === slotTime(row)}
                      onClick={() => move.mutate(time)}>Move it</button>
            </p>
          )}
          {row.may.rewrite ? (
            <p className="r-w-field">
              <label className="r-label" htmlFor={`asks-${row.id}`}>asks</label>
              <input id={`asks-${row.id}`} type="text" className="r-w-input r-w-input--wide"
                     value={asks} onChange={(e) => setAsks(e.target.value)} />
              <button type="button" className="r-act" disabled={busy || asks.trim() === row.asks}
                      onClick={() => word.mutate(asks.trim())}>Rewrite it</button>
            </p>
          ) : (
            /* Not a dead control: a watch has no name. What it watches is its
               condition, and changing that is a different watch. */
            <p className="r-src">
              A watch has no wording to change — what it watches is its condition.
              Ask Bob for a different one.
            </p>
          )}
        </div>
      )}

      <Said row={row} />

      {/* The backtest is a measurement, so it carries when it was measured and
          the closed window it was measured over (UI rule 6). */}
      {row.backtest && (
        <p className="r-src">
          would have spoken on {row.backtest}
          {row.backtest_window && ` · ${row.backtest_window}`}
          {manila(row.backtest_at) && ` · measured ${manila(row.backtest_at)}`}
        </p>
      )}

      <Told row={row} />

      {row.last_status && row.last_status !== 'ok' && row.last_status !== 'quiet' && (
        <p className="r-note">
          <span className="r-label">last run</span>
          {row.last_status}{row.last_error ? ` — ${row.last_error}` : ''}
        </p>
      )}
    </li>
  );
}

/** One group, with its three renderings, and never a literal count. */
function Group({ title, says, rows, query }: {
  title: string; says: string; rows: WatchingRow[];
  query: { isPending: boolean; isError: boolean };
}) {
  return (
    <section className="r-w-grp">
      <h2 className="r-w-h">{title}</h2>
      <p className="r-src r-w-of">{says}</p>
      {query.isPending ? <p className="r-note">Checking…</p>
        : query.isError ? <p className="r-say">These could not be read.</p>
          : rows.length === 0 ? <p className="r-say">None yet. Ask Bob for one.</p>
            : (
              <ul className="r-w-rows">
                {rows.map((row) => <Row key={row.id} row={row} />)}
              </ul>
            )}
    </section>
  );
}

export default function WatchesPage() {
  const watching = useQuery({
    queryKey: ['watching'],
    queryFn: getWatching,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const questions = watching.data?.questions ?? [];
  const watches = watching.data?.watches ?? [];

  // WHAT IS ON THIS PAGE, for Bob's line (UI rule 1). Names only — what each
  // one asks or watches — never a figure and never a reading of one.
  useRegisterHere({
    key: WATCHES_KEY,
    label: WATCHES_LABEL,
    subjects: [...questions, ...watches].map((r) => r.asks),
  });

  return (
    <>
      <RoomHead
        title={WATCHES_LABEL}
        says="Asked on a schedule, or checked on one. Nothing runs until you switch it on."
      />
      <Group
        title="Standing questions"
        says="Asked on a schedule and answered fresh. One always speaks."
        rows={questions} query={watching}
      />
      <Group
        title="Watches"
        says="A saved condition, checked on a schedule. It posts only when the answer changes, so silence is normal."
        rows={watches} query={watching}
      />
    </>
  );
}
