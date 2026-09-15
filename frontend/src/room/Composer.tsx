/**
 * THE LINE YOU TALK ON — and the two doors onto a subject (P2.c).
 *
 * It was inline in Room.tsx, which is the file no test renders. It is a
 * component now because the `@` menu is the half of this card that has to be
 * held by something, and "tests on the resolution, not the wording" needs
 * something to mount.
 *
 * WHAT SITS ABOVE THE LINE IS WHAT THE QUESTION WILL TRAVEL WITH, drawn as
 * three different things because they are three different things: subjects
 * (ids off rows or off a completion), the page this is being asked from, and
 * anything named that binds neither. Nothing here is a figure.
 *
 * THE MENU COSTS NO MODEL TURN. It is one read of things that exist, ranked
 * by the server off vetted reads; a kind that could not be read says so rather
 * than being drawn as nothing found (UI rule 8).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeskDefinitions } from '../services/deskApi';
import { readMentions, type MentionCandidate, type Mentions } from '../services/mentionsApi';
import { accept, bind, offered, openMention, worthReading, type Bound } from './mentions';
import type { Subject } from './subjects';

export interface NamedReference {
  kind: string;
  id: string;
  label: string;
}

export interface ComposerProps {
  draft: string;
  onDraft(text: string): void;
  /** What has been picked, by tap or by `@`. */
  subjects: Subject[];
  /** The page an `@page` bound, or null. */
  scope: { id: string; title: string } | null;
  /** What was named and binds nothing — a rule. */
  named: NamedReference[];
  onUnpick(subject: Subject): void;
  onUnscope(): void;
  onUnname(reference: NamedReference): void;
  onBind(bound: Bound): void;
  onSend(): void;
  onStop(): void;
  /** Escape with nothing open: the draft and everything held go together. */
  onClear(): void;
  busy: boolean;
  defs: DeskDefinitions | null | undefined;
  /** Injected in tests so the resolution is driven without a network. */
  read?: (q: string, signal?: AbortSignal) => Promise<Mentions>;
}

export function Composer(p: ComposerProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [cursor, setCursor] = useState(0);
  // Dismissed with Escape, and re-opened by typing. Without this the menu
  // cannot be got rid of while a mention is still under the caret.
  const [shut, setShut] = useState(false);

  const open = useMemo(
    () => (shut ? null : openMention(p.draft, caret, p.defs)),
    [p.draft, caret, p.defs, shut],
  );
  const asking = worthReading(open, p.defs);
  const reader = p.read ?? readMentions;

  const found = useQuery({
    queryKey: ['mentions', open?.query ?? ''],
    queryFn: ({ signal }) => reader(open?.query ?? '', signal),
    enabled: asking,
    staleTime: 30_000,
    retry: false,
  });

  const list = useMemo(
    () => (asking ? offered(found.data?.candidates ?? [], p.defs) : []),
    [asking, found.data, p.defs],
  );
  useEffect(() => { setCursor(0); }, [open?.query]);

  const take = useCallback((candidate: MentionCandidate) => {
    if (!open) return;
    const bound = bind(candidate, p.defs);
    const next = accept(p.draft, open, candidate, p.defs);
    p.onDraft(next.text);
    if (bound) p.onBind(bound);
    // The caret goes after the word just accepted, so typing carries on where
    // a person expects it to rather than at the end of a sentence they may be
    // in the middle of.
    requestAnimationFrame(() => {
      input.current?.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  }, [open, p]);

  const move = (e: { currentTarget: HTMLInputElement }) => {
    setCaret(e.currentTarget.selectionStart ?? e.currentTarget.value.length);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (list.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); setCursor((n) => (n + 1) % list.length); return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault(); setCursor((n) => (n - 1 + list.length) % list.length); return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault(); take(list[cursor] ?? list[0]); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setShut(true); return; }
    }
    if (e.key === 'Enter') { p.onSend(); return; }
    if (e.key === 'Escape') { p.onClear(); return; }
    // Anything else may have moved the caret; the menu is decided from where
    // it lands, not from what was typed.
    requestAnimationFrame(() => {
      const el = input.current;
      if (el) setCaret(el.selectionStart ?? el.value.length);
    });
  };

  const unavailable = asking ? Object.entries(found.data?.unavailable ?? {}) : [];

  return (
    <div className="r-line-wrap">
      <div className="r-measure">
        {(p.subjects.length > 0 || p.scope || p.named.length > 0) && (
          <div className="r-chips">
            {p.subjects.map((s) => (
              <button key={`${s.dimension}:${s.id}`} type="button" className="r-chip r-chip--subject"
                      title={`${s.dimension} · ${s.id}`}
                      onClick={() => p.onUnpick(s)}>
                {s.label} ×
              </button>
            ))}
            {p.scope && (
              <button type="button" className="r-chip r-chip--scope"
                      title="the page this is asked from"
                      onClick={p.onUnscope}>
                page · {p.scope.title} ×
              </button>
            )}
            {p.named.map((r) => (
              <button key={`${r.kind}:${r.id}`} type="button" className="r-chip r-chip--named"
                      title={`${r.kind} · ${r.id}`}
                      onClick={() => p.onUnname(r)}>
                {r.kind} · {r.label} ×
              </button>
            ))}
          </div>
        )}

        {asking && (
          <div className="r-mentions" role="listbox" aria-label="What that could mean">
            {found.isPending && <p className="r-label">Looking…</p>}
            {!found.isPending && !list.length && !unavailable.length && (
              <p className="r-label">Nothing by that name.</p>
            )}
            {list.map((c, n) => (
              <button
                key={`${c.kind}:${c.id}`}
                type="button"
                role="option"
                aria-selected={n === cursor}
                className={`r-mention${n === cursor ? ' r-mention--on' : ''}`}
                // The pointer must not take focus off the line, or the caret
                // moves and the mention this is completing stops existing.
                onMouseDown={(e) => { e.preventDefault(); take(c); }}
                onMouseEnter={() => setCursor(n)}
              >
                <span className="r-mention-label">{c.label}</span>
                <span className="r-mention-says">{c.says}</span>
                {c.hint && <span className="r-mention-hint">{c.hint}</span>}
              </button>
            ))}
            {/* A KIND THAT COULD NOT BE READ SAYS SO. "No supplier by that
                name" and "the purchasing read did not come back" are
                different facts, and the second one must never be drawn as the
                first. */}
            {unavailable.map(([kind, why]) => (
              <p key={kind} className="r-mention-out">
                {kind}s could not be read. {why}
              </p>
            ))}
          </div>
        )}

        <div className="r-line">
          <input
            ref={input}
            value={p.draft}
            placeholder={
              p.subjects.length ? 'say what to do with these'
                : p.busy ? 'you can redirect while he reads'
                : 'say something, or touch something above'
            }
            onChange={(e) => {
              setShut(false);
              p.onDraft(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={move}
            onClick={move}
            onSelect={move}
            aria-label="Say something to George"
          />
          {p.busy ? (
            <button type="button" className="r-send" onClick={p.onStop}
                    title="Stop" aria-label="Stop"
                    style={{ background: 'var(--sunk)', color: 'var(--ink)' }}>■</button>
          ) : (
            <button type="button" className="r-send" onClick={p.onSend}
                    disabled={!p.draft.trim()} title="Send" aria-label="Send">↑</button>
          )}
        </div>
      </div>
    </div>
  );
}
