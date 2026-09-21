/**
 * THE PLAN AS STEPS (P7, narrowed P13). When what he would do is a sequence,
 * the page numbers it — the numeral is the page's, never his. A step opens
 * with a short sentence ("Greenhills first.") and that opening is set in bold.
 *
 * IT SPLITS WHERE HE SPLIT IT, AND NOWHERE ELSE (P13, 2026-09-21).
 *
 * P8 tried to find the steps inside a run-on plan, because his live plan ran
 * as one paragraph and drew a wall of italic nobody reads to the end. The rule
 * was "a short sentence ending in . or : opens a step", and on the next live
 * plan it broke his own sentence in half: *"Third, and this is the one that
 * keeps costing us: a clean stock count. Until the negative counts are fixed…"*
 * became a step called "a clean stock count." Requiring a capital only moved
 * the error — "Walk it today." opens nothing either.
 *
 * A wall of text is his to fix and the tool now asks him to (a blank line per
 * step). A wrong split is the page asserting a structure he did not write, and
 * that is worse than long: the owner's word for it was "all wrong". So the
 * page splits on his blank lines and guesses nothing.
 */

export function planSteps(text: string): string[] {
  const steps = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return steps.length ? steps : [];
}

/**
 * [the short opening sentence, the rest] — or ['', all of it].
 *
 * This one is safe where the splitting was not: it only changes the WEIGHT of
 * an opening inside a paragraph he has already ended, and never where one
 * paragraph stops and the next begins.
 */
export function leadOf(step: string): [string, string] {
  const m = /^(.{3,48}?[.:])\s+([\s\S]+)$/.exec(step);
  return m && m[1].split(/\s+/).length <= 5 ? [m[1], m[2]] : ['', step];
}
