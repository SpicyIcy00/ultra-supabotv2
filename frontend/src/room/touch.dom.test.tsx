// @vitest-environment jsdom
/**
 * ALIVE FIGURES, AND TOUCH — P2S.2(f)'s done-when: *"every mark kind has the
 * tooltip and a dom test reads its text off a recorded run"*, and UI rule 3's
 * *"a tap opens the receipts in place"*.
 *
 * The rows are the recorded ones (`__fixtures__/recorded-runs.json`, lifted
 * whole from the eval reports): a one-row read with a baseline, a seven-day
 * series, eight products compared, and a replenishment table. Each is drawn as
 * every mark kind its rows can take, touched, and the tip is read back: the
 * exact figure as the mark formats it, and `read HH:MM` in Manila off the
 * call's own `snapshot_timestamp`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { fmt, readAt, subjectOf, unitOf, valueOf, type AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';
import { Board } from './render';
import recorded from './__fixtures__/recorded-runs.json';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

type Call = { seq: number; tool: string; result: { rows: Record<string, unknown>[]; meta: { snapshot_timestamp?: string } } };
const runs = recorded.runs as unknown as { run: string; calls: Call[] }[];
const WHY = runs.find((r) => r.run === 'dogfood-remainder-caveats/why')!;
const CAVEATS = runs.find((r) => r.run === 'dogfood-remainder-caveats/caveats')!;

function drawRecorded(run: { calls: Call[] }, seq: number, kind: string, on?: Partial<TileActions>) {
  const actions: TileActions = { open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(), retune: vi.fn(), ...on };
  const turn = {
    role: 'george', text: '', thinking: '', at: '2026-09-13T15:18:00Z',
    toolCalls: run.calls.map((c) => ({ seq: c.seq, tool: c.tool, arguments: {}, result: c.result })),
  } as unknown as AnswerTurn;
  const call = run.calls.find((c) => c.seq === seq)!;
  const object = { key: `k${seq}`, kind, seq, tool: call.tool, weight: 'lead', turn: 0, touched: 0 } as unknown as BoardObject;
  const view = render(
    <Board answers={[turn]} board={[object]} local={{}} focused={null}
           selection={[]} live={false} retuned={{}} on={actions} />,
  );
  return { ...view, call, actions };
}

/** Hover a mark and read the tip the board draws. */
function touch(container: HTMLElement, el: Element): { text: string; figure: string } {
  fireEvent.mouseOver(el);
  const tip = container.querySelector('.r-tip');
  return { text: tip?.textContent ?? '', figure: tip?.querySelector('b')?.textContent ?? '' };
}

const readOf = (call: Call) => readAt(call.result.meta.snapshot_timestamp) as string;

describe('every mark kind says its exact figure and when it was read', () => {
  it('figure — the one number', () => {
    const { container, call } = drawRecorded(WHY, 0, 'figure');
    expect(container.querySelector('[data-mark]')?.getAttribute('data-mark')).toBe('figure');
    const row = call.result.rows[0];
    const v = valueOf(row)!;
    const got = touch(container, container.querySelector('.r-mk-num[data-v]')!);
    expect(got.figure).toContain(fmt(v.key, v.value, unitOf(row) ?? unitOf(call.result.meta as never)));
    expect(got.text).toContain(readOf(call));
  });

  it('line — every point, not only the labelled ones', () => {
    const { container, call } = drawRecorded(WHY, 3, 'line');
    expect(container.querySelector('[data-mark]')?.getAttribute('data-mark')).toBe('line');
    const hits = [...container.querySelectorAll('.r-mk-hit[data-v]')];
    expect(hits).toHaveLength(call.result.rows.length);
    call.result.rows.forEach((row, n) => {
      const got = touch(container, hits[n]);
      expect(got.figure).toContain(String(row.day));
      expect(got.figure).toContain(fmt('value', row.value, unitOf(row)));
      expect(got.text).toContain(readOf(call));
    });
  });

  for (const [kind, selector] of [
    ['dumbbell', '.r-mk-track[data-v]'],
    ['ranked', '.r-mk-bar[data-v]'],
    ['contributors', '.r-mk-bar--split[data-v]'],
  ] as const) {
    it(`${kind} — every row`, () => {
      const { container, call } = drawRecorded(WHY, 4, kind);
      expect(container.querySelector('[data-mark]')?.getAttribute('data-mark')).toBe(kind);
      const marks = [...container.querySelectorAll(selector)];
      expect(marks).toHaveLength(call.result.rows.length);
      marks.forEach((m, n) => {
        const row = call.result.rows[n];
        const got = touch(container, m);
        expect(got.figure).toContain(String(subjectOf(row)));
        const figure = kind === 'contributors'
          ? fmt('change', row.change, unitOf(row))
          : fmt(valueOf(row)!.key, valueOf(row)!.value, unitOf(row));
        expect(got.figure).toContain(figure);
        expect(got.text).toContain(readOf(call));
      });
    });
  }

  it('table — every figure in a cell', () => {
    const { container, call } = drawRecorded(CAVEATS, 1, 'table');
    expect(container.querySelector('[data-mark]')?.getAttribute('data-mark')).toBe('table');
    const cells = [...container.querySelectorAll('td[data-v]')];
    expect(cells.length).toBeGreaterThan(0);
    const got = touch(container, cells[0]);
    expect(got.figure.length).toBeGreaterThan(0);
    expect(got.text).toContain(readOf(call));
  });
});

describe('a tap', () => {
  it('pins the tip, and does not open the figure behind the mark', () => {
    const { container, actions } = drawRecorded(WHY, 4, 'ranked');
    const bar = container.querySelector('.r-mk-bar[data-v]')!;
    fireEvent.click(bar);
    expect(container.querySelector('.r-tip')?.getAttribute('data-pinned')).toBe('yes');
    expect(actions.open).not.toHaveBeenCalled();
    fireEvent.mouseLeave(container.querySelector('.r-flow')!);
    expect(container.querySelector('.r-tip')).not.toBeNull();
    fireEvent.click(bar);
    expect(container.querySelector('.r-tip')).toBeNull();
  });

  it('opens the receipts in place — the source and every filter, under the line (UI rule 3)', () => {
    const { container, call, actions } = drawRecorded(WHY, 4, 'ranked');
    const line = container.querySelector('button.r-src')!;
    expect(line.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(line);
    expect(line.getAttribute('aria-expanded')).toBe('true');
    const opened = container.querySelector('.r-receipt')?.textContent ?? '';
    const meta = call.result.meta as { source_table?: string };
    if (meta.source_table) expect(opened).toContain(meta.source_table);
    expect(opened).toContain('read at');
    expect(actions.open).not.toHaveBeenCalled();
  });
});

describe('a figure draws itself in', () => {
  it('gives each row its own beat, in order', () => {
    const { container } = drawRecorded(WHY, 4, 'ranked');
    const beats = [...container.querySelectorAll<HTMLElement>('.r-mk-row')]
      .map((r) => r.style.getPropertyValue('--d'));
    expect(beats.slice(0, 3)).toEqual(['0ms', '90ms', '180ms']);
  });

  it('draws the line as a path of length one, so it can be drawn without measuring', () => {
    const { container } = drawRecorded(WHY, 3, 'line');
    expect(container.querySelector('.r-mk-series-line')?.getAttribute('pathLength')).toBe('1');
  });
});
