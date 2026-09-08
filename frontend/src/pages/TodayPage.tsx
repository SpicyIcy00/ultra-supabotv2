/**
 * /today — where George comes to you.
 *
 * TODAY: GEORGE → USER. What he initiated: the morning brief, a notice, a
 * workflow run, an approval — the attention stream of the river
 * (routes/george.py RIVER_STREAMS). Not the questions you asked him; those are
 * your work, and their home is Ask.
 *
 * WHAT THIS PAGE IS NOT (2026-09-09). Until now it rendered the whole river,
 * questions and answers included, with a general composer at the bottom — a
 * second Ask, and the one that held the persisted history, which made Ask
 * feel like a temporary chat and this like the real home. That was backwards.
 * Today renders only what George put here, and nothing it invented.
 *
 * NOT A MANUFACTURED EXECUTIVE PAGE. When George's proactive intelligence can
 * say what deserves attention, this page will change; until then it shows
 * the record and, when the record is empty, says so plainly. No fabricated
 * alert, finding, recommendation or score — every one of those would be a
 * claim about the world the app never checked (UI rule 8).
 *
 * TALKING TO GEORGE FROM HERE. A brief's follow-up chip asks George in the
 * ordinary way and takes you to Ask, where the work lands and persists — work
 * you start belongs to Ask wherever you started it. There is no general
 * composer here: one canonical river of user-directed work, not two.
 *
 * THREE INDEPENDENT UNKNOWNS, THREE RENDERINGS (UI rule 8). The stream, the
 * status band and the needs-you count each load separately and each says so
 * while it does not know.
 */
import { useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useGeorge } from '../hooks/useGeorge';
import { useRiver } from '../hooks/useRiver';
import { RiverFeed } from '../components/george/RiverFeed';
import { StatusBand } from '../components/george/StatusBand';
import { approvalsView } from '../components/george/approvalState';
import type { StatusQuery } from '../components/george/statusState';
import { SHELL_COLUMN, SHELL_PAGE_HEIGHT } from '../components/shell/shellLayout';
import { useShare } from '../hooks/useShare';
import { listApprovals } from '../services/workflowsApi';
import { readStatus } from '../services/statusApi';

/** The truthful early state: nothing George initiated is on record yet. */
function NothingToSurface() {
  return (
    <div className="py-16 text-center">
      <p className="font-george-serif text-[22px] leading-snug text-george-navy">Good morning.</p>
      <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-george-slate">
        George will surface things that need your attention here — the morning brief, anything he
        notices, a run that fired, an approval waiting.
      </p>
      <Link
        to="/ask"
        className="mt-6 inline-block min-h-touch rounded-full border border-george-line bg-george-paper px-4 py-2 text-[13px] text-george-navy hover:border-george-slate"
      >
        Ask George
      </Link>
    </div>
  );
}

export default function TodayPage() {
  const { ask, reset } = useGeorge();
  const navigate = useNavigate();
  const river = useRiver('attention');
  const share = useShare();

  const status = useQuery({
    queryKey: ['george-status'],
    queryFn: () => readStatus(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const approvals = useQuery({
    queryKey: ['workflow-approvals'],
    queryFn: () => listApprovals(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const statusQuery: StatusQuery = useMemo(
    () =>
      status.isPending
        ? { status: 'pending' }
        : status.isError
          ? { status: 'error' }
          : { status: 'success', data: status.data! },
    [status.isPending, status.isError, status.data],
  );

  const needsYou = approvalsView(
    approvals.isPending
      ? { status: 'pending' }
      : approvals.isError
        ? { status: 'error' }
        : { status: 'success', approvals: approvals.data ?? [] },
  ).count;

  /**
   * A follow-up George offered on a brief. The work it starts is YOURS and
   * lands in Ask: a new thread, watched there, persisted there.
   */
  const onAsk = useCallback(
    (question: string) => {
      reset();
      void ask(question);
      navigate('/ask');
    },
    [ask, reset, navigate],
  );

  return (
    <div className={`${SHELL_PAGE_HEIGHT} flex flex-col`}>
      <StatusBand query={statusQuery} needsYou={needsYou} onOpenApprovals={() => navigate('/inbox')} />

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 md:px-8">
        <div className={SHELL_COLUMN}>
          <RiverFeed
            posts={river.posts}
            loading={river.loading}
            error={river.error ? 'The timeline could not be read.' : null}
            hasOlder={river.hasOlder}
            onLoadOlder={river.loadOlder}
            loadingOlder={river.loadingOlder}
            onAsk={onAsk}
            onOpenThread={(id) => navigate(`/ask/${id}`)}
            onShare={share.share}
            sharingId={share.sharingId}
            empty={<NothingToSurface />}
            showBeginning={false}
          />
          {river.posts.length > 0 && (
            <p className="mt-8 text-center text-[12px] text-george-muted">
              Your own work is in{' '}
              <Link to="/ask" className="text-george-slate underline hover:text-george-navy">Ask</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
