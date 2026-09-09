/**
 * Where you talk to George.
 *
 * IT SHOWS WHAT IT WILL SEND. Above the box, one line naming the subjects
 * selected and the window the work is on — so "Why?" is visibly a question
 * about North Edsa, and nobody has to guess whether the selection travelled.
 * The line is built from the desk's own state, which is ids and labels off
 * rows (deskState.deskContextFor).
 *
 * IT DOES NOT DOMINATE. One line at the foot of the workspace, lifted by
 * light rather than boxed by a border. The actions beside it are what the
 * definitions allow of what is on screen; a local one changes the view and
 * never reaches the model, an asked one is a question in business words.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { useGeorge } from '../../hooks/useGeorge';

export interface DeskLineProps {
  onAsk: (question: string) => void;
  onCancel: () => void;
  busy: boolean;
  /** What the question will carry, in words. Null when the desk is empty. */
  context: string | null;
  /**
   * What George is doing right now, in his own words, derived from the frames
   * that arrived. Shown only while a turn runs — presence is a fact, and
   * there is no line when nothing is happening.
   */
  narration?: string | null;
  placeholder?: string;
  /** Text to start with, unsent — from a move, for the person to edit. */
  draft?: string | null;
  draftKey?: number;
}

export function DeskLine({
  onAsk, onCancel, busy, context, narration = null,
  placeholder = 'Ask George, or touch something above…', draft = null, draftKey = 0,
}: DeskLineProps) {
  const { setComposer } = useGeorge();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
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

  useEffect(() => {
    setComposer(value.trim() ? 'drafting' : focused ? 'focused' : 'idle');
    return () => setComposer('idle');
  }, [value, focused, setComposer]);

  /**
   * A QUESTION IS NEVER REFUSED BECAUSE GEORGE IS BUSY.
   *
   * This used to return early while a turn ran, and the send button became
   * Stop, so the only way to say anything was to wait or reload. A turn that
   * never terminated — a dropped stream, an error with no `done` frame — left
   * the composer dead. The guard bought nothing either way: `ask` in
   * useGeorgeStream already cancels the running turn before it starts a new
   * one, and marks the stopped turn as stopped rather than finished.
   */
  const submit = () => {
    if (!value.trim()) return;
    onAsk(value.trim());
    setValue('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  // Stop is offered while a turn runs and the box is empty. The moment there
  // is something to send, the button sends it — a person who has typed a new
  // instruction has already decided what to do with the turn in flight.
  const stopping = busy && !value.trim();

  return (
    <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 md:px-8" data-desk-line>
      <div className="mx-auto w-full max-w-4xl">
        {/* What George is doing, while he is doing it. Never a fake state. */}
        {busy && narration && (
          <p className="mb-1.5 truncate text-[12px] text-george-slate" data-narration>{narration}</p>
        )}

        {/* What the question will carry. Never a figure. */}
        {context && !busy && (
          <p className="mb-1.5 truncate text-[11px] text-george-muted" data-desk-context>
            George will read this as: {context}
          </p>
        )}

        <div className="desk-lift-2 flex items-end gap-2 rounded-2xl bg-george-paper px-4 py-2.5">
          <textarea
            ref={ref}
            value={value}
            rows={1}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => { setValue(e.target.value); grow(e.target); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="max-h-36 flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-relaxed text-george-navy placeholder:text-george-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={stopping ? onCancel : submit}
            disabled={!busy && !value.trim()}
            aria-label={stopping ? 'Stop' : 'Send'}
            className="flex h-9 w-9 min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full bg-george-navy text-george-cream transition-opacity disabled:opacity-25"
          >
            {stopping ? <Square className="h-3.5 w-3.5" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
