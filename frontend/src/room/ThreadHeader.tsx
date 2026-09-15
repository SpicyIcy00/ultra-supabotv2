/**
 * THE THREAD'S OWN HEADER — and the thread is already a page (P2.a).
 *
 * Hex gives one object three views: the agent you talked to, the notebook
 * underneath, the app it becomes. This is George's version of that, and the
 * four are not four places — they are four readings of the same
 * conversation:
 *
 *   TALK       the reading and the board, which is where you already are.
 *   BEHIND IT  every read this thread stands on, with its receipts.
 *   REPLAY     the work itself, walked: every step in the order it ran, one
 *              at a time, with what it brought back (P2.e).
 *   PAGE       what this thread would be if you kept it, and what it would
 *              not take.
 *
 * FOUR NOW, AND THE FOURTH IS NOT THE SECOND. Behind it is the EVIDENCE — the
 * reads, flat, with their receipts, answering "where did these numbers come
 * from". Replay is the WORK — every step including the ones that read nothing,
 * in order, answering "what did he do, and what did he see". A view that
 * merged them would answer neither question well.
 *
 * NOTHING IS CREATED BY LOOKING. The Page view is a draft of something that
 * already exists: the questions asked, in order, standing on calls that can be
 * run again. "Keep as page" names it; it does not assemble it.
 *
 * THE KEPT STATE IS READ, NEVER ASSUMED. "Not kept" is a claim about the world
 * (UI rule 8), so this draws it only while holding a result that says so:
 * *checking*, *could not be read*, *kept as <name>* and *not kept* are four
 * renderings and the first two never borrow the last two's. The read is
 * `listThreadPins` — the pins this thread actually produced, joined by the
 * conversations in it — so a page found here is a page that exists.
 *
 * NO COLOUR. The one colour means "needs you" (UI rule 5) and a thread nobody
 * has kept is not an approval. The views are words, and the one that is
 * current is the one that is dark.
 */
import { Link } from 'react-router-dom';

import type { Pin } from '../types/pins';

export type ThreadView = 'talk' | 'behind' | 'replay' | 'page';

/** The page a thread was kept as: its identity, and the name to draw. */
export interface KeptAs {
  pageId: string;
  title: string;
}

/**
 * Which page this thread was kept as, off the pins it produced — or null.
 *
 * THE NEWEST WINS AND THE REST ARE NOT HIDDEN: a thread kept twice, or one
 * George pinned an answer from before the whole thread was kept, has pins on
 * more than one page. The header names the most recent, and `keptPages` is
 * what the Page view lists so the older one is still reachable.
 *
 * Ungrouped is not a page and never answers this. A pin with no page is a
 * kept ANALYSIS, not a kept thread, and saying otherwise would send somebody
 * to `/pages/ungrouped` looking for their conversation.
 */
export function keptPages(pins: Pin[] | undefined): KeptAs[] {
  if (!pins) return [];
  const out: KeptAs[] = [];
  const seen = new Set<string>();
  // The listing is newest first, which is the order the header wants.
  for (const pin of pins) {
    if (!pin.page_id || !pin.page || seen.has(pin.page_id)) continue;
    seen.add(pin.page_id);
    out.push({ pageId: pin.page_id, title: pin.page });
  }
  return out;
}

const WORDS: Record<ThreadView, string> = {
  talk: 'Talk',
  behind: 'Behind it',
  replay: 'Replay',
  page: 'Page',
};

export function ThreadHeader({ view, onView, kept, state }: {
  view: ThreadView;
  onView: (to: ThreadView) => void;
  /** The pages this thread was kept as, newest first. Empty is "not kept". */
  kept: KeptAs[];
  /**
   * Whether the kept state has been READ. Three values, three renderings, and
   * `loading` is not a quiet version of `loaded` — a header that said "not
   * kept" before the answer arrived would be the app asserting an absence it
   * had not checked.
   */
  state: 'loading' | 'failed' | 'loaded';
}) {
  return (
    <header className="r-thead">
      <p className="r-thead-kept">
        {state === 'loading' && <span className="r-thead-quiet">checking what this is kept as…</span>}
        {state === 'failed' && (
          <span className="r-thead-quiet">what this is kept as could not be read</span>
        )}
        {state === 'loaded' && kept.length === 0 && (
          <span className="r-thead-quiet">not kept</span>
        )}
        {state === 'loaded' && kept.length > 0 && (
          <>
            <span className="r-label">kept as</span>
            <Link to={`/pages/${kept[0].pageId}`} className="r-thead-page">
              {kept[0].title}
            </Link>
          </>
        )}
      </p>
      {/* THE FOUR VIEWS, and they are one control. Tabs rather than links
          because none of them is a route: the thread is one URL and these are
          four ways of reading what is already loaded, so leaving and coming
          back does not put you somewhere else. */}
      <div className="r-thead-views" role="tablist" aria-label="This thread">
        {(['talk', 'behind', 'replay', 'page'] as ThreadView[]).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={`r-thead-view${view === v ? ' r-thead-view--on' : ''}`}
            onClick={() => onView(v)}
          >
            {WORDS[v]}
          </button>
        ))}
      </div>
    </header>
  );
}
