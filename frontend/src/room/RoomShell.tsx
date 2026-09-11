/**
 * THE OTHER ROOMS.
 *
 * `/` is the board. Three screens are not the board — what needs a decision,
 * what you kept, what runs on its own — and until now they rendered in the
 * shell that existed BEFORE the room: a wide rail of words on cream, serif
 * headings, its own type scale, its own idea of a card. Clicking the rail
 * took you out of George's surface and into the previous one, which is what
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
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useGeorge } from '../hooks/useGeorge';
import { listApprovals } from '../services/workflowsApi';
import { Rail } from './Rail';
import './room.css';

export function RoomShell({ children }: { children: ReactNode }) {
  const george = useGeorge();
  const navigate = useNavigate();
  // The same read the board's rail makes, for the same reason: a count is a
  // claim about the world, so it is drawn from a result or not at all.
  const approvals = useQuery({
    queryKey: ['workflow-approvals'],
    queryFn: () => listApprovals(),
    staleTime: 30_000,
  });

  return (
    <div className="room">
      <Rail busy={george.busy} needsYou={approvals.data?.length}
            onNew={() => navigate('/')} />
      <main className="r-main">
        <div className="r-column">{children}</div>
      </main>
    </div>
  );
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
