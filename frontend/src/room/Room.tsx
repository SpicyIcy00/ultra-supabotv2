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
import { replaysToRestore, restoreFromPosts } from './restore';
import { boardContext, buildBoard, dropped, folded, inOrder, shapedByReplay,
         type Local, type BoardObject } from './board';
import { keepLocal, restoreLocal } from './arrangement';
import { callOf, rowsOf, subjectOf, type AnswerTurn, type Block } from './data';
import { Board, turnNotices } from './render';
import { Reading, ReadingNext } from './Reading';
import { FootOffers } from './FootOffers';
import { offersOf, placement } from './actions';
import { usePagesForGhosts } from './ghosts';
import { Earlier } from './Earlier';
import { readDeskDefinitions, replayStoredCall, type DeskAlternative } from '../services/deskApi';
import { Tokens } from './Tokens';
import { Composer, type NamedReference } from './Composer';
import { pageScopeFor } from '../components/george/pageScope';
import type { Bound } from './mentions';
import { asSelection, maxSubjects, subjectOnBoard,
         toggleSubject, type Subject } from './subjects';
import { pathFor, refusalForPerson, resolveFragment, retunedKey, tokensFor,
         type DrawnToken } from './tokenShape';
import type { ToolCall } from '../types/george';
import { Noticed } from './Noticed';
import { WorkLine, Working } from './Working';
import { BehindIt } from './BehindIt';
import { Replay } from './Replay';
import { ThreadHeader, keptPages, type KeptAs, type ThreadView } from './ThreadHeader';
import { ThreadPage } from './ThreadPage';
import { listThreadPins } from '../services/pinsApi';
import { useQuery } from '@tanstack/react-query';
import { listApprovals } from '../services/workflowsApi';
import { Rail } from './Rail';
import { dismissStanding, useStandingOpening } from './useStandingOpening';
import { decisionFor, leftBehind } from './decisions';
import { recordDecision, type Outcome } from '../services/decisionsApi';
import { forgetBelief } from '../services/beliefsApi';
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

  /**
   * WHAT THE QUESTION IS ABOUT — ids, not words (P2.c).
   *
   * A tap resolves the id out of the row it tapped; an `@` resolves it out of
   * a vetted read. Both land here, both travel in `desk.selection`, and the
   * id is what travels: "Rockwell" is a shop and also every product sold in
   * one, and until this card George had to decide which.
   */
  const [selection, setSelection] = useState<Subject[]>([]);
  // The page an `@page` bound, which is `page_scope` on the question — the
  // field that injects a reader bound to this caller and this page. A page
  // MENTIONED is a page in scope; nothing here writes one.
  const [scope, setScope] = useState<{ id: string; title: string } | null>(null);
  // What was named and binds nothing: a rule, today. George is told its name
  // and its id, and what to do about it stays his tool call.
  const [named, setNamed] = useState<NamedReference[]>([]);
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
  // Reads re-run because somebody moved a token or a control, keyed
  // `turn:seq`. Deliberately not sent back to George as though he had decided
  // it: what he is told is the window on the desk, on the next question
  // (metrics.yaml surface.desk.replay).
  //
  // AND IT SURVIVES A RELOAD SINCE P1.j. Each change is appended to the
  // answer post by the endpoint (P1.i) and read back on opening — the newest
  // per call, run again rather than restored from a copy, so a restored
  // figure wears the time it was read and not the time the first one was.
  const [retuned, setRetuned] = useState<Record<string, ToolCall>>({});
  // The board frame a replay returned for a change that reshaped the rows.
  // Only for those: a window keeps the object it had (`replay.changes_shape`).
  const [shapes, setShapes] = useState<Record<string, Block[]>>({});
  // A replay in flight, and the tool's own words when one was refused. Both
  // are drawn — a control that silently did nothing is the worst of the three
  // states it could be in.
  const [moving, setMoving] = useState(0);
  const [refusal, setRefusal] = useState<string | null>(null);

  // THE DEFINITIONS THE TOKENS ARE DRAWN FROM — metrics.yaml, served. Which
  // arguments are movable, what each may be moved to, the words each answers
  // to when typed. Nothing here is a figure and nothing here is George's, so
  // it is read once and never again.
  const desk = useQuery({
    queryKey: ['desk-definitions'],
    queryFn: readDeskDefinitions,
    staleTime: Infinity,
    retry: false,
  });

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
  // WHICH OF THE THREAD'S FOUR VIEWS IS OPEN (P2.a, P2.e). `talk` is the
  // reading and the board; `behind` is every read this thread stands on, with
  // its receipts (P1.k); `replay` is the work itself, walked a step at a time
  // (P2.e); `page` is what this thread would be if it were kept. One URL, four
  // readings of what is already loaded — none of them is a route, so coming
  // back from one does not put you somewhere else.
  const [view, setView] = useState<ThreadView>('talk');
  // The read a tapped figure asked for, keyed `turn:seq` — the same key the
  // board uses, because seq restarts every turn. Only `behind` reads it.
  const [focus, setFocus] = useState<string | null>(null);
  // The page this thread was just kept as, so the header names it without
  // waiting for the listing to come back round. The query below is still the
  // authority; this only fills the gap between the write and the refetch.
  const [justKept, setJustKept] = useState<KeptAs | null>(null);
  // WHETHER THIS THREAD HAS BEEN KEPT, AND AS WHAT (P2.a). The pins this
  // thread produced, joined by the conversations in it — so a page named here
  // is a page that exists. Read, never assumed: the header draws *checking*,
  // *could not be read* and the answer as three separate things, because "not
  // kept" is a claim about the world (UI rule 8).
  const keptQuery = useQuery({
    queryKey: ['thread-pins', threadId ?? george.threadId ?? null],
    queryFn: () => listThreadPins((threadId ?? george.threadId) as string),
    enabled: Boolean(threadId ?? george.threadId),
    staleTime: 30_000,
    retry: false,
  });
  const kept = useMemo(() => {
    const read = keptPages(keptQuery.data);
    // The page just created leads, until the listing carries it too. Never a
    // duplicate: the same page from both sources is one entry.
    if (!justKept || read.some((k) => k.pageId === justKept.pageId)) return read;
    return [justKept, ...read];
  }, [keptQuery.data, justKept]);
  const keptState: 'loading' | 'failed' | 'loaded' =
    justKept ? 'loaded'
      : !(threadId ?? george.threadId) ? 'loaded'
        : keptQuery.isPending ? 'loading'
          : keptQuery.isError ? 'failed' : 'loaded';
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

  // ANOTHER THREAD IS ANOTHER THREAD (P2.a). The view and the page just kept
  // both belong to the conversation that was open: carrying them across would
  // put one thread's page name in another thread's header, which is the exact
  // claim UI rule 8 exists to stop. The query is keyed by thread and answers
  // for itself; this clears what was held locally.
  useEffect(() => { setView('talk'); setFocus(null); setJustKept(null); }, [threadId]);

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
  // AND ASKING RETURNS TO THE TALK (P1.k). Behind it and Page are views on what
  // has already happened; a question is a request for something new, and an
  // answer arriving behind a list nobody is looking at is the "stuff came out
  // but it just disappeared" shape all over again.
  useEffect(() => { if (busy) { setView('talk'); setFocus(null); } }, [busy]);
  const drawn = unfolded ? board : shown;
  // The turn's caveats, minus the ones its objects already carry — computed
  // over what is DRAWN, because a caveat carried by a tile nobody can see has
  // not been said (UI rule 4).
  const notices = useMemo(
    () => turnNotices({ answers, board: drawn, local, focused }),
    [answers, drawn, local, focused],
  );
  // WHERE EVERY OFFER GOES, DECIDED ONCE (P2.d). Over what is DRAWN, for the
  // same reason the caveats are: an offer placed on a tile that folded away is
  // an offer nobody can take, and it belongs at the foot instead.
  const offers = useMemo(
    () => placement(offersOf(latest), drawn, answers),
    [latest, drawn, answers],
  );
  // EVERY NAME THE BOARD IS DRAWING, for the grey completion. Off the rows the
  // objects draw, so a completion is a word the data carried and never one
  // anybody inferred — the same rule the selection is held to.
  // THE CALLER'S OWN PAGES, through the door P2.c already opened (`@`). One
  // cached read of things that exist, no SQL on the path and no model on it;
  // the ghost uses only the ones whose title NAMES something on the board, so
  // this is a completion and never a menu of every page.
  const ownPages = usePagesForGhosts();
  const boardSubjects = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const o of drawn) {
      const rows = rowsOf(callOf(answers[o.turn], o.seq));
      for (const name of [o.subject, ...rows.map((r) => subjectOf(r))]) {
        const said = (name ?? '').trim();
        if (!said || seen.has(said.toLowerCase())) continue;
        seen.add(said.toLowerCase());
        names.push(said);
      }
    }
    return names;
  }, [drawn, answers]);
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

  // WHAT A QUESTION TRAVELS WITH. Named apart from `ask` because a fragment
  // never reaches it: this is the one path that costs a model turn.
  const askGeorge = useCallback((text: string, subjects = selection) => {
    const q = text.trim();
    if (!q) return;
    setDraft('');
    // A REFUSAL BELONGS TO THE GESTURE THAT CAUSED IT (the dogfood log,
    // 2026-09-15). It was cleared only when the next replay STARTED, so a
    // refused move left its sentence under every turn after it — the owner's
    // screenshots show one caveat sitting under two different boards with
    // different tokens above it, which on its own makes every later gesture
    // look like it failed. Asking a question is the end of that gesture.
    setRefusal(null);
    // IDS, NOT LABELS (P2.c). `asSelection` reads the ids the rows carried —
    // or the ones a completion resolved — and keeps the one dimension that
    // travels, which is `DeskSelection`'s own shape. It used to send
    // `{id: label}`, so every subject reached George as a word.
    const picked = asSelection(subjects);
    const desk = {
      ...(picked ? { selection: picked } : {}),
      ...(named.length ? { references: named } : {}),
      ...(board.length ? { board: boardContext(answers, board, local, focused) } : {}),
    };
    void george.ask(q, {
      ...(Object.keys(desk).length ? { desk } : {}),
      // An `@page` is the page this is asked FROM: the route injects a reader
      // bound to this caller and this page, and without it the tool is not in
      // his schema at all (architecture rule 4).
      ...(scope ? { pageScope: pageScopeFor(scope.id, scope.title) } : {}),
    });
  }, [george, selection, named, scope, answers, board, local, focused]);

  /**
   * ONE REPLAY PATH, FOR EVERY DOOR INTO IT (P1.j).
   *
   * A tapped token, a typed fragment and a control George composed are three
   * gestures and one act: run reads already on screen again with one scope
   * argument changed. No model. The call is NAMED, not sent (P1.i) — the
   * request carries the answer post and the call's seq, and the server reads
   * the arguments off what the loop recorded.
   *
   * EVERY READ ON THAT ARGUMENT MOVES TOGETHER, because half a board on
   * August and half on last week is a screen that cannot be read at all.
   *
   * AND A REFUSAL IS SAID. A tool declining to compare a window still in
   * progress answers in its own sentence; swallowing it would leave the old
   * figures sitting under the label of a window nobody is looking at.
   */
  const runReplay = useCallback(async (
    targets: { post: string; turn: number; seq: number }[],
    argument: string, value: unknown,
  ) => {
    if (!targets.length) return false;
    const reshapes = (desk.data?.replay?.changes_shape ?? []).includes(argument);
    setMoving((n) => n + 1);
    setRefusal(null);
    try {
      const outs = await Promise.all(targets.map((t) => (
        replayStoredCall(t.post, t.seq, argument, value)
          .then((out) => ({ t, out }))
          .catch(() => null)
      )));
      const calls: Record<string, ToolCall> = {};
      const frames: Record<string, Block[]> = {};
      let refused: string | null = null;
      for (const got of outs) {
        if (!got) continue;
        const { t, out } = got;
        const key = retunedKey(t.turn, t.seq);
        if (out.status !== 'ok') { refused = refused ?? out.refusal ?? null; continue; }
        // ALL OF THE ROWS OR NONE. A read the loop would not have sent whole
        // does not move the board either: a mark over the first 120 of 365 is
        // a different and wrong mark. The sentence is the definitions', not
        // this component's.
        if (!out.rows_complete) {
          refused = refused ?? String(desk.data?.replay?.rows_incomplete_says ?? '');
          continue;
        }
        const before = retuned[key] ?? callOf(answers[t.turn], t.seq);
        calls[key] = {
          ...(before ?? { seq: t.seq, tool: out.tool }),
          // The arguments that RAN, as the server resolved them — not the
          // ones this component thought it was asking for.
          arguments: out.arguments,
          result: { rows: out.rows ?? [], meta: out.meta ?? {} },
        } as ToolCall;
        if (reshapes && out.blocks?.length) frames[key] = out.blocks as Block[];
      }
      if (Object.keys(calls).length) setRetuned((s) => ({ ...s, ...calls }));
      if (Object.keys(frames).length) setShapes((s) => ({ ...s, ...frames }));
      setRefusal(refused);
      return Object.keys(calls).length > 0;
    } finally {
      setMoving((n) => n - 1);
    }
  }, [desk.data, answers, retuned]);

  /**
   * MOVING A TOKEN, which is what every gesture in this feature comes down to.
   *
   * A NAVIGATION change is answered by the replay alone: the figures carry
   * their own receipts and their own read time, and there is nothing left to
   * interpret that they do not say. An ANALYTICAL one draws the figure first
   * and then asks George to read it — `fragments.analytical_asks_anyway`,
   * because the number is not the answer and a reading is not a thing to drop
   * in order to win a stopwatch.
   */
  const move = useCallback(async (
    token: DrawnToken, alternative: DeskAlternative, said?: string,
  ) => {
    const ran = await runReplay(token.targets, token.argument, alternative.value);
    if (ran && token.kind === 'analytical') askGeorge(said ?? alternative.label);
  }, [runReplay, askGeorge]);

  // A control George composed, through the same path. Its own name for its
  // argument travels as it is: the two vocabularies meet in metrics.yaml
  // (surface.desk.replay.from_control), never in a component holding a copy
  // of both lists.
  const retune = useCallback(async (key: string, argument: string,
                                    value: string | number) => {
    const object = board.find((o) => o.key === key);
    const turn = object?.turn === undefined ? null : answers[object.turn] ?? null;
    const post = turn?.post?.answer_post_id ?? null;
    // No post means the turn was never logged, so there is no stored call to
    // run again. The control does not move rather than running the browser's
    // copy of it.
    if (!object || object.seq === undefined || !post) return;
    await runReplay([{ post, turn: object.turn, seq: object.seq }], argument, value);
  }, [board, answers, runReplay]);

  /**
   * THE RECORD, READ BACK (P1.j) — the other half of P1.i.
   *
   * Every change was appended to the answer post and nothing read it, so a
   * reload drew the STORED window under figures somebody had moved. Opening a
   * thread now runs the newest change per call again. Again, not from a copy:
   * the record keeps the change and not the rows, and a number on this screen
   * wears the time it was read (UI rule 6).
   */
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (!threadId || !thread.ready || !desk.data) return;
    if (restored.current === threadId || !george.turns.length) return;
    restored.current = threadId;
    const max = Number(desk.data.replay?.max_restored_per_open ?? 0);
    for (const r of replaysToRestore(george.turns, thread.posts, max)) {
      void runReplay([{ post: r.post, turn: r.turn, seq: r.seq }], r.argument, r.value);
    }
  }, [threadId, thread.ready, thread.posts, desk.data, george.turns, runReplay]);

  // THE ARGUMENTS THE LOOP ACCEPTED, over what is DRAWN — a token for a read
  // nobody can see would offer to move something that is not on the screen.
  const tokens = useMemo(
    () => tokensFor({ defs: desk.data, answers, board: drawn, retuned }),
    [desk.data, answers, drawn, retuned],
  );

  /**
   * EVERY DRAWN READ THAT COULD TAKE A SCOPE ARGUMENT — which is not the same
   * list as a token's targets (P2.c).
   *
   * A token is drawn only where the argument is already ON the call, because
   * a token is a value you can see and move. "Compare these" is the opposite
   * case: the board is grouped by shop with no shop filter at all, so there is
   * no shop token, and the change to make is to ADD the argument. The reads it
   * applies to are therefore every drawn read whose tool has somewhere to put
   * it, read off the same served map the token uses.
   */
  const targetsFor = useCallback((argument: string) => {
    if (!desk.data) return [];
    const out: { post: string; turn: number; seq: number }[] = [];
    const seen = new Set<string>();
    for (const o of drawn) {
      if (o.seq === undefined) continue;
      const turn = answers[o.turn];
      const post = turn?.post?.answer_post_id ?? null;
      const call = retuned[retunedKey(o.turn, o.seq)] ?? callOf(turn, o.seq);
      if (!post || !call || !pathFor(desk.data, call.tool, argument)) continue;
      const key = retunedKey(o.turn, o.seq);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ post, turn: o.turn, seq: o.seq });
    }
    return out;
  }, [desk.data, drawn, answers, retuned]);

  /**
   * SAYING SOMETHING — which is not always asking something (P1.j).
   *
   * "last month" is not a question. Sending it to the model costs a round
   * trip, a model turn and the risk that he reads it as something else, to
   * arrive at a call the record already holds with one argument different. So
   * a short thing that names one of the alternatives ON SCREEN is run as a
   * replay instead.
   *
   * ANYTHING THAT DOES NOT RESOLVE IS A QUESTION, unchanged. There is no
   * fuzzy match and no "did you mean": the failure mode of this whole feature
   * is a model turn, which is what would have happened anyway.
   */
  const ask = useCallback((text: string, subjects = selection) => {
    const q = text.trim();
    if (!q) return;
    // "COMPARE THESE" IS A QUESTION, AND THERE IS NO CODE FOR IT (2026-09-15).
    //
    // It used to be a replay: two shops picked scoped the read on screen to
    // their two ids, no model turn, 528 ms. The owner reported it as not
    // working twice — the second time after the token had been fixed to read
    // their NAMES rather than their ids, which is how it became clear the
    // label was never the whole of it. A narrowed chart says nothing ABOUT
    // two shops, and "compare" asks for something said.
    //
    // So the shortcut is gone and nothing replaced it: with subjects picked,
    // `fragment` is already null and the line below sends the words to George
    // with the selection attached, exactly as every other short instruction
    // goes. The behaviour is the absence, which is why there is no branch
    // here to read.
    const fragment = subjects.length ? null : resolveFragment(q, tokens, desk.data);
    if (!fragment) { askGeorge(q, subjects); return; }
    setDraft('');
    // The one token that costs a turn on purpose. What is asked of him is a
    // definition (`fragments.correction.asks`) rather than a string somebody
    // typed into a button — and whether a belief is recorded is HIS act: the
    // room holds no writer and may not (architecture rule 4).
    if (fragment.kind === 'correction') { askGeorge(fragment.asks, subjects); return; }
    void move(fragment.token, fragment.alternative, q);
  }, [askGeorge, move, tokens, desk.data, selection, runReplay, targetsFor]);

  /**
   * WHAT AN `@` PICKED, PUT WHERE IT BELONGS (P2.c).
   *
   * Three destinations, because three things are being named. A shop, a
   * product or a supplier is a SUBJECT and joins the selection, which is the
   * same place a tap puts one — one mechanism, two doors. A page binds the
   * SCOPE, which is what injects a reader bound to this caller and that page.
   * A rule binds neither and is named on the question: there is no request
   * field for a workflow, and running one is George's tool call and the
   * owner's decision.
   *
   * WHICH IS WHICH IS THE DEFINITIONS' TO SAY, read in `mentions.bind` off
   * `selection.mentions.kinds`. A kind this room does not recognise binds
   * nothing at all rather than being assumed to be a subject.
   */
  const bound = useCallback((b: Bound) => {
    if (b.binds === 'selection') {
      setSelection((held) => toggleSubject(held, b.subject, maxSubjects(desk.data)));
      return;
    }
    if (b.binds === 'page_scope') {
      setScope({ id: b.pageId, title: b.title });
      return;
    }
    setNamed((held) => (held.some((x) => x.id === b.id)
      ? held
      : [...held, { kind: b.kind, id: b.id, label: b.label }]));
  }, [desk.data]);

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
    // A TAP RESOLVES AN ID (P2.c). The label came off a row and so does the
    // id beside it, at the column the definitions declare for this dimension —
    // and where no row carries one, the subject says the label is all there
    // was rather than passing a name off as a key.
    pick: (label, dimension) => setSelection((s) => toggleSubject(
      s, subjectOnBoard({ answers, board: drawn, retuned, defs: desk.data },
                         label, dimension ?? 'store'),
      maxSubjects(desk.data),
    )),
    why: (label, dimension) => {
      decide(board.find((o) => o.subject === label), 'asked');
      ask('why?', [subjectOnBoard({ answers, board: drawn, retuned, defs: desk.data },
                                  label, dimension ?? 'store')]);
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
    // FORGET A VIEW — the memory's one write, and it is the person's.
    //
    // The row goes the moment they press it, before the server answers: the
    // gesture is theirs, they know what they meant, and a Forget that waits
    // on a round trip is a Forget people press twice. If the write fails the
    // row comes back, which is the honest rendering of a view he still holds.
    forget: (key, beliefId) => {
      if (!beliefId) return;
      setLocal((s) => {
        setHistory((h) => [...h.slice(-19), s]);
        const was = s[key]?.forgot ?? [];
        return was.includes(beliefId) ? s
          : { ...s, [key]: { ...s[key], forgot: [...was, beliefId] } };
      });
      void forgetBelief(beliefId).catch(() => {
        setLocal((s) => ({
          ...s,
          [key]: { ...s[key], forgot: (s[key]?.forgot ?? []).filter((i) => i !== beliefId) },
        }));
      });
    },
  }), [ask, patch, retune, board, drawn, answers, retuned, desk.data, local, focused, decide]);

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
    george.reset(); setSelection([]); setScope(null); setNamed([]); setFocused(null);
    setView('talk'); setFocus(null); setJustKept(null);
    setRetuned({}); setShapes({}); setRefusal(null);
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
        {/* THE THREAD'S OWN HEADER (P2.a), and the first thing on the column
            because it says what you are looking at before it says anything
            about the world. Not drawn on an empty room: there is no thread to
            have three views of, and "not kept" about nothing is noise. */}
        {!empty && (
          <ThreadHeader view={view} kept={kept} state={keptState}
                        onView={(to) => { setView(to); if (to !== 'behind') setFocus(null); }} />
        )}
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
            {/* WHAT THE WORK WAS, ONCE IT IS OVER (P1.k). The trail above is
                live and goes when the turn does; this is what is left of it —
                four counts off the turn's own frames, the steps one tap
                below, and the whole thread's reads one tap sideways. */}
            {!busy && (
              <WorkLine turn={latest}
                        onBehind={view === 'behind' ? undefined
                          : () => { setView('behind'); setFocus(null); }} />
            )}
            {/* SINCE YOU LAST LOOKED. A count of answers with a time after
                the mark this browser kept — derived, never guessed (UI rule
                8) — and only when there is one. What it counts is what
                lands with the glow below. */}
            {arrived > 0 && !busy && (
              <p className="r-label r-since">
                since you last looked · {arrived} {arrived === 1 ? 'answer' : 'answers'} arrived
              </p>
            )}
            {view === 'behind' ? (
              // A VIEW, NOT A PANEL. The evidence replaces the conversation
              // rather than sitting under it: a list of every read in the
              // thread beneath the answer it belongs to would be a page you
              // scroll past. P2.a made it one of the header's three.
              <BehindIt answers={answers} focus={focus}
                        onBack={() => { setView('talk'); setFocus(null); }} />
            ) : view === 'replay' ? (
              // THE WORK, WALKED (P2.e). A view rather than a panel, for the
              // same reason Behind it is one: it is an account of the whole
              // conversation and it replaces the conversation while you read
              // it. Nothing on this path asks anything — every rung is off
              // frames that already arrived.
              <Replay turns={george.turns} onBack={() => setView('talk')} />
            ) : view === 'page' ? (
              // THE THIRD VIEW: what this thread would be if it were kept, and
              // what it would not take. A draft of something that already
              // exists — the gesture names it, it does not assemble it.
              <ThreadPage turns={george.turns} kept={kept}
                          threadId={threadId ?? george.threadId ?? null}
                          onKept={(page) => setJustKept({ pageId: page.id, title: page.title })} />
            ) : (
            <>
              {/* THE READING, ABOVE THE BOARD, ALWAYS. His words are not an
                  object and cannot be forgotten into one: whatever he says
                  this turn is drawn here, with the turn's caveats above it,
                  and the objects below are its evidence. See Reading.tsx. */}
              {/* WHAT CAME BEFORE IT, folded to one quiet line — above the
                  finding, because that is the order they happened in. */}
              <Earlier count={earlier.length} open={unfolded}
                       onToggle={() => setUnfolded((o) => !o)} />
              <Reading text={latest?.text} notices={notices} reading={latest?.reading}
                       calls={latest?.toolCalls}
                       onFigure={(seq) => {
                         setFocus(`${answers.length - 1}:${seq}`);
                         setView('behind');
                       }} />
              {/* WHAT THESE FIGURES ARE OF, AND HOW TO MOVE IT (P1.j). The
                  arguments the loop accepted, drawn between his reading and the
                  evidence it is about — which is where they are read, and where
                  what they change is directly below them. Tapping one is a
                  replay; typing one of the same words is the same act. */}
              <Tokens
                tokens={tokens}
                correction={desk.data?.fragments?.correction?.token}
                moving={moving > 0}
                refusal={refusalForPerson(refusal, desk.data?.replay)}
                detailWord={String(desk.data?.replay?.refused_detail_word ?? 'why')}
                onMove={(token, alternative) => { void move(token, alternative); }}
                onCorrect={() => {
                  const asks = desk.data?.fragments?.correction?.asks;
                  if (asks) askGeorge(asks);
                }}
              />
              <Board
                answers={answers}
                offers={offers.onRows}
                board={shapedByReplay(drawn, shapes)}
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
              {/* AND WHAT TO DO ABOUT ALL OF IT (P2.d). Only the offers no row
                  on the board could carry: an offer about one shop is drawn on
                  that shop, and this is where the ones about the answer go —
                  beside `next`, because that is where "what now" is read.
                  Nothing is lost between the two, which is what `placement`
                  deciding both halves at once buys. */}
              <FootOffers offers={offers.foot} answers={answers} on={on} />
            </>
            )}
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

      {/* THE LINE YOU TALK ON, AND THE TWO DOORS ONTO A SUBJECT (P2.c).
          It is a component now because the `@` menu has to be held by a test
          and Room.tsx is rendered by none. What sits above it is what the
          question will travel with: subjects as ids, the page in scope, and
          anything named that binds neither. */}
      <Composer
        draft={draft}
        onDraft={setDraft}
        subjects={selection}
        scope={scope}
        named={named}
        defs={desk.data}
        busy={busy}
        // WHAT THE GREY COMPLETION IS BUILT FROM (P2.d) — all of it already on
        // screen. The tokens are the scope the work is on, so a completion off
        // one is a REPLAY; the subjects are what the board is drawing; the
        // pages are the caller's own, so one naming a subject can complete.
        // No new read on this path and no model on it either.
        tokens={tokens}
        drawn={boardSubjects}
        pages={ownPages}
        onUnpick={(subject) => setSelection(
          (held) => toggleSubject(held, subject, maxSubjects(desk.data)))}
        onUnscope={() => setScope(null)}
        onUnname={(r) => setNamed((held) => held.filter((x) => x.id !== r.id))}
        onBind={bound}
        onSend={() => ask(draft)}
        onStop={() => george.cancel()}
        onClear={() => { setDraft(''); setSelection([]); setScope(null); setNamed([]); }}
      />
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
