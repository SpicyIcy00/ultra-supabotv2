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
import { riverMerge } from '../george/riverMerge';
import { riverSurfaces, type Surface } from '../george/surfaceCompose';
import { liveItems, storedItems, withContinuity } from '../george/workUnit';
import { markDetail } from '../george/markState';
import { composeDesk, readingSubjects, type DeskLayout } from './deskCompose';
import { deskActions, type DeskActionItem } from './deskActions';
import {
  deskContextFor, deskReducer, INITIAL_DESK, restoreDeskState, selectionWords,
} from './deskState';
import { replayCalls, replayedSurface, restSurface } from './replay';
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
    enabled: Boolean(restReads) && !focused,
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
    onSuccess: (out) => setReplay(out),
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

  const surface: Surface | null = useMemo(() => {
    const base = focused ?? (rest.data ? restSurface(rest.data.results, rest.data.ran_at) : null);
    if (!base) return null;
    if (replay && replay.id === base.id) return replayedSurface(base, replay.results, base.latest.at);
    return base;
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

  const actions: DeskActionItem[] = useMemo(() => deskActions(layout, state), [layout, state]);

  /* ------------------------------------------------------------ the doing -- */

  const onSelect = useCallback((subject: Subject, additive: boolean) => {
    dispatch(additive ? { type: 'toggle', subject } : { type: 'focus', subject });
  }, []);

  const onWindow = useCallback((window: DeskWindow) => {
    if (!surface) return;
    dispatch({ type: 'window', window });
    replaying.mutate({ surface, window });
  }, [surface, replaying]);

  const ask = useCallback((question: string) => {
    const parent = focused?.latest.post?.id ?? null;
    void george.ask(question, { parentId: parent, desk: deskContextFor(state) });
  }, [george, focused, state]);

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

  // Whether the figures on screen carry a comparison, so the ribbon knows
  // which windows the tool would refuse.
  const compared = Boolean(layout.headlineMeta?.comparison?.baseline);

  return {
    state,
    dispatch,
    layout,
    surface: shown,
    actions,
    reading,
    inProgress,
    contextWords,
    narration,
    compared,
    windows: definitions.data?.windows ?? [],
    definitions,
    onSelect,
    onWindow,
    ask,
    replaying: replaying.isPending,
    replayFailed: replaying.isError,
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
