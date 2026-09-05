/**
 * The ask box. Pinned to the bottom of the centre column on phones, above the
 * safe-area inset (the `safe-bottom` spacing token already exists in the
 * Tailwind config for the existing bottom nav).
 */
import { useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface Props {
  onAsk: (q: string) => void;
  onCancel: () => void;
  busy: boolean;
}

export function GeorgeInput({ onAsk, onCancel, busy }: Props) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!value.trim() || busy) return;
    onAsk(value.trim());
    setValue('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  return (
    <div className="border-t border-george-line bg-george-cream px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-0 md:pb-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-george-line bg-george-paper px-3 py-2">
        <textarea
          ref={ref}
          value={value}
          rows={1}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter newlines. On touch the button is the
            // primary affordance, so this never traps a mobile user.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Tell George…"
          className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-relaxed text-george-navy placeholder:text-george-muted focus:outline-none"
          aria-label="Tell George"
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
