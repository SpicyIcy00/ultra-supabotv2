/**
 * THE OFFERS NO ROW COULD CARRY, at the foot beside `next`.
 *
 * Two kinds land here, and they are drawn the same because a reader does not
 * need to know the difference: an offer Bob made about the ANSWER rather
 * than about one row (it named no target), and one he aimed at a row the board
 * did not end up drawing — a read shown as a line chart, a tile the person
 * folded away. `actions.placement` decides both halves in one pass, so an
 * offer is drawn exactly once and never nowhere.
 *
 * WHY IT IS HERE AND NOT UNDER THE READING. `next` is the one sentence about
 * what to do, and it is drawn last, under the evidence, because that is the
 * order it is read in: the figures, then what to do about them. An offer is
 * the same sentence with a button on it, so it belongs in the same place.
 *
 * NO ACCENT, EVER (UI rule 5). One colour means "needs you" and it means
 * approvals. A suggestion is not an approval — nobody is blocked on it — and
 * dressing it in the same colour is how the one signal stops meaning anything.
 */
import { useState } from 'react';
import type { ActionOffer } from '../types/bob';
import { Offer, type TileActions } from './tiles';
import { callOf, dimensionOf, rowsOf, type AnswerTurn } from './data';
import { ObjectPanel, kindOf } from './ObjectPanel';

export function FootOffers({ offers, answers, on }: {
  offers: ActionOffer[];
  /** The turns, so an offer can resolve what KIND of thing its target is. */
  answers: AnswerTurn[];
  on: TileActions;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  if (!offers.length) return null;

  /**
   * WHAT KIND OF THING THE TARGET IS, off the rows of the read the offer
   * named — never guessed from the word. A product called "Rockwell Crackers"
   * is a product, and opening a SHOP of that name would open nothing.
   */
  const dimensionFor = (a: ActionOffer) => {
    if (!a.target) return null;
    const turn = answers[answers.length - 1];
    if (!turn) return null;
    return dimensionOf(rowsOf(callOf(turn, a.seq)), a.target);
  };

  const take = (a: ActionOffer) => {
    if (!a.target) return;
    if (a.act === 'why') on.why(a.target, dimensionFor(a));
    else if (a.act === 'open') setRevealed((r) => (r === a.target ? null : a.target));
  };

  const openedKind = revealed
    ? kindOf(dimensionFor(offers.find((a) => a.target === revealed) as ActionOffer))
    : null;

  return (
    <>
      <div className="r-foot-offers">
        {offers.map((a) => (
          <Offer key={`${a.act}:${a.seq}:${a.target ?? ''}`} offer={a} onTake={take} />
        ))}
      </div>
      {revealed && openedKind && (
        <ObjectPanel kind={openedKind} name={revealed} />
      )}
    </>
  );
}
