/**
 * The in-flight turn, rendered as a PENDING POST in the river.
 *
 * Same shape as a stored post — avatar column, then content — so a turn does
 * not visibly change form as it lands. What it is not is a separate surface:
 * this is the river's newest entry, still being written.
 *
 * ONE PRESENCE. The mark animates HERE, as this turn's avatar, and nowhere
 * else. Until 2026-09-05 a second, larger mark sat above the thread doing the
 * same job, so during a turn George appeared twice on one screen — once as the
 * author of what was being written and once as a floating presence beside it.
 * A colleague is in one place at a time.
 *
 * ORDER WITHIN A TURN is deliberate and matches the loop's own priority:
 *   narration -> thinking (collapsed) -> tool calls -> NOTICES -> answer -> receipts
 *
 * Notices sit ABOVE the answer, not after it and not inside the receipts
 * disclosure (UI rule 4). A caveat that qualifies a number has to be read
 * before the number, not found afterwards.
 *
 * THINKING IS SHOWN IN ONE PLACE AT A TIME. While a turn is in flight the
 * reasoning streams as the second narration line, so the collapsed disclosure
 * here would be the same text twice on one screen — which reads as a bug. It
 * appears once the turn is finished, because the whole reasoning has to stay
 * reachable after the live line has gone.
 */
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronRight, Pin as PinIcon } from 'lucide-react';
import type { GeorgeState, GeorgeTurn, PinnedFrame, ToolCall } from '../../types/george';
import { liveCognition, type LastResult } from './cognition';
import { markClass, markDetail, markPath } from './markState';
import { GeorgeChart } from './GeorgeChart';
import { NoticeBanner } from './NoticeBanner';
import { ReceiptsBlock } from './ReceiptsBlock';
import { ToolCallRow } from './ToolCallRow';
import { PinButton } from './PinButton';
import { inferShape, resultFromToolCall } from './pinShape';

interface Props {
  turns: GeorgeTurn[];
  /** Loop state, for the ONE animated mark. */
  state?: GeorgeState;
  /** Tools in flight, for the narration line. */
  running?: string[];
  /** The newest completed call, for the narration line. */
  lastResult?: LastResult | null;
  /** The reasoning arriving now, under the narration. */
  thinking?: string;
  /**
   * True while the last turn is still streaming. Its thinking is on screen
   * under the mark, so it is not also offered here.
   */
  busy?: boolean;
  /**
   * False once George has opened the chat himself. He is the first thing in
   * the thread then, so the thread is not empty and the "Ask about the
   * business" placeholder would be a second, contradictory opening.
   */
  showEmptyState?: boolean;
}

export function GeorgeConversation({
  turns,
  busy = false,
  showEmptyState = true,
  state = 'idle',
  running = [],
  lastResult = null,
  thinking = '',
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  if (turns.length === 0) return showEmptyState ? <EmptyState /> : null;

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
          <article key={i} className="flex gap-2.5">
            {/* THE ONE PLACE THE MARK ANIMATES. It is this turn's avatar and
                also its working indicator; there is no second mark anywhere
                on the page. */}
            <div className="w-7 shrink-0">
              <TurnMark live={busy && i === turns.length - 1} state={state} />
            </div>

            <div className="min-w-0 flex-1 space-y-3">
            {busy && i === turns.length - 1 && (
              <Narration
                state={state}
                running={running}
                lastResult={lastResult}
                thinking={thinking}
              />
            )}

            {turn.thinking && !(busy && i === turns.length - 1) && (
              <Thinking text={turn.thinking} />
            )}

            {turn.toolCalls.length > 0 && (
              <div className="space-y-1.5">
                {turn.toolCalls.map((c) => (
                  <ToolCallRow key={c.seq} call={c} />
                ))}
              </div>
            )}

            {/* Above the answer, always. */}
            <NoticeBanner notices={turn.notices} />

            {turn.text && (
              <div className="george-prose text-[15px] leading-relaxed text-george-navy">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
              </div>
            )}

            {/* Figures the answer describes, drawn through the SAME component
                a tile draws them with. Below the prose because the answer
                leads with the number; above the pin note because a pin is
                about the answer, not part of it. */}
            <ChartedResults calls={turn.toolCalls} />

            {turn.error && (
              <p className="rounded-lg border border-george-line bg-george-paper px-3 py-2.5 text-[13px] text-george-navy">
                {turn.error}
              </p>
            )}

            {turn.pinned.map((p) => (
              <PinnedNote key={p.pin_id} pin={p} />
            ))}

            {/* The turn-level receipts are the LAST tool's meta — a lossy
                stand-in for per-call receipts. When charts are present they
                carry their own, which is strictly better, so this would only
                repeat one of them under a different heading. */}
            {!hasCharts(turn.toolCalls) && <ReceiptsBlock meta={turn.receipts} />}

            {turn.done && (
              <div className="flex items-center gap-1">
                <p className="flex-1 text-[11px] text-george-muted">
                  {turn.done.tool_calls} tool {turn.done.tool_calls === 1 ? 'call' : 'calls'} ·{' '}
                  {turn.done.iterations} iterations
                  {turn.done.cache_hit && ' · cache hit'}
                </p>
                {/* The answer action row. Pin sits alone for now — there is no
                    Save control anywhere in this app yet, and save means a
                    versioned rule (CLAUDE.md), which the backend cannot do. The
                    row is shaped to take one when it can. */}
                <PinButton
                  turn={turn}
                  question={
                    turns[i - 1]?.role === 'user'
                      ? (turns[i - 1] as { text: string }).text
                      : undefined
                  }
                />
              </div>
            )}
            </div>
          </article>
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}

function chartsIn(calls: ToolCall[]) {
  return calls.flatMap((call) => {
    const result = resultFromToolCall(call);
    if (!result) return [];
    const shape = inferShape(result);
    return shape?.kind === 'chart' ? [{ call, result, shape }] : [];
  });
}

function hasCharts(calls: ToolCall[]): boolean {
  return chartsIn(calls).length > 0;
}

/**
 * Every chartable result in a turn, each with its own receipts.
 *
 * Per call rather than per turn, because an answer that reads two sources
 * read them at two moments — one timestamp over both would be a claim about
 * data it does not describe (UI rule 6).
 */
function ChartedResults({ calls }: { calls: ToolCall[] }) {
  const charts = chartsIn(calls);
  if (charts.length === 0) return null;
  return (
    <div className="space-y-3">
      {charts.map(({ call, result, shape }) => (
        <div key={call.seq} className="rounded-xl border border-george-line bg-george-paper p-3">
          <GeorgeChart shape={shape} meta={result.meta} />
          <ReceiptsBlock meta={result.meta} />
        </div>
      ))}
    </div>
  );
}

/**
 * A pin George made because he was asked to, in conversation.
 *
 * The answer says the same thing in prose; this says it from the `pinned`
 * frame, so the confirmation is the write itself rather than the model's
 * account of it — what was pinned, where it went, and that it re-runs.
 *
 * Deliberately quiet chrome. Nothing here may use the approvals colour: one
 * colour means "needs you" (UI rule 5), and a pin needs nothing.
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
 * This turn's avatar, which is also the working indicator.
 *
 * ONE PRESENCE. There was a second, larger mark above the thread doing the
 * same job, so during a turn George appeared twice on one screen — once as the
 * author of what was being written and once as a floating presence beside it.
 * A colleague is in one place at a time.
 *
 * A finished turn's avatar is the same drawing at rest, identical to the one a
 * stored post carries, so a turn does not visibly change shape as it lands in
 * the river.
 */
function TurnMark({ live, state }: { live: boolean; state: GeorgeState }) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-george-navy"
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="h-4 w-4 text-george-cream">
        <g className={live ? markClass(state) : undefined}>
          <path d={markPath(live ? state : 'idle')} fill="currentColor" fillRule="evenodd" />
        </g>
      </svg>
    </span>
  );
}

/**
 * What George is doing and what he is thinking, while he does it.
 *
 * Two lines, and they say different things — the first is derived from the
 * TOOL and is true by construction, the second is the model's own summarized
 * reasoning and is never evidence. Both slots are fixed height so the post
 * does not resize under the reader as a turn progresses.
 */
function Narration({
  state,
  running,
  lastResult,
  thinking,
}: {
  state: GeorgeState;
  running: string[];
  lastResult: LastResult | null;
  thinking: string;
}) {
  const cognition = liveCognition(state, thinking);
  return (
    <div>
      <p className="h-[18px] truncate text-[13px] leading-[18px] text-george-slate">
        {markDetail(state, running, lastResult)}
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

function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[12px] text-george-muted min-h-touch"
        aria-expanded={open}
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
        Thinking
      </button>
      {open && (
        <p className="mt-1 border-l-2 border-george-line pl-3 text-[13px] leading-relaxed text-george-slate whitespace-pre-wrap">
          {text}
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-10 text-center">
      <h2 className="font-george-serif text-2xl text-george-navy">Ask about the business</h2>
      <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-george-slate">
        Every figure comes with its receipts — where it came from, which filters were
        applied, and when it was read.
      </p>
    </div>
  );
}
