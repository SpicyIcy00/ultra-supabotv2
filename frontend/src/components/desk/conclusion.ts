/**
 * What the figures say, in one sentence — George's reading, beside the
 * evidence it reads.
 *
 * A CHARACTERISATION OF ROWS, CARRYING NO NUMERAL. "Transactions rose while
 * average transaction value fell; transactions moved more" is a statement
 * about figures that are drawn two inches away. Putting the figures back into
 * the sentence is the "prose restates what is already on screen" failure the
 * surface rules forbid, and it is also what made the old reading a paragraph
 * nobody read. `metrics.yaml surface.desk.initiative.explain` records the rule
 * and a test holds the sentence to it.
 *
 * DERIVED, NOT WRITTEN BY THE MODEL. Every word comes from the tool's own
 * `direction` on the rows and from which declared driver moved more in
 * magnitude — the qualitative reading `metrics.yaml investigation` already
 * defines. No share, no attribution, no threshold, and no causal word: a
 * driver moving more is a measured fact, and "caused" is not.
 *
 * WHY THE COMPOSER MAY AUTHOR THIS AT ALL. It is the same warrant
 * `attentionLine` has had since V3: naming what rows establish, in a closed
 * vocabulary, with no figure introduced. George's own prose still arrives
 * from the model and is drawn beneath; this is the line that is true by
 * construction and can therefore lead.
 */
import type { AnatomyPlan, Figure } from './deskCompose';

/** Words for a direction. `flat` is the tool's own word for exactly zero. */
function moved(direction: Figure['direction'], past = true): string {
  if (direction === 'up') return past ? 'rose' : 'rise';
  if (direction === 'down') return past ? 'fell' : 'fall';
  return past ? 'held' : 'hold';
}

function noun(direction: Figure['direction']): string {
  return direction === 'up' ? 'rise' : direction === 'down' ? 'fall' : 'change';
}

/** A driver's label, lowercased for the middle of a sentence. */
function label(figure: Figure): string {
  const text = figure.label ?? '';
  // "Transactions" stays capitalised only at the start; a metric name is not
  // a proper noun.
  return text ? text[0].toLowerCase() + text.slice(1) : 'it';
}

function sentence(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : '';
}

/**
 * The reading of one subject's anatomy, or null when there is nothing a
 * reader could not see at a glance.
 *
 * Four cases, and each says something the figures alone do not:
 *
 *   diverging      the drivers went opposite ways, so one carried the change
 *                  against the other — the most useful thing to say
 *   same, uneven   both went the same way, one further
 *   same, level    both moved together
 *   no drivers     nothing to decompose; the figure speaks for itself
 */
export function conclusionOf(anatomy: AnatomyPlan): string | null {
  const drivers = anatomy.drivers;
  if (drivers.length < 2) return null;
  const [a, b] = drivers;
  if (a.direction === null || b.direction === null) return null;

  const stronger = anatomy.stronger;
  const diverging = (a.direction === 'up' && b.direction === 'down')
    || (a.direction === 'down' && b.direction === 'up');

  if (diverging && stronger !== null) {
    const lead = drivers[stronger];
    const other = drivers[stronger === 0 ? 1 : 0];
    // The one that moved more, against the one that went the other way.
    return sentence(
      `${label(lead)} ${moved(lead.direction)} while ${label(other)} ` +
      `${moved(other.direction)}, and ${label(lead)} moved more — ` +
      `it carried the ${noun(anatomy.headline.direction)}.`,
    );
  }

  if (diverging) {
    // They pulled against each other by the same measured amount; naming a
    // winner would be inventing one.
    return sentence(
      `${label(a)} ${moved(a.direction)} and ${label(b)} ${moved(b.direction)} ` +
      `by about as much, so neither carried the ${noun(anatomy.headline.direction)} on its own.`,
    );
  }

  if (stronger !== null) {
    const lead = drivers[stronger];
    const other = drivers[stronger === 0 ? 1 : 0];
    return sentence(
      `both ${moved(lead.direction)} — ${label(lead)} further than ${label(other)}.`,
    );
  }

  return sentence(`${label(a)} and ${label(b)} ${moved(a.direction)} by about as much.`);
}

/**
 * The lead sentence of George's own prose, and what follows it.
 *
 * HIS WORDS, BRIEFLY. The model's reading is worth having and is not worth a
 * column: the first sentence sits with the figures and the rest opens on
 * request. Split on a sentence end followed by a capital, so a figure like
 * "₱1,234.50" or a date never splits a sentence in half.
 */
export function leadAndRest(prose: string): { lead: string; rest: string } {
  const text = (prose ?? '').trim();
  if (!text) return { lead: '', rest: '' };
  const match = text.match(/^[\s\S]*?[.!?](?=\s+[A-Z“"']|\s*$)/);
  if (!match) return { lead: text, rest: '' };
  return { lead: match[0].trim(), rest: text.slice(match[0].length).trim() };
}
