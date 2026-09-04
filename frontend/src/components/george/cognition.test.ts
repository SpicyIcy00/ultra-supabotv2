/**
 * Naming the act, and showing the thought.
 *
 * The act names are checked against the LIVE tool surface rather than against
 * a copy: every tool in agent/loop.py TOOL_FUNCTIONS and every injected tool
 * must have a phrase, so adding a tool to the loop without adding it here
 * fails the suite instead of shipping "get_whatever" under the mark.
 */
import { describe, expect, it } from 'vitest';
import type { GeorgeState } from '../../types/george';
import {
  actLine,
  actName,
  cognitionTail,
  liveCognition,
  narrateCall,
  narrateResult,
} from './cognition';

/** agent/loop.py TOOL_FUNCTIONS — the read surface. */
const READ_TOOLS = [
  'get_sales',
  'get_stock',
  'get_product',
  'get_movement',
  'get_vending',
  'get_vending_stock',
  'get_dead_stock',
  'get_purchasing',
  'get_cost_history',
  'get_brief',
];

/** agent/write_tools.py and agent/composite_tools.py — injected per capability. */
const INJECTED_TOOLS = ['pin_answer', 'save_workflow', 'run_workflow'];

describe('actName', () => {
  it.each([...READ_TOOLS, ...INJECTED_TOOLS])('names %s in words', (tool) => {
    const act = actName(tool);
    expect(act).not.toBe(tool);
    expect(act).not.toMatch(/_/);
    expect(act).toBe(act.toLowerCase());
  });

  it('reads as something in progress', () => {
    expect(actName('get_purchasing')).toBe('checking purchasing');
    expect(actName('get_stock')).toBe('counting stock');
    expect(actName('run_workflow')).toBe('running the workflow');
  });

  it('falls back to the tool name for a tool it does not know', () => {
    // Deliberately NOT a generic phrase. "reading the data" would claim a read
    // of something that might well write.
    expect(actName('get_something_new')).toBe('get_something_new');
  });

  it('gives no two tools the same phrase', () => {
    const acts = [...READ_TOOLS, ...INJECTED_TOOLS].map(actName);
    expect(new Set(acts).size).toBe(acts.length);
  });
});

describe('actLine', () => {
  it('is empty when nothing is in flight', () => {
    expect(actLine([])).toBe('');
  });

  it('trails off, because the work is not finished', () => {
    expect(actLine(['get_purchasing'])).toBe('checking purchasing…');
  });

  it('names two', () => {
    expect(actLine(['get_sales', 'get_stock'])).toBe('reading sales and counting stock…');
  });

  it('says an act once however many calls are doing it', () => {
    // Seen live: get_purchasing dispatched twice in one turn, for po_count and
    // for ordered_value, both frames landing before either result. Without the
    // dedupe this read "checking purchasing and checking purchasing…".
    expect(actLine(['get_purchasing', 'get_purchasing'])).toBe('checking purchasing…');
  });

  it('counts DISTINCT acts, not calls, past two', () => {
    expect(actLine(['get_sales', 'get_sales', 'get_stock', 'get_movement'])).toBe(
      'reading sales and 2 other things…',
    );
  });

  it('counts beyond two rather than listing them', () => {
    // Parallel dispatch can put five calls in the air at once, and five acts
    // is a log line rather than a sentence.
    expect(actLine(['get_sales', 'get_stock', 'get_movement', 'get_vending'])).toBe(
      'reading sales and 3 other things…',
    );
  });
});

describe('cognitionTail', () => {
  it('is empty for empty thinking', () => {
    expect(cognitionTail('')).toBe('');
    expect(cognitionTail('   \n  ')).toBe('');
  });

  it('shows only the clause being written, not the whole accumulation', () => {
    const text = 'The user wants last week. That means the preset window. Now I need the store scope';
    expect(cognitionTail(text)).toBe('Now I need the store scope…');
  });

  it('keeps a finished sentence as the clause when nothing follows it', () => {
    // A trailing terminator ends the clause we want to show; it is not a
    // boundary to skip past.
    expect(cognitionTail('That means the preset window.')).toBe('That means the preset window…');
  });

  it('always trails off, because the next delta may extend it', () => {
    expect(cognitionTail('Checking the brief')).toMatch(/…$/);
    expect(cognitionTail('Checking the brief.')).toMatch(/…$/);
  });

  it('never doubles a terminator', () => {
    expect(cognitionTail('Reading sales,')).toBe('Reading sales…');
    expect(cognitionTail('Reading sales …')).toBe('Reading sales…');
  });

  it('breaks a sentence even when a delta boundary ate the space after it', () => {
    // Seen live: deltas concatenate raw, giving "...how it's changed.This
    // window is...". Without a capital-letter boundary the superseded sentence
    // never leaves the line.
    expect(cognitionTail("I should see how it's changed.This window is the same")).toBe(
      'This window is the same…',
    );
  });

  it('keeps underscores, because tool arguments are full of them', () => {
    // Seen live: stripping underscore turned "last_30_days" into "last30days"
    // — a metric name that does not exist, reading as though George had
    // invented one. Emphasis by underscore is vanishingly rare here; arguments
    // are not.
    expect(cognitionTail('the last_30_days window resolves identically')).toBe(
      'the last_30_days window resolves identically…',
    );
  });

  it('does not treat a decimal point as the end of a sentence', () => {
    expect(cognitionTail('It came to 179,412.50 across the estate')).toBe(
      'It came to 179,412.50 across the estate…',
    );
  });

  it('strips markdown rather than rendering it', () => {
    expect(cognitionTail('I need **net sales** for `Rockwell`')).toBe(
      'I need net sales for Rockwell…',
    );
    expect(cognitionTail('## Plan\nCheck purchasing')).toBe('Plan Check purchasing…');
  });

  it('strips a code fence that is still open', () => {
    // Deltas arrive mid-token, so a fence with no closer is the normal case.
    expect(cognitionTail('Consider ```sql\nSELECT 1')).toBe('Consider…');
  });

  it('collapses newlines so the line stays one line', () => {
    expect(cognitionTail('one\n\ntwo\nthree')).toBe('one two three…');
  });

  it('keeps the END of an over-long clause, not its beginning', () => {
    // The words arriving now are the ones nobody has read yet.
    const long = `${'padding word '.repeat(20)}the part that matters most`;
    const out = cognitionTail(long, 40);
    expect(out).toMatch(/the part that matters most…$/);
    expect(out.startsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(42);
  });

  it('does not cut a word in half when it truncates', () => {
    const out = cognitionTail(`${'x'.repeat(10)} alpha beta gamma delta epsilon`, 20);
    expect(out).not.toMatch(/…\S*[^\s]…$/);
    expect(out.slice(1).trimStart()).toBe(out.slice(1));
  });

  it('leaves a clause that fits exactly alone', () => {
    expect(cognitionTail('short clause', 140)).toBe('short clause…');
  });
});

describe('liveCognition — presence, and where it stops', () => {
  const THOUGHT = 'The user wants last week, so the preset window';

  it('shows the thought while he is thinking and while tools run', () => {
    expect(liveCognition('thinking', THOUGHT)).toBe(`${THOUGHT}…`);
    expect(liveCognition('running', THOUGHT)).toBe(`${THOUGHT}…`);
  });

  it('stops the moment the answer begins', () => {
    // Once there are words in the thread the reasoning behind them is no
    // longer the most useful thing on screen, and the turn's own disclosure
    // still holds all of it.
    expect(liveCognition('answering', THOUGHT)).toBe('');
  });

  it('shows nothing in error, so a half-formed thought is never read as a cause', () => {
    // The last thing the model was thinking before something broke is not an
    // explanation of what broke.
    expect(liveCognition('error', THOUGHT)).toBe('');
  });

  it('shows nothing at rest', () => {
    for (const s of ['idle', 'listening'] as GeorgeState[]) {
      expect(liveCognition(s, THOUGHT)).toBe('');
    }
  });

  it('is empty rather than absent when there is no thinking yet', () => {
    // The slot is fixed height and held empty; an undefined here would render
    // as "undefined" under the mark.
    expect(liveCognition('thinking', '')).toBe('');
  });
});


describe('narrateCall — what he is doing, in the first person', () => {
  it('puts him in front of the act', () => {
    expect(narrateCall(['get_purchasing'])).toBe("I'm checking purchasing…");
  });

  it('stays grammatical for every tool, because ACTS are participles', () => {
    // The reason narration can be BUILT from actLine rather than duplicated:
    // "I'm " in front of a present participle is always a sentence.
    for (const tool of [...READ_TOOLS, ...INJECTED_TOOLS]) {
      const line = narrateCall([tool]);
      expect(line.startsWith("I'm ")).toBe(true);
      expect(line.endsWith('…')).toBe(true);
    }
  });

  it('carries actLine’s deduping and its two-name limit', () => {
    expect(narrateCall(['get_sales', 'get_sales'])).toBe("I'm reading sales…");
    expect(narrateCall(['get_sales', 'get_stock', 'get_movement'])).toBe(
      "I'm reading sales and 2 other things…",
    );
  });

  it('says nothing at all rather than a sentence with nothing in it', () => {
    // The caller falls back to the state label; "I'm …" would be worse than
    // either.
    expect(narrateCall([])).toBe('');
  });
});

describe('narrateResult — what he is seeing', () => {
  it('names the subject and the size', () => {
    expect(narrateResult({ tool: 'get_purchasing', rowCount: 14 })).toBe(
      'Purchasing came back — 14 rows',
    );
  });

  it('reads singular for one row', () => {
    expect(narrateResult({ tool: 'get_sales', rowCount: 1 })).toBe(
      'Sales came back — 1 row',
    );
  });

  it('an empty result is EMPTY, never a zero', () => {
    // A zero would be a figure. "came back empty" says the query matched
    // nothing — the distinction PinTile draws for a tile with no rows.
    const line = narrateResult({ tool: 'get_dead_stock', rowCount: 0 });
    expect(line).toBe('Dead stock came back empty');
    expect(line).not.toMatch(/0/);
  });

  it('says a tool refused rather than reporting a size it does not have', () => {
    expect(narrateResult({ tool: 'get_stock', rowCount: null, error: 'refused' })).toBe(
      'Stock refused that',
    );
  });

  it('has a subject for every tool that has an act', () => {
    // A tool must never narrate its call and then go silent on its result.
    for (const tool of [...READ_TOOLS, ...INJECTED_TOOLS]) {
      const line = narrateResult({ tool, rowCount: 3 });
      expect(line).not.toContain(tool);
      expect(line).toContain('came back');
    }
  });

  it('falls back to the tool name for a tool nobody has named', () => {
    // Same discipline as actName: plainly an identifier, rather than a
    // catch-all that would describe it wrongly.
    expect(narrateResult({ tool: 'get_whatever', rowCount: 2 })).toBe(
      'get_whatever came back — 2 rows',
    );
  });
});
