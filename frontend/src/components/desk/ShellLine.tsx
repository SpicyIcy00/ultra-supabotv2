/**
 * The one permanent line: where you are, and what needs you.
 *
 * WHAT IS PERMANENTLY VISIBLE, and nothing else is: George's mark, the
 * business and the narrowest subject in focus, the needs-you count, and the
 * three quiet rails. That is the answer to "where am I" and "what needs me"
 * without a navigation bar, because the desk has no destinations to navigate
 * between.
 *
 * THE ACCENT LIVES HERE AND IN TWO OTHER PLACES. The needs-you count wears it
 * only for a LOADED, non-zero result (UI rules 5 and 8); while the queue is
 * unknown the count is simply absent, because absence is not a claim, and a
 * zero says so in words. Nothing else on the desk may use the colour.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useGeorge } from '../../hooks/useGeorge';
import { approvalsView, attentionAccent, attentionLabel } from '../george/approvalState';
import { markDetail } from '../george/markState';
import { PresenceMark } from '../george/PresenceMark';
import { listApprovals } from '../../services/workflowsApi';
import { listPins } from '../../services/pinsApi';
import { listWorkflows } from '../../services/workflowsApi';

/** A rail: a count that came back, or nothing. Never a literal. */
function Rail({ to, label, count }: { to: string; label: string; count: number | null }) {
  return (
    <Link to={to} className="min-h-touch text-[12px] text-george-slate hover:text-george-navy" data-rail={label}>
      {label}
      {count !== null && count > 0 && <span className="ml-1.5 tabular-nums text-george-navy">{count}</span>}
    </Link>
  );
}

export function ShellLine({ scope, onHistory }: { scope: string[]; onHistory: () => void }) {
  const { presence, live } = useGeorge();

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

  const detail = presence === 'idle' ? '' : markDetail(presence, live.running, live.lastResult);

  return (
    <header className="flex items-center gap-4 px-5 pb-3 pt-4 md:px-8" data-shell-line>
      <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="George">
        <PresenceMark
          state={presence}
          running={live.running}
          lastResult={live.lastResult}
          toolResults={live.toolResults}
          className="h-7 w-7"
        />
        <span className="font-george-serif text-[15px] leading-none tracking-wide text-george-navy">George</span>
      </Link>

      {/* Where you are: the business, then the narrowest subject in focus. */}
      <nav aria-label="Scope" className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
        <span className="text-george-navy">AJI</span>
        {scope.map((name) => (
          <span key={name} className="flex items-baseline gap-1.5 truncate">
            <span className="text-george-muted" aria-hidden>·</span>
            <span className="truncate text-george-navy">{name}</span>
          </span>
        ))}
      </nav>

      {/* What George is doing, in his own words. Empty at rest — a caption on
          a mark that visibly breathes says nothing. */}
      <p className="hidden min-w-0 flex-1 truncate text-[12px] text-george-slate lg:block">{detail}</p>
      <span className="flex-1 lg:hidden" />

      <div className="flex shrink-0 items-baseline gap-5">
        <Link
          to="/inbox"
          aria-label={attentionLabel(needsYou)}
          className={`min-h-touch text-[12px] ${attentionAccent(needsYou) ? 'text-george-accent' : 'text-george-slate hover:text-george-navy'}`}
          data-rail="needs-you"
        >
          {needsYou === null ? 'Checking…' : needsYou === 0 ? 'Nothing needs you' : `Needs you ${needsYou}`}
        </Link>
        <Rail to="/workflows" label="Running" count={workflows.data?.length ?? null} />
        <Rail to="/pages" label="Kept" count={pins.data?.length ?? null} />
        <button
          type="button"
          onClick={onHistory}
          className="min-h-touch text-[12px] text-george-slate hover:text-george-navy"
          data-rail="history"
        >
          History
        </button>
      </div>
    </header>
  );
}
