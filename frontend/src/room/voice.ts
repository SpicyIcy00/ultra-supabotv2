/**
 * VOICE — a first-class way of operating George, not speech-to-chat (P2S.5).
 *
 * The owner's standard, §8: *"Eventually voice should become a first-class way
 * of operating George rather than simply speech-to-chat"*, and *"Language is
 * for intent. Direct interaction is for reference. They should work naturally
 * together."* So nothing here is a second path. What is heard is put in the
 * line exactly as typing would put it there and sent through the SAME `ask`:
 * whatever is picked on screen travels with it, a short steer ("last 30 days")
 * resolves through the same fragment path as the chips and replays with no
 * model turn, and everything else is an ordinary question. George cannot tell
 * a spoken question from a typed one, and stores nothing of it but its text.
 *
 * THIS FILE IS THE RULES, with no DOM — which browser has a recogniser, what
 * a result list says so far, which failure is which, and the one sentence he
 * reads aloud. `Mic.tsx` is the part that touches the browser.
 */
import type { DeskDefinitions } from '../services/deskApi';
import { claimAndStanding, unmark } from './beside';
import { normalise } from './tokenShape';

/** The slice of the Web Speech API's recogniser this room uses. */
export interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex?: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
export type RecognitionCtor = new () => Recognition;

/**
 * THE RECOGNISER THIS BROWSER HAS, OR NONE (P2S.5(e)).
 *
 * Chrome and Edge ship it prefixed, current Safari both ways, Firefox not at
 * all. No recogniser means no mic is drawn — a button that cannot hear teaches
 * that buttons do nothing — and one line says why.
 */
export function recognitionIn(win: unknown): RecognitionCtor | null {
  const w = win as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | null;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
}

/** Whether this browser can read aloud at all — the hands-free switch needs it. */
export function synthesisIn(win: unknown): boolean {
  const w = win as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown } | null;
  return Boolean(w?.speechSynthesis && w?.SpeechSynthesisUtterance);
}

/**
 * WHAT HAS BEEN HEARD SO FAR — every settled phrase, then the one still being
 * heard. A recogniser hands back the whole list on every event, the last entry
 * revised as it listens, so the line is rebuilt from the list rather than
 * appended to (appending would repeat every interim guess).
 */
export function heardIn(results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>): string {
  const parts: string[] = [];
  for (let n = 0; n < results.length; n += 1) {
    const said = results[n]?.[0]?.transcript ?? '';
    if (said.trim()) parts.push(said.trim());
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** What was already in the line, then what was heard — a space between. */
export function joinSaid(before: string, heard: string): string {
  const a = before.trimEnd();
  const b = heard.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

/**
 * EACH FAILURE SAYS WHICH, IN ONE LINE (P2S.5(d)), and none pretends to have
 * heard. The recogniser's error codes, grouped by what a person can do about
 * them: allow the microphone, plug one in, try later, or say it again.
 * `aborted` is the room stopping it on purpose and says nothing.
 */
export type VoiceFailure = 'denied' | 'no-microphone' | 'no-service' | 'nothing-heard';

export function failureOf(error: string): VoiceFailure | null {
  switch (error) {
    case 'not-allowed':
      return 'denied';
    case 'audio-capture':
      return 'no-microphone';
    case 'service-not-allowed':
    case 'network':
    case 'language-not-supported':
    case 'bad-grammar':
      return 'no-service';
    case 'no-speech':
      return 'nothing-heard';
    default:
      return null;
  }
}

export const FAILURE_SAYS: Record<VoiceFailure, string> = {
  denied: 'The microphone is not allowed for this site — allow it in the browser to speak.',
  'no-microphone': 'No microphone was found.',
  'no-service': 'The speech service could not be reached, so nothing was heard.',
  'nothing-heard': 'Nothing heard.',
};

export const NOT_IN_THIS_BROWSER = 'Voice is not available in this browser.';

/**
 * THE ONE SENTENCE HE READS ALOUD (P2S.5(c)) — the claim, as the headline
 * draws it: the sentence his claim span sits in, his emphasis markers out,
 * every other character his. Never the figures on the right, never the
 * receipts, never the rest of what he said. The same cut `Reading` draws, so
 * what is heard is exactly the line that is lit.
 */
export function spokenClaim(text: string | null | undefined, span: string | null | undefined): string {
  const plain = unmark((text ?? '').trim()).plain;
  return claimAndStanding(plain, span).claim;
}

/**
 * "READ IT TO ME" — the words that ask for the claim aloud, on demand. They
 * are the definitions' (`surface.desk.fragments.read_aloud`), as the
 * correction token's are, so what the room answers to is not a string in a
 * component. Matched whole, like every fragment: no fuzzy match, and anything
 * else is a question.
 */
export function asksToHear(text: string, defs: DeskDefinitions | null | undefined): boolean {
  const said = normalise(text);
  const spellings = (defs?.fragments?.read_aloud as { spellings?: unknown } | undefined)?.spellings;
  if (!said || !Array.isArray(spellings)) return false;
  return spellings.some((s) => typeof s === 'string' && normalise(s) === said);
}
