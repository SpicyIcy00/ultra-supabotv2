// @vitest-environment jsdom
/**
 * TWO VOICES, AND NEITHER BORROWS THE OTHER'S (P2.b).
 *
 * The room speaks in two faces and they mean different things:
 *
 *   THE PROSE FACE (`--sans`, the card's "serif") is what George says and what
 *   a tool says in words it wrote to be read. It is a voice with a point of
 *   view — it can be wrong, and it is read as an argument.
 *   THE RECEIPT FACE (`--mono`) is what the frames carried: a source table, a
 *   predicate the definitions applied, a duration, a count. It is read as
 *   evidence, and evidence does not have opinions.
 *
 * Put one in the other's face and the meaning inverts. A sentence of his in a
 * mono line is a claim wearing the authority of a receipt. A source table in
 * prose type is a receipt dressed as an argument — and worse, it is `get_sales`
 * and `t.store_id IN (…)` arriving in the middle of an answer, which is the
 * thing BehindIt's own header forbids in so many words: reads with receipts,
 * never code.
 *
 * SO IT IS A SCAN, IN BOTH DIRECTIONS, NOT A REVIEW. P1.k wrote the first half
 * and it moved here to sit beside its mirror; the classes of each face are
 * read out of room.css rather than listed, so a new class joins the scan by
 * being written rather than by being remembered.
 *
 * WHAT IS EXCUSED, AND WHY IT IS NOT A HOLE. Each direction excuses exactly
 * what the frames themselves make ambiguous, by the same rule:
 *   - his words that appear ANYWHERE in the turn's frames are not evidence of
 *     his prose (a shop is named in the rows and in his sentence, and a
 *     receipt printing "Rockwell" is printing what the tool returned);
 *   - a machine string that appears inside a tool's ERROR is the tool talking
 *     in sentences, which is deliberately drawn in prose type — "this_month is
 *     still running; compare last_month instead" is written to be read.
 * Both excuses are computed off the frames. Neither is a file on a list.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AnswerTurn } from './data';
import { Reading } from './Reading';
import { WorkLine } from './Working';
import { BehindIt } from './BehindIt';

afterEach(cleanup);

/** Comments out, so a selector is a selector and never a sentence about one. */
const CSS = readFileSync(join(__dirname, 'room.css'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Every SELECTOR whose rule sets one of the two faces, read out of the sheet.
 *
 * Selectors rather than class names, because a class is not always the thing
 * wearing the face: `.r-spec-cell em` is prose and `.r-spec-cell b` is a
 * receipt, in one cell, and a scan that collected class names would have put
 * that class in both lists and then had to argue with itself about it.
 */
function selectorsWearing(face: 'sans' | 'mono'): string[] {
  const out: string[] = [];
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!new RegExp(`var\\(--${face}\\)`).test(m[2])) continue;
    for (const one of m[1].split(',')) {
      const sel = one.trim();
      // An at-rule prelude and a keyframe stop are not selectors. A nested
      // rule inside `@media` already arrives here on its own, because a
      // prelude cannot contain a brace.
      if (!sel || sel.startsWith('@') || /^(from|to|\d)/.test(sel)) continue;
      out.push(sel);
    }
  }
  return out;
}

const MONO = selectorsWearing('mono');
const SANS = selectorsWearing('sans');

/** Everything on screen wearing one face, by the sheet's own selectors. */
function wearing(container: Element, selectors: string[]): Element[] {
  const out = new Set<Element>();
  for (const sel of selectors) {
    for (const el of Array.from(container.querySelectorAll(sel))) out.add(el);
  }
  return [...out];
}

/**
 * The text an element carries ITSELF — not what a differently-faced child
 * inside it carries.
 *
 * A prose line with a mono count inside it (`read sales · 1 row · 412ms`) is
 * correct and common: the line is his voice, the counts are the frames', and
 * each wears its own face. Reading the parent's whole `textContent` would
 * report the child's receipt as prose and the scan would fail on the shape it
 * exists to encourage.
 */
function ownText(el: Element, other: Element[]): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === node.TEXT_NODE) { out += node.textContent ?? ''; continue; }
    if (node.nodeType !== node.ELEMENT_NODE) continue;
    const child = node as Element;
    if (other.includes(child)) continue;
    out += ownText(child, other);
  }
  return out;
}

/* ------------------------------------------------------------ one real turn */

const FILTERS = [
  "t.status <> 'cancelled'   # metrics.yaml: filters.cancelled",
  "t.store_id IN (1: Rockwell)   # metrics.yaml: stores.active_retail",
];

function meta() {
  return {
    source_table: 'new_transactions',
    metric_label: 'Net sales',
    group_by: ['store'],
    window: { name: 'last_week' },
    snapshot_timestamp: '2026-09-14T08:00:00Z',
    filters_applied: FILTERS,
  };
}

function read(seq: number, tool: string, ms: number, rows: Record<string, unknown>[]) {
  return {
    seq, tool, arguments: { date_range: 'last_week', group_by: ['store'] },
    result: {
      row_count: rows.length, source_table: 'new_transactions', truncated: false,
      duration_ms: ms, error: null, rows, rows_complete: true, meta: meta(),
    },
  };
}

const SAID = 'Rockwell is down ₱18,400 on last week, and it is basket size '
  + 'rather than footfall.';

/** Three reads, one refusal and a label call — every shape a line can take. */
const TURN: AnswerTurn = {
  role: 'george',
  text: SAID,
  thinking: '',
  at: '2026-09-14T08:00:00Z',
  toolCalls: [
    read(0, 'get_sales', 412, [{ store: 'Rockwell', value: 203717, change_pct: -8.3 }]),
    read(1, 'get_sales', 260, [{ store: 'Rockwell', value: 1187 }]),
    read(2, 'get_stock', 155, [{ product: 'Aji Mix', quantity_on_hand: 0 }]),
    {
      seq: 3, tool: 'get_purchasing', arguments: { date_range: 'this_month' },
      result: {
        row_count: null, source_table: null, truncated: false, duration_ms: 3,
        error: 'this_month is still running; compare last_month instead.',
      },
    },
    {
      seq: 4, tool: 'compose', arguments: {},
      result: { row_count: 0, source_table: null, truncated: false, duration_ms: 9, error: null },
    },
  ],
  notices: [{ kind: 'partial_window', message: 'this week is not over yet' }],
  pinned: [], saved: [], pageChanges: [],
  reading: { claim: 'down ₱18,400 on last week', next: 'check the basket at the till' },
  done: { duration_ms: 19_000 },
} as unknown as AnswerTurn;

/** Every surface that draws the work, with the folds opened. */
function surfaces() {
  const out = render(
    <>
      <WorkLine turn={TURN} onBehind={() => {}} />
      <BehindIt answers={[TURN]} onBack={() => {}} />
      <Reading text={SAID} reading={TURN.reading} calls={TURN.toolCalls}
               onFigure={() => {}} />
    </>,
  );
  fireEvent.click(out.container.querySelector('.r-workline-line') as HTMLElement);
  for (const step of Array.from(out.container.querySelectorAll('.r-work--step'))) {
    fireEvent.click(step);
  }
  return out.container;
}

/* --------------------------------------------------- what each voice may say */

/** His words: the ones in his sentence that appear nowhere in the frames. */
function hisWords(): string[] {
  const frames = JSON.stringify(TURN.toolCalls).toLowerCase();
  return SAID.split(/\s+/)
    .map((w) => w.replace(/[.,—]/g, ''))
    .filter((w) => w.length > 4 && !frames.includes(w.toLowerCase()));
}

/**
 * The machine's strings: what the CLIENT lifted out of a frame to show as a
 * receipt — a tool's name, a source table, an argument key, the predicate half
 * of a filter. Never a row value and never a metric label: those are the
 * BUSINESS's words and belong in a sentence as readily as in a receipt.
 */
function machineStrings(): string[] {
  const out = new Set<string>();
  const excused: string[] = [];
  for (const call of TURN.toolCalls) {
    out.add(call.tool);
    for (const key of Object.keys(call.arguments ?? {})) out.add(key);
    const m = call.result?.meta as { source_table?: string; filters_applied?: string[] } | null;
    if (m?.source_table) out.add(m.source_table);
    for (const raw of m?.filters_applied ?? []) {
      const cut = raw.indexOf('#');
      if (cut > 0) out.add(raw.slice(0, cut).trim());
    }
    if (call.result?.error) excused.push(String(call.result.error));
  }
  // A string the tool put inside its own SENTENCE is the tool talking, and a
  // sentence written to be read is drawn in prose type on purpose.
  return [...out].filter((s) => !excused.some((e) => e.includes(s)));
}

describe('the two voices of the room', () => {
  it('finds both faces in the stylesheet rather than being told them', () => {
    expect(MONO).toContain('.r-src');
    expect(MONO).toContain('.r-work-n');
    expect(MONO).toContain('.r-figure-n');
    expect(SANS).toContain('.r-say');
    expect(SANS).toContain('.r-behind-what');
    expect(SANS).toContain('.r-behind-filter');
    // Nothing on screen may wear both, or the scan would argue with itself.
    const container = surfaces();
    const mono = wearing(container, MONO);
    expect(wearing(container, SANS).filter((e) => mono.includes(e))).toEqual([]);
    // And both faces are actually ON the surfaces being scanned.
    expect(mono.length).toBeGreaterThan(5);
    expect(wearing(container, SANS).length).toBeGreaterThan(5);
  });

  it('has words of his and strings of the machine to look for', () => {
    // A scan over an empty list passes for the wrong reason.
    expect(hisWords().length).toBeGreaterThanOrEqual(4);
    const machine = machineStrings();
    expect(machine).toContain('get_sales');
    expect(machine).toContain('new_transactions');
    expect(machine).toContain('date_range');
    expect(machine.some((s) => s.startsWith('t.store_id'))).toBe(true);
    // And the refusal's own words are excused, because it is a sentence.
    expect(machine).not.toContain('this_month');
  });

  it('puts nothing model-written in the receipt face', () => {
    const container = surfaces();
    for (const el of wearing(container, MONO)) {
      const text = el.textContent ?? '';
      for (const word of hisWords()) {
        expect(text.includes(word), `a receipt carries his words: ${text}`).toBe(false);
      }
    }
  });

  it('puts nothing frame-derived in the prose face', () => {
    const container = surfaces();
    const mono = wearing(container, MONO);
    for (const el of wearing(container, SANS)) {
      const text = ownText(el, mono);
      for (const s of machineStrings()) {
        expect(text.includes(s), `a sentence speaks in code: ${text.trim()}`).toBe(false);
      }
    }
  });

  it('bites — a source table put in a prose line is caught', () => {
    // A scan that cannot fail is a comment. This is the failure it exists to
    // produce, written out: the same two functions, over a line that does the
    // wrong thing, and they find it.
    const { container } = render(
      <p className="r-behind-what">read sales from new_transactions</p>);
    const found = wearing(container, SANS)
      .flatMap((el) => machineStrings().filter((s) => ownText(el, wearing(container, MONO)).includes(s)));
    expect(found).toContain('new_transactions');
  });

  it('still draws the refusal in words, in the prose face', () => {
    // The excuse above has to buy something real, or it is a hole rather than
    // a rule: the tool's own sentence IS on screen and IS in prose type.
    const container = surfaces();
    const declined = container.querySelector('.r-behind-declined');
    expect(SANS).toContain('.r-behind-declined');
    expect(declined?.textContent).toContain('compare last_month instead');
  });
});
