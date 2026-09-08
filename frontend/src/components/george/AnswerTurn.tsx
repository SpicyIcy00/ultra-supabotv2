/**
 * The live turns, rendered as PENDING POSTS.
 *
 * Same shape as a stored post — avatar column, then content — so a turn does
 * not visibly change form as it lands in the river. This is the river's
 * newest entry, still being written; it is not a separate surface.
 *
 * ONE PRESENCE. The mark animates in the shell — that is George's identity,
 * wherever the person is — so here the avatar is the same drawing at rest,
 * identical to the one a stored post carries. What THIS turn is doing is
 * narrated in words beside it, from the frames, while it runs.
 *
 * ORDER WITHIN A TURN matches the loop's own priority and turnShape's levels:
 *
 *   narration -> ACTIVITY (open while running) -> NOTICES -> answer ->
 *   figures -> stopped/error -> confirmations -> page context -> receipts
 *   -> actions
 *
 * PAGE CONTEXT is evidence, like the receipts: what George considered of the
 * page he was asked from, one line always visible, the pins behind it. It is
 * drawn from the `page_context` frame and never from the prose.
 *
 * Notices sit ABOVE the answer, not after it and not inside a disclosure
 * (UI rule 4). A caveat that qualifies a number has to be read before the
 * number, not found afterwards.
 */
import { useMemo } from 'react';
import { Pin as PinIcon, Save as SaveIcon } from 'lucide-react';
import type { GeorgeTurn, PinnedFrame, SavedFrame } from '../../types/george';
import { useGeorge } from '../../hooks/useGeorge';
import { liveCognition } from './cognition';
import { markDetail, MARK_PATH } from './markState';
import { ActivityDisclosure } from './ActivityDisclosure';
import { Prose } from './Prose';
import { NoticeBanner } from './NoticeBanner';
import { PageChangeNote } from './PageChangeNote';
import { PageContextBlock } from './PageContextBlock';
import { ReceiptsBlock } from './ReceiptsBlock';
import { ResultSurface } from './ResultSurface';
import { ResultActions } from './ResultActions';
import { blocksFromCalls } from './resultShape';
import { emphasisOf, pinnableCalls } from './turnShape';

type Answer = Extract<GeorgeTurn, { role: 'george' }>;

interface Props {
  turns: GeorgeTurn[];
  /** Whether earlier turns go quieter so the newest answer leads. */
  focusLatest?: boolean;
}

export function AnswerTurns({ turns, focusLatest = false }: Props) {
  const { busy, presence, live } = useGeorge();

  if (turns.length === 0) return null;

  return (
    <div className="space-y-6">
      {turns.map((turn, i) =>
        turn.role === 'user' ? (
          <div key={i} className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-george-navy px-3.5 py-2.5 text-[15px] leading-relaxed text-george-cream">
              {turn.text}
            </p>
          </div>
        ) : (
          <AnswerTurn
            key={i}
            turn={turn}
            question={turns[i - 1]?.role === 'user' ? (turns[i - 1] as { text: string }).text : undefined}
            live={busy && i === turns.length - 1}
            narration={
              busy && i === turns.length - 1
                ? {
                    detail: markDetail(presence, live.running, live.lastResult),
                    cognition: liveCognition(presence, live.thinking),
                  }
                : null
            }
            quiet={focusLatest && emphasisOf(i, turns) === 'earlier'}
          />
        ),
      )}
    </div>
  );
}

function AnswerTurn({
  turn,
  question,
  live,
  narration,
  quiet,
}: {
  turn: Answer;
  question?: string;
  live: boolean;
  narration: { detail: string; cognition: string } | null;
  quiet: boolean;
}) {
  // One selection path, shared with the stored post and the pinned tile.
  const blocks = useMemo(() => blocksFromCalls(turn.toolCalls), [turn.toolCalls]);

  return (
    <article className="flex gap-2.5">
      <div className="w-7 shrink-0">
        <RestingMark />
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        {narration && <Narration {...narration} />}

        <ActivityDisclosure turn={turn} live={live} />

        {/* Above the answer, always — and never quieter. */}
        <NoticeBanner notices={turn.notices} />

        {/* The finding, then the working. See Prose. */}
        {turn.text && <Prose text={turn.text} lede quiet={quiet} />}

        {/* An answer George is replacing, still on screen because a blank
            screen is worse than a stale paragraph that says it is stale.
            Cleared the moment the first delta of the rewrite lands, and again
            on `done` — so this can never be what the reader is left with, and
            can never disagree with what the river stored. */}
        {!turn.text && turn.superseded && <SupersededAnswer text={turn.superseded} />}

        <ResultSurface blocks={blocks} />

        {turn.error && (
          <p className="rounded-lg border border-george-line bg-george-paper px-3 py-2.5 text-[13px] text-george-navy">
            {turn.error}
          </p>
        )}

        {turn.cancelled && <StoppedNote turn={turn} />}

        {turn.pinned.map((p) => (
          <PinnedNote key={p.pin_id} pin={p} />
        ))}
        {turn.saved.map((s) => (
          <SavedNote key={`${s.workflow_id}-${s.version}`} saved={s} />
        ))}
        {/* A page created or changed, from the committed result. */}
        {turn.pageChanges.map((c, i) => (
          <PageChangeNote key={`${c.page_id}-${i}`} change={c} />
        ))}

        {/* What George considered of the page, when he read one. */}
        <PageContextBlock context={turn.pageContext} />

        {/* The turn-level receipts are the LAST tool's meta, and they are the
            fallback only. When the surface drew anything, every block already
            carries the meta of the call behind it — which is strictly better,
            because one line over several calls describes none of them. */}
        {blocks.length === 0 && <ReceiptsBlock meta={turn.receipts} />}

        {/* Only the calls the loop marked pinnable: a page read or a workflow
            run is a call George made, and neither is a tile. */}
        {turn.done && (
          <ResultActions
            calls={pinnableCalls(turn.toolCalls)}
            question={question}
            conversationId={turn.done.conversation_id}
          />
        )}
      </div>
    </article>
  );
}

/**
 * The answer being replaced, while it is being replaced.
 *
 * WHY IT IS STILL HERE. The loop asks the model to write the answer again from
 * seven places (agent/loop.py `_reset_answer`) — a caveat that went unsurfaced,
 * a pin or save or page claimed but never made, the volunteering cap, the
 * convergence cap. Every one of those is right to fire. What was wrong was
 * what the client did with it: `text` was emptied on arrival, so a finished
 * paragraph somebody was reading vanished and the screen sat blank until the
 * rewrite streamed. Keeping it visible costs nothing and loses nothing.
 *
 * IT IS MARKED, NOT QUIETLY LEFT. Slate rather than navy, and a line above it
 * saying what is happening — because this text is about to stop being true, and
 * an unmarked paragraph is a claim. It is not a notice and wears no notice
 * chrome: nothing is being caveated and nobody is being asked for anything.
 */
function SupersededAnswer({ text }: { text: string }) {
  return (
    <div aria-live="off">
      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-george-muted">
        Rewriting this answer
      </p>
      <p className="font-george-serif text-[15px] leading-relaxed text-george-slate opacity-70 whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
}

/** The avatar at rest: the same drawing a stored post carries. */
function RestingMark() {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-george-navy"
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="h-4 w-4 text-george-cream">
        <path d={MARK_PATH} fill="currentColor" fillRule="evenodd" />
      </svg>
    </span>
  );
}

/**
 * What George is doing and what he is thinking, while he does it.
 *
 * Two lines that say different things — the first is derived from the TOOL
 * and is true by construction, the second is the model's own summarized
 * reasoning and is never evidence. Both slots are fixed height so the post
 * does not resize under the reader as a turn progresses.
 */
function Narration({ detail, cognition }: { detail: string; cognition: string }) {
  return (
    <div>
      <p className="h-[18px] truncate text-[13px] leading-[18px] text-george-slate" aria-live="polite">
        {detail}
      </p>
      <p
        className="h-[16px] truncate font-george-serif text-[12px] italic leading-4 text-george-muted"
        aria-hidden
      >
        {cognition}
      </p>
    </div>
  );
}

/**
 * A pin George made because he was asked to, in conversation.
 *
 * The answer says the same thing in prose; this says it from the `pinned`
 * frame, so the confirmation is the write itself rather than the model's
 * account of it. Nothing here may use the approvals colour (UI rule 5).
 */
function PinnedNote({ pin }: { pin: PinnedFrame }) {
  const n = pin.tool_calls.length;
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Pinned <span className="text-george-navy">“{pin.title}”</span>{' '}
        {pin.page ? (
          <>
            to <span className="text-george-navy">{pin.page}</span>
          </>
        ) : (
          'with no page'
        )}
        . The tile re-runs {n === 1 ? 'its call' : `its ${n} calls`} each time it loads.
      </span>
    </p>
  );
}

/**
 * A workflow George saved because he was asked to. Confirmed from the
 * `saved` frame, not the prose. A saved version is NOT a scheduled one: it
 * waits in the approval queue, which is where "needs you" lives, so nothing
 * here wears the approvals colour.
 */
function SavedNote({ saved }: { saved: SavedFrame }) {
  const n = saved.steps.length;
  return (
    <p className="flex items-start gap-1.5 rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <SaveIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Saved <span className="text-george-navy">“{saved.name}”</span> as version{' '}
        <span className="tabular-nums text-george-navy">{saved.version}</span>
        {n > 0 && ` with ${n === 1 ? 'one step' : `${n} steps`}`}.{' '}
        {saved.awaiting_promotion
          ? 'It runs when asked; it will not run unattended until an administrator promotes it.'
          : 'It is promoted.'}
      </span>
    </p>
  );
}

/**
 * The person stopped this turn.
 *
 * WHAT IS KNOWN, AND ONLY THAT. The request was aborted before `done`, so the
 * text above is where George got to and not what he concluded. Whether the
 * server carried on and stored the turn is not known here — no `post` frame
 * arrived — so the note says the answer MAY appear in the thread, and never
 * that it was or was not saved. Quiet chrome: stopping needs nobody.
 */
function StoppedNote({ turn }: { turn: Answer }) {
  const said = turn.text.trim().length > 0 || turn.toolCalls.length > 0;
  return (
    <p className="rounded-lg border border-george-line bg-george-paper px-3 py-2 text-[12px] leading-relaxed text-george-slate">
      <span className="text-george-navy">Stopped</span>
      {said ? ' before George finished — this is where he got to, not an answer.' : '.'}{' '}
      If he completed it anyway, the answer will appear in the thread.
    </p>
  );
}
