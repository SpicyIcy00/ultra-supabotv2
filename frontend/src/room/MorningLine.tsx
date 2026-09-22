/**
 * THE MORNING'S LINE (W2.1, 2026-09-22) — one quiet line, only on the
 * morning's own page.
 *
 * Two things are said here and nothing else:
 *
 *   - ASKED AGAIN TODAY, it was not asked again. The server showed today's
 *     answer instead of spending a model turn, because nothing has landed
 *     since it was read that its reads cover. Said with WHEN it was read
 *     (UI rule 6): a page shown twice is a claim about the morning, and the
 *     person has to be able to see which morning.
 *   - THE SWITCH. The morning is a standing question born OFF (rule 7); only
 *     the person switches it on. Drawn from a LOADED morning (UI rule 8): not
 *     loaded, or failed, and nothing is claimed about whether it is on.
 *
 * No accent anywhere: the one accent colour means an approval waits, and
 * this is neither an approval nor a caveat (UI rule 5).
 */
import { readAt } from './data';
import type { ReusedFrame } from '../types/bob';
import type { Morning } from '../services/standingApi';

/** "08:02" in Manila, or null. */
function hm(stamp: string | null | undefined): string | null {
  if (!stamp) return null;
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false,
                                          timeZone: 'Asia/Manila' });
}

/** The words for a reused morning — exported for the panel beside a page. */
export function reusedWords(reused: ReusedFrame, now: Date = new Date()): string {
  const answered = hm(reused.answered_at);
  const read = readAt(reused.read_at, now);
  return [
    'asked already today',
    answered ? `this is the answer from ${answered}` : 'this is today\'s answer',
    read,
    'nothing has landed since',
  ].filter(Boolean).join(' · ');
}

export function MorningLine({ threadId, reused, morning, onSwitch, switching }: {
  /** The thread on screen. */
  threadId: string | null | undefined;
  reused: ReusedFrame | null;
  /** The morning as loaded — undefined while loading or when it failed. */
  morning: Morning | undefined;
  onSwitch?(on: boolean): void;
  switching?: boolean;
}) {
  if (!threadId) return null;
  const shownAgain = reused?.thread_id === threadId ? reused : null;
  const isMorning = Boolean(shownAgain) || morning?.today?.thread_id === threadId;
  if (!isMorning) return null;
  const off = morning?.enabled === false;
  if (!shownAgain && !off) return null;
  return (
    <p className="r-label r-morning" data-state={shownAgain ? 'reused' : 'morning'}>
      {shownAgain && <span>{reusedWords(shownAgain)}</span>}
      {shownAgain && off && <span> · </span>}
      {off && (
        <>
          <span>the morning {morning?.when ? `(${morning.when}) ` : ''}is switched off</span>
          {onSwitch && (
            <>
              {' '}
              <button type="button" className="r-act" disabled={switching}
                      onClick={() => onSwitch(true)}>switch it on</button>
            </>
          )}
        </>
      )}
    </p>
  );
}
