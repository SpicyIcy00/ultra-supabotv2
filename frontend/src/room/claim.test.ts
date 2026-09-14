/**
 * The claim is a highlight, and these are the cases that make it one.
 *
 * The whole safety argument for a text slot rests here: `splitClaim` returns a
 * span of the ANSWER or nothing at all, so the surface can emphasise what
 * George said and can never write a word he did not. Mirrored in
 * agent/reading.py `was_said`, which decides only whether it landed.
 */
import { describe, expect, it } from 'vitest';
import { splitClaim } from './claim';

const SAID = 'Every shop is up on last week.\nOPUS is the one to look at: it added ₱130,016.';

describe('splitClaim', () => {
  it('cuts the answer around the claim, keeping his own spelling', () => {
    const out = splitClaim(SAID, 'opus is THE one to look at');
    expect(out).not.toBeNull();
    // The span drawn is the original text, not the claim as submitted.
    expect(out!.hit).toBe('OPUS is the one to look at');
    expect(out!.before + out!.hit + out!.after).toBe(SAID);
  });

  it('survives a line break inside the claim', () => {
    const wrapped = 'Every shop\nis up on last week.';
    const out = splitClaim(wrapped, 'Every shop is up');
    expect(out!.hit).toBe('Every shop\nis up');
    expect(out!.before + out!.hit + out!.after).toBe(wrapped);
  });

  it('finds a claim at the very start and at the very end', () => {
    const head = splitClaim(SAID, 'Every shop is up');
    expect(head!.before).toBe('');
    const tail = splitClaim(SAID, 'it added ₱130,016.');
    expect(tail!.after).toBe('');
  });

  it('is null for a paraphrase, so nothing is lit', () => {
    expect(splitClaim(SAID, 'OPUS is the one worth looking at')).toBeNull();
  });

  it('is null when there is nothing to light or nothing to light it in', () => {
    expect(splitClaim(SAID, '')).toBeNull();
    expect(splitClaim(SAID, undefined)).toBeNull();
    expect(splitClaim('', 'OPUS')).toBeNull();
    expect(splitClaim(null, 'OPUS')).toBeNull();
  });

  it('lights the first occurrence only, and leaves the rest of the text alone', () => {
    const twice = 'OPUS led. Then OPUS led again.';
    const out = splitClaim(twice, 'OPUS led');
    expect(out!.before).toBe('');
    expect(out!.after).toBe('. Then OPUS led again.');
  });
});
