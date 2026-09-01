/**
 * The conversation column.
 *
 * Order within a George turn is deliberate and matches the loop's own priority:
 *   thinking (collapsed)  ->  tool calls  ->  NOTICES  ->  answer  ->  receipts
 *
 * Notices sit ABOVE the answer, not after it and not inside the receipts
 * disclosure (UI rule 4). A caveat that qualifies a number has to be read
 * before the number, not found afterwards.
 */
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronRight } from 'lucide-react';
import type { GeorgeTurn } from '../../types/george';
import { NoticeBanner } from './NoticeBanner';
import { ReceiptsBlock } from './ReceiptsBlock';
import { ToolCallRow } from './ToolCallRow';

export function GeorgeConversation({ turns }: { turns: GeorgeTurn[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  if (turns.length === 0) return <EmptyState />;

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
          <div key={i} className="space-y-3">
            {turn.thinking && <Thinking text={turn.thinking} />}

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

            {turn.error && (
              <p className="rounded-lg border border-george-line bg-george-paper px-3 py-2.5 text-[13px] text-george-navy">
                {turn.error}
              </p>
            )}

            <ReceiptsBlock meta={turn.receipts} />

            {turn.done && (
              <p className="text-[11px] text-george-muted">
                {turn.done.tool_calls} tool {turn.done.tool_calls === 1 ? 'call' : 'calls'} ·{' '}
                {turn.done.iterations} iterations
                {turn.done.cache_hit && ' · cache hit'}
              </p>
            )}
          </div>
        ),
      )}
      <div ref={endRef} />
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
