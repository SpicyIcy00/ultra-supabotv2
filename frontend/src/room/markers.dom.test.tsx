// @vitest-environment jsdom
/**
 * A MARKER ON EVERY FIGURE, OR VISIBLY NONE (P2.b).
 *
 * P1.k made a figure with a read behind it tappable. It did not make the
 * DIFFERENCE visible: a numeral George worked out himself and a numeral a
 * tool returned were drawn identically, so the only way to find out which one
 * you were looking at was to tap it and see whether anything happened. That
 * is a surface answering a question about trust by saying nothing.
 *
 * So now there are two renderings and both are deliberate:
 *
 *   PLACED    underlined, and a small number after it saying WHICH read — the
 *             same number that read's line wears in the trail above the claim.
 *   UNPLACED  the caveat's own ink, no underline, no marker. It says "there
 *             is nothing here to open", which is the only thing the client
 *             knows. It is not a verdict on his arithmetic: CLAUDE.md rule 9
 *             leaves checking prose numerals to the evals.
 *
 * THE LAST DESCRIBE IS THE CARD'S DONE-WHEN, and it is over real answers:
 * forty-four turns George actually took across the four recorded v2 runs,
 * with the rows those turns actually read. Every business figure in every one
 * of them is drawn as one of the two, and the reading still says exactly what
 * he said — the scan cannot lose a word or double one.
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ToolCall } from '../types/george';
import type { AnswerTurn } from './data';
import { Reading } from './Reading';
import { WorkLine } from './Working';
import { figuresIn } from './figures';
import { readIndexes } from './work';
import recorded from './__fixtures__/recorded-answers.json';

afterEach(cleanup);

function meta(over: Record<string, unknown> = {}) {
  return {
    source_table: 'new_transactions',
    metric_label: 'Net sales',
    group_by: ['store'],
    window: { name: 'last_week' },
    snapshot_timestamp: '2026-09-14T08:00:00Z',
    filters_applied: ["t.status <> 'cancelled'   # metrics.yaml: filters.cancelled"],
    ...over,
  };
}

function read(seq: number, tool: string, rows: Record<string, unknown>[]): ToolCall {
  return {
    seq, tool, arguments: { date_range: 'last_week' },
    result: {
      row_count: rows.length, source_table: 'new_transactions', truncated: false,
      duration_ms: 200, error: null, rows, rows_complete: true, meta: meta(),
    },
  } as ToolCall;
}

/** Three reads and a label call, the middle read holding two of his figures. */
const CALLS: ToolCall[] = [
  read(0, 'get_sales', [{ store: 'Rockwell', value: 203717 }]),
  read(1, 'get_sales', [{ store: 'Rockwell', transactions: 1187, basket: 171.6 }]),
  read(2, 'get_stock', [{ product: 'Aji Mix', quantity_on_hand: 0 }]),
  {
    seq: 3, tool: 'compose', arguments: {},
    result: { row_count: 0, source_table: null, truncated: false, duration_ms: 9, error: null },
  } as ToolCall,
];

const SAID = 'Rockwell did ₱203,717 on 1,187 receipts, a basket of ₱171.60 — '
  + 'that is ₱18,400 more than the week before.';

function reading(over: Partial<Parameters<typeof Reading>[0]> = {}) {
  return render(
    <Reading text={SAID} calls={CALLS} onFigure={() => {}} {...over} />,
  );
}

describe('a figure says which read it came out of', () => {
  it('draws the read index after each placed figure', () => {
    const { container } = reading();
    const placed = Array.from(container.querySelectorAll('.r-figure'))
      .map((f) => f.textContent);
    expect(placed).toEqual(['₱203,717', '1,187', '₱171.60']);
    const markers = Array.from(container.querySelectorAll('.r-figure-n'))
      .map((m) => m.textContent);
    // The first read is 1; the receipts and the basket both came out of the
    // second, so they wear the same number — which is the whole point of
    // drawing one at all.
    expect(markers).toEqual(['1', '2', '2']);
  });

  it('gives an unplaced figure no marker and the quieter ink', () => {
    const { container } = reading();
    const bare = Array.from(container.querySelectorAll('.r-figure-bare'))
      .map((b) => b.textContent);
    // ₱18,400 is the difference he worked out. No row holds it.
    expect(bare).toEqual(['₱18,400']);
    // And it is not a door: nothing to tap, nothing to point at.
    expect(container.querySelectorAll('.r-figure')).toHaveLength(3);
    expect(container.querySelectorAll('.r-figure-n')).toHaveLength(3);
  });

  it('numbers the reads the trail numbers, and skips what is not a read', () => {
    // One definition, read by both. A marker counting differently from the
    // steps would point at the wrong evidence.
    const indexes = readIndexes(CALLS);
    expect([...indexes.entries()]).toEqual([[0, 1], [1, 2], [2, 3]]);
    const turn = {
      role: 'george', text: SAID, thinking: '', at: '2026-09-14T08:00:00Z',
      toolCalls: CALLS, notices: [], pinned: [], saved: [], pageChanges: [],
      done: { duration_ms: 9_000 },
    } as unknown as AnswerTurn;
    const { container } = render(<WorkLine turn={turn} />);
    fireEvent.click(container.querySelector('.r-workline-line') as HTMLElement);
    const drawn = Array.from(container.querySelectorAll('.r-work-i'))
      .map((n) => n.textContent);
    // Three reads numbered, the compose not — it read nothing.
    expect(drawn).toEqual(['1', '2', '3']);
  });

  it('does not number a read that was refused', () => {
    const refused = [{
      seq: 0, tool: 'get_sales', arguments: {},
      result: {
        row_count: null, source_table: null, truncated: false, duration_ms: 2,
        error: 'this_month is still running; compare last_month instead.',
      },
    }, read(1, 'get_sales', [{ store: 'Rockwell', value: 203717 }])] as ToolCall[];
    // A refusal returned no rows, so no figure can have come out of it, and
    // the read that did land is the FIRST one — not the second.
    expect([...readIndexes(refused).entries()]).toEqual([[1, 1]]);
  });

  it('marks nothing either way on a turn whose calls were not kept', () => {
    // Not an absence of evidence — an absence of RECORD (UI rule 8). Drawing
    // every figure as unplaced would say the reads never happened.
    const { container } = render(<Reading text={SAID} calls={[]} onFigure={() => {}} />);
    expect(container.querySelector('.r-figure')).toBeNull();
    expect(container.querySelector('.r-figure-bare')).toBeNull();
    expect(container.querySelector('.r-say--reading')?.textContent).toBe(SAID);
  });

  it('marks the figures in the whole answer, not only inside the lit claim', () => {
    // The claim slot is the few words that ARE the point. Until P2.b the scan
    // ran over that span alone, so whether a figure could be opened depended
    // on where in his paragraph he had put it.
    const { container } = reading({ reading: { claim: 'Rockwell did ₱203,717' } });
    const claim = container.querySelector('.r-claim') as HTMLElement;
    for (const m of Array.from(claim.querySelectorAll('.r-figure-n'))) m.remove();
    expect(claim.textContent).toBe('Rockwell did ₱203,717');
    expect(container.querySelectorAll('.r-figure')).toHaveLength(3);
    expect(container.querySelectorAll('.r-figure-bare')).toHaveLength(1);
  });
});

/* ------------------------------------------------- the card's own done-when */

interface RecordedAnswer {
  run: string;
  scenario: string;
  question: string;
  answer: string;
  calls: ToolCall[];
}

const ANSWERS = (recorded as unknown as { answers: RecordedAnswer[] }).answers;

describe('over the four recorded runs', () => {
  it('has four runs of real answers to read', () => {
    expect(new Set(ANSWERS.map((a) => a.run)).size).toBe(4);
    expect(ANSWERS.length).toBeGreaterThan(40);
  });

  it('draws every figure as placed or as visibly unplaced, and never both', () => {
    let placed = 0;
    let unplaced = 0;
    let withFigures = 0;
    for (const a of ANSWERS.filter((x) => x.calls.length)) {
      const { container } = render(
        <Reading text={a.answer} calls={a.calls} onFigure={() => {}} />);
      const want = figuresIn(a.answer.trim()).map((f) => a.answer.trim().slice(f.start, f.end));
      const drawn = Array.from(
        container.querySelectorAll('.r-figure, .r-figure-bare'),
      ).map((e) => e.textContent ?? '');
      expect(drawn, `${a.run}/${a.scenario}`).toEqual(want);
      if (want.length) withFigures += 1;
      placed += container.querySelectorAll('.r-figure').length;
      unplaced += container.querySelectorAll('.r-figure-bare').length;
      cleanup();
    }
    expect(withFigures).toBeGreaterThan(20);
    // EIGHTY-TWO FIGURES over thirty-eight turns, exactly. The fixture is
    // frozen, so this is a contract rather than a floor: the matcher is the
    // server's rule ported, and a change that placed one more or one fewer
    // should have to say so here.
    expect(placed).toBe(82);
    // AND EVERY ONE OF THEM IS PLACED — nought unplaced across the four runs.
    // That is the evals' own trust row ("0 figures no tool returned") seen
    // from the client side for the first time, and it means the corpus does
    // not exercise the unplaced branch at all: the synthetic ₱18,400 above is
    // what holds it. Written as an equality rather than a floor so that the
    // day a run does produce one, this line says so instead of passing.
    expect(unplaced).toBe(0);
  });

  it('marks nothing at all on the six turns that called nothing', () => {
    // SIX OF THE FORTY-FOUR answered out of the thread — a follow-up, a
    // correction, "run it Monday" — and the room hands the reading THIS
    // turn's calls. A figure of theirs came out of a read that happened, in
    // an earlier turn, and calling it unplaced would be the surface saying
    // there was no evidence when what it has is no record of it here.
    const silent = ANSWERS.filter((a) => !a.calls.length);
    expect(silent).toHaveLength(6);
    for (const a of silent) {
      const { container } = render(
        <Reading text={a.answer} calls={a.calls} onFigure={() => {}} />);
      expect(container.querySelector('.r-figure'), a.scenario).toBeNull();
      expect(container.querySelector('.r-figure-bare'), a.scenario).toBeNull();
      expect(container.querySelector('.r-say--reading')?.textContent)
        .toBe(a.answer.trim());
      cleanup();
    }
  });

  it('gives every placed figure a marker and every unplaced one none', () => {
    for (const a of ANSWERS) {
      const { container } = render(
        <Reading text={a.answer} calls={a.calls} onFigure={() => {}} />);
      const placed = container.querySelectorAll('.r-figure').length;
      const markers = container.querySelectorAll('.r-figure-n').length;
      expect(markers, `${a.run}/${a.scenario}`).toBe(placed);
      for (const bare of Array.from(container.querySelectorAll('.r-figure-bare'))) {
        expect(bare.querySelector('.r-figure-n')).toBeNull();
        expect(bare.nextElementSibling?.className).not.toBe('r-figure-n');
      }
      cleanup();
    }
  });

  it('still says exactly what he said, word for word', () => {
    // The scan cuts his sentence into pieces and puts it back. A figure drawn
    // twice or a span dropped would be the surface rewriting the answer.
    for (const a of ANSWERS) {
      const { container } = render(
        <Reading text={a.answer} calls={a.calls} onFigure={() => {}} />);
      // The markers are the one thing the reading adds and they are not his,
      // so they come out before the comparison — by element, never by
      // searching the string for a digit that might be his.
      for (const m of Array.from(container.querySelectorAll('.r-figure-n'))) {
        m.remove();
      }
      const said = container.querySelector('.r-say--reading')?.textContent ?? '';
      expect(said, `${a.run}/${a.scenario}`).toBe(a.answer.trim());
      cleanup();
    }
  });
});
