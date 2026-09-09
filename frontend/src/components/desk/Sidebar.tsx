/**
 * The sidebar: navigation, and nothing that belongs in the work.
 *
 * WHAT WENT WRONG BEFORE. This column held George's reading — several
 * paragraphs of prose, beside the figures it was about but not with them, in
 * the one place a reader's eye does not go. Two failures at once: the
 * explanation was detached from the evidence, and the persistent navigation a
 * workspace needs had nowhere to live.
 *
 * SO IT IS NAVIGATION, AND IT IS QUIET. George, then the states of his
 * environment — what needs you, what is running, what is kept, what happened.
 * These are not five pages: each is an access point into a state of the same
 * environment, and the workspace stays the product. The business sits at the
 * top because "which business am I in" is the one thing that must never be a
 * question.
 *
 * NOTHING ELSE GOES HERE. No reading, no summary, no receipts, no answer
 * prose. A test holds that, because this column is where all four would drift
 * back to.
 */
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useGeorge } from '../../hooks/useGeorge';
import { useAuthStore } from '../../stores/authStore';
import { approvalsView, attentionAccent } from '../george/approvalState';
import { PresenceMark } from '../george/PresenceMark';
import { operationsFor } from '../shell/shellNav';
import { listApprovals, listWorkflows } from '../../services/workflowsApi';
import { listPins } from '../../services/pinsApi';

export interface SidebarProps {
  business: string;
  /** Open the history drawer — a state of this environment, not a page. */
  onHistory: () => void;
  /** True while the history drawer is open, so the entry can say so. */
  historyOpen: boolean;
}

/** One entry: a word, and a count only when one came back (UI rule 8). */
function Entry({
  to, label, count, accent = false, onClick, active,
}: {
  to?: string;
  label: string;
  count?: number | null;
  accent?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <span>{label}</span>
      {count !== null && count !== undefined && count > 0 && (
        <span className={`text-[12px] tabular-nums ${accent ? 'text-george-accent' : 'text-george-muted'}`}>
          {count}
        </span>
      )}
    </>
  );
  const className = (here: boolean) =>
    `flex min-h-touch items-baseline justify-between gap-3 text-[14px] leading-none transition-colors ${
      here ? 'text-george-navy' : 'text-george-slate hover:text-george-navy'
    }`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} data-nav={label} className={`${className(Boolean(active))} w-full text-left`}>
        {body}
      </button>
    );
  }
  return (
    <NavLink to={to!} data-nav={label} end={to === '/'} className={({ isActive }) => className(isActive)}>
      {body}
    </NavLink>
  );
}

export function Sidebar({ business, onHistory, historyOpen }: SidebarProps) {
  const { presence, live } = useGeorge();
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const operations = operationsFor(user?.allowed_pages ?? []);

  const approvals = useQuery({
    queryKey: ['workflow-approvals'], queryFn: () => listApprovals(),
    staleTime: 30_000, refetchOnWindowFocus: true, retry: 1,
  });
  const needsYou = approvalsView(
    approvals.isPending ? { status: 'pending' }
      : approvals.isError ? { status: 'error' }
        : { status: 'success', approvals: approvals.data ?? [] },
  ).count;
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: listWorkflows, staleTime: 60_000, retry: 1 });
  const pins = useQuery({ queryKey: ['pins'], queryFn: () => listPins(), staleTime: 60_000, retry: 1 });

  return (
    <nav
      aria-label="George"
      data-sidebar
      className="flex h-full flex-col gap-8 overflow-y-auto px-5 pb-6 pt-4"
    >
      {/* George, and which business. Both permanent. */}
      <div>
        <NavLink to="/" className="flex items-center gap-2.5" aria-label="George">
          <PresenceMark
            state={presence}
            running={live.running}
            lastResult={live.lastResult}
            toolResults={live.toolResults}
            className="h-7 w-7"
          />
          <span className="font-george-serif text-[15px] leading-none tracking-wide text-george-navy">George</span>
        </NavLink>
        <p className="desk-label mt-3" data-business>{business}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <Entry to="/" label="Home" />
        <Entry to="/inbox" label="Needs you" count={needsYou} accent={attentionAccent(needsYou)} />
        <Entry to="/workflows" label="Running" count={workflows.data?.length ?? null} />
        <Entry to="/pages" label="Kept" count={pins.data?.length ?? null} />
        <Entry label="History" onClick={onHistory} active={historyOpen} />
      </div>

      {operations.length > 0 && (
        <div className="mt-auto">
          {/* The existing application: reachable, secondary, not going anywhere. */}
          <p className="desk-label mb-2">Operations</p>
          <div className="flex flex-col gap-1.5">
            {operations.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                data-nav={item.label}
                className={`min-h-touch text-[13px] ${
                  item.matches(pathname) ? 'text-george-slate' : 'text-george-muted hover:text-george-slate'
                }`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <div className={operations.length > 0 ? '' : 'mt-auto'}>
        <p className="truncate text-[12px] text-george-slate">{user?.display_name || user?.username}</p>
        <button type="button" onClick={logout} className="mt-0.5 min-h-touch text-[12px] text-george-muted hover:text-george-navy">
          Sign out
        </button>
      </div>
    </nav>
  );
}
