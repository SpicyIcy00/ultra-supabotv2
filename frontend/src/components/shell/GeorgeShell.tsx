/**
 * The George-first shell.
 *
 * EDITORIAL, NOT A SIDEBAR. A rail of words on cream: Today, Ask, Inbox,
 * Pages, Workflows, then Operations. No icon buttons, no pills, no cards, no
 * separators; the current page is navy and the rest are slate, and that is
 * the whole of the state. Typography and whitespace do the work.
 *
 * THE MARK IS GEORGE, AND IT IS THE ONLY ORANGE ON THE RAIL. It reflects what
 * the one stream is doing wherever the person is — an answer arriving while
 * they read Inbox is visible here — and under it one slate line says what,
 * in George's own words, only while he is working. At rest the line is
 * empty: "Ready" beside a mark that visibly breathes is a caption on a
 * photograph.
 *
 * The needs-you count beside Inbox is the ONE other place the accent appears
 * in the shell, and only for a loaded, non-zero count (UI rules 5 and 8).
 * While the queue is unknown the count is simply absent — absence is not a
 * claim, and the Inbox page itself says "Checking…".
 *
 * MOBILE IS THE REAL LAYOUT (UI rule 7). Below `md` the rail becomes a
 * header with the mark and a bottom bar with Today, Ask, Inbox and More; the
 * centre column is the whole screen. Between `md` and `lg` the words sit in
 * the header. From `lg` the rail returns. One set of components, three
 * arrangements.
 */
import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useGeorge } from '../../hooks/useGeorge';
import { listApprovals } from '../../services/workflowsApi';
import { approvalsView, attentionAccent } from '../george/approvalState';
import { ReactiveMark } from '../george/ReactiveMark';
import { markDetail } from '../george/markState';
import {
  isActive,
  operationsFor,
  phoneMore,
  phoneTabs,
  primaryFor,
  type NavItem,
} from './shellNav';

function useApprovalsCount(): number | null {
  const approvals = useQuery({
    queryKey: ['workflow-approvals'],
    queryFn: () => listApprovals(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  return approvalsView(
    approvals.isPending
      ? { status: 'pending' }
      : approvals.isError
        ? { status: 'error' }
        : { status: 'success', approvals: approvals.data ?? [] },
  ).count;
}

/** One word in the rail. Navy when here, slate otherwise; nothing else. */
function Word({
  item,
  pathname,
  count,
  onClick,
  className = '',
}: {
  item: NavItem;
  pathname: string;
  count?: number | null;
  onClick?: () => void;
  className?: string;
}) {
  const here = isActive(item, pathname);
  const accent = item.label === 'Inbox' && attentionAccent(count ?? null);
  return (
    <Link
      to={item.path}
      onClick={onClick}
      aria-current={here ? 'page' : undefined}
      className={`flex min-h-touch items-baseline gap-3 text-[15px] leading-none transition-colors ${
        here ? 'text-george-navy' : 'text-george-slate hover:text-george-navy'
      } ${className}`}
    >
      <span>{item.label}</span>
      {accent && (
        <span className="text-[13px] tabular-nums text-george-accent">{count}</span>
      )}
    </Link>
  );
}

/** The mark with George's name, and under it what he is doing — if anything. */
function Presence({ compact = false }: { compact?: boolean }) {
  const { presence, live } = useGeorge();
  const detail = presence === 'idle' ? '' : markDetail(presence, live.running, live.lastResult);
  return (
    <div className="flex items-center gap-2.5">
      <ReactiveMark
        variant="mark"
        state={presence}
        running={live.running}
        lastResult={live.lastResult}
        toolResults={live.toolResults}
        className={compact ? 'h-7 w-7' : 'h-8 w-8'}
      />
      <div className="min-w-0">
        <p className="font-george-serif text-[15px] leading-none tracking-wide text-george-navy">
          George
        </p>
        {/* Fixed height, held empty at rest — the rail must not move when a
            turn starts. */}
        <p className="mt-1 h-[14px] truncate text-[11px] leading-[14px] text-george-slate">
          {detail}
        </p>
      </div>
    </div>
  );
}

export function GeorgeShell() {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const allowed = user?.allowed_pages ?? [];
  const count = useApprovalsCount();
  const [opsOpen, setOpsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = primaryFor(allowed);
  const operations = operationsFor(allowed);
  const tabs = phoneTabs(allowed);
  const more = phoneMore(allowed);
  const inOperations = operations.some((i) => isActive(i, pathname));

  return (
    <div className="min-h-dvh bg-george-cream font-sans text-george-navy">
      {/* ---- desktop rail ---------------------------------------------- */}
      <aside className="fixed inset-y-0 left-0 hidden w-52 flex-col px-7 pb-6 pt-8 lg:flex">
        <Link to="/today" className="block">
          <Presence />
        </Link>

        <nav className="mt-10 flex flex-col gap-1" aria-label="George">
          {primary.slice(0, 3).map((i) => (
            <Word key={i.path} item={i} pathname={pathname} count={count} />
          ))}
          <span className="h-4" aria-hidden />
          {primary.slice(3).map((i) => (
            <Word key={i.path} item={i} pathname={pathname} />
          ))}
        </nav>

        {operations.length > 0 && (
          <nav className="mt-10" aria-label="Operations">
            <button
              type="button"
              onClick={() => setOpsOpen((o) => !o)}
              aria-expanded={opsOpen || inOperations}
              className={`flex min-h-touch items-baseline gap-2 text-[15px] leading-none ${
                inOperations ? 'text-george-navy' : 'text-george-slate hover:text-george-navy'
              }`}
            >
              Operations
              <span className="text-[13px]" aria-hidden>{opsOpen || inOperations ? '↓' : '→'}</span>
            </button>
            {(opsOpen || inOperations) && (
              <div className="mt-1 flex flex-col gap-0.5 pl-3">
                {operations.map((i) => (
                  <Word key={i.path} item={i} pathname={pathname} className="text-[14px]" />
                ))}
              </div>
            )}
          </nav>
        )}

        <div className="mt-auto pt-6">
          <p className="truncate text-[12px] text-george-slate">
            {user?.display_name || user?.username}
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-0.5 text-[12px] text-george-muted hover:text-george-navy"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ---- phone and tablet header ----------------------------------- */}
      <header className="flex h-14 items-center gap-6 px-4 lg:hidden">
        <Link to="/today"><Presence compact /></Link>
        {/* Tablet: the words in the header. Phone: the bottom bar instead. */}
        <nav className="hidden flex-1 items-baseline gap-6 md:flex" aria-label="George">
          {primary.map((i) => (
            <Word key={i.path} item={i} pathname={pathname} count={count} />
          ))}
          {operations.length > 0 && (
            <div className="relative ml-auto">
              <button
                type="button"
                onClick={() => setOpsOpen((o) => !o)}
                aria-expanded={opsOpen}
                className={`min-h-touch text-[15px] ${
                  inOperations ? 'text-george-navy' : 'text-george-slate'
                }`}
              >
                Operations →
              </button>
              {opsOpen && (
                <div className="absolute right-0 top-full z-30 flex min-w-40 flex-col gap-0.5 rounded-lg border border-george-line bg-george-paper px-4 py-2">
                  {operations.map((i) => (
                    <Word key={i.path} item={i} pathname={pathname} onClick={() => setOpsOpen(false)} />
                  ))}
                  <button
                    type="button"
                    onClick={logout}
                    className="mt-1 py-2 text-left text-[13px] text-george-muted hover:text-george-navy"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </header>

      {/* ---- the page ---------------------------------------------------- */}
      <main className="lg:pl-52">
        <Outlet />
      </main>

      {/* ---- phone bottom bar ------------------------------------------ */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch justify-around border-t border-george-line bg-george-cream md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="George"
      >
        {tabs.map((i) => (
          <Word key={i.path} item={i} pathname={pathname} count={count}
                className="flex-1 items-center justify-center text-[14px]" />
        ))}
        {(more.length > 0 || operations.length > 0) && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex min-h-touch flex-1 items-center justify-center text-[14px] text-george-slate"
          >
            More
          </button>
        )}
      </nav>

      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-40 bg-george-navy/20 md:hidden"
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-george-cream px-6 pb-8 pt-5 md:hidden"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
            role="dialog"
            aria-label="More"
          >
            <div className="flex flex-col gap-1">
              {more.map((i) => (
                <Word key={i.path} item={i} pathname={pathname} onClick={() => setMoreOpen(false)} />
              ))}
            </div>
            {operations.length > 0 && (
              <>
                <p className="mb-1 mt-5 text-[11px] uppercase tracking-wider text-george-muted">
                  Operations
                </p>
                <div className="flex flex-col gap-0.5">
                  {operations.map((i) => (
                    <Word key={i.path} item={i} pathname={pathname} onClick={() => setMoreOpen(false)} className="text-[14px]" />
                  ))}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={logout}
              className="mt-6 text-[13px] text-george-muted hover:text-george-navy"
            >
              Sign out · {user?.display_name || user?.username}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
