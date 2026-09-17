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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeskDefinitions } from '../services/deskApi';
import { readMentions, type MentionCandidate, type Mentions } from '../services/mentionsApi';
import { accept, bind, offered, openMention, worthReading, type Bound } from './mentions';
import { accepted, ghostFor, type Ghost } from './ghosts';
import type { DrawnToken } from './tokenShape';
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
  /**
   * WHICH BUSINESS THE QUESTION IS SCOPED TO (P2.g), or null on the estate's
   * own default — where nothing is travelling and a chip would be about
   * nothing. The switch itself lives at the top of the column; this is it
   * drawn where the rest of what travels is drawn, because a full board
   * scrolls the top away and what a question carries has to be visible at the
   * moment it is sent.
   */
  estate?: { key: string; label: string } | null;
  onUnpick(subject: Subject): void;
  onUnscope(): void;
  onUnestate?(): void;
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
  /**
   * THE BOARD'S OWN WORDS, for the grey completion (P2.d).
   *
   * Handed down rather than read here: they are what is on the screen, and the
   * screen is the Room's. `tokens` is the scope the work is on — a completion
   * built from one is a REPLAY, about a second, no model turn — and `drawn`
   * is what the board is drawing. `pages` is the caller's own, so a page that
   * names one of those subjects can complete too.
   *
   * IT IS `drawn`, NOT `subjects`, AND THAT IS THE WHOLE OF A DEFECT (P2.e,
   * 2026-09-15). P2.d added this as a second `subjects`, so the interface
   * declared the name twice and Room.tsx passed the attribute twice — the
   * later one won, the picked subjects never reached the composer, and the
   * chips above the line drew `undefined` for every one of them. Two things
   * are two names: what the person PICKED and what the board is DRAWING.
   */
  tokens?: DrawnToken[];
  drawn?: string[];
  pages?: { id: string; title: string }[];
  /**
   * THE CHIPS ON THE LINE (P2S.1(h)) — the read-as tokens, drawn where the
   * design draws "why?", "products" and "last 90 days". Tapping one is the
   * replay path it always was: no model turn. Handed in, because what it moves
   * is the Room's.
   */
  steer?: ReactNode;
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

  // A MULTI-WORD MENTION THAT MATCHES NOTHING IS A SENTENCE (2026-09-15).
  //
  // Allowing spaces in a mention is what makes `@Kiamoy strips` work, and it
  // also means the menu would otherwise follow a person into an ordinary
  // sentence saying "Nothing by that name" at every word. So the RESULT closes
  // it: once a query with a space has come back empty, there is nothing to
  // offer and this stops being a mention.
  //
  // A ONE-WORD MISS STILL SPEAKS, because right after `@` that is useful
  // feedback rather than noise, and because a kind that could not be READ is a
  // different fact that must still be said (UI rule 8).
  const sentence = Boolean(
    open && /\s/.test(open.query) && !found.isPending
    && !list.length && !Object.keys(found.data?.unavailable ?? {}).length,
  );
  useEffect(() => { setCursor(0); }, [open?.query]);

  const take = useCallback((candidate: MentionCandidate) => {
    if (!open) return;
    const bound = bind(candidate, p.defs);
    const next = accept(p.draft, open, candidate, p.defs);
    // ACCEPTING ONE CLOSES THE MENU. `accept` leaves `@Aji Kiamoy Curl Sour`
    // in the line, and a query that may now contain spaces matches that
    // perfectly — so without this the menu reopens offering the thing that was
    // just chosen. Typing anything opens it again.
    setShut(true);
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

  // GREY TEXT THAT FINISHES THE QUESTION (P2.d). Pure, from what is already on
  // screen, recomputed on every keystroke because it costs nothing to — no
  // request, no model, no debounce. It is suppressed while the `@` menu is up:
  // two completions on one line, both taking Tab, is one too many.
  const ghost: Ghost | null = useMemo(
    () => (asking && !sentence ? null : ghostFor({
      draft: p.draft,
      tokens: p.tokens ?? [],
      // Every name on the screen: what the board drew, what was picked off
      // it, and what was named and bound nothing. All three are in front of
      // the person, which is what makes a completion from them free.
      subjects: (p.drawn ?? [])
        .concat(p.subjects.map((s) => s.label))
        .concat(p.named.map((n) => n.label)),
      pages: p.pages ?? [],
    })),
    [asking, sentence, p.draft, p.tokens, p.drawn, p.subjects, p.named, p.pages],
  );

  const takeGhost = useCallback((g: Ghost) => {
    const next = accepted(g);
    p.onDraft(next);
    requestAnimationFrame(() => {
      input.current?.setSelectionRange(next.length, next.length);
      setCaret(next.length);
    });
  }, [p]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (list.length && !sentence) {
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
    // TAB ACCEPTS, AND ONLY TAB. Enter still sends what was actually typed:
    // a completion taken by the key that sends is a question nobody wrote.
    if (e.key === 'Tab' && ghost) { e.preventDefault(); takeGhost(ghost); return; }
    if (e.key === 'Enter') { p.onSend(); return; }
    if (e.key === 'Escape') { p.onClear(); return; }
    // Anything else may have moved the caret; the menu is decided from where
    // it lands, not from what was typed.
    requestAnimationFrame(() => {
      const el = input.current;
      if (el) setCaret(el.selectionStart ?? el.value.length);
    });
  };

  const unavailable = asking && !sentence
    ? Object.entries(found.data?.unavailable ?? {}) : [];

  return (
    <div className="r-line-wrap">
      <div className="r-compose">
        {/* WHAT THE QUESTION WILL CARRY, or the design's one line saying how
            to give it something: tap anything above. */}
        {(p.subjects.length > 0 || p.scope || p.named.length > 0 || p.estate) ? (
          <div className="r-chips">
            {p.estate && (
              <button type="button" className="r-chip r-chip--scope"
                      title="the part of the estate this question is about"
                      onClick={() => p.onUnestate?.()}>
                {p.estate.label} ×
              </button>
            )}
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
        ) : (
          <div className="r-chips">
            <span className="r-refs-hint">tap anything above to bring it here, then say what you mean</span>
          </div>
        )}

        {asking && !sentence && (
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
          {/* THE GHOST SITS UNDER THE INPUT, in the same box with the same
              type, so the grey continues the line rather than sitting beside
              it. What has been typed is drawn transparent here — it is the
              spacer that puts the completion in the right place — and the real
              characters are the input's own, above it. aria-hidden, because a
              screen reader reading the line twice is worse than not being
              offered the completion; the hint below names it instead. */}
          <span className="r-ghost-box">
            {ghost && (
              <span className="r-ghost" aria-hidden="true">
                <span className="r-ghost-typed">{p.draft}</span>
                <span className="r-ghost-rest">{ghost.rest}</span>
                <span className="r-ghost-key">tab · {ghost.costs}</span>
              </span>
            )}
            <input
              ref={input}
              value={p.draft}
              placeholder={
                p.subjects.length ? 'say what to do with these'
                  : p.busy ? 'you can redirect while he reads'
                  : 'say what you mean · “why?” · “these two” · “last 90 days”'
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
          </span>
          {p.steer && <div className="r-steer">{p.steer}</div>}
          {/* NO MIC YET. The design draws one here; P2S.5 builds voice, and a
              button that does nothing teaches that buttons do nothing. */}
          {p.busy ? (
            <button type="button" className="r-send" onClick={p.onStop}
                    title="Stop" aria-label="Stop">■</button>
          ) : (
            <button type="button" className="r-send" onClick={p.onSend}
                    disabled={!p.draft.trim()} title="Send" aria-label="Send">↑</button>
          )}
        </div>
      </div>
    </div>
  );
}
