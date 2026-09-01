/**
 * One tool invocation, rendered the moment its tool_call frame arrives and
 * completed in place when the matching tool_result lands.
 *
 * Rows are keyed by the conversation-global `seq`. Two tools dispatched in
 * parallel arrive as two tool_call frames before either result, so position in
 * the array is not a stable identity — seq is.
 */
import { useState } from 'react';
import { ChevronRight, Database, Loader2, TriangleAlert } from 'lucide-react';
import type { ToolCall } from '../../types/george';

function args(a: Record<string, unknown>): string {
  const parts = Object.entries(a)
    .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return parts.join(' · ');
}

export function ToolCallRow({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const done = Boolean(call.result);
  const failed = Boolean(call.result?.error);

  return (
    <div className="rounded-lg border border-george-line bg-george-paper">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left min-h-touch"
        aria-expanded={open}
      >
        {!done ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-george-slate" aria-hidden />
        ) : failed ? (
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-george-accent" aria-hidden />
        ) : (
          <Database className="h-3.5 w-3.5 shrink-0 text-george-slate" aria-hidden />
        )}

        <span className="font-mono text-[12px] text-george-navy shrink-0">{call.tool}</span>

        <span className="truncate text-[12px] text-george-muted flex-1 min-w-0">
          {args(call.arguments)}
        </span>

        {done && !failed && (
          <span className="hidden xs:inline shrink-0 text-[11px] text-george-muted tabular-nums">
            {call.result!.row_count ?? 0} {call.result!.row_count === 1 ? 'row' : 'rows'} ·{' '}
            {call.result!.duration_ms}ms
          </span>
        )}

        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-george-muted transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-george-line px-3 py-2.5 space-y-1.5">
          <pre className="overflow-x-auto rounded bg-george-cream p-2 text-[11px] leading-relaxed text-george-navy">
            {JSON.stringify(call.arguments, null, 2)}
          </pre>
          {call.result && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-george-muted">source</dt>
              <dd className="text-george-navy break-words">{call.result.source_table ?? '—'}</dd>
              <dt className="text-george-muted">rows</dt>
              <dd className="text-george-navy tabular-nums">
                {call.result.row_count ?? 0}
                {call.result.truncated && ' (truncated for the model)'}
              </dd>
              <dt className="text-george-muted">took</dt>
              <dd className="text-george-navy tabular-nums">{call.result.duration_ms}ms</dd>
              {call.result.error && (
                <>
                  <dt className="text-george-accent">refused</dt>
                  <dd className="text-george-navy break-words">{call.result.error}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
