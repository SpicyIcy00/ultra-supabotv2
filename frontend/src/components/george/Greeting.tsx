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
import type { Greeting as GreetingType } from '../../types/george';
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

export function Greeting({ greeting }: { greeting: GreetingType }) {
  // The item's own receipts where there is an item; the brief's otherwise.
  const receipts = greeting.item?.receipts ?? greeting.meta;

  return (
    <div className="space-y-3">
      {/* Above the sentence, always. */}
      <NoticeBanner notices={greeting.notices} />

      <p className="text-[15px] leading-relaxed text-george-navy">{greeting.headline}</p>

      <ReceiptsBlock meta={receipts} />
    </div>
  );
}
