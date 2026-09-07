/**
 * /today — the river. Everything George did and said, and everything anyone
 * said to him, as one timeline that is already running when you arrive.
 *
 * NO SESSIONS, NO "NEW CHAT", NO BLANK PAGE. There is nothing to start, so
 * there is no button to start it and no empty state pretending to be one —
 * the nearest thing is a database with no posts at all, which says so
 * plainly (RiverFeed).
 *
 * NOT A MANUFACTURED EXECUTIVE PAGE. Today is the timeline because the
 * timeline is what George actually has: the brief, the runs, the approvals,
 * the answers. When his proactive intelligence can say what deserves
 * attention, this page will change; until then it shows the record and
 * nothing it invented.
 *
 * THREE INDEPENDENT UNKNOWNS, THREE RENDERINGS (UI rule 8). The river, the
 * status band and the needs-you count each load separately and each says so
 * while it does not know. None of them may borrow another's calm default.
 *
 * ASKING FROM HERE OPENS THE WORKSPACE. The composer starts a new thread and
 * goes to Ask, where the answer takes the screen; the same turn is also the
 * river's newest entry, drawn here as a pending post until the stored copy
 * arrives (riverMerge). One George, one turn, two places to watch it.
 */
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useGeorge } from '../hooks/useGeorge';
import { useRiver } from '../hooks/useRiver';
import { AnswerTurns } from '../components/george/AnswerTurn';
import { AskComposer } from '../components/george/AskComposer';
import { RiverFeed } from '../components/george/RiverFeed';
import { StatusBand } from '../components/george/StatusBand';
import { approvalsView } from '../components/george/approvalState';
import { riverMerge } from '../components/george/riverMerge';
import type { StatusQuery } from '../components/george/statusState';
import { SHELL_COLUMN, SHELL_PAGE_HEIGHT } from '../components/shell/shellLayout';
import { useShare } from '../hooks/useShare';
import { listApprovals } from '../services/workflowsApi';
import { readStatus } from '../services/statusApi';

export default function TodayPage() {
  const { turns, ask, reset, cancel, busy } = useGeorge();
  const navigate = useNavigate();
  const river = useRiver();
  const share = useShare();

  const merged = useMemo(() => riverMerge(river.posts, turns), [river.posts, turns]);

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

  /** A new thread, and the workspace to watch it in. */
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
      <StatusBand
        query={statusQuery}
        needsYou={needsYou}
        onOpenApprovals={() => navigate('/inbox')}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 md:px-8">
        <div className={SHELL_COLUMN}>
          <RiverFeed
            posts={merged.posts}
            loading={river.loading}
            error={river.error ? 'The timeline could not be read.' : null}
            hasOlder={river.hasOlder}
            onLoadOlder={river.loadOlder}
            loadingOlder={river.loadingOlder}
            onAsk={onAsk}
            onOpenThread={(id) => navigate(`/ask/${id}`)}
            onShare={share.share}
            sharingId={share.sharingId}
          />

          {/* The live turn as a PENDING POST, same column, same shape. */}
          {merged.pending.length > 0 && (
            <div className="mt-5">
              <AnswerTurns turns={merged.pending} />
            </div>
          )}
        </div>
      </div>

      <AskComposer onAsk={onAsk} onCancel={cancel} busy={busy} placeholder="Tell George…" />
    </div>
  );
}
