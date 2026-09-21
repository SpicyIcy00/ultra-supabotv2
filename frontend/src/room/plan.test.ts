/**
 * THE PLAN, AS THE PAGE BREAKS IT (P7, P8).
 */
import { describe, expect, it } from 'vitest';
import { leadOf, planSteps } from './plan';

/* ---------------------------------------------------------------------------
 * HE DOES NOT ALWAYS LEAVE A BLANK LINE (P8, 2026-09-21)
 *
 * His live plan of 15:05 ran as one paragraph and the page drew a wall of
 * italic nobody reads to the end. The steps were in his own words already.
 * ------------------------------------------------------------------------ */

const RUN_ON = 'Greenhills first. The kiamoy money moved between lines rather than leaving. '
  + 'Ask the shop for a physical count. Magnolia second. It is the weakest single-day reading '
  + 'of any shop. Then the exports. Transfers have been frozen since 18 September. '
  + 'And the standing repair: no product in any shop has a low-stock level.';

describe('a plan he wrote as one paragraph', () => {
  it('breaks where his own openings break it', () => {
    const steps = planSteps(RUN_ON);
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => leadOf(s)[0])).toEqual([
      'Greenhills first.', 'Magnolia second.', 'Then the exports.', 'And the standing repair:']);
  });

  it('changes not one word of his', () => {
    expect(planSteps(RUN_ON).join(' ')).toBe(RUN_ON);
  });

  it('leaves his blank lines alone where he left them', () => {
    expect(planSteps('Greenhills first. Ask them.\n\nMagnolia second. Walk it.')).toHaveLength(2);
  });

  it('is one step when there is one thing to do', () => {
    expect(planSteps('I would walk into Greenhills today and count the kiamoy shelf.'))
      .toHaveLength(1);
  });

  it('does not break on a long sentence that merely starts with a short clause', () => {
    const one = 'The stock record cannot answer it, so a hand count is the only way to know '
      + 'whether those two lines were on the shelf at all.';
    expect(planSteps(one)).toHaveLength(1);
  });
});
