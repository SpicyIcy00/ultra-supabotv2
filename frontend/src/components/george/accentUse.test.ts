/**
 * UI rule 5, enforced over the source rather than over a review.
 *
 * "One colour means 'needs you'. Reserved for approvals. Nothing else may use
 * it — not errors, not warnings, not emphasis. Its meaning is destroyed by a
 * second use."
 *
 * That rule was written after the first George components, and three of them
 * had been spending the colour ever since without anyone noticing: every
 * notice banner in the app, a reconciliation disagreement in the receipts, and
 * a refused tool call. Each one felt urgent, which is exactly the pressure the
 * rule describes — the colour's meaning is destroyed by a second USE, not by a
 * second feeling.
 *
 * A review will not catch the fourth. This test will: any file that references
 * the accent token has to be listed below, with a reason, and adding one is a
 * visible edit in a diff rather than a class name nobody looked twice at.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const GEORGE_DIR = join(__dirname);
const PAGES_DIR = join(__dirname, '..', '..', 'pages');
const SHELL_DIR = join(__dirname, '..', 'shell');

/** The accent token, in every form Tailwind lets it be written. */
const ACCENT = /george-accent/;

/**
 * The only files that may name the accent, and why.
 *
 * Every entry is a deliberate, recorded exemption. Nothing joins this list
 * without a reason that survives being read out loud.
 */
const ALLOWED: Record<string, string> = {
  // The brand mark. The bounded exemption recorded in CLAUDE.md: it is static
  // presence, it asks for nothing, and its error state changes the DRAWING and
  // never the hue.
  'ReactiveMark.tsx': 'the mark — CLAUDE.md UI rule 5, amended 2026-09-04',
  // The needs-you count above the river, shown only for a loaded, non-zero
  // count (UI rules 5 and 8).
  'StatusBand.tsx': 'the needs-you count on the status band',
  // The same count beside "Inbox" in the shell's navigation — the badge
  // beside the mark that the 2026-09-04 amendment describes.
  'GeorgeShell.tsx': 'the needs-you count beside Inbox',
  // The approval queue itself, and Promote: the one accent-coloured ACTION
  // in the app, because this is what the colour is for.
  'InboxPage.tsx': 'the approval queue and its one decision — the reserved use',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts'))
    .map((e) => e.name);
}

describe('UI rule 5 — one colour means "needs you"', () => {
  it('is used only by files that have a recorded reason', () => {
    const offenders: string[] = [];

    for (const [dir, files] of [
      [GEORGE_DIR, sourceFiles(GEORGE_DIR)],
      [PAGES_DIR, sourceFiles(PAGES_DIR)],
      [SHELL_DIR, sourceFiles(SHELL_DIR)],
    ] as [string, string[]][]) {
      for (const name of files) {
        const source = readFileSync(join(dir, name), 'utf8');
        if (!ACCENT.test(source)) continue;
        if (!(name in ALLOWED)) offenders.push(name);
      }
    }

    expect(
      offenders,
      `These files use the approvals colour without a recorded reason. A notice, ` +
        `a failed run, a refusal and a stale tile all feel urgent — none of them ` +
        `is an approval. Either use navy/slate, or add the file to ALLOWED with ` +
        `a reason.`,
    ).toEqual([]);
  });

  it('is not used by the notice banner, on any surface', () => {
    // The one component every surface renders a caveat through. If it wears
    // the colour, every notice in the app does.
    const source = readFileSync(join(GEORGE_DIR, 'NoticeBanner.tsx'), 'utf8');
    expect(ACCENT.test(source)).toBe(false);
  });

  it('is not used to mark a refused tool call', () => {
    // A refusal is the tool declining to produce a misleading number — a real
    // answer, and nothing anyone has to act on.
    const source = readFileSync(join(GEORGE_DIR, 'ToolCallRow.tsx'), 'utf8');
    expect(ACCENT.test(source)).toBe(false);
  });

  it('is not used to mark measures disagreeing', () => {
    const source = readFileSync(join(GEORGE_DIR, 'ReceiptsBlock.tsx'), 'utf8');
    expect(ACCENT.test(source)).toBe(false);
  });

  it('keeps the exemption list short enough to read', () => {
    // Not a style preference: a long list of exemptions IS a second use, so
    // this number going up should require an argument rather than a commit.
    //
    // Raised to 5 when the river arrived and returned to 4 the same day, when
    // Rails.tsx — the old approval rail — was deleted with the old George
    // page. Held at 4 on 2026-09-07 when the shell arrived: PostCard's dead
    // branch and the drawer left, the shell's Inbox count and the Inbox page
    // took their places. If somebody wants a fifth, the honest move is to
    // ask whether the colour still means one thing.
    expect(Object.keys(ALLOWED).length).toBeLessThanOrEqual(4);
  });
});
