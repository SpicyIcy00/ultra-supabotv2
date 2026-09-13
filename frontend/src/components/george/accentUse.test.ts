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
// it became "/". It is now the surface a person spends the day on, it draws
// more colour than anything else in the app, and it was outside this guard
// entirely — which is how its needs-you badge came to be painted in `--down`,
// the DECLINE colour, so three decisions waiting read as three things falling.
const ROOM_DIR = join(__dirname, '..', '..', 'room');

/** The accent token, in every form Tailwind lets it be written. */
const ACCENT = /george-accent|--accent|var\(--accent\)/;

/**
 * The semantic data tokens (Stage 5): `george-data-up`, `-down`, `-flat`, and
 * whatever real state joins them. A separate family from the accent with a
 * separate rule: they may appear ONLY inside an instrument whose own data
 * declares a direction. Never on a bare figure, never on a plain comparison,
 * never in the shell, never on a page, never in a notice — each of those
 * would be colour saying something the tool did not say.
 */
const DATA = /george-data-/;

const DATA_ALLOWED: Record<string, string> = {
  // Diverging bars in a ranking by change and in a driver split. The bar
  // already diverges from a drawn zero line with its signed figure printed
  // beside it; colour reinforces a direction the tool measured.
  'Instruments.tsx': 'diverging bars whose data declares direction',
  // Field.tsx and Anatomy.tsx left this list on 2026-09-12 with the desk they
  // belonged to. The room draws the same diverging forms through Instruments.
};

/**
 * The only files that may name the accent, and why.
 *
 * Every entry is a deliberate, recorded exemption. Nothing joins this list
 * without a reason that survives being read out loud.
 */
const ALLOWED: Record<string, string> = {
  // The needs-you count above the river, shown only for a loaded, non-zero
  // count (UI rules 5 and 8).
  'StatusBand.tsx': 'the needs-you count on the status band',
  // The approval queue itself, and Promote: the one accent-coloured ACTION
  // in the app, because this is what the colour is for.
  'InboxPage.tsx': 'the approval queue and its one decision — the reserved use',
  // The room's rail carries the same count, for a loaded and non-zero result
  // only. The room replaced the desk as "/" on 2026-09-11; this is the same
  // fact in the chrome people actually use, not a new meaning.
  'Rail.tsx': 'the needs-you count on the room rail',
  // Where the room DEFINES the token. One value for the one meaning, so a
  // second chrome cannot quietly invent a second approvals colour.
  'room.css': 'the room defines the reserved token here',
};

/**
 * Every source file in a directory — components and modules, never tests.
 *
 * A test that asserts a component does NOT use the accent has to name the
 * token to do it, and a scan that counted those would report the guard
 * against the rule as a breach of it. `.test.ts` was already excluded; the
 * DOM suites are `.test.tsx`, which the old pattern let through.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile()
      // CSS is scanned too (2026-09-11). The room carries its palette in a
      // stylesheet rather than in Tailwind classes, so a scan that read only
      // TypeScript could not see where it defines — or misuses — the one
      // reserved colour.
      && /\.(tsx?|css)$/.test(e.name)
      && !/\.test\.tsx?$/.test(e.name))
    .map((e) => e.name);
}

describe('UI rule 5 — one colour means "needs you"', () => {
  it('is used only by files that have a recorded reason', () => {
    const offenders: string[] = [];

    for (const [dir, files] of [
      [GEORGE_DIR, sourceFiles(GEORGE_DIR)],
      [PAGES_DIR, sourceFiles(PAGES_DIR)],
      [SHELL_DIR, sourceFiles(SHELL_DIR)],
      [ROOM_DIR, sourceFiles(ROOM_DIR)],
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

  it('confines the data tokens to instruments whose data declares direction', () => {
    const offenders: string[] = [];
    for (const [dir, files] of [
      [GEORGE_DIR, sourceFiles(GEORGE_DIR)],
      [PAGES_DIR, sourceFiles(PAGES_DIR)],
      [SHELL_DIR, sourceFiles(SHELL_DIR)],
      [ROOM_DIR, sourceFiles(ROOM_DIR)],
    ] as [string, string[]][]) {
      for (const name of files) {
        const source = readFileSync(join(dir, name), 'utf8');
        if (!DATA.test(source)) continue;
        if (!(name in DATA_ALLOWED)) offenders.push(name);
      }
    }
    expect(
      offenders,
      `These files use a data-direction token outside an instrument. A bare ` +
        `figure, a plain comparison, a notice, the shell and a page carry no ` +
        `direction of their own; colour there would be saying something the ` +
        `tool did not say.`,
    ).toEqual([]);
  });

  it('never lets a data token onto a bare figure or a plain comparison', () => {
    // The narrowing recorded in the V2 proposal: "no colour carries the
    // direction" stays true for a single figure. A fall in sales is
    // information, and whether it is bad depends on the question.
    expect(DATA.test(readFileSync(join(GEORGE_DIR, 'ResultBlocks.tsx'), 'utf8'))).toBe(false);
    expect(DATA.test(readFileSync(join(GEORGE_DIR, 'NoticeBanner.tsx'), 'utf8'))).toBe(false);
    expect(DATA.test(readFileSync(join(GEORGE_DIR, 'WorkSpine.tsx'), 'utf8'))).toBe(false);
  });

  it('never lets the accent onto an instrument or the spine', () => {
    expect(ACCENT.test(readFileSync(join(GEORGE_DIR, 'Instruments.tsx'), 'utf8'))).toBe(false);
    expect(ACCENT.test(readFileSync(join(GEORGE_DIR, 'WorkSpine.tsx'), 'utf8'))).toBe(false);
  });

  it('keeps the exemption list short enough to read', () => {
    // Not a style preference: a long list of exemptions IS a second use, so
    // this number going up should require an argument rather than a commit.
    //
    // Raised to 5 when the river arrived and returned to 4 the same day, when
    // Rails.tsx — the old approval rail — was deleted with the old George
    // page. Held at 4 on 2026-09-07 when the shell arrived: PostCard's dead
    // branch and the drawer left, the shell's Inbox count and the Inbox page
    // took their places.
    //
    // Five on 2026-09-09, with the desk, and this is the one increase that
    // has been argued rather than absorbed: the desk's line carries the count
    // for the surface a person lives on, and the shell's rail still carries
    // it for the three rooms.
    //
    // SEVEN, from 2026-09-11, and the two additions are one fact and one
    // definition rather than two new meanings. The ROOM replaced the desk as
    // "/" and its rail carries the same count; room.css is where the room
    // DEFINES the token, which is listed so a second chrome cannot quietly
    // invent a second approvals colour with a different value.
    //
    // This number goes DOWN as chromes are retired, never up for a new
    // feeling. If somebody wants one more, the honest move is to ask whether
    // the colour still means one thing.
    //
    // FOUR, from 2026-09-12. The desk and the shell were deleted as dead
    // code, and the mark with them, so three entries left at once without a
    // single decision being reversed: the room is the only chrome now, and
    // the count it carries is the same fact the other three carried.
    expect(Object.keys(ALLOWED).length).toBeLessThanOrEqual(4);
  });
});
