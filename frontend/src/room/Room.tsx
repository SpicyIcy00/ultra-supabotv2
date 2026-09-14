/**
 * THE ROOM — where the work is.
 *
 * You arrive somewhere rather than starting a session. What is on screen is
 * the board: every object George has put there, still drawing the read it was
 * made from. It is not the last answer, and a follow-up transforms an object
 * rather than drawing a second one beneath it.
 *
 * What is yours: bring something forward, set it aside, sort a table, pick a
 * subject to talk about. All instant, all local, never sent back to George as
 * though he had decided it. Only a new FACT costs a turn.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useGeorge } from '../hooks/useGeorge';
import { useThread } from '../hooks/useThread';
import { threadHistory } from '../components/george/threadHistory';
import { restoreFromPosts } from './restore';
import { boardContext, buildBoard, dropped, folded, inOrder, type Local, type BoardObject } from './board';
import { keepLocal, restoreLocal } from './arrangement';
import type { AnswerTurn, Dimension } from './data';
import { Board, turnNotices } from './render';
import { Reading, ReadingNext } from './Reading';
import { Earlier } from './Earlier';
import { replayStoredCall } from '../services/deskApi';
import type { ToolCall } from '../types/george';
import { Noticed } from './Noticed';
import { Working } from './Working';
import { useQuery } from '@tanstack/react-query';
import { listApprovals } from '../services/workflowsApi';
import { Rail } from './Rail';
import { dismissStanding, useStandingOpening } from './useStandingOpening';
import { decisionFor, leftBehind } from './decisions';
import { recordDecision, type Outcome } from '../services/decisionsApi';
import { arrivedSince, firstUnseen, forgetLast, lastSeen, lastThread, remember } from './history';
import type { TileActions } from './tiles';
import './room.css';

export default function Room() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const asked = useRef<string | null>(null);
  const george = useGeorge();
  const thread = useThread(threadId ?? '');

  const [selection, setSelection] = useState<{ label: string; dimension: Dimension }[]>([]);
  // WHAT YOU HAVE DONE TO THE BOARD — where things sit, how big they are,
  // what you are holding on to. Restored per thread, because an arrangement
  // you made is worth more than the trouble of remembering it, and lost on a
  // reload it would teach you not to bother.
  const [local, setLocal] = useState<Record<string, Local>>(
    () => restoreLocal(threadId));
  // Every arrangement you had before this one. Undo is the thing that makes
  // rearranging safe to try.
  const [history, setHistory] = useState<Record<string, Local>[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  // Reads re-run because somebody moved a control, by seq. Deliberately not
  // sent back to George as though he had decided it: what he is told is the
  // window on the desk, on the next question (metrics.yaml surface.desk.replay).
  //
  // ON SCREEN THIS IS STILL PER-SESSION, and the record is not (P1.i). The
  // server now appends each change to the answer post, so a replayed figure
  // has a receipt; nothing reads that back onto the board yet, so a reload
  // still draws the stored window. Restoring from it is P1.j's, where a
  // replay becomes the ordinary way the board moves.
  const [retuned, setRetuned] = useState<Record<number, ToolCall>>({});

  // WHAT NEEDS A DECISION. Read, never assumed: the rail draws a count only
  // when a result says so, because "nothing needs you" is a claim about the
  // world and the room may only make it while holding something that says it
  // (UI rule 8). `undefined` until then, which draws nothing at all — this is
  // the exact failure that rule was written from, where a rail said the queue
  // was empty while a version sat in it waiting for somebody.
  const approvals = useQuery({
    queryKey: ['approvals'],
    queryFn: listApprovals,
    staleTime: 60_000,
    retry: false,
  });
  const [draft, setDraft] = useState('');
  const opened = useRef<string | null>(null);

  // A stored thread opens once, with its rows and compositions restored from
  // the posts — so the board a reload rebuilds is the board that was there.
  useEffect(() => {
    if (!threadId || !thread.ready || opened.current === threadId) return;
    opened.current = threadId;
    george.open(
      restoreFromPosts(threadHistory(thread.posts, thread.chat, threadId), thread.posts),
      threadId,
    );
  }, [threadId, thread.ready, thread.posts, thread.chat, george]);

  useEffect(() => {
    if (!threadId && george.storedThreadId) navigate(`/w/${george.storedThreadId}`, { replace: true });
  }, [threadId, george.storedThreadId, navigate]);

  const answers = useMemo(
    () => george.turns.filter((t): t is AnswerTurn => t.role === 'george'),
    [george.turns],
  );
  // What the person KEPT never expires from the board.
  const keptKeys = useMemo(
    () => new Set(Object.entries(local).filter(([, l]) => l?.kept).map(([k]) => k)),
    [local],
  );
  const board = useMemo(() => buildBoard(answers, keptKeys), [answers, keptKeys]);
  const busy = george.busy;
  const latest = answers[answers.length - 1] ?? null;
  // WHAT CAME BEFORE THIS FINDING FOLDS TO A LINE (P1.d). Clearing handles a
  // question that shares nothing with the board; this handles the one that
  // does, so a fourth follow-up is still one finding and not nine tiles. The
  // board keeps every object — only the screen folds — so the next question
  // still travels with all of them.
  const { shown, earlier } = useMemo(
    () => folded(board, answers.length - 1, local, focused),
    [board, answers.length, local, focused],
  );
  const [unfolded, setUnfolded] = useState(false);
  // A new answer folds again. The fold is about the newest finding, and
  // leaving it open would put the accumulation straight back.
  useEffect(() => { setUnfolded(false); }, [answers.length]);
  const drawn = unfolded ? board : shown;
  // The turn's caveats, minus the ones its objects already carry — computed
  // over what is DRAWN, because a caveat carried by a tile nobody can see has
  // not been said (UI rule 4).
  const notices = useMemo(
    () => turnNotices({ answers, board: drawn, local, focused }),
    [answers, drawn, local, focused],
  );
  // AN EMPTY ROOM IS THE ONE WITH NOTHING IN IT AT ALL, which is no longer
  // the same question as an empty board: a turn that read nothing and said
  // something — a refusal, an answer off what he already knows — has a
  // reading and no objects, and used to land on the greeting with his words
  // thrown away.
  const empty = board.length === 0 && !(latest?.text ?? '').trim() && notices.length === 0;

  // THE COLD OPEN. Arriving with nothing in hand, the room opens on the
  // newest answer George gave to a question he was asked to keep asking —
  // this morning's, normally — IF IT IS NEWER THAN YOUR LAST LOOK AT IT.
  // Otherwise it opens where you were: the thread you left is the thread
  // you return to. Nothing here builds a briefing or knows what one is; it
  // opens a thread, and the thread contains whatever he decided. Nowhere to
  // go back to and nothing new is a real answer, and stays the empty room.
  const nothingInHand = !threadId && !george.storedThreadId && !george.busy;
  const standing = useStandingOpening(nothingInHand);
  useEffect(() => {
    if (!nothingInHand) return;
    const found = standing.found;
    if (found) {
      const seen = lastSeen(found.thread_id);
      const fresh = !seen || !found.answered_at
        || Date.parse(found.answered_at) > Date.parse(seen);
      if (fresh) { navigate(`/w/${found.thread_id}`, { replace: true }); return; }
    }
    if (!standing.settled) return;
    const back = lastThread();
    if (back) navigate(`/w/${back}`, { replace: true });
  }, [nothingInHand, standing.found, standing.settled, navigate]);

  // WHEN YOU LAST LOOKED AT THIS THREAD — read once, as it opens, so that
  // what arrived since can land with the glow and be counted. Once you ask
  // something here you are no longer "back": the line and the glow stand
  // down, and everything is marked seen as it settles.
  const openedSeen = useMemo(() => lastSeen(threadId), [threadId]);
  const askedHere = useRef<string | null>(null);
  useEffect(() => { if (busy && threadId) askedHere.current = threadId; }, [busy, threadId]);
  const sinceAt = askedHere.current === threadId ? null : openedSeen;
  const arrived = arrivedSince(answers, sinceAt);
  useEffect(() => { if (threadId) remember(threadId); }, [threadId]);
  useEffect(() => {
    if (!threadId || busy || !answers.length) return;
    remember(threadId, answers[answers.length - 1].at);
  }, [threadId, busy, answers]);

  // LOOKING INTO SOMETHING GEORGE NOTICED. The watch post carries the read
  // that fired it, so this is an ordinary reply in its thread — George re-runs
  // that call and climbs from a fact. The question rides in router state so it
  // survives the navigation, and `asked` makes sure it happens once.
  const pending = (location.state as { ask?: string } | null)?.ask;
  useEffect(() => {
    if (!pending || !threadId || !thread.ready) return;
    if (asked.current === threadId) return;
    asked.current = threadId;
    navigate(location.pathname, { replace: true, state: null });
    void george.ask(pending);
  }, [pending, threadId, thread.ready, george, navigate, location.pathname]);


  const patch = useCallback((key: string, p: Local) => {
    setLocal((s) => {
      setHistory((h) => [...h.slice(-19), s]);
      return { ...s, [key]: { ...s[key], ...p } };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setLocal(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  // George putting an object back is him disagreeing with your setting it
  // aside, deliberately and by name — so it returns. Everything else you did
  // to it survives, because he did not touch that.
  useEffect(() => {
    const newest = answers.length - 1;
    setLocal((s) => {
      let next = s;
      for (const o of board) {
        if (o.touched === newest && s[o.key]?.closed) {
          if (next === s) next = { ...s };
          next[o.key] = { ...next[o.key], closed: false };
        }
      }
      return next;
    });
  }, [answers.length, board]);

  const ask = useCallback((text: string, subjects = selection) => {
    const q = text.trim();
    if (!q) return;
    setDraft('');
    const desk = {
      ...(subjects.length ? {
        selection: {
          dimension: subjects[0].dimension,
          subjects: subjects
            .filter((s) => s.dimension === subjects[0].dimension)
            .map((s) => ({ id: s.label, label: s.label })),
        },
      } : {}),
      ...(board.length ? { board: boardContext(answers, board, local, focused) } : {}),
    };
    void george.ask(q, Object.keys(desk).length ? { desk } : {});
  }, [george, selection, answers, board, local, focused]);

  // MOVING A CONTROL COSTS NO MODEL TURN. It re-runs the read the control
  // names with one scope argument changed, on the pin runner's path, and every
  // object drawn from that read follows — which is what makes it one change
  // rather than a screen full of them.
  //
  // THE CALL IS NAMED, NOT SENT (P1.i). The request carries the answer post
  // and the call's seq; the server reads the arguments off what the loop
  // recorded. This used to post the whole call — tool and arguments — from
  // the browser's own copy, which meant a figure could reach the screen under
  // a receipts line without any record that it was ever read that way.
  const retune = useCallback(async (key: string, argument: string,
                                    value: string | number) => {
    const object = board.find((o) => o.key === key);
    const turn = object?.turn === undefined ? null : answers[object.turn] ?? null;
    const call = object?.seq === undefined || !turn ? null
      : turn.toolCalls.find((c) => c.seq === object.seq) ?? null;
    const post = turn?.post?.answer_post_id ?? null;
    // No post means the turn was never logged, so there is no stored call to
    // run again. The control does not move rather than running the browser's
    // copy of it.
    if (!object || !call || !post) return;
    try {
      // The control's own name for its argument travels as it is: the two
      // vocabularies meet in metrics.yaml (surface.desk.replay.from_control),
      // never in a component holding a copy of both lists.
      const out = await replayStoredCall(post, object.seq as number, argument, value);
      // `status`, not `state` — the runner's field. Written wrong, this was
      // always truthy-unequal to 'ok', so every control click returned here
      // and the chips did nothing at all.
      if (out.status !== 'ok') return;
      setRetuned((s) => ({
        ...s,
        [object.seq as number]: {
          ...call,
          // The arguments that RAN, as the server resolved them — not the
          // ones this component thought it was asking for.
          arguments: out.arguments,
          result: { rows: out.rows ?? [], meta: out.meta ?? {} },
        } as ToolCall,
      }));
    } catch {
      // A replay that failed leaves the figures that are on screen alone.
      // Showing nothing, or showing the old window under the new label, are
      // both worse than the control simply not having moved.
    }
  }, [board, answers]);

  // A GESTURE ON AN AGENDA ROW IS A DECISION, and George learns from it: what
  // you keep, set aside, open, ask about or leave decides where it ranks next
  // morning (metrics.yaml attention.learning). Recorded once per identity
  // and outcome for this room, fire-and-forget: a record that fails must
  // never stop the gesture. Nothing is recorded for any other object.
  const decided = useRef(new Set<string>());
  const decide = useCallback((o: BoardObject | undefined, outcome: Outcome) => {
    if (!o) return;
    const d = decisionFor(answers, o, outcome, threadId ?? null);
    if (!d || decided.current.has(`${d.what}|${d.outcome}`)) return;
    decided.current.add(`${d.what}|${d.outcome}`);
    void recordDecision(d).catch(() => { /* the gesture stands; the record did not */ });
  }, [answers, threadId]);

  const on: TileActions = useMemo(() => ({
    open: (key) => {
      if (focused !== key) decide(board.find((o) => o.key === key), 'opened');
      setFocused((f) => (f === key ? null : key));
    },
    pick: (label, dimension) => setSelection((s) => (
      s.some((x) => x.label === label)
        ? s.filter((x) => x.label !== label)
        : [...s, { label, dimension: dimension ?? 'store' }]
    )),
    why: (label, dimension) => {
      decide(board.find((o) => o.subject === label), 'asked');
      ask('why?', [{ label, dimension: dimension ?? 'store' }]);
    },
    aside: (key) => {
      decide(board.find((o) => o.key === key), 'dismissed');
      patch(key, { closed: true }); setFocused((f) => (f === key ? null : f));
    },
    patch,
    retune: (key, argument, value) => { void retune(key, argument, value); },
    // MOVING SOMETHING IS A SWAP WITH ITS NEIGHBOUR, not a free-floating
    // index: it keeps the order dense and it means one press does exactly one
    // visible thing, which is what makes it undoable in your head as well as
    // in the stack.
    shift: (key, by) => {
      const order = inOrder(board, local, focused);
      const at = order.findIndex((o) => o.key === key);
      const to = at + by;
      if (at < 0 || to < 0 || to >= order.length) return;
      const swap = order[to];
      setLocal((s) => {
        setHistory((h) => [...h.slice(-19), s]);
        return {
          ...s,
          [key]: { ...s[key], at: to },
          [swap.key]: { ...s[swap.key], at },
        };
      });
    },
    // WHERE YOU PUT IT DOWN. The drag has already moved the board under the
    // cursor by the time this runs — it is called on every crossing, not on
    // release — so it writes the whole arrangement each time and one drag
    // leaves one thing on the undo stack per tile it passed, not per pixel.
    //
    // THE REGION IS PART OF THE DROP, and this is the only place that fact
    // exists. The top of the board is where the lead sits: something dragged
    // up there is being made the point, and something dragged out of it is
    // being told it is not — so the drop writes the size as well as the
    // position, because otherwise the tile springs back to the row you just
    // took it out of and the board looks like it is fighting you.
    move: (key, target, after, region) => {
      const order = inOrder(board, local, focused);
      const at = dropped(order, key, target, after);
      const his = board.find((o) => o.key === key)?.weight;
      const size: Local['size'] | undefined = region === 'lead' ? 'big'
        : his === 'lead' ? 'normal' : undefined;
      if (!at && local[key]?.size === size) return;
      setLocal((s2) => {
        setHistory((h) => [...h.slice(-19), s2]);
        const out = { ...s2 };
        if (at) for (const [k, n] of Object.entries(at)) out[k] = { ...out[k], at: n };
        out[key] = { ...out[key], size };
        return out;
      });
    },
    resize: (key, to) => patch(key, { size: to ?? undefined }),
    keep: (key, kept) => {
      if (kept) decide(board.find((o) => o.key === key), 'kept');
      patch(key, { kept });
    },
  }), [ask, patch, retune, board, local, focused, decide]);

  useEffect(() => { keepLocal(threadId, local); }, [threadId, local]);

  const aside = board.filter((o) => local[o.key]?.closed);
  const clear = useCallback(() => {
    // Put away whatever is open, INCLUDING a standing answer: dismissing it
    // has to outlive the navigate back to "/", or the cold open immediately
    // reopens the thing just closed.
    dismissStanding(threadId);
    // PUTTING THE MORNING AWAY IS A GESTURE TOO. Every agenda row still on
    // the board that nobody touched is recorded as left — not dismissed —
    // so tomorrow George can say "raised Tuesday, left". A row already
    // decided is not also left.
    const already = new Set(Array.from(decided.current, (k) => k.split('|').slice(0, -1).join('|')));
    for (const d of leftBehind(answers, board, already, threadId ?? null)) {
      decided.current.add(`${d.what}|${d.outcome}`);
      void recordDecision(d).catch(() => { /* see above */ });
    }
    // Leaving on purpose: "/" must not walk straight back in.
    forgetLast();
    george.reset(); setSelection([]); setFocused(null);
    setRetuned({});
    // WHAT YOU KEPT SURVIVES. Clearing is for the conversation, not for the
    // things you decided to hold on to — losing those to a button meant for
    // starting fresh is the reason people stop using a keep.
    setLocal((s) => Object.fromEntries(
      Object.entries(s).filter(([, v]) => v.kept)));
    setHistory([]);
    navigate('/george');
  }, [george, navigate, threadId, answers, board]);

  return (
    <div className="room">
      <Rail busy={busy} needsYou={approvals.data?.length} onNew={clear} />

      <main className="r-main">
        {/* ONE COLUMN, CENTRED, AND IT IS THE MEASURE THE COMPOSER USES.
            A wrapper rather than a rule on every child: the reading has its
            own measure (66ch, because it is prose) and forcing the page's
            onto it would run his words the full width of the board. Reported
            2026-09-14 — "at 100% size theres lots of empty space on the right
            and its not centered". See `--measure` in room.css. */}
        <div className="r-measure">
        {/* Above the board, always — what happened while you were away comes
            before this morning's figures, the same way a caveat does. */}
        <Noticed onLookInto={(item) => navigate(`/w/${item.thread_id}`, {
          state: { ask: 'what happened here? look into it.' },
        })} />

        {empty ? (
          <Opening loading={Boolean(threadId) && thread.loading} />
        ) : (
          <>
            <Working turn={latest} live={busy} />
            {/* SINCE YOU LAST LOOKED. A count of answers with a time after
                the mark this browser kept — derived, never guessed (UI rule
                8) — and only when there is one. What it counts is what
                lands with the glow below. */}
            {arrived > 0 && !busy && (
              <p className="r-label r-since">
                since you last looked · {arrived} {arrived === 1 ? 'answer' : 'answers'} arrived
              </p>
            )}
            {/* THE READING, ABOVE THE BOARD, ALWAYS. His words are not an
                object and cannot be forgotten into one: whatever he says
                this turn is drawn here, with the turn's caveats above it,
                and the objects below are its evidence. See Reading.tsx. */}
            {/* WHAT CAME BEFORE IT, folded to one quiet line — above the
                finding, because that is the order they happened in. */}
            <Earlier count={earlier.length} open={unfolded}
                     onToggle={() => setUnfolded((o) => !o)} />
            <Reading text={latest?.text} notices={notices} reading={latest?.reading} />
            <Board
              answers={answers}
              board={drawn}
              local={local}
              focused={focused}
              selection={selection.map((s) => s.label)}
              live={busy}
              retuned={retuned}
              on={on}
              seenUpTo={firstUnseen(answers, sinceAt)}
            />
            {/* ONE SENTENCE, ALWAYS LAST. It is the third slot of the reading
                and it is drawn here rather than up there, because it is read
                after the evidence: the figures, then what to do about them. */}
            <ReadingNext reading={latest?.reading} />
          </>
        )}

        {latest?.error && <p className="r-note" style={{ marginTop: 18 }}>{latest.error}</p>}

        {/* UNDO IS WHAT MAKES REARRANGING SAFE TO TRY. It shows only when
            there is something to undo — a permanent, always-dead control
            teaches you it does nothing. It undoes YOUR changes to the board,
            never George's reads: what he found is not yours to take back. */}
        {history.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <button type="button" className="r-chip" onClick={undo}>
              ↺ undo {history.length > 1 ? `(${history.length})` : ''}
            </button>
          </div>
        )}

        {aside.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 30 }}>
            <span className="r-label">set aside</span>
            {aside.map((o) => (
              <button key={o.key} type="button" className="r-chip"
                      onClick={() => patch(o.key, { closed: false })}>
                {o.key} ↩
              </button>
            ))}
          </div>
        )}
        </div>
      </main>

      <div className="r-line-wrap">
        <div className="r-measure">
          {selection.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {selection.map((s) => (
                <button key={s.label} type="button" className="r-chip"
                        style={{ pointerEvents: 'auto', borderColor: 'rgba(var(--george), 0.45)' }}
                        onClick={() => on.pick(s.label, s.dimension)}>
                  {s.label} ×
                </button>
              ))}
            </div>
          )}
          <div className="r-line">
            <input
              value={draft}
              placeholder={
                selection.length ? 'say what to do with these'
                  : busy ? 'you can redirect while he reads'
                  : 'say something, or touch something above'
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ask(draft);
                if (e.key === 'Escape') { setDraft(''); setSelection([]); }
              }}
              aria-label="Say something to George"
            />
            {busy ? (
              <button type="button" className="r-send" onClick={() => george.cancel()}
                      title="Stop" aria-label="Stop"
                      style={{ background: 'var(--sunk)', color: 'var(--ink)' }}>■</button>
            ) : (
              <button type="button" className="r-send" onClick={() => ask(draft)}
                      disabled={!draft.trim()} title="Send" aria-label="Send">↑</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The cold open. A greeting and nothing else — asked for in those words. The
 * openers below it are the shortest way into the three things he actually does
 * on a normal morning, not a menu.
 */
function Opening({ loading }: { loading: boolean }) {
  if (loading) return <p className="r-label" style={{ paddingTop: '16vh' }}>Opening…</p>;
  return (
    <div style={{ paddingTop: '14vh', maxWidth: 640 }}>
      <p className="r-greeting">{greeting()}</p>
      <p className="r-greeting-sub">What are we looking at?</p>
      {/*
        NOTHING SUGGESTED HERE. Three example questions used to sit on this
        screen — mine, not George's. Proposing what to ask is his job and he
        has the whole business to draw on; a hardcoded list is me pretending to
        be him, and it is exactly the habit this build keeps falling into.
        Until he speaks first (the briefing), the door stays open and empty.
      */}
    </div>
  );
}

function greeting(): string {
  const hour = Number(new Date().toLocaleString('en-PH', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }));
  if (hour < 12) return 'Morning.';
  if (hour < 18) return 'Afternoon.';
  return 'Evening.';
}
