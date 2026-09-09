/**
 * The desk, wired: persistence in, a layout and the things a person can do
 * out.
 *
 * ONE SOURCE, AND IT IS THE SERVER. The work stream of the river, read on
 * every visit, composed into surfaces by the same pure functions an answer
 * goes through, then laid out by `composeDesk`. Nothing about what is on the
 * desk is remembered on the client: focus is restored from what the newest
 * question CARRIED, the window from the replay in flight, and everything else
 * from the posts. A reload rebuilds all of it (metrics.yaml surface.desk).
 *
 * THE REST OF THE BUSINESS IS A REPLAY, NOT AN ANSWER. With no work in focus
 * the desk draws the definitions' resting reads through the same runner a
 * tile uses — deterministic, no model, its own receipts — so opening George
 * costs a query and never a turn.
 *
 * A WINDOW CHANGE IS THE SAME MECHANISM over the surface's own calls, and it
 * is transient: it is not written, and the record of it is the next question,
 * which carries the window in `desk.window`.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { DeskWindow } from '../../types/george';
import type { PinCallResult, PinToolCall } from '../../types/pins';
import { useGeorge } from '../../hooks/useGeorge';
import { useRiver } from '../../hooks/useRiver';
import { useThread } from '../../hooks/useThread';
import { readDeskDefinitions, replayCalls as postReplay } from '../../services/deskApi';
import { withFocus } from '../george/askHome';
import { threadHistory } from '../george/threadHistory';
import { riverMerge } from '../george/riverMerge';
import { riverSurfaces, type Surface } from '../george/surfaceCompose';
import { liveItems, storedItems, withContinuity } from '../george/workUnit';
import { markDetail } from '../george/markState';
import { composeDesk, readingSubjects, type DeskLayout } from './deskCompose';
import { deskActions, localizeQuestion, questionAnchor, type DeskActionItem } from './deskActions';
import { recommendationFor, type Recommendation } from './initiative';
import { activeStep, workTrail, type TrailStep } from './workTrail';
import {
  deskContextFor, deskReducer, INITIAL_DESK, restoreDeskState, selectionWords,
} from './deskState';
import { replayCalls, replayedSurface, restSurface } from './replay';
import { workLine } from './workLine';
import { deskFindings, type DeskFinding } from './findings';
import { windowWords } from './TimeRibbon';
import { sameSubject, type Subject } from './subject';

export interface InProgress {
  id: string;
  threadId: string;
  title: string;
  at: string;
}

/** The title of a piece of work, for the in-progress list: what was asked. */
function titleOf(surface: Surface): string {
  const asked = surface.steps.find((s) => s.intent?.text)?.intent?.text;
  return asked ?? surface.plan.title ?? 'Work';
}

function threadOf(surface: Surface): string | null {
  for (const step of surface.steps) {
    const id = step.unit.post?.thread_id ?? step.intent?.post?.thread_id;
    if (id) return id;
  }
  return null;
}

export function useDesk(threadId: string | undefined) {
  const george = useGeorge();
  const river = useRiver('work');
  const [state, dispatch] = useReducer(deskReducer, INITIAL_DESK);

  // The definitions the desk is drawn from: the windows, the resting reads,
  // the selection bounds. Served, so the client keeps no copy that can drift.
  const definitions = useQuery({
    queryKey: ['desk-definitions'],
    queryFn: readDeskDefinitions,
    staleTime: 10 * 60_000,
  });

  /* ---------------------------------------------------------- the surfaces -- */

  // A piece of work may be older than the loaded page of the river, so the
  // thread is read too and folded in. The thread read is filtered by the SAME
  // visibility clause as the river, so this exposes nothing the river would
  // not; it only guarantees the work asked for is on the desk.
  const thread = useThread(threadId ?? '');
  const posts = useMemo(
    () => (threadId ? withFocus(river.posts, thread.posts) : river.posts),
    [threadId, river.posts, thread.posts],
  );

  /**
   * OPENING THE THREAD IS WHAT GIVES GEORGE HIS MEMORY.
   *
   * `useGeorgeStream` sends the history it holds, and it holds nothing until
   * a thread is opened into it. Until this existed the desk never called
   * `open`, so after any reload `ask` sent `history: []`, `thread_id: null`
   * and — because the hook drops a parent when it has no thread —
   * `parent_id: null`. Every follow-up silently started a NEW thread with no
   * memory of the work on screen. Within one unbroken session it appeared to
   * work, because the first turn's own frame set the thread; that is why it
   * failed "sometimes".
   *
   * The two reads it needs were already here: the river's thread read is what
   * is SHOWN, the chats read is what George is TOLD, and `threadHistory`
   * merges them (useThread.ts). Opened once per thread, never while a turn is
   * running — `open` cancels — and never when the stream is already on it,
   * which is the case immediately after asking at rest.
   */
  const opened = useRef<string | null>(null);
  const openThread = george.open;
  useEffect(() => {
    if (!threadId) {
      opened.current = null;
      return;
    }
    if (opened.current === threadId || george.threadId === threadId) return;
    if (george.busy || !thread.ready) return;
    opened.current = threadId;
    openThread(threadHistory(thread.posts, thread.chat, threadId), threadId);
  }, [threadId, thread.ready, thread.posts, thread.chat, george.threadId, george.busy, openThread]);

  const merged = useMemo(() => riverMerge(posts, george.turns), [posts, george.turns]);
  const stored = useMemo(() => storedItems(merged.posts), [merged.posts]);
  const live = useMemo(() => liveItems(merged.pending), [merged.pending]);
  const items = useMemo(
    () => withContinuity([...stored.map((i) => ({ ...i })), ...live.map((i) => ({ ...i }))]),
    [stored, live],
  );
  const surfaces = useMemo(
    () => riverSurfaces(items).filter((e): e is Surface => e.kind === 'surface'),
    [items],
  );

  // The work in focus: the thread asked for, or — while a turn is running —
  // the newest, so an answer appears where it was asked.
  const focused = useMemo(() => {
    if (threadId) return surfaces.find((s) => threadOf(s) === threadId) ?? null;
    if (merged.pending.length > 0) return surfaces[surfaces.length - 1] ?? null;
    return null;
  }, [threadId, surfaces, merged.pending.length]);

  const inProgress: InProgress[] = useMemo(
    () =>
      surfaces
        .filter((s) => s !== focused)
        .map((s) => ({ id: s.id, threadId: threadOf(s) ?? '', title: titleOf(s), at: s.latest.at }))
        .filter((w) => w.threadId)
        .reverse()
        .slice(0, 8),
    [surfaces, focused],
  );

  /* ------------------------------------------------------------ at rest -- */

  const restReads = definitions.data?.rest_reads;
  const rest = useQuery({
    queryKey: ['desk-rest', restReads],
    queryFn: () => postReplay(restReads as PinToolCall[]),
    // Read whenever the work in focus has nothing drawn yet — which includes
    // the moment a question is asked at rest. Disabling it on `focused` alone
    // meant the estate was thrown away exactly when it was needed to keep the
    // screen from going empty. React Query keeps the rows once the work has
    // its own evidence, so this stops fetching without losing what it read.
    enabled: Boolean(restReads) && (!focused || focused.plan.evidence.length === 0),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  /* ------------------------------------------------------------ a replay -- */

  const [replay, setReplay] = useState<{ id: string; window: DeskWindow; results: PinCallResult[] } | null>(null);
  const replaying = useMutation({
    mutationFn: async ({ surface, window }: { surface: Surface; window: DeskWindow }) => {
      const calls = replayCalls(surface, window, definitions.data?.window_arguments ?? {});
      const out = await postReplay(calls);
      return { id: surface.id, window, results: out.results };
    },
    // Both together: the rows and the window they were read for. The
    // dispatch is here and not at the click so the label and the figures
    // change in the same commit and can never disagree.
    onSuccess: (out) => {
      setReplay(out);
      dispatch({ type: 'window', window: out.window });
    },
  });

  // A replay belongs to the surface it was made from. Opening other work
  // drops it rather than drawing yesterday's window over today's question.
  const surfaceId = focused?.id ?? 'rest';
  const lastSurface = useRef(surfaceId);
  useEffect(() => {
    if (lastSurface.current !== surfaceId) {
      lastSurface.current = surfaceId;
      setReplay(null);
      dispatch({ type: 'reset' });
    }
  }, [surfaceId]);

  // Focus is restored from what the newest question carried — the server's
  // record — whenever the work in focus changes.
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (!focused || restored.current === focused.id) return;
    restored.current = focused.id;
    const from = restoreDeskState(focused);
    if (from.selection.length > 0) dispatch({ type: 'select', subjects: from.selection });
  }, [focused]);

  /* ------------------------------------------------------------ the layout -- */

  /**
   * THE WORKSPACE NEVER BLANKS.
   *
   * Asking at rest makes the live turn the work in focus before it has read
   * anything, and a surface with no evidence composes to `statement`, which
   * draws nothing. The screen went empty at the exact moment a person most
   * needs to see that they were heard — and the resting figures they had just
   * been looking at went with it.
   *
   * So a piece of work with no evidence yet does not replace what is on
   * screen: the resting estate stays until the first result lands, and then
   * the workspace FORMS from real arriving evidence. `composeDesk` is pure
   * over whatever results exist and a live turn accumulates them frame by
   * frame, so this needs no new machinery — it only stops the empty case
   * winning.
   */
  const surface: Surface | null = useMemo(() => {
    const resting = rest.data ? restSurface(rest.data.results, rest.data.ran_at) : null;
    const working = focused && focused.plan.evidence.length > 0 ? focused : null;
    const chosen = working ?? resting ?? focused;
    if (!chosen) return null;
    if (replay && replay.id === chosen.id) return replayedSurface(chosen, replay.results, chosen.latest.at);
    return chosen;
  }, [focused, rest.data, replay]);

  // A step of the trail: the work as it stood then, composed from the same
  // posts. Nothing is remembered — the earlier steps are still on the surface.
  const shown: Surface | null = useMemo(() => {
    if (!surface || state.stepIndex === null) return surface;
    const steps = surface.steps.slice(0, state.stepIndex + 1);
    if (steps.length === 0 || steps.length === surface.steps.length) return surface;
    const last = steps[steps.length - 1];
    return { ...surface, steps, latest: last.unit, plan: surface.plan };
  }, [surface, state.stepIndex]);

  const layout: DeskLayout = useMemo(() => composeDesk(shown, state), [shown, state]);

  const reading = useMemo(() => {
    const field = layout.stage.kind === 'field' ? layout.stage.field
      : layout.stage.kind === 'anatomy' ? layout.stage.breakdown : null;
    return readingSubjects(george.live.running, field);
  }, [layout, george.live.running]);

  /**
   * WHAT GEORGE WOULD CHECK NEXT, and what else the evidence supports.
   *
   * The recommendation is derived from trusted rows and the definitions' own
   * ladder (initiative.ts) and carries the action that performs it. The moves
   * are the few others, with his suggestion excluded so one thing is not
   * offered twice under two names.
   */
  const breakdownShown = useMemo(() => {
    const stage = layout.stage;
    if (stage.kind === 'anatomy') return stage.breakdown?.dimension ?? null;
    if (stage.kind === 'field') return stage.field.within ? stage.field.dimension : null;
    if (stage.kind === 'compare') return stage.fields[0]?.dimension ?? null;
    return null;
  }, [layout.stage]);

  /**
   * WHAT GEORGE FOUND, as several things rather than one line.
   *
   * A broad read establishes facts about several shops out of one grouped
   * call, and the composer already recorded them per subject — it just joined
   * them into a sentence before drawing them. These are those same marks,
   * unflattened, each with the subject's own figures and its own next move
   * (findings.ts). The field they came from stays on screen beneath, so this
   * is a reading of one drawing and not a grid of tiles.
   */
  const findings: DeskFinding[] = useMemo(() => {
    const stage = layout.stage;
    const field = stage.kind === 'field' ? stage.field
      : stage.kind === 'anatomy' ? stage.breakdown
        : stage.kind === 'compare' ? stage.fields[0] ?? null
          : null;
    // One subject on screen is not a set of findings — it is the answer, and
    // the anatomy already says everything a finding would.
    if (!field || field.objects.length < 2) return [];
    return deskFindings(field, layout.attention, layout.identity);
  }, [layout]);

  const recommendation: Recommendation | null = useMemo(
    () => recommendationFor(
      layout,
      questionAnchor(layout),
      breakdownShown,
      definitions.data?.breakdown_dimensions ?? [],
    ),
    [layout, breakdownShown, definitions.data],
  );

  /**
   * The one move that investigates a finding further.
   *
   * The ladder's own next rung, scoped to that subject: which products moved
   * most there. Offered only where the definitions say a breakdown of that
   * dimension EXISTS — served, because net sales is transaction grain and
   * refuses a product grouping while the ladder localizes through product
   * revenue, so a client reading the headline metric's own valid_group_by
   * would never offer the move the ladder is built around.
   */
  const breakdownDimensions = definitions.data?.breakdown_dimensions ?? [];
  const moveFor = useCallback(
    (finding: DeskFinding) => {
      const meta = finding.anatomy.headline.meta;
      const dimension = breakdownDimensions.includes('product')
        ? 'product'
        : breakdownDimensions.includes('category')
          ? 'category'
          : null;
      if (!dimension || finding.subject.dimension !== 'store') return null;
      return {
        label: `Why ${finding.subject.label}?`,
        question: localizeQuestion(dimension, finding.subject.label, meta),
      };
    },
    [breakdownDimensions],
  );

  const actions: DeskActionItem[] = useMemo(
    () => deskActions(layout, state, recommendation?.action.question ?? null),
    [layout, state, recommendation],
  );

  /**
   * THE WORK TRAIL: where this investigation has been.
   *
   * Composed from the posts of the work — each step is a question and the desk
   * it was asked from, both on the question's own post — plus the state being
   * made now, which is marked as such and becomes server truth the moment
   * anything is asked (workTrail.ts).
   */
  const trail: TrailStep[] = useMemo(() => workTrail(surface, state), [surface, state]);
  const active = useMemo(() => activeStep(trail, state), [trail, state]);

  /**
   * Restore a step: the workspace recomposes at that state.
   *
   * The step's own selection comes back with it, because a step IS a question
   * and the scope it was asked in. Nothing is replayed and nothing is
   * refetched — the posts are already here.
   */
  const onStep = useCallback((step: TrailStep) => {
    dispatch({ type: 'step', index: step.index });
    dispatch({ type: 'select', subjects: step.selection ?? [] });
  }, []);

  /* ------------------------------------------------------------ the doing -- */

  const onSelect = useCallback((subject: Subject, additive: boolean) => {
    dispatch(additive ? { type: 'toggle', subject } : { type: 'focus', subject });
  }, []);

  /**
   * A WINDOW CHANGE IS ATOMIC, OR IT DID NOT HAPPEN.
   *
   * This used to move the ribbon FIRST and then fire the replay, so between
   * the click and the rows the chip said "last month" over last week's
   * figures — and if the replay failed it stayed there, labelling old numbers
   * with a window they were never read for. A figure under the wrong window
   * is the one thing this product must never show.
   *
   * So the state moves only when rows come back (`onSuccess` below), the
   * ribbon marks the pending window as pending rather than current, and a
   * failure leaves both the chip and the figures where they were.
   */
  const onWindow = useCallback((window: DeskWindow) => {
    if (!surface) return;
    replaying.mutate({ surface, window });
  }, [surface, replaying]);

  /**
   * A QUESTION CARRIES THE WORKSPACE IT WAS ASKED FROM.
   *
   * The selection and the window as before, and now the layout George is
   * being asked about: what is drawn, what the rows already singled out, and
   * the move he last offered. All of it names and closed vocabularies, none
   * of it a figure (deskState.deskContextFor, metrics.yaml
   * surface.desk.context). This is what gives "show me", "products" and
   * "what would you do?" a referent.
   */
  const ask = useCallback((question: string) => {
    const parent = focused?.latest.post?.id ?? null;
    void george.ask(question, {
      parentId: parent,
      desk: deskContextFor(state, layout, recommendation),
    });
  }, [george, focused, state, layout, recommendation]);

  /* ------------------------------------------------- what the line will say -- */

  const contextWords = useMemo(() => {
    const parts: string[] = [];
    const who = selectionWords(state);
    if (who) parts.push(who);
    else if (layout.scope.length > 0) parts.push(layout.scope.join(', '));
    const w = state.window?.kind === 'preset' && state.window.name
      ? windowWords(state.window.name)
      : layout.anchor?.window?.name
        ? windowWords(layout.anchor.window.name)
        : null;
    if (w) parts.push(w.toLowerCase());
    return parts.length ? parts.join(' · ') : null;
  }, [state, layout]);

  const narration = george.busy
    ? markDetail(george.presence, george.live.running, george.live.lastResult)
    : null;

  /**
   * WHAT THE PERSON JUST SAID, ON SCREEN, IMMEDIATELY.
   *
   * `ask` appends the user turn to the stream synchronously, so this is
   * available on the very next render — before the request has opened, let
   * alone returned. Until now nothing drew it and the only acknowledgement
   * was a truncated line above the composer, which is why a submitted
   * instruction could not be told apart from one that never sent.
   */
  const asked = useMemo(() => {
    for (let i = merged.pending.length - 1; i >= 0; i -= 1) {
      const turn = merged.pending[i];
      if (turn.role === 'user' && turn.text.trim()) return turn.text.trim();
    }
    return null;
  }, [merged.pending]);

  /** What George is doing to the business, from frames that actually arrived. */
  const work = useMemo(
    () => workLine({ running: george.live.running, completed: george.live.completed }, george.busy),
    [george.live.running, george.live.completed, george.busy],
  );

  // Whether the figures on screen carry a comparison, so the ribbon knows
  // which windows the tool would refuse.
  const compared = Boolean(layout.headlineMeta?.comparison?.baseline);

  return {
    state,
    dispatch,
    layout,
    surface: shown,
    trail,
    activeStepId: active?.id ?? '',
    onStep,
    recommendation,
    actions,
    reading,
    inProgress,
    contextWords,
    narration,
    /** The instruction being worked on, drawn the instant it is submitted. */
    asked,
    /** What George has read and is reading, in business words. */
    work,
    /** What he found: a few subjects the rows singled out, with their figures. */
    findings,
    /** The ladder's next move for one finding, or null. */
    moveFor,
    compared,
    windows: definitions.data?.windows ?? [],
    definitions,
    onSelect,
    onWindow,
    ask,
    replaying: replaying.isPending,
    replayFailed: replaying.isError,
    /** The window a replay is reading now, before its rows have landed. */
    pendingWindow: replaying.isPending ? (replaying.variables?.window ?? null) : null,
    /** True while the desk has nothing to draw yet and is still asking. */
    loading: threadId
      ? !focused && (river.loading || thread.loading)
      : definitions.isPending || rest.isPending,
    /** The read failed and may work on a retry. Never drawn as emptiness. */
    failed: threadId ? !focused && thread.failed : definitions.isError || rest.isError,
    /**
     * The work asked for is missing or is not this person's — the two are one
     * answer, as on the server. Different from a failed lookup, which is
     * retryable and must never be reported as work that is gone.
     */
    unavailable: Boolean(threadId) && !focused && thread.unavailable,
    retry: thread.refetch,
    atRest: !focused,
    /** The thread the live turn was stored under, for the address bar. */
    storedThreadId: george.storedThreadId,
    isSelected: (s: Subject) => state.selection.some((x) => sameSubject(x, s)),
  };
}
