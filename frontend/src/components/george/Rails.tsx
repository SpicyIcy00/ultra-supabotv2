/**
 * The two rails.
 *
 * The LEFT rail has two sections, and the split is the point:
 *
 *   Chats   sessions. Past conversations from george.conversations, by title
 *           and date; click to reopen and continue. New chat starts an empty
 *           one.
 *   Pages   pinned tile collections, from GET /pins/pages. "Ungrouped" is the
 *           page of pins that have no page — it never holds a conversation.
 *
 * Before this the rail was pages only. The conversation had no place in it,
 * the way back to it was a row inside the pages list, and the only durable
 * thing a chat could become was a pin with no page — which is how chats ended
 * up in Ungrouped. Chats are sessions, not pages (CLAUDE.md vocabulary).
 *
 * The rail names things; they open in the centre column. Tiles live there
 * (see PinnedPage) because a notice banner and a receipts line do not fit in
 * 256px, and UI rule 4 says a tile that cannot show its caveat is the wrong
 * shape.
 *
 * The RIGHT rail is the approval queue, and it renders from a loaded result —
 * never a literal (UI rule 8). It was a placeholder saying "Nothing needs you"
 * long after GET /george/workflows/approvals went live, which is how the app
 * came to assert something it had never checked. Loading, failure and an empty
 * queue are now three different renderings; see approvalState.ts.
 *
 * Responsive contract (UI rule 7 — the centre column is the whole screen on a
 * phone): below lg both rails are OVERLAYS. They never take width from the
 * conversation, they cover it and dismiss.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronRight, PanelLeft, Plus, Trash2, X } from 'lucide-react';
import { deleteChat, listChats } from '../../services/chatsApi';
import { listPinPages, listPins } from '../../services/pinsApi';
import type { Approval } from '../../types/workflows';
import { attentionAccent, attentionLabel, type ApprovalsView } from './approvalState';

/** What the centre column is showing. */
export type Centre = { kind: 'chat' } | { kind: 'page'; page: string | null };

interface RailProps {
  open: boolean;
  onClose: () => void;
}

interface LeftRailProps extends RailProps {
  centre: Centre;
  /** The chat the centre column holds, if it has been given a thread yet. */
  activeThreadId: string | null;
  onNewChat: () => void;
  onOpenChat: (threadId: string) => void;
  /** Called after a chat is deleted, with its id, so the page can clear it if it is open. */
  onChatDeleted: (threadId: string) => void;
  onSelectPage: (page: string | null) => void;
}

/* ---------------------------------------------------------------- left ---- */

export function LeftRail({
  open,
  onClose,
  centre,
  activeThreadId,
  onNewChat,
  onOpenChat,
  onChatDeleted,
  onSelectPage,
}: LeftRailProps) {
  const qc = useQueryClient();
  const chats = useQuery({ queryKey: ['chats'], queryFn: listChats });
  const pages = useQuery({ queryKey: ['pin-pages'], queryFn: listPinPages });
  const totalPins = (pages.data ?? []).reduce((n, p) => n + p.pins, 0);

  const remove = useMutation({
    mutationFn: deleteChat,
    onSuccess: (_void, threadId) => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      onChatDeleted(threadId);
    },
  });

  const onDelete = (threadId: string, title: string) => {
    // Deleting a chat hides a conversation, not data — the answers' figures
    // were never stored, and any pin made from it lives on its page. A plain
    // confirm is proportionate, the same as removing a pin.
    if (window.confirm(`Delete “${title}”? It will disappear from this list and cannot be reopened.`)) {
      remove.mutate(threadId);
    }
  };

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close chats and pages"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-george-navy/20 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-george-line bg-george-cream
          transition-transform lg:static lg:z-auto lg:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full lg:hidden'}`}
        aria-label="Chats and pages"
      >
        {/* ---------------------------------------------------- chats ---- */}
        <div className="flex items-center justify-between px-3 py-3">
          <h2 className="font-george-serif text-[15px] text-george-navy">Chats</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onNewChat}
              aria-label="New chat"
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-george-slate hover:bg-george-line/40 min-h-touch"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chats and pages"
              className="flex h-8 w-8 min-h-touch min-w-touch items-center justify-center text-george-slate lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {chats.isPending && (
            <p className="text-[13px] text-george-muted">Loading chats…</p>
          )}
          {chats.isError && (
            <p className="text-[13px] leading-relaxed text-george-slate">
              Could not load chats.
            </p>
          )}
          {chats.data && chats.data.length === 0 && (
            <p className="text-[13px] leading-relaxed text-george-slate">
              No chats yet. Ask something to start one.
            </p>
          )}
          {remove.isError && (
            <p className="text-[12px] leading-relaxed text-george-slate">
              Could not delete that chat.
            </p>
          )}

          <ul className="space-y-0.5">
            {(chats.data ?? []).map((c) => (
              <ChatRow
                key={c.thread_id}
                title={c.title}
                question={c.question}
                at={c.last_asked_at}
                active={centre.kind === 'chat' && activeThreadId === c.thread_id}
                onOpen={() => onOpenChat(c.thread_id)}
                onDelete={() => onDelete(c.thread_id, c.title)}
              />
            ))}
          </ul>

          {/* ---------------------------------------------------- pages ---- */}
          <h2 className="mt-5 mb-2 font-george-serif text-[15px] text-george-navy">Pages</h2>

          {pages.isPending && (
            <p className="text-[13px] text-george-muted">Loading pages…</p>
          )}
          {pages.isError && (
            <p className="text-[13px] leading-relaxed text-george-slate">
              Could not load pages.
            </p>
          )}
          {pages.data && totalPins === 0 && (
            <>
              <p className="text-[13px] leading-relaxed text-george-slate">
                No saved pages yet.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-george-muted">
                Pin an answer to start one. A pin re-runs; the page collects them.
              </p>
            </>
          )}

          <ul className="space-y-0.5">
            {(pages.data ?? []).map((p) => (
              <PageRow
                key={p.page ?? '__ungrouped__'}
                page={p.page}
                count={p.pins}
                active={centre.kind === 'page' && centre.page === p.page}
                onOpen={() => onSelectPage(p.page)}
              />
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}

/**
 * One chat: its title, the day it was last active, and a delete control.
 *
 * The control is always rendered rather than shown on hover — there is no
 * hover on a phone, and the phone layout is the real layout (UI rule 7).
 */
function ChatRow({
  title,
  question,
  at,
  active,
  onOpen,
  onDelete,
}: {
  /** Already cut to 40 characters, ellipsis included, by chat_history.title_of. */
  title: string;
  /** The full question, for the hover. Falls back to the title if absent. */
  question?: string;
  at: string;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <li>
      <div className={`group flex items-center rounded-lg ${active ? 'bg-george-line/50' : ''}`}>
        <button
          type="button"
          onClick={onOpen}
          aria-current={active ? 'true' : undefined}
          className="flex min-h-touch min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-george-navy hover:bg-george-line/40"
          // The WHOLE question, not the truncated label — a hover that repeats
          // what is already on screen tells the reader nothing.
          title={question || title}
        >
          <span className="truncate">{title}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-george-muted">{dayLabel(at)}</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete chat “${title}”`}
          className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-george-muted hover:text-george-navy"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
}

/** "3 Sep", or "3 Sep 2025" once the year differs. Manila is the app's clock. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'Asia/Manila',
  });
}

/**
 * One page: a row that opens it in the centre, and a disclosure listing the pin
 * titles it holds. The titles are navigation, not tiles — see the file header.
 */
function PageRow({
  page,
  count,
  active,
  onOpen,
}: {
  page: string | null;
  count: number;
  active: boolean;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pins = useQuery({
    queryKey: ['pins', page],
    queryFn: () => listPins(page),
    enabled: expanded,
  });

  return (
    <li>
      <div
        className={`flex items-center gap-0.5 rounded-lg ${active ? 'bg-george-line/50' : ''}`}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${page ?? 'Ungrouped'}` : `Expand ${page ?? 'Ungrouped'}`}
          className="flex h-8 w-6 items-center justify-center text-george-muted"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-touch flex-1 items-center justify-between gap-2 rounded-lg py-1.5 pr-2 text-left text-[13px] text-george-navy hover:bg-george-line/40"
        >
          <span className="truncate">{page ?? 'Ungrouped'}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-george-muted">{count}</span>
        </button>
      </div>

      {expanded && (
        <ul className="mb-1 ml-6 space-y-0.5 border-l border-george-line pl-2">
          {pins.isPending && <li className="py-1 text-[12px] text-george-muted">Loading…</li>}
          {(pins.data ?? []).map((pin) => (
            <li key={pin.id}>
              <button
                type="button"
                onClick={onOpen}
                className="w-full truncate rounded py-1 text-left text-[12px] text-george-slate hover:text-george-navy"
                title={pin.title}
              >
                {pin.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Desktop-only strip shown when the left rail is collapsed (its default). */
export function LeftRailStub({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open chats and pages"
      className="hidden lg:flex w-11 shrink-0 flex-col items-center border-r border-george-line bg-george-cream pt-3 text-george-slate"
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  );
}

/* --------------------------------------------------------------- right ---- */

/**
 * The approval queue.
 *
 * Every word here comes from a loaded result (UI rule 8). The rail used to say
 * "Nothing needs you" as a literal beside a count hardcoded to 0, while the
 * endpoint had been live for a day and one version was genuinely waiting — so
 * loading and failure are their own renderings and neither may borrow the empty
 * state's words. The decision is in approvalState.ts, where the suite holds it.
 *
 * ORANGE APPEARS ON ROWS AND NOWHERE ELSE. UI rule 5's one reserved colour
 * belongs to a workflow version waiting to be promoted past the backtest gate.
 * A queue that failed to load is not an approval; an empty one is not either.
 * Both are navy, and `view.accent` is what decides.
 *
 * NO RECEIPTS BLOCK, DELIBERATELY. An approval row carries no figure from a
 * tool, and the receipts rules govern numbers. Its times are its own —
 * created_at, and backtested_at or the absence of one.
 */
export function RightRail({ open, onClose, view }: RailProps & { view: ApprovalsView }) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close attention"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-george-navy/20 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-80 shrink-0 flex-col border-l border-george-line bg-george-cream
          transition-transform lg:static lg:z-auto lg:translate-x-0
          ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
        aria-label="Needs you"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-george-serif text-[15px] text-george-navy">Needs you</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 min-h-touch min-w-touch items-center justify-center text-george-slate lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {view.kind === 'rows' ? (
            <>
              <p className="mb-2 text-[12px] text-george-accent">{view.heading}</p>
              <ul className="space-y-2">
                {view.rows.map((a) => (
                  <ApprovalRow key={a.version_id} approval={a} />
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-george-slate">{view.heading}</p>
              {view.detail && (
                <p className="mt-1 text-[12px] leading-relaxed text-george-muted">
                  {view.detail}
                </p>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * One version waiting on a person.
 *
 * `blocked_on` is printed verbatim: the server distinguishes "never
 * backtested" from "backtested and waiting for an administrator", and those
 * have different fixes — promote it, or go and run a backtest. A client that
 * summarised both as "waiting" would throw that away.
 *
 * The accent is one hairline down the left edge. It marks the row as the thing
 * that needs you without turning the panel into an alarm.
 */
function ApprovalRow({ approval }: { approval: Approval }) {
  return (
    <li className="border-l-2 border-george-accent bg-george-paper py-2 pl-2.5 pr-2">
      <p className="text-[13px] leading-snug text-george-navy">
        {approval.name}{' '}
        <span className="tabular-nums text-george-slate">v{approval.version}</span>
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-george-slate">
        {approval.blocked_on}
      </p>
      {/* Its own times, not a snapshot timestamp — this row states no figure. */}
      <p className="mt-1.5 text-[11px] text-george-muted">
        Saved by {approval.created_by} · {dayLabel(approval.created_at)}
        {approval.backtested_at
          ? ` · backtested ${dayLabel(approval.backtested_at)}`
          : ' · never backtested'}
      </p>
    </li>
  );
}

/**
 * Header button for the right rail.
 *
 * `count` is `number | null`, and null is not a synonym for 0 — it means we
 * have not found out yet. The label says so and the badge stays away, so an
 * unknown count can never read as "nothing needs you" (UI rule 8).
 *
 * Not `lg:hidden`. The rail is statically visible at that width, but the badge
 * is the only thing on screen carrying a NUMBER, and suppressing it exactly
 * where there is room for it was backwards.
 */
export function AttentionButton({
  count,
  onClick,
}: {
  count: number | null;
  onClick: () => void;
}) {
  const accent = attentionAccent(count);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={attentionLabel(count)}
      className="relative flex h-9 w-9 min-h-touch min-w-touch items-center justify-center rounded-lg text-george-slate"
    >
      <Bell className={`h-4 w-4 ${accent ? 'text-george-accent' : ''}`} />
      {accent && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-george-accent" />
      )}
    </button>
  );
}
