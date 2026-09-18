/**
 * VOICE'S RULES (P2S.5), pure: which browser can hear, what has been heard so
 * far, which failure is which, and the one sentence he reads aloud.
 */
import { describe, expect, it } from 'vitest';
import type { DeskDefinitions } from '../services/deskApi';
import {
  FAILURE_SAYS, asksToHear, failureOf, heardIn, joinSaid, recognitionIn, spokenClaim, synthesisIn,
} from './voice';

const result = (transcript: string, isFinal: boolean) =>
  Object.assign([{ transcript }], { isFinal });

describe('which browser can hear', () => {
  it('takes the standard recogniser, or the prefixed one, or says there is none', () => {
    class A {}
    class B {}
    expect(recognitionIn({ SpeechRecognition: A, webkitSpeechRecognition: B })).toBe(A);
    expect(recognitionIn({ webkitSpeechRecognition: B })).toBe(B);
    expect(recognitionIn({})).toBeNull();
    expect(recognitionIn(null)).toBeNull();
  });

  it('can read aloud only with both halves of speech synthesis', () => {
    expect(synthesisIn({ speechSynthesis: {}, SpeechSynthesisUtterance: class {} })).toBe(true);
    expect(synthesisIn({ speechSynthesis: {} })).toBe(false);
    expect(synthesisIn(null)).toBe(false);
  });
});

describe('what has been heard so far', () => {
  it('is every settled phrase and then the one still being heard, rebuilt not appended', () => {
    expect(heardIn([result('how are', false)])).toBe('how are');
    expect(heardIn([result('how are we doing', true)])).toBe('how are we doing');
    expect(heardIn([result('compare these', true), result(' for last week', false)]))
      .toBe('compare these for last week');
    expect(heardIn([])).toBe('');
  });

  it('follows what was already in the line, with one space', () => {
    expect(joinSaid('compare', 'these two')).toBe('compare these two');
    expect(joinSaid('', 'how are we doing')).toBe('how are we doing');
    expect(joinSaid('why ', '')).toBe('why');
  });
});

describe('each failure says which, and none pretends to have heard', () => {
  it('names permission, microphone, service and silence apart', () => {
    expect(failureOf('not-allowed')).toBe('denied');
    expect(failureOf('audio-capture')).toBe('no-microphone');
    expect(failureOf('network')).toBe('no-service');
    expect(failureOf('service-not-allowed')).toBe('no-service');
    expect(failureOf('no-speech')).toBe('nothing-heard');
    // Stopped on purpose: nothing to say.
    expect(failureOf('aborted')).toBeNull();
  });

  it('says each in one line, and no line claims anything was heard', () => {
    for (const says of Object.values(FAILURE_SAYS)) {
      expect(says.split('\n')).toHaveLength(1);
      expect(says).not.toMatch(/heard you|you said/i);
    }
    expect(new Set(Object.values(FAILURE_SAYS)).size).toBe(4);
  });
});

describe('the one sentence he reads aloud', () => {
  const text = 'Sales held up this week. **Rockwell is down 12%** on last week, the only shop that fell. I would look at its products.';

  it('is the claim sentence as the headline draws it — markers out, nothing else', () => {
    expect(spokenClaim(text, 'Rockwell is down 12%'))
      .toBe('Rockwell is down 12% on last week, the only shop that fell.');
  });

  it('is the first sentence when he marked no claim, and nothing when he said nothing', () => {
    expect(spokenClaim(text, null)).toBe('Sales held up this week.');
    expect(spokenClaim('', 'x')).toBe('');
    expect(spokenClaim(null, null)).toBe('');
  });
});

describe('"read it to me"', () => {
  const defs = { fragments: { read_aloud: { spellings: ['read it to me', 'read it'] } } } as unknown as DeskDefinitions;

  it('answers to the definitions\' words, whole, however they are cased or ended', () => {
    expect(asksToHear('Read it to me', defs)).toBe(true);
    expect(asksToHear('read it to me.', defs)).toBe(true);
    expect(asksToHear('read it', defs)).toBe(true);
  });

  it('is nothing else: a longer sentence is a question, and no words served means none', () => {
    expect(asksToHear('read it to me and then compare', defs)).toBe(false);
    expect(asksToHear('read it to me', { fragments: {} } as unknown as DeskDefinitions)).toBe(false);
    expect(asksToHear('read it to me', null)).toBe(false);
  });
});
