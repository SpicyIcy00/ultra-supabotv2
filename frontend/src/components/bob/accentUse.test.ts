/**
 * UI rule 5, enforced over the source rather than over a review.
 *
 * "One colour means 'needs you'. Reserved for approvals. Nothing else may use
 * it — not errors, not warnings, not emphasis. Its meaning is destroyed by a
 * second use."
 *
 * That rule was written after the first Bob components, and three of them
 * had been spending the colour ever since without anyone noticing: every
 * notice banner in the app, a reconciliation disagreement in the receipts, and
 * a refused tool call. Each one felt urgent, which is exactly the pressure the
 * rule describes — the colour's meaning is destroyed by a second USE, not by a
 * second feeling.
 *
 * A review will not catch the fourth. This test will: any file that references
 * the accent token has to be listed below, with a reason, and adding one is a
 * visible edit in a diff rather than a class name nobody looked twice at.
 *
 * FIVE COLOURS, FROM 2026-09-15 (P2.b). The same scan now runs over the four
 * that say something about a VALUE — `--up`, `--down`, `--flat` and
 * `--bob` — because they had the same hole the accent had before the room
 * was added to this file: `palette.test.ts` bounds what a mark may paint with,
 * and nothing bounded what everything else may. The reasoning for each is with
 * `COLOUR_ALLOWED` below. The accent's rule and this one are not the same
 * rule: the accent means "needs you" and has exactly one use; a data colour
 * means what a tool measured and may be used wherever a tool measured it.
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
const ACCENT = /bob-accent|--accent\b|var\(--accent\)/;

/**
 * The semantic data tokens (Stage 5): `bob-data-up`, `-down`, `-flat`, and
 * whatever real state joins them. A separate family from the accent with a
 * separate rule: they may appear ONLY inside an instrument whose own data
 * declares a direction. Never on a bare figure, never on a plain comparison,
 * never in the shell, never on a page, never in a notice — each of those
 * would be colour saying something the tool did not say.
 */
const DATA = /bob-data-/;

const DATA_ALLOWED: Record<string, string> = {
  // EMPTY SINCE P2S.3(g): Instruments.tsx, the last file allowed a
  // `bob-data-*` token, went with the kept-page renderer. The room's marks
  // paint direction through `paint()` and `wash()` (palette.test.ts).
};

/**
 * The only files that may name the accent, and why.
 *
 * Every entry is a deliberate, recorded exemption. Nothing joins this list
 * without a reason that survives being read out loud.
 */
const ALLOWED: Record<string, string> = {
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
  // HIS MARK, THE ONE EXEMPTION CLAUDE.md UI rule 5 NAMES (P2S.2(d)). It warms
  // in the `need` state — something is waiting on a decision, the same fact
  // the rail's count says — and in no other; a failed turn changes the
  // drawing, never the colour. `alive.dom.test.tsx` holds both.
  'AliveMark.tsx': 'his mark, warm only while something needs you',
};

/* ---------------------------------------------- the other four (P2.b) ----
 *
 * FIVE COLOURS MEAN SOMETHING IN THIS APP, and until today the scan guarded
 * one of them. `palette.test.ts` holds the other four from the INSIDE — a mark
 * may paint with these and nothing else — and nothing at all held them from
 * the outside, so any file in the room could paint a figure green and no test
 * would have an opinion. That is how the room's needs-you badge came to wear
 * `--down`, which is the mistake this whole file exists to catch, one family
 * over.
 *
 *   --up / --down   a direction a tool MEASURED. Only a mark measures one.
 *   --flat          the absence of one: a row nobody emphasised, a baseline.
 *                   The card calls this one "quiet", which is the room's word
 *                   for the weight rather than for the colour; the token is
 *                   `--flat` and it was not renamed, because three files and
 *                   `palette.test.ts` read that name by value and a rename
 *                   would be a word changing, not a meaning.
 *   --bob        his mark — "orange for Bob" (CLAUDE.md), the one hue
 *                   that is an identity rather than a measurement, and the one
 *                   with two jobs: the chrome he speaks through, and the
 *                   emphasised row of a read that declared no direction.
 *
 * The scan reads `var(--x)` and no other form, because that is the only way a
 * file outside `marks.tsx` can reach one: the marks themselves go through
 * `paint()`, which the compiler and `palette.test.ts` already bound.
 */
const DATA_TOKENS = ['up', 'down', 'flat', 'bob'] as const;

const COLOUR_ALLOWED: Record<(typeof DATA_TOKENS)[number], Record<string, string>> = {
  // NOTHING may name them. A direction is measured inside a drawing or it is
  // decoration, and the drawing reaches the colour through `paint()`.
  up: {},
  down: {},
  flat: {
    'marks.tsx': 'the zero line a diverging mark is read against',
    'room.css': 'defines it, and draws the spec bar and the dot that "was"',
    // P2.l, 2026-09-15. A composed mark used to fall back to `var(--hue)` —
    // the TILE's identity — wherever its rows declared no direction, so a
    // chart of one shop's hours drew in that shop's colour. The shell carries
    // no identity now, so there is nothing to inherit: no direction is drawn
    // as no direction.
    'Spec.tsx': 'a composed mark whose rows declare no direction',
  },
  bob: {
    'room.css': 'defines it, and the chrome he speaks through — links, focus, the caveat rule',
    'Noticed.tsx': 'the label on what he noticed unasked: his voice, not a measurement',
    'ObjectPanel.tsx': 'the one line of his in an opened object',
    // Room.tsx left this list on 2026-09-15 (P2.c): the composer became a
    // component of its own and the edge it wore went with the stylesheet
    // rule that draws it. One fewer file naming a colour, which is the
    // direction this list is supposed to move in.
  },
};

/* ------------------------------------------------- identity (P2.l) ----
 *
 * THE SIXTH COLOUR WAS THE ONE NOBODY WAS COUNTING, and it was the biggest
 * thing on the screen. A tile wore its object's own hue — `identity.ts`, seven
 * shops named by hand — on its border and in the wash under it, and the wash's
 * brightness was |change| on top of that. So colour meant four things at once,
 * and three of the seven shop hues sat on the three semantic colours: OPUS
 * amber like Bob's mark and the approvals accent, Magnolia rose like
 * `--down`, Greenhills green like `--up`. The owner looked at the live build
 * and asked *"what do the colors mean now? does this make sense?"*.
 *
 * P1.e had already answered the same complaint one layer in — colour is
 * direction, not identity, INSIDE a mark — and this file's `COLOUR_ALLOWED`
 * has guarded that ever since. What it did not guard was the SHELL, which
 * `palette.test.ts` explicitly exempted: "identity keeps its hue where
 * identity is the point — the tile's edge and wash". P2.l took the exemption
 * away, and this is where the absence is held.
 *
 * ONE PLACE IS LEFT, and it is the one where identity is genuinely the point:
 * an OPENED object, alone on screen, named in its own heading. Everything else
 * reads its name off a title and a row label, which it always could.
 */
const IDENTITY = /\bhueFor\b|var\(\s*--hue\s*\)|'--hue'|--c-\d|'--sw-(dark|light)'|\bslotColour\b|\btoned\b|var\(\s*--sw-(dark|light)\s*\)/;

/*
 * AND SINCE P2S.2(e), THE SWATCH. The owner asked for identity back — *"ok
 * implement that"*, after the research — on the condition that it never rides
 * the mark: *"the line if its up or down should be green or red … not the same
 * color as the stores"*. So identity has exactly one new home, the 8px dot
 * before a name (`swatch.tsx`), and every other file reaches it only by
 * rendering that component, which names no colour.
 */
const IDENTITY_ALLOWED: Record<string, string> = {
  // Where a store's slot is worked out from the served retail order. No store
  // is named there; naming a slot is not spending one.
  'identity.ts': 'the mapping itself',
  // THE SWATCH — the one element that wears a categorical hue, beside a name.
  'swatch.tsx': 'the swatch, and the opened object rule in the same hue',
  // The ONE caller: the wrapper around an opened object's panel.
  'marks.tsx': 'sets the hue on an opened object, and nowhere else',
  // Declares the token, and draws the one rule that reads it (`.r-obj`).
  'room.css': 'declares the eight slots and --hue; draws the swatch and the opened object rule',
};

/** Comments out, so a token NAMED in a docstring is not a token USED. */
function noComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The four directories this file guards, each with its source files. */
function DIRS(): [string, string[]][] {
  return [
    [GEORGE_DIR, sourceFiles(GEORGE_DIR)],
    [PAGES_DIR, sourceFiles(PAGES_DIR)],
    [SHELL_DIR, sourceFiles(SHELL_DIR)],
    [ROOM_DIR, sourceFiles(ROOM_DIR)],
  ];
}

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

  it('is not used by a caveat, on any surface', () => {
    // The one component every surface renders a caveat through — the room's
    // `Caveats`, since NoticeBanner went with the kept-page renderer
    // (P2S.3(g)). If it wears the colour, every notice in the app does.
    const source = readFileSync(join(ROOM_DIR, 'tiles.tsx'), 'utf8');
    expect(ACCENT.test(source)).toBe(false);
  });

  it('is not used to mark a refused tool call', () => {
    // A refusal is the tool declining to produce a misleading number — a real
    // answer, and nothing anyone has to act on.
    // ToolCallRow.tsx went with the old river in P2S.1; the room draws a
    // declined read in its work trail.
    const source = readFileSync(join(ROOM_DIR, 'Working.tsx'), 'utf8');
    expect(ACCENT.test(source)).toBe(false);
  });

  it('is not used on a kept page or its receipts', () => {
    // ReceiptsBlock went with the kept-page renderer (P2S.3(g)); a kept page is
    // drawn by the room now, and its receipts are the room's.
    expect(ACCENT.test(readFileSync(join(ROOM_DIR, 'KeptPage.tsx'), 'utf8'))).toBe(false);
    expect(ACCENT.test(readFileSync(join(ROOM_DIR, 'marks.tsx'), 'utf8'))).toBe(false);
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
    expect(DATA.test(readFileSync(join(ROOM_DIR, 'tiles.tsx'), 'utf8'))).toBe(false);
    expect(DATA.test(readFileSync(join(ROOM_DIR, 'KeptPage.tsx'), 'utf8'))).toBe(false);
    expect(DATA.test(readFileSync(join(ROOM_DIR, 'Working.tsx'), 'utf8'))).toBe(false);
  });

  it('never lets the accent onto an instrument or the spine', () => {
    expect(ACCENT.test(readFileSync(join(ROOM_DIR, 'shapes.tsx'), 'utf8'))).toBe(false);
    // The spine (WorkSpine.tsx) went with the old river in P2S.1; the room's
    // account of the work is Working.tsx.
    expect(ACCENT.test(readFileSync(join(ROOM_DIR, 'Working.tsx'), 'utf8'))).toBe(false);
  });

  it('keeps the four data colours where a value chose them', () => {
    const offenders: string[] = [];
    for (const [dir, files] of DIRS()) {
      for (const name of files) {
        const source = noComments(readFileSync(join(dir, name), 'utf8'));
        for (const token of DATA_TOKENS) {
          if (!new RegExp(`var\\(\\s*--${token}\\s*\\)`).test(source)) continue;
          if (!(name in COLOUR_ALLOWED[token])) offenders.push(`${token}: ${name}`);
        }
      }
    }
    expect(
      offenders,
      `These files name a data colour with no recorded reason. --up and --down ` +
        `are a direction a tool MEASURED, --flat is the absence of one, and ` +
        `--bob is his mark. A file that paints with one is saying something ` +
        `about a value; if the value did not say it, the colour is a decoration.`,
    ).toEqual([]);
  });

  it('lets no drawing colour reach a surface that draws no data', () => {
    // The narrow claim, stated as itself: --up and --down exist to say which
    // way a measured number went, and a mark is the only thing that measures
    // one. `marks.tsx` reaches them through `paint()`, never by name, which is
    // what `palette.test.ts` holds from the inside; from out here, NOTHING
    // names them at all.
    expect(Object.keys(COLOUR_ALLOWED.up)).toEqual([]);
    expect(Object.keys(COLOUR_ALLOWED.down)).toEqual([]);
  });

  it('lets no identity colour onto the shell, or anywhere else it is not the point', () => {
    const offenders: string[] = [];
    for (const [dir, files] of DIRS()) {
      for (const name of files) {
        const source = noComments(readFileSync(join(dir, name), 'utf8'));
        if (!IDENTITY.test(source)) continue;
        if (!(name in IDENTITY_ALLOWED)) offenders.push(name);
      }
    }
    expect(
      offenders,
      `These files reach for an object's IDENTITY colour. A tile says what it ` +
        `is about in its title and its rows; a hue that decodes a name those ` +
        `already give is colour spent on nothing, and it collides with the ` +
        `three that mean a direction. The one place left is an opened object.`,
    ).toEqual([]);
  });

  it('keeps the shell itself free of every colour that means something', () => {
    // The tile frame, stated as itself. `tiles.tsx` draws the thing every
    // object sits in; after P2.l it names no identity, no direction and no
    // magnitude — the four `--i`/`--hue`/`change`/`solid` channels are gone —
    // and the only colour left on a tile is inside a mark. `directionRgb` is
    // the delta PILL, which is a figure's own sign and is drawn on the mark's
    // side of that line.
    const shell = noComments(readFileSync(join(ROOM_DIR, 'tiles.tsx'), 'utf8'));
    expect(IDENTITY.test(shell), 'the shell names an identity colour').toBe(false);
    expect(shell).not.toMatch(/'--i'/);
    expect(shell).not.toMatch(/r-tile--solid/);
  });

  it('keeps the exemption list short enough to read', () => {
    // Not a style preference: a long list of exemptions IS a second use, so
    // this number going up should require an argument rather than a commit.
    //
    // Raised to 5 when the river arrived and returned to 4 the same day, when
    // Rails.tsx — the old approval rail — was deleted with the old Bob
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
