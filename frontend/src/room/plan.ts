/**
 * THE PLAN AS STEPS (P7). When he wrote what he would do as more than one
 * paragraph it is a sequence, and the page numbers it — the numeral is the
 * page's, never his. A paragraph that opens with a short sentence
 * ("Greenhills first.") leads with it, in bold.
 */
export function planSteps(text: string): string[] {
  return text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}

/** [the short opening sentence, the rest] — or ['', all of it]. */
export function leadOf(step: string): [string, string] {
  const m = /^(.{3,48}?[.:])\s+([\s\S]+)$/.exec(step);
  return m && m[1].split(/\s+/).length <= 5 ? [m[1], m[2]] : ['', step];
}
