/**
 * The live turns, drawn by the one renderer.
 *
 * WHAT IS LEFT OF THIS FILE. This used to be a second rendering of a George
 * answer — the streaming one — beside PostCard's stored one, and the two
 * agreed only by coincidence. Everything it drew now lives in RiverEntry, and
 * a live turn reaches it as a WorkUnit exactly as a stored post does
 * (workUnit.ts), so the live-to-stored handoff changes `state` rather than
 * swapping a subtree.
 *
 * ONE PRESENCE. The mark animates in the shell — that is George's identity,
 * wherever the person is — so the avatar here is the same drawing at rest,
 * identical to the one a stored post carries. What THIS turn is doing is
 * narrated in words beside it, from the frames, while it runs.
 *
 * SCROLLING IS NOT HERE. It was, as a smooth `scrollIntoView` keyed on the
 * turns array, which is new on every delta — hundreds of queued animations per
 * turn and no way for a reader to hold their place. It belongs to the scroll
 * container now (useAutoFollow).
 */
import { useMemo } from 'react';
import type { GeorgeTurn } from '../../types/george';
import { useGeorge } from '../../hooks/useGeorge';
import { liveCognition } from './cognition';
import { markDetail } from './markState';
import { RiverEntry } from './RiverEntry';
import { latestWorkId, liveItems } from './workUnit';

interface Props {
  turns: GeorgeTurn[];
  /** Whether earlier turns go quieter so the newest answer leads. */
  focusLatest?: boolean;
}

export function AnswerTurns({ turns, focusLatest = false }: Props) {
  const { busy, presence, live } = useGeorge();

  const items = useMemo(() => liveItems(turns), [turns]);
  const leader = useMemo(() => latestWorkId(items), [items]);

  // The narration belongs to the newest entry and only while it is running.
  // Built here because it reads the shared stream; RiverEntry takes it as a
  // prop so a stored entry costs nothing and the component memoizes on props.
  const narration = useMemo(
    () =>
      busy
        ? {
            detail: markDetail(presence, live.running, live.lastResult),
            cognition: liveCognition(presence, live.thinking),
          }
        : null,
    [busy, presence, live.running, live.lastResult, live.thinking],
  );

  if (items.length === 0) return null;

  return (
    <div className="space-y-6">
      {items.map((item) => (
        <RiverEntry
          key={item.id}
          item={item}
          quiet={focusLatest && item.kind === 'work' && item.id !== leader}
          narration={item.id === leader && item.kind === 'work' ? narration : null}
        />
      ))}
    </div>
  );
}
