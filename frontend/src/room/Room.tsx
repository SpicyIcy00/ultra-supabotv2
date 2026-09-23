/**
 * THE ROOM — where the work is.
 *
 * You arrive somewhere rather than starting a session. What is on screen is
 * the board: every object Bob has put there, still drawing the read it was
 * made from. It is not the last answer, and a follow-up transforms an object
 * rather than drawing a second one beneath it.
 *
 * DRAWN AS THE DESIGN'S BESIDE ROOM since P2S.1 (`ops/ideal/bob-ahead-of-me.html`):
 * him, his words under him, the figures flowing on the right, a line from him
 * to each. What is yours: open a figure, sort a table, pick a subject to talk
 * about. All instant, all local, never sent back to Bob as though he had
 * decided it. Only a new FACT costs a turn.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useBob } from '../hooks/useBob';
import { useThread } from '../hooks/useThread';
import { threadHistory } from '../components/bob/threadHistory';
import { replaysToRestore, restoreFromPosts } from './restore';
import { boardContext, buildBoard, folded, ledeOf, placesCaveat, shapedByReplay,
         type Local, type BoardObject } from './board';
import { keepLocal, restoreLocal } from './arrangement';
import { callOf, rowsOf, subjectOf, type AnswerTurn, type Block } from './data';
import { Board, turnNotices } from './render';
import { FiguresArea, Wires, scrollToFigure } from './FiguresArea';
import { AliveMark } from './AliveMark';
import { markStateOf } from './alive';
import { HEADLINE_RESTATED_AT, bodyOf, caveatUnshown, claimAndStanding, restated,
         stickyTop, thoughtsOf, travels, unmark } from './beside';
import { pageOf } from './page';
import { placeFigures as figuresInText } from './figures';
import { identitiesFrom } from './identity';
import { readStoreAppearance } from '../services/storesApi';
import { IdentityContext } from './swatch';
import { ExplainsOnlyContext, drawnOnly, explainsOnlyFrom } from './noticeDrawing';
import { Narration, Reading, ReadingAsks, ReadingNext, unsaid } from './Reading';
import { FootOffers } from './FootOffers';
import { offersOf, placement } from './actions';
import { usePagesForGhosts } from './ghosts';
import { Earlier } from './Earlier';
import { EstateSwitch } from './EstateSwitch';
import { estateFor, scopeChip } from './estate';
import { readDeskDefinitions, replayStoredCall, type DeskAlternative } from '../services/deskApi';
import { Tokens } from './Tokens';
import { Composer, type NamedReference } from './Composer';
import { pageScopeFor, threadScope } from '../components/bob/pageScope';
import type { Bound } from './mentions';
import { asSelection, maxSubjects, subjectOnBoard,
         toggleSubject, type Subject } from './subjects';
import { pathFor, refusalForPerson, resolveFragment, retunedKey, tokensFor,
         type DrawnToken } from './tokenShape';
import type { ToolCall } from '../types/bob';
import { Noticed } from './Noticed';
import { KeptPage } from './KeptPage';
import { pageOpened } from './pageOpened';
import { Doing } from './Working';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNeedsYou } from '../hooks/useNeedsYou';
import { Rail } from './Rail';
import { dismissStanding, useStandingOpening } from './useStandingOpening';
import { MorningLine } from './MorningLine';
import { openMorning, switchMorning, type Morning } from '../services/standingApi';
import { decisionFor, leftBehind } from './decisions';
import { recordDecision, type Outcome } from '../services/decisionsApi';
import { forgetBelief } from '../services/beliefsApi';
import { dismiss as dismissItem } from '../services/dismissalsApi';
import { arrivedSince, firstUnseen, forgetLast, lastSeen, lastThread, questionsOf,
         remember } from './history';
import type { TileActions } from './tiles';
import { useReader } from './Mic';
import { asksToHear, spokenClaim } from './voice';
import './room.css';

export default function Room() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const asked = useRef<string | null>(null);
  const bob = useBob();
  const thread = useThread(threadId ?? '');

  /**
   * WHAT THE QUESTION IS ABOUT — ids, not words (P2.c).
   *
   * A tap resolves the id out of the row it tapped; an `@` resolves it out of
   * a vetted read. Both land here, both travel in `desk.selection`, and the
   * id is what travels: "Rockwell" is a shop and also every product sold in
   * one, and until this card Bob had to decide which.
   */
  const [selection, setSelection] = useState<Subject[]>([]);
  // The page an `@page` bound, which is `page_scope` on the question — the
  // field that injects a reader bound to this caller and this page. A page
  // MENTIONED is a page in scope; nothing here writes one.
  const [scope, setScope] = useState<{ id: string; title: string } | null>(null);
  // What was named and binds nothing: a rule, today. Bob is told its name
  // and its id, and what to do about it stays his tool call.
  const [named, setNamed] = useState<NamedReference[]>([]);
  // WHAT YOU HAVE DONE TO THE BOARD — where things sit, how big they are,
  // what you are holding on to. Restored per thread, because an arrangement
  // you made is worth more than the trouble of remembering it, and lost on a
  // reload it would teach you not to bother.
  const [local, setLocal] = useState<Record<string, Local>>(
    () => restoreLocal(threadId));
  const [focused, setFocused] = useState<string | null>(null);
  // Reads re-run because somebody moved a token or a control, keyed
  // `turn:seq`. Deliberately not sent back to Bob as though he had decided
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
  // WHICH BUSINESS THE NEXT QUESTION IS ABOUT (P2.g). Null is the
  // definitions' own default, which is what every question has meant until
  // now — so it travels as nothing and can only narrow. It is scope on the
  // NEXT question and not a view over what is drawn, which is why moving it
  // redraws nothing and costs no turn.
  const [estate, setEstate] = useState<string | null>(null);
  // HANDS-FREE (P2S.5(c)): each answer that lands is read aloud, the claim
  // and nothing else. Kept per browser — a switch you turned on stays on — and
  // off wherever storage is not there to say otherwise.
  const [handsFree, setHandsFree] = useState<boolean>(() => {
    try { return localStorage.getItem('bob.handsFree') === 'on'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('bob.handsFree', handsFree ? 'on' : 'off'); } catch { /* kept for this visit only */ }
  }, [handsFree]);
  const reader = useReader();

  // THE DEFINITIONS THE TOKENS ARE DRAWN FROM — metrics.yaml, served. Which
  // arguments are movable, what each may be moved to, the words each answers
  // to when typed. Nothing here is a figure and nothing here is Bob's, so
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
  // W2.2: versions waiting on promotion AND drafts that arrived as decisions
  // for this person, from both loaded results (hooks/useNeedsYou).
  const needsYou = useNeedsYou();
  const [draft, setDraft] = useState('');
  const opened = useRef<string | null>(null);
  // THE FOUR ELEMENTS THE LEADING LINES ARE MEASURED BETWEEN (P2S.1(c)).
  const frameRef = useRef<HTMLDivElement>(null);
  const himRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  // WHETHER HIS WORDS RUN PAST THE BOTTOM OF THEIR COLUMN, so the column can
  // fade there instead of cutting a sentence (the log, 2026-09-17).
  // HOW THE FIGURES' ARRIVAL IS GOING, from the board (P2S.2(d)). The mark
  // stays `reading` while any are on their way, and pulses as each lands.
  const [landing, setLanding] = useState({ pending: 0, arrived: 0 });
  const onLanding = useCallback((p: { pending: number; arrived: number }) => {
    setLanding((was) => (was.pending === p.pending && was.arrived === p.arrived ? was : p));
  }, []);

  // A stored thread opens once, with its rows and compositions restored from
  // the posts — so the board a reload rebuilds is the board that was there.
  //
  // WITH ITS OWN PAGE SCOPE (W1.4 — the bug at this line): `threadScope` read
  // the page a thread's answers had read and nothing passed it, so a thread
  // reopened here lost its page and its next question could not see it.
  //
  // AND NOT OVER ITSELF: a thread the stream is already holding — "Open in
  // Bob" from beside a page, perhaps mid-answer — is already on screen, and
  // re-opening it from the record would stop the answer being written.
  const ownPages = usePagesForGhosts();
  useEffect(() => {
    if (!threadId || opened.current === threadId) return;
    if (bob.threadId === threadId) { opened.current = threadId; return; }
    if (!thread.ready) return;
    opened.current = threadId;
    bob.open(
      restoreFromPosts(threadHistory(thread.posts, thread.chat, threadId), thread.posts),
      threadId,
      threadScope(thread.posts, ownPages),
    );
  }, [threadId, thread.ready, thread.posts, thread.chat, bob, ownPages]);

  useEffect(() => {
    if (!threadId && bob.storedThreadId) navigate(`/w/${bob.storedThreadId}`, { replace: true });
  }, [threadId, bob.storedThreadId, navigate]);

  const allAnswers = useMemo(
    () => bob.turns.filter((t): t is AnswerTurn => t.role === 'bob'),
    [bob.turns],
  );
  // WHAT EACH ANSWER WAS ASKED, in the person's words (the log, 2026-09-18).
  const questions = useMemo(() => questionsOf(bob.turns), [bob.turns]);
  // BACK TO AN EARLIER QUESTION AND ITS RESULTS (the log, 2026-09-18: "when you
  // can go to your last question and its last resutls"). Null is the newest.
  // Stepping back draws the room AS IT WAS after that answer: the board is
  // built from the stored turns up to it, by the same function that built it
  // then, so it costs no model call and no read. A new answer, or asking,
  // returns to the newest; while he works, the room is always the newest.
  const [view, setView] = useState<number | null>(null);
  useEffect(() => { setView(null); }, [allAnswers.length]);
  const at = view === null || bob.busy
    ? allAnswers.length - 1 : Math.min(view, allAnswers.length - 1);
  const atNewest = at === allAnswers.length - 1;
  const answers = useMemo(
    () => (atNewest ? allAnswers : allAnswers.slice(0, at + 1)),
    [allAnswers, at, atNewest],
  );
  const board = useMemo(() => buildBoard(answers), [answers]);
  const busy = bob.busy;
  const latest = answers[answers.length - 1] ?? null;
  // A DASHBOARD IS OPENED, NOT WRITTEN UP (W2.4): the kept page this answer
  // built or changed, from the committed write — drawn where the board would be.
  const dashboard = busy ? null : pageOpened(latest);
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

  // THE FIGURE THE ANSWER RESTS ON (the log, 2026-09-17). The first read his
  // CLAIM cites by a figure in it, drawn from this turn; the Board falls back
  // to the block he weighted `lead`. Values the answer carries, never a guess.
  // A FIGURE IN HIS WORDS SCROLLS TO THE FIGURE IT CAME FROM, and lights its
  // READ label for a moment — the door it used to open was Behind it.
  const showFigure = useCallback((seq: number) => {
    scrollToFigure(areaRef.current, answers.length - 1, seq);
  }, [answers.length]);

  // HIS SENTENCES BY THE CHART THEY CITE (the owner, 2026-09-17: "if the ai
  // thoughts are with the charts it feels likes your going thorugh it
  // together"). What no chart takes stays with the rest of his words.
  // HIS CAVEAT IS ON THE PAGE WHERE HIS PAGE PUTS IT (P7) — settled turns only,
  // for the reason the arrangement is: mid-turn there is no page yet.
  const caveatOnPage = !busy && placesCaveat(latest?.composition?.arrangement);
  // AND HIS HEADLINE IS NOT SAID TWICE (P15.b's first half, 2026-09-21).
  //
  // Two places own the answer: this column's headline and the page's opening
  // sentence. The card says the opening sentence IS the answer, so where the
  // lede restates the headline the headline goes and the page keeps it — the
  // Done-when is "nothing on screen repeats the headline". Where the lede says
  // something ELSE, both stay: that is a second thing said, not a repeat.
  //
  // SETTLED TURNS ONLY, and this one matters more than it looks. Mid-turn the
  // page is not drawn at all (`busy ? null` below) while this headline is the
  // one thing on screen carrying his words for the 47-85 s a compose takes.
  // Suppressing it while he works would leave the room blank.
  const headlineOnPage = useMemo(() => {
    if (busy) return false;
    const lede = ledeOf(latest?.composition?.arrangement);
    if (!lede) return false;
    const said = claimAndStanding(unmark((latest?.text ?? '').trim()).plain,
                                  latest?.reading?.claim).claimRaw;
    return Boolean(said) && restated(said, [lede], HEADLINE_RESTATED_AT);
  }, [busy, latest?.composition?.arrangement, latest?.text, latest?.reading?.claim]);
  const thoughts = useMemo(() => {
    if (!latest || busy) return null;
    // A chart that already carries his own thought takes no sentence of the
    // answer as well (the log, 2026-09-17: one point said three times).
    const newest = answers.length - 1;
    const thoughtful = new Set(drawn.flatMap((o) => (
      o.turn === newest && o.thought?.trim() ? [o.seq ?? o.seqs?.[0]] : []
    )).filter((s): s is number => typeof s === 'number'));
    // WHAT THE SCREEN ALREADY SAYS (the owner, 2026-09-18: "if its stating
    // whats already stated or shown in the page … then dont make it say that").
    // The reads this turn draws, and his words already drawn beside them.
    const mine = drawn.filter((o) => o.turn === newest);
    const shown = new Set(mine.flatMap((o) => [o.seq, ...(o.seqs ?? [])])
      .filter((s): s is number => typeof s === 'number'));
    const said = [
      latest.reading?.claim, latest.reading?.next, ...(latest.reading?.asks ?? []),
      ...mine.flatMap((o) => [o.claim, o.thought]),
    ].map((x) => (typeof x === 'string' ? x : ''));
    const got = thoughtsOf(latest.text, latest.reading?.claim, latest.toolCalls, thoughtful,
                           { drawn: shown, said });
    // His caveat, less the answer's exact repeats and anything said again in
    // other words — by the answer or by what is drawn.
    const plain = unmark((latest.text ?? '').trim()).plain;
    const caveat = caveatUnshown(unsaid(latest.reading?.caveat, plain), said, plain);
    // HIS ANSWER AS THE PAGE (P3.n). Only where there are figures to put it
    // among: with nothing drawn there is no page to carry his words, and they
    // stay under him where they have always been.
    const page = mine.length
      ? pageOf(latest.text, latest.reading?.claim, latest.reading?.next, latest.toolCalls) : [];
    return { ...got, caveat, page };
  }, [latest, busy, drawn, answers.length]);
  // A NEW ANSWER IS READ FROM ITS TOP (the log, 2026-09-17: the headline shown
  // from its middle). While he works, the lines above the answer come and go
  // and the browser keeps the column's scroll where the old content was; when
  // the turn settles, the column goes back to its start.
  useEffect(() => {
    if (!busy && wordsRef.current) wordsRef.current.scrollTop = 0;
  }, [busy, answers.length]);
  // WHERE HIS SIDE PINS (D1, 2026-09-23). The owner: *"i couldnt scroll down
  // the left but there was more"*. A sticky column taller than the window it
  // is pinned in cannot be read to its end by scrolling the page, because the
  // page is what moves and the column is what does not. So a tall column pins
  // by its FOOT instead of its head — `beside.stickyTop` — and the end of what
  // he said comes to rest above the line. This is only the MEASUREMENT the
  // rule is given, re-taken whenever the column or the window changes; nothing
  // here is a layout, it sets one property and one attribute.
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const look = () => {
      const fits = travels(el.scrollHeight, window.innerHeight);
      el.dataset.travels = fits ? 'yes' : 'no';
      el.style.setProperty('--aside-top', `${stickyTop(el.scrollHeight, window.innerHeight)}px`);
    };
    look();
    window.addEventListener('resize', look);
    // A caveat, a notice or a third suggested question landing mid-turn makes
    // the column taller without the window moving, so the box is watched too.
    const grew = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(look);
    grew?.observe(el);
    return () => { window.removeEventListener('resize', look); grew?.disconnect(); };
  }, [busy, answers.length, at]);

  const lead = useMemo(() => {
    if (!latest || busy) return null;
    // Cut from the text with his markers out, as the headline is (Reading.tsx).
    const { claimRaw } = claimAndStanding(unmark((latest.text ?? '').trim()).plain,
                                          latest.reading?.claim);
    const cited = figuresInText(claimRaw, latest.toolCalls)
      .map((piece) => piece.seq)
      .filter((seq): seq is number => seq !== undefined);
    const newest = answers.length - 1;
    for (const seq of cited) {
      const o = drawn.find((x) => x.turn === newest && (x.seq === seq || x.seqs?.includes(seq)));
      if (o) return o.key;
    }
    return null;
  }, [latest, busy, answers.length, drawn]);


  // HE READS THE CLAIM ALOUD AS AN ANSWER LANDS, with hands-free on (P2S.5(c)):
  // on the moment he stops working, never on opening a thread, so an answer
  // somebody already read is not read at them again.
  const wasBusy = useRef(busy);
  useEffect(() => {
    const landed = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (!landed || !handsFree || !latest) return;
    reader.speak(spokenClaim(latest.text, latest.reading?.claim));
  }, [busy, handsFree, latest, reader]);

  // WHAT HE IS DOING, off the stream and nothing else (P2S.2(d)). `need` only
  // from a LOADED approvals count (UI rule 8); a failed turn breaks the
  // drawing. The talk view is the only one whose figures arrive.
  const mark = markStateOf({
    busy,
    turn: latest,
    landing: landing.pending,
    needsYou,
  });

  // THE COLD OPEN. Arriving with nothing in hand, the room opens on the
  // newest answer Bob gave to a question he was asked to keep asking —
  // this morning's, normally — IF IT IS NEWER THAN YOUR LAST LOOK AT IT.
  // Otherwise it opens where you were: the thread you left is the thread
  // you return to. Nothing here builds a briefing or knows what one is; it
  // opens a thread, and the thread contains whatever he decided. Nowhere to
  // go back to and nothing new is a real answer, and stays the empty room.
  const nothingInHand = !threadId && !bob.storedThreadId && !bob.busy;
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

  // THE MORNING (W2.1). Opening the room makes sure the person has it — a
  // standing question at the slot the definitions name, born OFF (rule 7) —
  // and says whether it is on and which thread is today's. Read once a few
  // minutes; the room is opened far more often than the morning changes.
  const qc = useQueryClient();
  const morning = useQuery({
    queryKey: ['morning'],
    queryFn: openMorning,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [switching, setSwitching] = useState(false);
  const switchOn = useCallback((on: boolean) => {
    setSwitching(true);
    void switchMorning(on)
      .then((m) => qc.setQueryData<Morning>(['morning'], (was) => ({ ...m,
        today: was?.today ?? m.today ?? null })))
      .catch(() => { /* the line stays as it was: the switch did not move */ })
      .finally(() => setSwitching(false));
  }, [qc]);
  // ASKED AGAIN THE SAME DAY: the server answered with today's morning
  // instead of a turn, so the room goes to that thread — opened from the
  // record like any stored thread — once per reuse.
  const followed = useRef<unknown>(null);
  useEffect(() => {
    const r = bob.reused;
    if (!r || followed.current === r) return;
    followed.current = r;
    if (r.thread_id !== threadId) navigate(`/w/${r.thread_id}`);
  }, [bob.reused, threadId, navigate]);

  // WHEN YOU LAST LOOKED AT THIS THREAD — read once, as it opens, so that
  // what arrived since can land with the glow and be counted. Once you ask
  // something here you are no longer "back": the line and the glow stand
  // down, and everything is marked seen as it settles.
  const openedSeen = useMemo(() => lastSeen(threadId), [threadId]);
  const askedHere = useRef<string | null>(null);
  useEffect(() => { if (busy && threadId) askedHere.current = threadId; }, [busy, threadId]);
  const sinceAt = askedHere.current === threadId ? null : openedSeen;
  const arrived = arrivedSince(allAnswers, sinceAt);
  useEffect(() => { if (threadId) remember(threadId); }, [threadId]);
  useEffect(() => {
    if (!threadId || busy || !allAnswers.length) return;
    remember(threadId, allAnswers[allAnswers.length - 1].at);
  }, [threadId, busy, allAnswers]);

  // LOOKING INTO SOMETHING BOB NOTICED. The watch post carries the read
  // that fired it, so this is an ordinary reply in its thread — Bob re-runs
  // that call and climbs from a fact. The question rides in router state so it
  // survives the navigation, and `asked` makes sure it happens once.
  const pending = (location.state as { ask?: string } | null)?.ask;
  useEffect(() => {
    if (!pending || !threadId || !thread.ready) return;
    if (asked.current === threadId) return;
    asked.current = threadId;
    navigate(location.pathname, { replace: true, state: null });
    void bob.ask(pending);
  }, [pending, threadId, thread.ready, bob, navigate, location.pathname]);


  const patch = useCallback((key: string, p: Local) => {
    setLocal((s) => ({ ...s, [key]: { ...s[key], ...p } }));
  }, []);

  // THE PART OF THE ESTATE THE NEXT QUESTION CARRIES (P2.g) — the key, or
  // undefined on the definitions' default. Resolved against what was served,
  // so a key this build no longer declares travels as nothing rather than as
  // a scope the server would refuse.
  const scoped = useMemo(() => estateFor(desk.data, estate), [desk.data, estate]);
  // WHICH HUE EACH STORE IS (P2S.2(e)): its place in `stores.active_retail`,
  // as served. Nothing until the definitions load — no swatch is guessed.
  // AND EACH STORE'S OWN COLOUR, as Settings saved it — the one every other
  // Supabot chart already draws. Unloaded or failed, the palette slot stands in.
  const storeRecords = useQuery({
    queryKey: ['store-appearance'],
    queryFn: readStoreAppearance,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const identities = useMemo(() => identitiesFrom(desk.data, storeRecords.data),
    [desk.data, storeRecords.data]);
  // WHICH NOTICES ARE DRAWN (UI rule 4, 2026-09-17): not the ones that only
  // explain how a figure was measured. Everything, until the definitions load.
  const explainsOnly = useMemo(() => explainsOnlyFrom(desk.data), [desk.data]);
  // The same thing, drawn above the line. Null on the default, because nothing
  // is travelling and a chip saying "All" would be a chip about nothing.
  const estateChip = useMemo(() => scopeChip(desk.data, estate), [desk.data, estate]);

  // WHAT A QUESTION TRAVELS WITH. Named apart from `ask` because a fragment
  // never reaches it: this is the one path that costs a model turn.
  const askBob = useCallback((text: string, subjects = selection) => {
    const q = text.trim();
    if (!q) return;
    setDraft('');
    // Asked from an earlier answer, the question travels with the board as it
    // is drawn, and the room returns to the newest as he starts.
    setView(null);
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
    // `{id: label}`, so every subject reached Bob as a word.
    const picked = asSelection(subjects);
    const desk = {
      // WHICH BUSINESS (P2.g). The key, or nothing on the default — the
      // guarantee that a switch nobody touched changes no answer that was
      // already right.
      ...(scoped ? { estate: scoped } : {}),
      ...(picked ? { selection: picked } : {}),
      ...(named.length ? { references: named } : {}),
      ...(board.length ? { board: boardContext(answers, board, local, focused) } : {}),
    };
    void bob.ask(q, {
      ...(Object.keys(desk).length ? { desk } : {}),
      // An `@page` is the page this is asked FROM: the route injects a reader
      // bound to this caller and this page, and without it the tool is not in
      // his schema at all (architecture rule 4).
      ...(scope ? { pageScope: pageScopeFor(scope.id, scope.title) } : {}),
    });
  }, [bob, selection, named, scope, scoped, answers, board, local, focused]);

  /**
   * ONE REPLAY PATH, FOR EVERY DOOR INTO IT (P1.j).
   *
   * A tapped token, a typed fragment and a control Bob composed are three
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
   * and then asks Bob to read it — `fragments.analytical_asks_anyway`,
   * because the number is not the answer and a reading is not a thing to drop
   * in order to win a stopwatch.
   */
  const move = useCallback(async (
    token: DrawnToken, alternative: DeskAlternative, said?: string,
  ) => {
    const ran = await runReplay(token.targets, token.argument, alternative.value);
    if (ran && token.kind === 'analytical') askBob(said ?? alternative.label);
  }, [runReplay, askBob]);

  // A control Bob composed, through the same path. Its own name for its
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
    if (restored.current === threadId || !bob.turns.length) return;
    restored.current = threadId;
    const max = Number(desk.data.replay?.max_restored_per_open ?? 0);
    for (const r of replaysToRestore(bob.turns, thread.posts, max)) {
      void runReplay([{ post: r.post, turn: r.turn, seq: r.seq }], r.argument, r.value);
    }
  }, [threadId, thread.ready, thread.posts, desk.data, bob.turns, runReplay]);

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
    // "READ IT TO ME" (P2S.5(c)): the claim on screen, aloud, on demand — the
    // definitions' words, no model turn, typed or spoken alike.
    if (asksToHear(q, desk.data)) {
      setDraft('');
      reader.speak(spokenClaim(latest?.text, latest?.reading?.claim));
      return;
    }
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
    // `fragment` is already null and the line below sends the words to Bob
    // with the selection attached, exactly as every other short instruction
    // goes. The behaviour is the absence, which is why there is no branch
    // here to read.
    const fragment = subjects.length ? null : resolveFragment(q, tokens, desk.data);
    if (!fragment) { askBob(q, subjects); return; }
    setDraft('');
    // The one token that costs a turn on purpose. What is asked of him is a
    // definition (`fragments.correction.asks`) rather than a string somebody
    // typed into a button — and whether a belief is recorded is HIS act: the
    // room holds no writer and may not (architecture rule 4).
    if (fragment.kind === 'correction') { askBob(fragment.asks, subjects); return; }
    void move(fragment.token, fragment.alternative, q);
  }, [askBob, move, tokens, desk.data, selection, runReplay, targetsFor, reader, latest]);

  /**
   * WHAT AN `@` PICKED, PUT WHERE IT BELONGS (P2.c).
   *
   * Three destinations, because three things are being named. A shop, a
   * product or a supplier is a SUBJECT and joins the selection, which is the
   * same place a tap puts one — one mechanism, two doors. A page binds the
   * SCOPE, which is what injects a reader bound to this caller and that page.
   * A rule binds neither and is named on the question: there is no request
   * field for a workflow, and running one is Bob's tool call and the
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

  // A GESTURE ON AN AGENDA ROW IS A DECISION, and Bob learns from it: what
  // you open, ask about or leave decides where it ranks next morning
  // (metrics.yaml attention.learning). The per-figure keep and dismiss went
  // with their controls in P2S.1, so those two outcomes are no longer written
  // from the room. Recorded once per identity
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
    patch,
    retune: (key, argument, value) => { void retune(key, argument, value); },
    // FORGET A VIEW — the memory's one write, and it is the person's.
    //
    // The row goes the moment they press it, before the server answers: the
    // gesture is theirs, they know what they meant, and a Forget that waits
    // on a round trip is a Forget people press twice. If the write fails the
    // row comes back, which is the honest rendering of a view he still holds.
    forget: (key, beliefId) => {
      if (!beliefId) return;
      setLocal((s) => {
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
    // SET A ROW ASIDE WITH A REASON (W2.3) — the person's, like Forget. The
    // row's own key goes back as it came; the control says what was kept.
    dismiss: (what, reason) => dismissItem(what, reason, threadId ?? null),
  }), [ask, patch, retune, board, drawn, answers, retuned, desk.data, local, focused, decide, threadId]);

  useEffect(() => { keepLocal(threadId, local); }, [threadId, local]);

  const clear = useCallback(() => {
    // Put away whatever is open, INCLUDING a standing answer: dismissing it
    // has to outlive the navigate back to "/", or the cold open immediately
    // reopens the thing just closed.
    dismissStanding(threadId);
    // PUTTING THE MORNING AWAY IS A GESTURE TOO. Every agenda row still on
    // the board that nobody touched is recorded as left — not dismissed —
    // so tomorrow Bob can say "raised Tuesday, left". A row already
    // decided is not also left.
    const already = new Set(Array.from(decided.current, (k) => k.split('|').slice(0, -1).join('|')));
    for (const d of leftBehind(allAnswers, buildBoard(allAnswers), already, threadId ?? null)) {
      decided.current.add(`${d.what}|${d.outcome}`);
      void recordDecision(d).catch(() => { /* see above */ });
    }
    // Leaving on purpose: "/" must not walk straight back in.
    forgetLast();
    bob.reset(); setSelection([]); setScope(null); setNamed([]); setFocused(null); setView(null);
    // Starting fresh is the whole estate again: the switch is a scope you put
    // on, and carrying it into a new board would be the room deciding what the
    // next question is about (P2.g).
    setEstate(null);
    setRetuned({}); setShapes({}); setRefusal(null);
    setLocal({});
    navigate('/bob');
  }, [bob, navigate, threadId, allAnswers]);

  return (
    <IdentityContext.Provider value={identities}>
    <ExplainsOnlyContext.Provider value={explainsOnly}>
    <div className="room">
      <Rail busy={busy} needsYou={needsYou} onNew={clear}
            estate={(
              // WHICH BUSINESS (P2.g) — at the top of the sidebar, as the
              // design draws it. Set before the question, about the next thing
              // said and not about what is drawn.
              <EstateSwitch defs={desk.data} picked={estate} failed={desk.isError}
                            onPick={(key) => setEstate(key)} />
            )} />

      {/* THE BESIDE ROOM (P2S.1(b)) — the design's composition, ported from
          `ops/ideal/bob-ahead-of-me.html`: him top-left, his words under
          him set toward the figures, the figures filling the right, and a
          leading line from him to each. Two fixed columns, 580 and 940,
          centred in the room; the sidebar slides it and never shrinks it. */}
      <main className="r-main">
        <div className="r-beside" ref={frameRef}>
          <Wires frameRef={frameRef} markRef={himRef} wordsRef={wordsRef} areaRef={areaRef}
                 version={`${answers.length}:${drawn.length}:${busy}`} />

          {/* HIS SIDE, ONE COLUMN THAT TRAVELS WITH THE PAGE (P10). Him and
              his words were two cells of the grid, each scrolling inside
              itself; they are one sticky aside now, as the artifact's
              `.words` is, and the room scrolls as one document. */}
          <div className="r-aside" ref={asideRef}>
          <div className="r-him" ref={himRef}>
            <AliveMark state={mark.state} failed={mark.failed} drawn={mark.reads}
                       pulses={mark.reads + landing.arrived} />
          </div>

          <div className="r-words" ref={wordsRef}>
            {/* WHAT YOU ASKED, SMALL, UNDER HIM, and the way back to what
                you asked before (the log, 2026-09-18). */}
            <Asked question={questions[at] ?? null} at={at} count={allAnswers.length}
                   busy={busy} onStep={(to) => { setFocused(null); setView(to); }} />
            {/* THE MORNING'S LINE (W2.1): shown again rather than asked
                again, and when it was read; or that it is switched off. */}
            {!busy && (
              <MorningLine threadId={threadId} reused={bob.reused ?? null}
                           morning={morning.isSuccess ? morning.data : undefined}
                           onSwitch={switchOn} switching={switching} />
            )}
            {/* WHILE HE WORKS, A LINE UNDER HIM (the log, 2026-09-17). */}
            <Doing turn={latest} live={busy} answering={Boolean((latest?.text ?? '').trim())} />
            <Narration said={(latest as { narration?: string } | null)?.narration} live={busy}
                       answering={Boolean((latest?.text ?? '').trim())} />
            {empty ? (
              <Opening loading={Boolean(threadId) && thread.loading} />
            ) : (
              <>
                {/* SINCE YOU LAST LOOKED. A count of answers with a time after
                    the mark this browser kept — derived, never guessed (UI rule
                    8) — one quiet line above the turn's caveat, only when there
                    is one. */}
                {arrived > 0 && !busy && atNewest && (
                  <p className="r-label r-since">
                    since you last looked · {arrived} {arrived === 1 ? 'answer' : 'answers'} arrived
                  </p>
                )}
                {/* UNDER HIM, THE HEADLINE, WHAT HE SAID THAT IS ABOUT NO CHART,
                    AND WHAT TO DO NEXT (the owner, 2026-09-18: "with the charts
                    thats it related to. and if its not related then it can go
                    under the blob"). A sentence about a chart is under that
                    chart (`thoughtsOf`); a repeat of what is on screen is not
                    drawn at all. A notice that says the data may be wrong stays
                    above the headline (UI rule 4). */}
                <Reading part="claim" text={latest?.text} notices={drawnOnly(notices, explainsOnly)}
                         reading={latest?.reading} calls={latest?.toolCalls} onFigure={showFigure}
                         speaking={reader.speaking} headlineOnPage={headlineOnPage} />
                {/* HIS PROSE IS THE CONCLUSION, AND IT IS HERE (2026-09-20).
                    For one day it was drawn down the right side, a paragraph
                    over each chart — the thread the owner refused. The right
                    is steps now and nothing else; everything he said that is
                    not the headline or the next is under the headline, whole,
                    and `voice.body` keeps it short. */}
                {!busy && (
                  <Reading part="rest" text={latest?.text} reading={latest?.reading}
                           calls={latest?.toolCalls} onFigure={showFigure}
                           standing={bodyOf(latest?.text, latest?.reading?.claim, latest?.reading?.next)}
                           // ON THE PAGE WHERE HE SET IT (P7), and then not here
                           // too: said twice it is the wall of text the owner
                           // kept finding on this side.
                           caveat={caveatOnPage ? '' : thoughts?.caveat} />
                )}
                <ReadingAsks reading={latest?.reading} busy={busy} onAsk={(q) => ask(q)} />
                {/* WHAT HE'D DO NEXT IS UNDER THE FIGURES NOW (P6.f), with the
                    offers that go with it — see the figures area below. */}
              </>
            )}
            {latest?.error && <p className="r-note r-failed">{latest.error}</p>}
          </div>
          {/* THERE IS MORE OF HIS WORDS BELOW (the owner, 2026-09-18: "add a
              indicatior that matches the theme to the text under blob to let
              people know they can scroll down on it"). The figures' own arrow,
              at the foot of his column, only while there is more; a tap moves
              it most of a screen, as the figures' does. */}
          </div>

          <div className="r-right">
            {/* NO HEADER OVER THE FIGURES (the log, 2026-09-17: "we also dont
                need anything of these anymroe", of the kept-as line, the Talk /
                Behind it / Replay / Page tabs and "2 reads · 4 tools · 2
                caveats · behind it"). Every figure's receipts open in place
                under it; a figure in his words scrolls to the figure. */}
            {/* WHAT HE NOTICED UNASKED, above the figures when there is any. */}
            <Noticed onLookInto={(item) => navigate(`/w/${item.thread_id}`, {
              state: { ask: 'what happened here? look into it.' },
            })} />

            <FiguresArea areaRef={areaRef}>
              {/* THE REAL DASHBOARD (W2.4, 2026-09-22). "Build me a dashboard"
                  built a kept page — live analyses that re-run on opening —
                  so the room opens that page here, the same page /pages
                  draws, instead of a report about the business. */}
              {dashboard ? (
                <KeptPage pageId={dashboard} embedded
                          onBack={() => navigate(`/pages/${dashboard}`)} />
              ) : empty ? null : (
                <>
                  {/* THREE RENDERINGS, NEVER TWO (UI rule 8). While he is
                      reading and nothing of this turn has landed, the figures
                      area says so — the reads running, each as it lands —
                      instead of an empty column that looks finished. A read
                      that failed is drawn as that, in the trail. */}
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
                    onLanding={onLanding}
                    lead={lead}
                    // NO PROSE OF HIS REACHES THE BOARD (2026-09-20): not his
                    // paragraphs as beats, not his sentences under the charts
                    // they cite. A step carries its question, its claim and
                    // its one-line thought, all composed; the reasoning is the
                    // figures. `page` and `thoughts` are still honoured by the
                    // Board for a kept page and the tests that hold them; the
                    // room simply stops sending them.
                    /* HOW HE LAID IT OUT (P3.p) — the newest turn's, and only
                       while it is settled: mid-turn the blocks are still
                       arriving, and an arrangement half its blocks have not
                       reached would draw holes. Absent is the packing. */
                    arrangement={busy ? null : latest?.composition?.arrangement ?? null}
                    // THE PLAN IS PART OF THE PAGE (P6.h): the Board draws it
                    // where his arrangement says, else last. Not while he is
                    // still working — a plan for figures that have not landed
                    // is not one.
                    caveat={caveatOnPage && latest?.reading?.caveat?.trim()
                      ? latest.reading.caveat.trim() : null}
                    foot={busy ? null : (
                      <>
                        <ReadingNext reading={latest?.reading} calls={latest?.toolCalls}
                                     onFigure={showFigure} />
                        <FootOffers offers={offers.foot} answers={answers} on={on} />
                      </>
                    )}
                    sameOrder
                  />
                  {/* AT THE FOOT (P3.o). This sat ABOVE the board, so the first
                      thing on the right of every follow-up was a line of
                      navigation — "2 things from earlier · show" — before his
                      first word. What came before this answer is not where
                      this answer starts; and what it opens is drawn below
                      the newest turn's figures anyway, so the line now sits
                      where the things it opens appear. */}
                  <Earlier count={earlier.length} open={unfolded}
                           onToggle={() => setUnfolded((o) => !o)} />
                </>
              )}
            </FiguresArea>
          </div>
        </div>
      </main>

      {/* THE LINE YOU TALK ON (P2.c), and above it what the question will
          travel with. The read-as chips sit here since P2S.1(h): the design
          draws "last 90 days", "products", "why?" on the composer line, and
          tapping one is the same replay path it always was — no model turn. */}
      <Composer
        draft={draft}
        onDraft={setDraft}
        subjects={selection}
        scope={scope}
        named={named}
        estate={estateChip}
        onUnestate={() => setEstate(null)}
        defs={desk.data}
        busy={busy}
        tokens={tokens}
        drawn={boardSubjects}
        pages={ownPages}
        onUnpick={(subject) => setSelection(
          (held) => toggleSubject(held, subject, maxSubjects(desk.data)))}
        onUnscope={() => setScope(null)}
        onUnname={(r) => setNamed((held) => held.filter((x) => x.id !== r.id))}
        onBind={bound}
        onSend={() => ask(draft)}
        // SPOKEN, THE SAME DOOR (P2S.5(a)): what was heard goes where Enter
        // sends, so the selection travels with it and a steer replays.
        onSay={(said) => ask(said)}
        handsFree={handsFree}
        onHandsFree={reader.can ? setHandsFree : undefined}
        onStop={() => bob.cancel()}
        onClear={() => { setDraft(''); setSelection([]); setScope(null); setNamed([]); }}
        steer={(
          <Tokens
            tokens={tokens}
            correction={desk.data?.fragments?.correction?.token}
            moving={moving > 0}
            refusal={refusalForPerson(refusal, desk.data?.replay)}
            onDismiss={() => setRefusal(null)}
            detailWord={String(desk.data?.replay?.refused_detail_word ?? 'why')}
            onMove={(token, alternative) => { void move(token, alternative); }}
            onCorrect={() => {
              const asks = desk.data?.fragments?.correction?.asks;
              if (asks) askBob(asks);
            }}
          />
        )}
      />
    </div>
    </ExplainsOnlyContext.Provider>
    </IdentityContext.Provider>
  );
}

/**
 * WHAT YOU ASKED, AND THE WAY BACK (the log, 2026-09-18: "i should see what i
 * ask too like around the area of the blob just something small and also be a
 * track back feature").
 *
 * The question the answer on screen answered, in your words, small and quiet
 * under him. With more than one answer in the thread, an arrow either side
 * steps to the question before or after, and "latest" comes back. Nothing
 * here is his and nothing here costs a turn. An answer nobody asked for has no
 * question to draw, so only its arrows are.
 */
export function Asked({ question, at, count, busy, onStep }: {
  question: string | null;
  at: number;
  count: number;
  busy: boolean;
  onStep(to: number | null): void;
}) {
  const steps = count > 1;
  if (!question && !steps) return null;
  const newest = at >= count - 1;
  return (
    <div className="r-asked" data-at={newest ? 'newest' : 'earlier'}>
      {steps && (
        <button type="button" className="r-asked-step" aria-label="the question before"
                disabled={busy || at <= 0} onClick={() => onStep(at - 1)}>&lsaquo;</button>
      )}
      {question && (
        <p className="r-asked-q"><b className="r-asked-label">you asked</b>{question}</p>
      )}
      {steps && (
        <button type="button" className="r-asked-step" aria-label="the question after"
                disabled={busy || newest}
                onClick={() => onStep(at + 1 >= count - 1 ? null : at + 1)}>&rsaquo;</button>
      )}
      {steps && !newest && (
        <button type="button" className="r-asked-latest" onClick={() => onStep(null)}>latest</button>
      )}
    </div>
  );
}

/**
 * The cold open. Nothing at all — the owner, 2026-09-19, of "Morning. / What
 * are we looking at?": "get rid of this". Only the loading state draws, so a
 * thread being opened is never mistaken for an empty room (UI rule 8). No
 * greeting, no suggested questions: until he speaks first (the briefing),
 * the door stays open and empty.
 */
function Opening({ loading }: { loading: boolean }) {
  if (loading) return <p className="r-label" style={{ paddingTop: '16vh' }}>Opening…</p>;
  return null;
}
