/**
 * THE MIC, THE HANDS-FREE SWITCH AND HIS VOICE (P2S.5) — the part of voice
 * that touches the browser. The rules are `voice.ts`.
 *
 * SPEAKING IS TYPING WITH YOUR VOICE, AND NOTHING ELSE. The words heard are
 * put in the line as they come (`onDraft`) and sent through the line's own
 * send (`onSay`, which the room points at the same `ask` Enter uses), so the
 * selection, the `@` subjects, the page and the estate travel exactly as they
 * would typed, and a spoken steer is a steer.
 *
 * TWO GESTURES ON ONE BUTTON (P2S.5(a)). Hold it and speak: release sends.
 * Tap it: it listens until you tap again, and what it heard stays in the line
 * to be corrected before you send it — unless hands-free is on, where it ends
 * at your pause and sends, because correcting by hand is what hands-free is
 * not. Which gesture it was is decided by how long the button was held.
 *
 * WHAT HE SAYS ALOUD IS THE CLAIM AND NOTHING ELSE (P2S.5(c)), and anything
 * tapped or typed stops him at once — including the mic, which is how
 * speaking to him stops him.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  FAILURE_SAYS, NOT_IN_THIS_BROWSER, failureOf, heardIn, joinSaid, recognitionIn, synthesisIn,
  type Recognition, type RecognitionCtor, type VoiceFailure,
} from './voice';

/** Held at least this long, a press is a hold and its release sends. */
export const HOLD_MS = 350;

const browser = (): unknown => (typeof window === 'undefined' ? null : window);

export interface VoiceOptions {
  /** Injected in tests; `undefined` reads the browser's own. `null` is none. */
  recognition?: RecognitionCtor | null;
  draft: string;
  onDraft(text: string): void;
  onSay(text: string): void;
  handsFree: boolean;
  input: RefObject<HTMLInputElement | null>;
}

export interface Voice {
  supported: boolean;
  listening: boolean;
  failure: VoiceFailure | null;
  press(): void;
  release(): void;
  toggle(): void;
  clear(): void;
}

export function useVoice(o: VoiceOptions): Voice {
  const Ctor = o.recognition === undefined ? recognitionIn(browser()) : o.recognition;
  const [listening, setListening] = useState(false);
  const [failure, setFailure] = useState<VoiceFailure | null>(null);
  const rec = useRef<Recognition | null>(null);
  // One listening, start to end. Refs, because the recogniser's events land
  // between renders and must see the gesture as it is now.
  const at = useRef({
    before: '', heard: '', pressedAt: 0,
    mode: 'none' as 'none' | 'hold' | 'tap',
    held: false, ended: false, failed: false, stopping: false,
  });
  const live = useRef(o);
  live.current = o;

  const send = useCallback(() => {
    const s = at.current;
    const text = joinSaid(s.before, s.heard);
    if (s.heard && text) live.current.onSay(text);
  }, []);

  const finish = useCallback(() => {
    const s = at.current;
    rec.current = null;
    setListening(false);
    // NEVER PRETEND TO HAVE HEARD (P2S.5(d)). Nothing came back and nothing
    // failed: that is its own line, and the line stays as it was.
    if (!s.heard) {
      if (!s.failed) setFailure('nothing-heard');
      return;
    }
    if (s.held) { s.ended = true; return; }      // the release sends
    if (s.mode === 'hold' || live.current.handsFree) { send(); return; }
    // Tapped, outside hands-free: the words are in the line to be corrected.
    live.current.input.current?.focus();
  }, [send]);

  const start = useCallback((mode: 'none' | 'tap') => {
    if (!Ctor) return;
    setFailure(null);
    at.current = {
      before: live.current.draft, heard: '', pressedAt: Date.now(), mode,
      held: mode === 'none', ended: false, failed: false, stopping: false,
    };
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      const s = at.current;
      s.heard = heardIn(e.results);
      live.current.onDraft(joinSaid(s.before, s.heard));
      // HANDS-FREE ENDS AT YOUR PAUSE. A tap with hands-free on sends the
      // phrase once the recogniser has settled it, with no second tap.
      const last = e.results[e.results.length - 1];
      if (s.mode === 'tap' && live.current.handsFree && last?.isFinal) r.stop();
    };
    r.onerror = (e) => {
      const f = failureOf(e.error);
      if (!f) return;
      at.current.failed = true;
      setFailure(f);
    };
    r.onend = finish;
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
      at.current.failed = true;
      setFailure('no-service');
    }
  }, [Ctor, finish]);

  const press = useCallback(() => {
    // A tap while a tapped listening is open is the tap that stops it.
    if (rec.current && at.current.mode === 'tap') {
      at.current.stopping = true;
      rec.current.stop();
      return;
    }
    if (rec.current) return;
    start('none');
  }, [start]);

  const release = useCallback(() => {
    const s = at.current;
    if (s.stopping) { s.stopping = false; return; }
    if (!s.held) return;
    s.held = false;
    if (s.mode === 'none') s.mode = Date.now() - s.pressedAt >= HOLD_MS ? 'hold' : 'tap';
    if (s.mode === 'tap') return;                  // keeps listening
    if (rec.current) { rec.current.stop(); return; }
    if (s.ended) send();                           // it stopped while still held
  }, [send]);

  // THE KEYBOARD'S WAY IN: Enter or Space on the mic is tap-to-start,
  // tap-to-stop, since a key cannot be "held" in any sense a person means.
  const toggle = useCallback(() => {
    if (rec.current) { at.current.mode = 'tap'; rec.current.stop(); return; }
    start('tap');
  }, [start]);

  const clear = useCallback(() => setFailure(null), []);

  useEffect(() => () => { rec.current?.abort(); }, []);

  return { supported: Boolean(Ctor), listening, failure, press, release, toggle, clear };
}

/** The design's `.mic`: a quiet circle beside ↑. Ringed while it listens. */
export function MicButton({ voice }: { voice: Voice }) {
  if (!voice.supported) return null;
  return (
    <button
      type="button"
      className="r-mic"
      data-state={voice.listening ? 'listening' : 'idle'}
      aria-pressed={voice.listening}
      aria-label={voice.listening ? 'Listening — release or tap to stop' : 'Speak — hold, or tap to start'}
      title={voice.listening ? 'Listening' : 'Speak — hold, or tap to start'}
      onPointerDown={(e) => {
        e.preventDefault();
        try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not every pointer can be captured */ }
        voice.press();
      }}
      onPointerUp={() => voice.release()}
      onPointerCancel={() => voice.release()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        voice.toggle();
      }}
    >
      ◉
    </button>
  );
}

/**
 * THE ONE LINE VOICE MAY SAY ABOUT ITSELF — a failure, or that this browser
 * has no recogniser. It is the frame's voice, not his, so it is a label.
 */
export function VoiceNote({ voice, offered }: { voice: Voice; offered: boolean }) {
  if (!offered) return null;
  const says = !voice.supported ? NOT_IN_THIS_BROWSER
    : voice.failure ? FAILURE_SAYS[voice.failure] : null;
  if (!says) return null;
  return <p className="r-voice-note" role="status" data-voice={voice.supported ? voice.failure : 'none'}>{says}</p>;
}

/**
 * HANDS-FREE (P2S.5(c)) — a switch on the line. On, each answer that lands is
 * read aloud: the claim, nothing else.
 */
export function HandsFree({ on, onChange }: { on: boolean; onChange(on: boolean): void }) {
  return (
    <button
      type="button"
      className="r-hands"
      aria-pressed={on}
      aria-label={on ? 'Hands-free is on — he reads each answer aloud' : 'Hands-free — read each answer aloud'}
      title={on ? 'Hands-free: on' : 'Hands-free: off'}
      onClick={() => onChange(!on)}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
        {on && <path d="M11 5.5c1 .8 1.5 1.6 1.5 2.5s-.5 1.7-1.5 2.5M12.5 3.5c1.6 1.2 2.5 2.7 2.5 4.5s-.9 3.3-2.5 4.5"
                     stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />}
      </svg>
    </button>
  );
}

export interface Reader {
  can: boolean;
  speaking: boolean;
  speak(text: string): boolean;
  stop(): void;
}

/**
 * HIS VOICE — the browser's speech synthesis, one utterance at a time.
 *
 * WHILE HE SPEAKS, ANYTHING TAPPED OR TYPED STOPS HIM AT ONCE: a capture
 * listener on the document, so it runs before whatever was tapped does. That
 * includes the mic — speaking to him is how you interrupt him.
 */
export function useReader(win: unknown = browser()): Reader {
  const can = synthesisIn(win);
  const w = win as { speechSynthesis: SpeechSynthesis; SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance };
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (!can) return;
    current.current = null;
    w.speechSynthesis.cancel();
    setSpeaking(false);
  }, [can, w]);

  const speak = useCallback((text: string) => {
    const said = text.trim();
    if (!can || !said) return false;
    w.speechSynthesis.cancel();
    const u = new w.SpeechSynthesisUtterance(said);
    const done = () => {
      if (current.current !== u) return;   // a later one has taken over
      current.current = null;
      setSpeaking(false);
    };
    u.onend = done;
    u.onerror = done;
    current.current = u;
    w.speechSynthesis.speak(u);
    setSpeaking(true);
    return true;
  }, [can, w]);

  useEffect(() => {
    if (!speaking) return undefined;
    const halt = () => stop();
    document.addEventListener('pointerdown', halt, true);
    document.addEventListener('keydown', halt, true);
    return () => {
      document.removeEventListener('pointerdown', halt, true);
      document.removeEventListener('keydown', halt, true);
    };
  }, [speaking, stop]);

  // Leaving the room leaves him silent.
  useEffect(() => () => { if (can) w.speechSynthesis?.cancel(); }, [can, w]);

  return useMemo(() => ({ can, speaking, speak, stop }), [can, speaking, speak, stop]);
}
