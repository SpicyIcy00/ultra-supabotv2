/**
 * THE LINE, ON EVERY PAGE, AND THE ANSWER BESIDE IT (W1.4, 2026-09-22).
 *
 * UI rule 1: Bob is on every page, not a page you navigate to, and he
 * receives that page as context. He was on Bob's own screens only: the BI
 * pages had no line at all, and the line his rooms had took you to /bob to
 * read the answer (RoomShell, KeptPage). This is the one line, mounted ONCE
 * above both chromes (App.tsx), in the same spot on every page (the owner,
 * 2026-09-19: "the text bar should be global same spot everypage"): the
 * room's `.r-line-wrap` / `.r-compose` / `.r-line`, and on the BI app's phone
 * layout it stands above the tab bar rather than under it.
 *
 * ASKING STAYS WHERE YOU ARE. The question carries this page (`here`: a kept
 * page's identity, or a BI page's key, tab, subjects and window — never a
 * figure) and the answer opens beside it, in `HerePanel`. The conversation
 * follows the page: asked from a different page than the open thread was,
 * it is a new thread (pageScope.askPlan). The panel shows only a thread asked
 * from THIS page — an answer about another page drawn beside this one would
 * be about the wrong thing.
 *
 * NOT DRAWN in Bob's own room, whose composer is the line; on the print
 * sheet; in the legacy NL→SQL chat, which has its own and is not Bob; or for
 * a person without Bob's page, who has no one to ask (`here.lineShownAt`).
 */
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useBob } from '../hooks/useBob';
import { useHere } from '../hooks/useHere';
import { useAuthStore } from '../stores/authStore';
import type { DeskContext } from '../types/bob';
import { askFrom, chromeAt, lineShownAt, placeholderFor, whereOf } from '../components/bob/here';
import './room.css';
import './here.css';

const HerePanel = lazy(() => import('./HerePanel'));

export function BobHere() {
  const { pathname } = useLocation();
  const mayAsk = useAuthStore((s) => s.user?.allowed_pages.includes('bob') ?? false);
  if (!mayAsk || !lineShownAt(pathname)) return null;
  return <HereLine pathname={pathname} />;
}

function HereLine({ pathname }: { pathname: string }) {
  const bob = useBob();
  const here = useHere();
  const [draft, setDraft] = useState('');
  const at = whereOf(here);
  // Closed by the person, for the thread as it stood: a new question opens it again.
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const mine = bob.where === at && bob.turns.length > 0;
  const open = mine && closedAt !== bob.turns.length;
  useEffect(() => { setClosedAt(null); }, [at]);
  // The page makes room for the panel on a desktop (here.css `.r-here-beside`),
  // keyed on <html> as the rail's `data-side` is.
  useEffect(() => {
    if (!open) return undefined;
    const root = document.documentElement;
    root.setAttribute('data-here', 'open');
    return () => root.removeAttribute('data-here');
  }, [open]);

  const ask = useCallback((question: string, extra: { desk?: DeskContext } = {}) => {
    const q = question.trim();
    if (!q || bob.busy) return;
    setClosedAt(null);
    void bob.ask(q, { ...askFrom(here), ...extra });
  }, [bob, here]);

  const send = () => {
    if (!draft.trim() || bob.busy) return;
    ask(draft);
    setDraft('');
  };

  // Working on a question asked from another page: said, not hidden, so the
  // line is never simply dead.
  const elsewhere = bob.busy && !mine;
  const placeholder = bob.busy
    ? (elsewhere ? 'Bob is answering on another page…' : 'Bob is working…')
    : placeholderFor(here);

  return (
    <div className="room r-here" data-chrome={chromeAt(pathname)} data-open={open ? 'yes' : 'no'}>
      {open && (
        <Suspense fallback={<aside className="r-here-panel" aria-label="Bob, beside this page"><p className="r-note">Opening…</p></aside>}>
          <HerePanel label={here.page ? (here.page.title ?? here.label) : here.label}
                     onClose={() => setClosedAt(bob.turns.length)} onAsk={ask} />
        </Suspense>
      )}
      <div className="r-line-wrap r-here-line">
        <div className="r-compose">
          <div className="r-line">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
              placeholder={placeholder}
              aria-label="Ask Bob"
            />
            {mine && !open && (
              <button type="button" className="r-act r-here-reopen" onClick={() => setClosedAt(null)}>
                Show answer
              </button>
            )}
            <button type="button" className="r-send" onClick={send}
                    disabled={!draft.trim() || bob.busy} aria-label="Ask">↑</button>
          </div>
        </div>
      </div>
    </div>
  );
}
