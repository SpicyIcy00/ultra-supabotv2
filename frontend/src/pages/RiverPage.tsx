/**
 * /george — the river. George's home, and the only surface.
 *
 * NO SESSIONS, NO "NEW CHAT", NO BLANK PAGE. You arrive into a timeline that
 * is already running. There is nothing to start, so there is no button to
 * start it and no empty state pretending to be one — the nearest thing is a
 * database with no posts at all, which says so plainly.
 *
 * MOBILE IS THE REAL LAYOUT (UI rule 7). The centre column is the whole screen
 * on a phone; the side panel is an overlay there and a column with room either
 * side on desktop. Not two layouts — one column, with the furniture arriving
 * when there is room for it.
 *
 * THREE INDEPENDENT UNKNOWNS, THREE RENDERINGS (UI rule 8). The river, the
 * status band and the needs-you count each load separately and each says so
 * while it does not know. None of them may borrow another's calm default.
 *
 * WHAT THIS REPLACES, and what it keeps: the greeting became the morning post
 * (river_writer.post_brief), the cognition line became the working indicator
 * under the mark, and george_recall is untouched. What is discarded is
 * chats-as-sessions, the left rail's chat list, and the empty state.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PanelRight } from 'lucide-react';
import { useGeorgeStream } from '../hooks/useGeorgeStream';
import { GeorgeConversation } from '../components/george/GeorgeConversation';
import { GeorgeInput } from '../components/george/GeorgeInput';
import { RiverFeed } from '../components/george/RiverFeed';
import { StatusBand } from '../components/george/StatusBand';
import { SidePanel } from '../components/george/SidePanel';
import { approvalsView } from '../components/george/approvalState';
import type { StatusQuery } from '../components/george/statusState';
import { listApprovals } from '../services/workflowsApi';
import { readRiver, sharePost } from '../services/riverApi';
import { readStatus } from '../services/statusApi';

export default function RiverPage() {
  const { turns, state, ask, cancel, busy } = useGeorgeStream();
  const qc = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const navigate = useNavigate();

  /**
   * The river. Refetched on focus because it is a shared timeline: George
   * posts into it while nobody is looking, and other people post into it too.
   * That is the opposite of the greeting's staleTime: Infinity, and for the
   * opposite reason.
   */
  const river = useQuery({
    queryKey: ['river', before],
    queryFn: () => readRiver(before),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

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

  const approvalsState = useMemo(
    () =>
      approvalsView(
        approvals.isPending
          ? { status: 'pending' }
          : approvals.isError
            ? { status: 'error' }
            : { status: 'success', approvals: approvals.data ?? [] },
      ),
    [approvals.isPending, approvals.isError, approvals.data],
  );

  /** Tools in flight and the newest result, for the mark's narration line. */
  const running = useMemo(() => {
    const last = turns[turns.length - 1];
    if (last?.role !== 'george') return [];
    return last.toolCalls.filter((c) => !c.result).map((c) => c.tool);
  }, [turns]);

  const lastResult = useMemo(() => {
    const last = turns[turns.length - 1];
    if (last?.role !== 'george') return null;
    const done = last.toolCalls.filter((c) => c.result);
    if (done.length === 0) return null;
    const newest = done.reduce((a, b) => (b.seq > a.seq ? b : a));
    return {
      tool: newest.tool,
      rowCount: newest.result?.row_count ?? null,
      error: newest.result?.error ?? null,
    };
  }, [turns]);

  const thinking = useMemo(() => {
    const last = turns[turns.length - 1];
    return last?.role === 'george' ? last.thinking : '';
  }, [turns]);

  /**
   * Ask, then refresh the river — the turn wrote two posts, and the timeline
   * is where they live. The optimistic copy on screen is the live turn; the
   * refetch reconciles it with what was stored.
   */
  const onAsk = useCallback(
    async (question: string) => {
      await ask(question);
      qc.invalidateQueries({ queryKey: ['river'] });
      qc.invalidateQueries({ queryKey: ['george-status'] });
    },
    [ask, qc],
  );

  /**
   * Share, then refetch.
   *
   * The server returns the thread it changed, but the river is a page of many
   * threads — refetching is simpler than splicing that thread back in, and it
   * cannot leave the two disagreeing about what is now public.
   */
  const onShare = useCallback(
    async (postId: string) => {
      setSharingId(postId);
      try {
        await sharePost(postId);
        await qc.invalidateQueries({ queryKey: ['river'] });
      } finally {
        setSharingId(null);
      }
    },
    [qc],
  );

  return (
    // THE HEIGHT SUBTRACTS THE PHONE TAB BAR, and must. Layout reserves room
    // for it with `pb-20 md:pb-6` on <main>, but this page cancels <main>'s
    // padding with negative margins to go full-bleed and then forces its own
    // height — so it ignored that reservation and ran 54px under the fixed
    // nav, putting 33px of the textarea out of reach. Measured, not guessed.
    //
    // 4rem is the nav's h-16; env(safe-area-inset-bottom) is the home-bar gap
    // the nav also pads by, which is 0 on a desktop browser and ~34px on a
    // notched phone. The md: breakpoint matches Layout's own isPhone (<768),
    // where the nav does not render at all.
    <div className="-m-3 sm:-m-4 lg:-m-6 flex h-[calc(100dvh-3.5rem-4rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-3.5rem)] bg-george-cream font-sans text-george-navy">
      <main className="flex min-w-0 flex-1 flex-col">
        <StatusBand
          query={statusQuery}
          needsYou={approvalsState.count}
          onOpenApprovals={() => setPanelOpen(true)}
        />

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-6">
          <div className="mx-auto max-w-3xl">
            <RiverFeed
              posts={river.data?.posts ?? []}
              loading={river.isPending}
              error={river.isError ? 'The timeline could not be read.' : null}
              hasOlder={Boolean(river.data?.before)}
              onLoadOlder={() => setBefore(river.data?.before ?? null)}
              loadingOlder={river.isFetching}
              onAsk={onAsk}
              onOpenThread={(id) => navigate(`/george/t/${id}`)}
              onShare={onShare}
              sharingId={sharingId}
            />

            {/* The live turn, rendered as a PENDING POST in the same column
                and the same shape as a stored one — it is happening now and is
                not yet something anyone else can see, but it is the same kind
                of thing. Its avatar is the one animated mark on the page. */}
            {turns.length > 0 && (
              <div className="mt-5 space-y-5">
                <GeorgeConversation
                  turns={turns}
                  busy={busy}
                  showEmptyState={false}
                  state={state}
                  running={running}
                  lastResult={lastResult}
                  thinking={thinking}
                />
              </div>
            )}
          </div>
        </div>

        <GeorgeInput onAsk={onAsk} onCancel={cancel} busy={busy} />
      </main>

      {/* Desktop: a column with room either side. Phone: an overlay, reached
          for rather than always present. */}
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        aria-label="Open pages and workflows"
        className="hidden lg:flex w-11 shrink-0 flex-col items-center border-l border-george-line bg-george-cream pt-3 text-george-slate"
      >
        <PanelRight className="h-4 w-4" />
      </button>

      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        approvals={approvalsState}
      />
    </div>
  );
}
