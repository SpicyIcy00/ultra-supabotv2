/**
 * WHAT BOB NOTICED WHILE YOU WERE AWAY.
 *
 * A watch checks on a schedule and posts only when the answer changes. Until
 * this existed the post went into the river and the room never showed it, so a
 * watch could fire correctly and still be invisible to the person it fired
 * for — which is the same as not having fired at all.
 *
 * IT IS NOT "NEEDS YOU", AND IT NEVER WEARS THE ACCENT. That colour and that
 * phrase belong to the approval queue and nothing else (UI rule 5). An
 * approval is something you must act on; this is something that happened.
 * Prominence here comes from position — above the board, before the figures —
 * exactly as a caveat's does.
 *
 * "LOOK INTO IT" IS AN ORDINARY REPLY. The post carries the exact read that
 * fired it, so replying in its thread lets Bob re-run that call and climb
 * from a fact rather than from the sentence. No investigation object, no
 * second path (CLAUDE.md architecture rule 10).
 *
 * SILENCE IS THE NORMAL STATE, so an empty list renders as nothing at all —
 * not as "all clear", which would be a claim, and not as a spinner's leftovers.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listNoticed, type NoticedItem } from '../services/noticedApi';

const DISMISSED = 'bob.noticed.dismissed';

function dismissedIds(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function remember(postId: string): void {
  try {
    sessionStorage.setItem(DISMISSED, JSON.stringify(
      [...dismissedIds(), postId].slice(-40),
    ));
  } catch {
    /* a browser that refuses storage loses the dismissal, not the room */
  }
}

export function Noticed({ onLookInto }: {
  onLookInto: (item: NoticedItem) => void;
}) {
  const [hidden, setHidden] = useState<string[]>(dismissedIds);
  const { data, isPending, isError } = useQuery({
    queryKey: ['noticed'],
    queryFn: listNoticed,
    staleTime: 60_000,
    retry: false,
  });

  // Not loaded and nothing to report are different facts, and neither of them
  // is a sentence on screen: the first waits, the second is silence.
  if (isPending || isError || !data) return null;
  const items = data.filter((item) => !hidden.includes(item.post_id));
  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: 22 }}>
      <p className="r-label" style={{ color: 'rgb(var(--bob))' }}>
        {items.length === 1 ? 'Bob noticed something' : `Bob noticed ${items.length} things`}
      </p>
      {items.map((item) => (
        <div
          key={item.post_id}
          style={{
            display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap',
            marginTop: 10, paddingLeft: 10, borderLeft: '2px solid var(--edge)',
          }}
        >
          <div style={{ flex: '1 1 26ch' }}>
            <p className="r-note" style={{ margin: 0 }}>
              {/* A system that broke is named as one. NOT in the approvals
                  colour: a failed run is not an approval (CLAUDE.md UI rule
                  5, in those words), and borrowing the summons colour for it
                  is how the summons stops meaning anything. */}
              {item.kind === 'stuck' && (
                <span className="r-label" style={{ marginRight: 8 }}>stopped ·</span>
              )}
              {item.body}
            </p>
            {/* What it said, then the one thing that would unstick it. Both
                come from the system's own record — neither is Bob guessing
                at a cause he has not established. */}
            {item.why && (
              <p className="r-label" style={{ marginTop: 4, opacity: 0.8 }}>{item.why}</p>
            )}
            {item.fix && (
              <p className="r-note" style={{ marginTop: 4, opacity: 0.9 }}>{item.fix}</p>
            )}
          </div>
          {item.created_at && (
            <span className="r-label" style={{ opacity: 0.7 }}>
              {new Date(item.created_at).toLocaleDateString()}
            </span>
          )}
          {/* Only offered when the read actually travelled with the post. A
              button that promised to re-run a call that was never stored
              would be inventing the one thing a reply must not invent. */}
          {item.has_calls && (
            <button type="button" className="r-act" onClick={() => onLookInto(item)}>
              look into it
            </button>
          )}
          <button
            type="button"
            className="r-act"
            onClick={() => { remember(item.post_id); setHidden(dismissedIds()); }}
          >
            dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
