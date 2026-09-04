/**
 * What George says before he is asked anything.
 *
 * George opens the page. He is not a text box that waits, so a new chat is
 * never a blank screen with a prompt in the middle of it — he leads with the
 * most notable thing in this morning's brief, or says plainly that nothing
 * moved, or that he could not look.
 *
 * IT IS AN ANSWER, SO IT CARRIES AN ANSWER'S RECEIPTS. Same NoticeBanner above
 * the sentence (UI rule 4), same ReceiptsBlock beneath it (rules 3 and 6),
 * through the same components a turn and a tile use. When there is an item, the
 * receipts are the ITEM'S own — a brief mixes sources of different ages, so
 * the brief-level timestamp would lend the freshest source's credibility to the
 * stalest source's facts (tools/brief.py). With no item, the brief's own meta
 * stands behind the claim that nothing moved, because that is a claim about a
 * moment too.
 *
 * IT IS NOT A TURN. It never enters `turns`, so it never reaches toHistory()
 * and never becomes part of an ask payload. George said this to the reader.
 */
import type { FollowUp as FollowUpType, Greeting as GreetingType } from '../../types/george';
import { NoticeBanner } from './NoticeBanner';
import { ReceiptsBlock } from './ReceiptsBlock';

/**
 * The failure is quiet and says what it is.
 *
 * Deliberately not a NoticeBanner: a notice is a caveat that qualifies a
 * number, and there is no number here. Nothing in this component may use the
 * approvals colour (UI rule 5) — an unreachable brief needs nobody.
 */
export function GreetingUnavailable() {
  return (
    <p className="text-[14px] leading-relaxed text-george-muted">
      I couldn't reach this morning's brief. Ask me anything and I'll go straight to
      the data.
    </p>
  );
}

/**
 * The obvious next questions, as chips.
 *
 * These are what "ask and I'll run it" has been promising since the greeting
 * shipped. A chip is a QUESTION: clicking it asks George in the ordinary way,
 * so the answer arrives as a normal turn with its narration, its notices and
 * its receipts. Nothing is pre-run, so a chip can never sit on screen showing
 * a figure that has gone stale.
 *
 * Quiet chrome, and nothing here may use the approvals colour (UI rule 5) — a
 * question George is offering to answer needs nobody.
 */
function FollowUps({
  items,
  onAsk,
}: {
  items: FollowUpType[];
  onAsk: (question: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((f) => (
        <button
          key={f.question}
          type="button"
          onClick={() => onAsk(f.question)}
          // The label is the shortcut; the question is what will actually be
          // asked, so it travels on the title rather than being hidden.
          title={f.question}
          className="min-h-touch rounded-full border border-george-line bg-george-paper px-3 py-1.5 text-[12px] text-george-slate hover:border-george-slate hover:text-george-navy"
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export function Greeting({
  greeting,
  onAsk,
}: {
  greeting: GreetingType;
  /** Absent where there is nowhere to ask; the chips are then not offered. */
  onAsk?: (question: string) => void;
}) {
  // The item's own receipts where there is an item; the brief's otherwise.
  const receipts = greeting.item?.receipts ?? greeting.meta;

  return (
    <div className="space-y-3">
      {/* Above the sentence, always. */}
      <NoticeBanner notices={greeting.notices} />

      <p className="text-[15px] leading-relaxed text-george-navy">{greeting.headline}</p>

      <ReceiptsBlock meta={receipts} />

      {/* Below the receipts: the chips are about what to do next, and the
          receipts are about the sentence above them. */}
      {onAsk && <FollowUps items={greeting.follow_ups ?? []} onAsk={onAsk} />}
    </div>
  );
}
