/**
 * THE PLAN AS STEPS (P7, widened P8). When what he would do is a sequence, the
 * page numbers it — the numeral is the page's, never his. A step opens with a
 * short sentence ("Greenhills first.") and that opening is set in bold.
 *
 * HE DOES NOT ALWAYS LEAVE A BLANK LINE (P8, 2026-09-21). His live plan ran
 * "Greenhills first. ... Magnolia second. ... Then the exports. ... And the
 * standing repair: ..." as ONE paragraph, and the page drew a wall of italic
 * nobody would read to the end. The steps were there in his own words; only
 * the line breaks were missing. So a step also begins wherever a short
 * opening sentence begins one — the same sentence the step then leads with,
 * which is why the two rules are in one file and share `leadOf`.
 *
 * Nothing here rewrites a word: every character of his text lands in exactly
 * one step, in his order (`planSteps(t).join(' ')` is his text, whitespace
 * aside), which is what `plan.test.ts` holds.
 */

/** A sentence short enough to be a step's label rather than its argument. */
const LEAD = /^(.{3,48}?[.:])(\s+|$)/;

function isLead(text: string): boolean {
  const m = LEAD.exec(text.trim());
  return Boolean(m) && (m as RegExpExecArray)[1].split(/\s+/).length <= 5;
}

export function planSteps(text: string): string[] {
  const paras = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  // Blank lines, where he left them: that is the sequence, said plainly.
  if (paras.length > 1) return paras;

  const whole = (paras[0] ?? '').trim();
  if (!whole) return [];
  // Otherwise, his own openings. A sentence is kept whole with the one before
  // it unless it OPENS a step, and a step needs something after its opening,
  // so a short sentence alone at the end is not a step of its own.
  const sentences = whole.split(/(?<=[.!?:])\s+/).filter(Boolean);
  const steps: string[] = [];
  for (const said of sentences) {
    if (steps.length && isLead(said)) steps.push(said);
    else if (!steps.length) steps.push(said);
    else steps[steps.length - 1] = `${steps[steps.length - 1]} ${said}`;
  }
  // A last "step" that never got its body is the tail of the one before it.
  if (steps.length > 1 && isLead(steps[steps.length - 1])
      && steps[steps.length - 1] === steps[steps.length - 1].trim()
      && leadOf(steps[steps.length - 1])[1] === steps[steps.length - 1]) {
    const tail = steps.pop() as string;
    steps[steps.length - 1] = `${steps[steps.length - 1]} ${tail}`;
  }
  return steps.length > 1 ? steps : [whole];
}

/** [the short opening sentence, the rest] — or ['', all of it]. */
export function leadOf(step: string): [string, string] {
  const m = /^(.{3,48}?[.:])\s+([\s\S]+)$/.exec(step);
  return m && m[1].split(/\s+/).length <= 5 ? [m[1], m[2]] : ['', step];
}
