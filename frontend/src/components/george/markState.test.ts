/**
 * The mark's six states.
 *
 * Pure mapping, no DOM — same reasoning as the shape suite: what can go wrong
 * silently is the DECISION each state makes, not the pixels. Two of those
 * decisions are rules from CLAUDE.md rather than preferences, and they are
 * asserted here so a later edit has to break a test to break the rule:
 *
 *   - error must not add orange (UI rule 5 amendment), and
 *   - error is the only state that changes the drawing.
 *
 * The CSS class names are the contract with index.css. If a class is renamed
 * in one place and not the other the mark silently stops animating, which is
 * exactly the kind of failure nobody notices.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GeorgeState } from '../../types/george';
import {
  MARK_LABEL,
  MARK_PATH,
  MARK_PATH_ERROR,
  markClass,
  markDetail,
  markPath,
} from './markState';

const STATES: GeorgeState[] = [
  'idle',
  'listening',
  'thinking',
  'running',
  'answering',
  'building',
  'complete',
  'error',
];

describe('every state', () => {
  it('has a class, a label and a drawing', () => {
    for (const s of STATES) {
      expect(markClass(s)).toBe(`george-mark george-mark--${s}`);
      expect(MARK_LABEL[s]).toBeTruthy();
      expect(markPath(s).startsWith('M ')).toBe(true);
    }
  });

  it('is distinct from every other state', () => {
    const classes = STATES.map(markClass);
    expect(new Set(classes).size).toBe(STATES.length);
  });

  it('keeps the base class, so the transform origin always applies', () => {
    // index.css pins transform-box/origin on .george-mark. A state class that
    // dropped it would rotate the mark about the wrong point.
    for (const s of STATES) expect(markClass(s).split(' ')).toContain('george-mark');
  });
});

describe('the drawing', () => {
  it('is the same for every state except error', () => {
    for (const s of STATES.filter((x) => x !== 'error')) {
      expect(markPath(s)).toBe(MARK_PATH);
    }
    expect(markPath('error')).toBe(MARK_PATH_ERROR);
  });

  it('gaps a petal in error rather than redrawing the mark', () => {
    // The error mark is the resting mark plus one knocked-out slot. If it ever
    // stops being a superset, the two drawings have drifted apart.
    expect(MARK_PATH_ERROR.startsWith(MARK_PATH)).toBe(true);
    expect(MARK_PATH_ERROR.length).toBeGreaterThan(MARK_PATH.length);
  });

  it('is one closed path with knocked-out holes, not a painted stack', () => {
    // Holes are subpaths of the same path; several closed subpaths, one fill.
    // A painted knockout would need its own colour and would be wrong on the
    // navy avatar chip.
    expect(MARK_PATH.match(/Z/g)!.length).toBeGreaterThan(1);
  });
});

describe('UI rule 5 — orange means needs-you, and the mark is the one exemption', () => {
  it('names no colour anywhere: the mark inherits currentColor', () => {
    // A hardcoded fill would defeat both the accent-on-cream mark and the
    // cream-on-navy avatar, which are the same path.
    for (const p of [MARK_PATH, MARK_PATH_ERROR]) {
      expect(p).not.toMatch(/#|rgb|orange|currentColor/i);
    }
  });

  it('does not let error add or intensify orange — it dims and gaps only', () => {
    // The class carries no colour of its own; index.css gives error opacity
    // 0.45 and nothing else. Encoded here because it is a rule, not a taste.
    expect(markClass('error')).toBe('george-mark george-mark--error');
    expect(markPath('error')).not.toBe(MARK_PATH);
  });
});

describe('markDetail — George narrating, in the first person', () => {
  it('names the tool that is running rather than the state', () => {
    // "I'm checking purchasing…" is the thing that is happening; "Reading the
    // data — get_purchasing" was the log line for it.
    expect(markDetail('running', ['get_purchasing'])).toBe("I'm checking purchasing…");
  });

  it('speaks in the first person', () => {
    for (const tools of [['get_sales'], ['get_sales', 'get_stock']]) {
      expect(markDetail('running', tools).startsWith("I'm ")).toBe(true);
    }
  });

  it('falls back to the state label the instant before a tool_call arrives', () => {
    // running with nothing in flight is the gap between the model deciding to
    // call and the frame landing. It must still say something true.
    expect(markDetail('running', [])).toBe(MARK_LABEL.running);
  });

  it('says what came back once a result lands and nothing is in flight', () => {
    // The instant the line used to fall silent for.
    expect(markDetail('running', [], { tool: 'get_purchasing', rowCount: 14 }))
      .toBe('Purchasing came back — 14 rows');
  });

  it('prefers a call in flight over a result already in', () => {
    // Both are true; the one still happening is the more useful.
    expect(markDetail('running', ['get_stock'], { tool: 'get_sales', rowCount: 7 }))
      .toBe("I'm counting stock…");
  });

  it('narrates a result while thinking, because the turn is not over', () => {
    expect(markDetail('thinking', [], { tool: 'get_sales', rowCount: 7 }))
      .toBe('Sales came back — 7 rows');
  });

  it('goes back to the state label once the answer begins', () => {
    // By then the answer is the narration; a stale "came back" line would
    // describe work that is finished.
    for (const s of ['answering', 'idle', 'error'] as const) {
      expect(markDetail(s, [], { tool: 'get_sales', rowCount: 7 })).toBe(MARK_LABEL[s]);
    }
  });

  it('uses the state label wherever no tool is involved', () => {
    for (const s of STATES.filter((x) => x !== 'running')) {
      // Even if a stale tool list is passed: a tool is not running in these.
      expect(markDetail(s, ['get_sales'])).toBe(MARK_LABEL[s]);
    }
  });

  it('always says something', () => {
    for (const s of STATES) expect(markDetail(s)).toBeTruthy();
  });
});

/**
 * The state classes are a contract with index.css, and the contract is only
 * real if something checks both ends. A state added here with no rule there
 * renders as a motionless mark that looks identical to idle — which is the
 * app claiming to be at rest while a turn runs.
 */
describe('index.css holds up its end', () => {
  const css = readFileSync(join(__dirname, '..', '..', 'index.css'), 'utf8');

  it('defines a rule for every state the mark can be in', () => {
    for (const s of STATES) {
      expect(css, `no .george-mark--${s} rule in index.css`).toContain(`.george-mark--${s}`);
    }
  });

  it('respects reduced motion for every state that would otherwise loop', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const s of STATES.filter((x) => x !== 'idle' && x !== 'error')) {
      expect(reduced, `.george-mark--${s} is not answered under reduced motion`).toContain(
        `.george-mark--${s}`,
      );
    }
  });

  it('adds no colour in any state — the amendment allows form, never hue', () => {
    // Every state rule is animation and opacity. A `color:` or a `fill:`
    // arriving here is orange learning to shout, which is the failure UI
    // rule 5's mark exemption is bounded against.
    const rules = css.match(/\.george-mark--\w+\s*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThanOrEqual(STATES.length);
    for (const rule of rules) {
      expect(rule).not.toMatch(/(^|[^-])color\s*:/);
      expect(rule).not.toMatch(/fill\s*:/);
    }
  });
});
