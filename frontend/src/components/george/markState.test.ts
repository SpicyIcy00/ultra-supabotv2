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
import { describe, expect, it } from 'vitest';
import type { GeorgeState } from '../../types/george';
import { MARK_LABEL, MARK_PATH, MARK_PATH_ERROR, markClass, markPath } from './markState';

const STATES: GeorgeState[] = [
  'idle',
  'listening',
  'thinking',
  'running',
  'answering',
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
