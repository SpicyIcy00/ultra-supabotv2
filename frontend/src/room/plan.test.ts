/**
 * THE PLAN, AS THE PAGE BREAKS IT (P7, P8).
 */
import { describe, expect, it } from 'vitest';
import { leadOf, planSteps } from './plan';

/* ---------------------------------------------------------------------------
 * IT SPLITS WHERE HE SPLIT IT (P13, 2026-09-21)
 *
 * P8 tried to find the steps inside a run-on plan. On the next live plan the
 * rule broke his own sentence in half — "Third, and this is the one that keeps
 * costing us: a clean stock count. Until the negative counts are fixed…" became
 * a step called "a clean stock count." — and the owner's word for the page was
 * "all wrong". A wall of text is his to fix and the tool asks him to; a wrong
 * split is the page asserting a structure he did not write.
 * ------------------------------------------------------------------------ */

const RUN_ON = 'Greenhills first. The kiamoy money moved between lines rather than leaving. '
  + 'Magnolia second. It is the weakest single-day reading of any shop. '
  + 'Third, and this is the one that keeps costing us: a clean stock count. '
  + 'Until the negative counts are fixed every supply explanation is unchecked.';

describe('a plan he wrote as one paragraph', () => {
  it('is one step, because he wrote one', () => {
    expect(planSteps(RUN_ON)).toEqual([RUN_ON]);
  });

  it('never breaks a sentence of his in half', () => {
    expect(planSteps(RUN_ON).some((s) => s.startsWith('a clean stock count'))).toBe(false);
  });

  it('splits where he left a blank line, and changes not one word', () => {
    const his = 'Greenhills first. Ask them.\n\nMagnolia second. Walk it.';
    expect(planSteps(his)).toHaveLength(2);
    expect(planSteps(his).join(' ')).toBe('Greenhills first. Ask them. Magnolia second. Walk it.');
  });

  it('draws nothing for nothing', () => {
    expect(planSteps('')).toEqual([]);
    expect(planSteps('   \n\n  ')).toEqual([]);
  });

  it('still sets a short opening in weight, which is safe', () => {
    expect(leadOf('Greenhills first. Ask the manager.')).toEqual(
      ['Greenhills first.', 'Ask the manager.']);
    expect(leadOf('The stock record cannot answer it, so a hand count is the only way.')[0]).toBe('');
  });
});
