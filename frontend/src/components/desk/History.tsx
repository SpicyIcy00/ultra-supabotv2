/**
 * History: the river, demoted to a drawer.
 *
 * THE RIVER IS UNCHANGED AS INFRASTRUCTURE — persistence, provenance, audit,
 * reconstruction — and this is the whole of its user-facing role: a list of
 * what has happened, by time, from which any piece of work can be reopened.
 *
 * OPENING ONE RESTORES A WORKSPACE, NOT A TRANSCRIPT. A row navigates to the
 * work's own address; the desk composes it from its posts and restores the
 * focus the newest question carried. Nothing here renders a conversation.
 */
import { X } from 'lucide-react';
import type { Post } from '../../types/river';

export interface HistoryEntry {
  threadId: string;
  title: string;
  at: string;
  /** What kind of thing it was: work a person started, or something George did. */
  kind: 'work' | 'george';
}

/** The river as entries: one per thread, named by what was asked. */
export function historyEntries(posts: Post[]): HistoryEntry[] {
  const byThread = new Map<string, HistoryEntry>();
  for (const post of posts) {
    const existing = byThread.get(post.thread_id);
    const isQuestion = post.kind === 'question';
    if (!existing) {
      byThread.set(post.thread_id, {
        threadId: post.thread_id,
        title: post.body?.trim() || (post.kind === 'brief' ? 'This morning' : 'Work'),
        at: post.created_at ?? '',
        kind: isQuestion || post.kind === 'answer' ? 'work' : 'george',
      });
      continue;
    }
    // The question names the thread; a later post only moves its time.
    if (isQuestion && existing.kind !== 'work') {
      existing.title = post.body?.trim() || existing.title;
      existing.kind = 'work';
    }
    if ((post.created_at ?? '') > existing.at) existing.at = post.created_at ?? existing.at;
  }
  return [...byThread.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
}

function when(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PH', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  });
}

export function History({ posts, loading, error, onOpen, onClose, hasOlder, onOlder }: {
  posts: Post[];
  loading: boolean;
  error: boolean;
  onOpen: (threadId: string) => void;
  onClose: () => void;
  hasOlder: boolean;
  onOlder: () => void;
}) {
  const entries = historyEntries(posts);
  return (
    <>
      <button type="button" aria-label="Close history" onClick={onClose} className="fixed inset-0 z-40 bg-george-navy/10" />
      <aside
        className="desk-lift-3 fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-george-paper"
        role="dialog"
        aria-label="History"
        data-history
      >
        <div className="flex items-baseline justify-between gap-3 px-6 pb-3 pt-5">
          <p className="font-george-serif text-[22px] leading-none text-george-navy">History</p>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-touch text-george-muted hover:text-george-navy">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="px-6 pb-4 text-[12px] leading-relaxed text-george-slate">
          Everything George has done, by time. Opening one puts that work back on the desk.
        </p>

        <div className="flex-1 overflow-y-auto px-6 pb-8">
          {/* Three outcomes, three renderings (UI rule 8). */}
          {loading && entries.length === 0 && <p className="text-[13px] text-george-muted">Reading…</p>}
          {error && entries.length === 0 && (
            <p className="text-[13px] leading-relaxed text-george-navy">Couldn’t read the history. It is still there.</p>
          )}
          {!loading && !error && entries.length === 0 && (
            <p className="text-[13px] leading-relaxed text-george-slate">Nothing yet.</p>
          )}

          <ul className="space-y-0">
            {entries.map((e) => (
              <li key={e.threadId} className="border-b border-george-line/70 last:border-0">
                <button
                  type="button"
                  onClick={() => onOpen(e.threadId)}
                  data-history-entry={e.threadId}
                  className="block w-full py-3.5 text-left"
                >
                  <p className="font-george-serif text-[15px] leading-snug text-george-navy">{e.title}</p>
                  <p className="mt-1 text-[11px] tabular-nums text-george-muted">
                    {when(e.at)}
                    {e.kind === 'george' && ' · George'}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {hasOlder && (
            <button
              type="button"
              onClick={onOlder}
              className="mt-5 min-h-touch text-[12px] text-george-slate hover:text-george-navy"
            >
              Earlier
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
