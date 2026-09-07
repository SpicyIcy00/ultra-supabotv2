/**
 * The ask box.
 *
 * ONE COMPOSER, EVERYWHERE. Today, an empty Ask and an open thread all use
 * this and nothing else, so learning it once is learning it everywhere.
 * Pinned to the bottom of the centre column on phones, above the safe-area
 * inset.
 *
 * IT TELLS THE MARK. Focus and an unsent draft are reported to the provider
 * as composer activity; presence.ts turns that into `listening` only while
 * George is otherwise at rest. The composer reports a fact and decides
 * nothing.
 *
 * A draft may arrive from elsewhere — a Workflows row offering "ask George
 * to run it" — and it is a DRAFT: it lands in the box for the person to
 * read, edit and send, and is never sent on their behalf.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { useGeorge } from '../../hooks/useGeorge';

interface Props {
  onAsk: (q: string) => void;
  onCancel: () => void;
  busy: boolean;
  placeholder?: string;
  /** Text to start with, unsent. Applied whenever the value or key changes. */
  draft?: string | null;
  draftKey?: number;
  autoFocus?: boolean;
  /** Bare: no top rule, no side padding — for the centre of an empty Ask. */
  bare?: boolean;
  /**
   * The column class the page is using.
   *
   * The composer sits at the bottom edge of the same column the answers scroll
   * in, and the column widens for a table or a chart (workspaceWidth). Passing
   * the class rather than hard-coding one keeps the box exactly as wide as the
   * thing above it — a 3xl composer under a 5xl table hangs under something it
   * no longer spans.
   */
  column?: string;
}

export function AskComposer({
  onAsk,
  onCancel,
  busy,
  placeholder = 'Ask George…',
  draft = null,
  draftKey = 0,
  autoFocus = false,
  bare = false,
  column = 'mx-auto max-w-3xl',
}: Props) {
  const { setComposer } = useGeorge();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  useEffect(() => {
    if (draft) {
      setValue(draft);
      if (ref.current) {
        grow(ref.current);
        ref.current.focus();
      }
    }
  }, [draft, draftKey]);

  // The fact the mark is told: addressed, drafting, or neither.
  useEffect(() => {
    setComposer(value.trim() ? 'drafting' : focused ? 'focused' : 'idle');
    return () => setComposer('idle');
  }, [value, focused, setComposer]);

  const submit = () => {
    if (!value.trim() || busy) return;
    onAsk(value.trim());
    setValue('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  return (
    <div
      className={
        bare
          ? 'w-full'
          : 'border-t border-george-line bg-george-cream px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-8 md:pb-4'
      }
    >
      <div
        className={`${column} flex items-end gap-2 rounded-2xl border border-george-line bg-george-paper px-3 py-2`}
      >
        <textarea
          ref={ref}
          value={value}
          rows={1}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setValue(e.target.value);
            grow(e.target);
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter newlines. On touch the button is the
            // primary affordance, so this never traps a mobile user.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-relaxed text-george-navy placeholder:text-george-muted focus:outline-none"
          aria-label={placeholder}
        />

        <button
          type="button"
          onClick={busy ? onCancel : submit}
          disabled={!busy && !value.trim()}
          aria-label={busy ? 'Stop' : 'Send'}
          className="flex h-9 w-9 min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full bg-george-navy text-george-cream transition-opacity disabled:opacity-30"
        >
          {busy ? <Square className="h-3.5 w-3.5" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
