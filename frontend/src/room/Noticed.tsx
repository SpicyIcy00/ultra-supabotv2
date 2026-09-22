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
 *
 * SET ASIDE WITH A REASON (W2.3). The session-only "dismiss" is gone: one tap
 * for why — known, not important, wrong — is kept as a view you told Bob, and
 * the server leaves that kind of post about those subjects off this list from
 * then on (undo it in what he remembers). "Wrong" keeps it listed, with the
 * doubt drawn above it as a notice, so nobody reads it as settled.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { listNoticed, type NoticedItem } from '../services/noticedApi';
import type { Dismissed } from '../services/dismissalsApi';
import { SetAside } from './SetAside';
import { Caveat } from './tiles';

export function Noticed({ onLookInto, send }: {
  onLookInto: (item: NoticedItem) => void;
  /** The write, for a test; the route by default. */
  send?: Parameters<typeof SetAside>[0]['send'];
}) {
  // What was set aside on THIS screen and quieted, kept until the list
  // reloads without it: the confirmation stays where the tap was.
  const [aside, setAside] = useState<Record<string, { item: NoticedItem; result: Dismissed }>>({});
  const client = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ['noticed'],
    queryFn: listNoticed,
    staleTime: 60_000,
    retry: false,
  });

  // Not loaded and nothing to report are different facts, and neither of them
  // is a sentence on screen: the first waits, the second is silence.
  if (isPending || isError || !data) return null;
  const items = data;
  // Set aside here and gone from the reload: said once, where it was.
  const gone = Object.values(aside).filter((a) => !items.some((i) => i.post_id === a.item.post_id));
  if (items.length === 0 && gone.length === 0) return null;
  const kept = (item: NoticedItem, result: Dismissed) => {
    if (result.quiets) setAside((a) => ({ ...a, [item.post_id]: { item, result } }));
    // A doubt comes back from the server on the item itself; a quieting
    // takes it off the next load. Either way the list is read again.
    void client.invalidateQueries({ queryKey: ['noticed'] });
  };

  return (
    <div style={{ marginBottom: 22 }}>
      {items.length > 0 && (
        <p className="r-label" style={{ color: 'rgb(var(--bob))' }}>
          {items.length === 1 ? 'Bob noticed something' : `Bob noticed ${items.length} things`}
        </p>
      )}
      {items.map((item) => (
        <div
          key={item.post_id}
          style={{
            display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap',
            marginTop: 10, paddingLeft: 10, borderLeft: '2px solid var(--edge)',
          }}
        >
          <div style={{ flex: '1 1 26ch' }}>
            {/* SOMEONE CALLED IT WRONG (W2.3): drawn above it as a notice
                is, never in the accent, and never hidden for it. */}
            {item.disputed && (
              <Caveat notice={{ kind: 'disputed_by_a_person', message: item.disputed }} />
            )}
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
          <SetAside
            what={{ item: item.kind === 'stuck' ? 'stuck' : 'watch', post_id: item.post_id }}
            threadId={item.thread_id || null}
            onKept={(result) => kept(item, result)}
            send={send}
          />
        </div>
      ))}
      {gone.map(({ item, result }) => (
        <p key={item.post_id} className="r-setaside r-setaside--kept" role="status"
           style={{ marginTop: 10, paddingLeft: 10 }}>
          Set aside as {result.reason === 'known' ? 'known' : 'not important'}: {item.body}.
          {' '}He will not raise this again; undo it in what he remembers.
        </p>
      ))}
    </div>
  );
}
