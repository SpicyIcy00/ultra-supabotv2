/**
 * THE OTHER ROOMS.
 *
 * `/` is the board. Three screens are not the board — what needs a decision,
 * what you kept, what runs on its own — and until now they rendered in the
 * shell that existed BEFORE the room: a wide rail of words on cream, serif
 * headings, its own type scale, its own idea of a card. Clicking the rail
 * took you out of Bob's surface and into the previous one, which is what
 * "why is it showing the old UI" was.
 *
 * They are not a different product, so they do not get a different chrome.
 * This is the room's rail and the room's ground, with a column down the
 * middle for a screen that is a LIST rather than a board. Every class in the
 * three screens is a room class, so a heading here is the same heading as a
 * heading there, and there is one place to change it.
 *
 * WHAT IT DOES NOT DO: it does not make them boards. A list of pages is a
 * list of pages, and dressing it as tiles would be the same mistake in the
 * other direction.
 */
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useBob } from '../hooks/useBob';
import { PAGES } from '../constants/pages';
import { listApprovals } from '../services/workflowsApi';
import { Rail } from './Rail';
import './room.css';

export function RoomShell({ children }: { children: ReactNode }) {
  const bob = useBob();
  const navigate = useNavigate();
  const location = useLocation();
  // The same read the board's rail makes, for the same reason: a count is a
  // claim about the world, so it is drawn from a result or not at all.
  const approvals = useQuery({
    queryKey: ['workflow-approvals'],
    queryFn: () => listApprovals(),
    staleTime: 30_000,
  });

  return (
    <div className="room">
      <Rail busy={bob.busy} needsYou={approvals.data?.length}
            onNew={() => navigate('/bob')} />
      {/* A LIST, NOT THE BESIDE ROOM: the same ground, sidebar and type, and a
          column centred in the room the sidebar leaves (P2S.1(h)). */}
      <main className="r-main r-main--list">
        <div className="r-column">{children}</div>
      </main>
      <AskBar from={screenName(location.pathname)} />
    </div>
  );
}

/** What this screen is called, for the line's placeholder and for Bob. */
function screenName(path: string): string {
  return PAGES.find((page) => page.path === path)?.label ?? 'this screen';
}

/**
 * The top of one of these screens.
 *
 * A name and one line saying what the screen is for — the same two things the
 * old shell said in a serif display face two sizes larger than anything else
 * on the page. Here the name is a name and the sentence is a sentence.
 */
export function RoomHead({ title, says, aside }: {
  title: string; says?: string; aside?: ReactNode;
}) {
  return (
    <header className="r-head">
      <div className="r-head-row">
        <h1 className="r-h1">{title}</h1>
        {aside}
      </div>
      {says && <p className="r-note" style={{ marginTop: 8 }}>{says}</p>}
    </header>
  );
}

/**
 * THE LINE, ON EVERY SCREEN (the owner, 2026-09-19: "the text bar should be
 * global same spot everypage").
 *
 * UI rule 1 says Bob is on every page, not a page you navigate to. He was not:
 * the composer lived in the Room, so on Needs you, Kept, Systems or the
 * StoreHub exports there was nowhere to say anything, and the way to ask was
 * to leave the screen first.
 *
 * THIS IS NOT A SECOND COMPOSER. It is one line with no chips, no mentions and
 * no voice, because none of those have anything to travel with here — nothing
 * on these screens is picked. It uses `.r-line-wrap` / `.r-compose` / `.r-line`,
 * the Room's own classes, so it is the same shape in the same place: fixed at
 * the bottom, 840 centred, sliding with the rail.
 *
 * ASKING TAKES YOU TO THE ANSWER. The question goes to the same `ask` the Room
 * uses, carrying THIS SCREEN as context (rule 1: he receives that page), and
 * the board opens, because that is where an answer is drawn. A question asked
 * into a screen with no room for the reply would be a question with nowhere to
 * land.
 */
function AskBar({ from }: { from: string }) {
  const bob = useBob();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');

  const send = () => {
    const question = draft.trim();
    if (!question || bob.busy) return;
    setDraft('');
    // Not awaited: the board is where the turn is drawn, and it is already
    // subscribed to the same stream.
    void bob.ask(question, { pageContext: from });
    navigate('/bob');
  };

  return (
    <div className="r-line-wrap">
      <div className="r-compose">
        <div className="r-line">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
            placeholder={bob.busy ? 'Bob is working…' : `ask about ${from.toLowerCase()}`}
            aria-label="Ask Bob"
          />
          <button type="button" className="r-send" onClick={send}
                  disabled={!draft.trim() || bob.busy} aria-label="Ask">↑</button>
        </div>
      </div>
    </div>
  );
}
