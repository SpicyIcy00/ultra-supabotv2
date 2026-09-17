// @vitest-environment jsdom
/**
 * EVERYTHING HE CAN DRAW, DRAWN FROM REAL ROWS (P2S.3).
 *
 * The card's done-when: "each shape has a golden render test off recorded
 * rows". `__fixtures__/vocab-reads.json` is one read per shape, recorded by
 * `ops/record_vocab_reads.py` from the vetted tools with no model — the rows
 * and `meta` exactly as the tool returned them. Each is drawn here through the
 * real board, and its drawing is held as a snapshot.
 *
 * AND THE SAME RULE ON BOTH SIDES. The fixture carries `_drawable` and
 * `_default`, written by the SERVER's rules (agent/vocabulary.py,
 * default_composition.shape_for); `tests/test_vocabulary_contract.py` holds
 * the server to them and this file holds the client's `drawable` and
 * `defaultMark` to them. A shape the rows cannot make is drawn as what they do
 * make, on both sides, the same way.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';
import { MARKS, MIN_ROWS, SHAPE_ROWS, defaultMark, drawable, markFor, type Mark } from './catalogue';
import { fmt } from './data';
import { Board } from './render';
import reads from './__fixtures__/vocab-reads.json';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

type Read = { tool: string; arguments: Record<string, unknown>; channels: Record<string, string>;
              rows: Record<string, unknown>[]; meta: Record<string, unknown> };
const all = reads as unknown as Record<string, Read> & {
  _drawable: Record<string, string[]>; _default: Record<string, string>;
};
const names = Object.keys(all).filter((k) => !k.startsWith('_'));

const on: TileActions = { open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn() };

function draw(kind: string, read: Read, extra: Partial<BoardObject> = {}) {
  const turn = {
    role: 'george', text: 'A reading.', thinking: '', at: '2026-09-17T08:00:00Z',
    toolCalls: [{ seq: 1, tool: read.tool, arguments: read.arguments,
                  result: { rows: read.rows, meta: read.meta } }],
  } as unknown as AnswerTurn;
  const object = {
    key: 'k', kind, weight: 'supporting', seq: 1, tool: read.tool, turn: 0, touched: 0,
    ...read.channels, ...extra,
  } as unknown as BoardObject;
  return render(
    <Board answers={[turn]} board={[object]} local={{}} focused={null}
           selection={[]} live={false} retuned={{}} on={on} />,
  );
}

describe('the client and the server give the same answer', () => {
  it('reads the same row rule for every shape out of the definitions', () => {
    const yaml = readFileSync(join(__dirname, '..', '..', '..', 'definitions', 'metrics.yaml'), 'utf8')
      .split('\r\n').join('\n');
    const start = yaml.indexOf('\n  widgets:\n');
    const block = yaml.slice(start, yaml.indexOf('\n  state_labels:', start));
    const rules: Record<string, string> = {};
    const least: Record<string, number> = {};
    let current = '';
    for (const line of block.split('\n')) {
      const kind = /^ {4}([a-z_]+):\s*$/.exec(line);
      if (kind) current = kind[1];
      const rows = /^ {6}rows: ([a-z_]+)\s*$/.exec(line);
      if (rows && current) rules[current] = rows[1];
      const min = /^ {6}min_rows: (\d+)\s*$/.exec(line);
      if (min && current) least[current] = Number(min[1]);
    }
    expect(rules).toEqual(SHAPE_ROWS);
    expect(least).toEqual(MIN_ROWS);
    expect(Object.keys(rules).sort()).toEqual([...MARKS].sort());
  });

  it.each(names)('%s: which shapes its rows can make, and its default', (name) => {
    const read = all[name];
    const got = MARKS.filter((m) => drawable(m, read.rows, read.channels));
    expect(got).toEqual(all._drawable[name]);
    expect(defaultMark(read.rows)).toBe(all._default[name]);
  });
});

describe('every shape, drawn from the read recorded for it', () => {
  it.each(names)('%s', (name) => {
    const read = all[name];
    const { container } = draw(name, read);
    const body = container.querySelector('.r-mk-body') as HTMLElement;
    expect(body.getAttribute('data-mark')).toBe(name);
    // A FIGURE IS NEVER DRAWN FROM NOTHING: no NaN, no undefined, no object.
    expect(body.innerHTML).not.toMatch(/NaN|undefined|\[object Object\]|Infinity/);
    // EVERY SHAPE ANSWERS A TOUCH (P2S.2(f)) — at least one mark says its figure.
    expect(body.querySelectorAll('[data-v]').length).toBeGreaterThan(0);
    // And its receipt line is under it (UI rules 3 and 6).
    expect(container.querySelector('.r-src')).not.toBeNull();
    expect(body.innerHTML).toMatchSnapshot();
  });

  it('touches every row of a read it draws a mark per row for', () => {
    const per: Partial<Record<Mark, string>> = {
      bar: 'bar', pie: 'pie', treemap: 'treemap', waterfall: 'waterfall', scatter: 'scatter',
    };
    for (const [shape, name] of Object.entries(per)) {
      const read = all[name as string];
      const { container } = draw(shape, read);
      const touched = container.querySelectorAll('.r-mk-body [data-v]').length;
      // A part of zero has no area, so a treemap draws no rectangle for it.
      const drawn = shape === 'treemap' ? read.rows.filter((r) => Number(r.value) > 0).length
        : read.rows.length;
      expect(touched, shape).toBeGreaterThanOrEqual(drawn);
      cleanup();
    }
  });

  it('draws a pair a read has no row for as an empty cell, never a zero', () => {
    const read = all.heatmap;
    const { container } = draw('heatmap', read);
    const cells = container.querySelectorAll('.r-mk-cell');
    const stores = new Set(read.rows.map((r) => r.store)).size;
    const hours = new Set(read.rows.map((r) => r.hour)).size;
    expect(cells.length).toBe(stores * hours);
    expect(container.querySelectorAll('.r-mk-cell--none').length).toBe(stores * hours - read.rows.length);
  });

  it('prints no share of a whole on a pie and no total on a stack', () => {
    const { container } = draw('pie', all.pie);
    expect(container.querySelector('.r-mk-body')?.textContent).not.toMatch(/%/);
    cleanup();
    const stacked = draw('stacked', all.stacked).container;
    // Every figure under a touch is one row's own value, formatted.
    const values = new Set(all.stacked.rows.map((r) => fmt('value', r.value, 'PHP')));
    const touched = Array.from(stacked.querySelectorAll('.r-mk-bar--stack [data-v]'));
    expect(touched.length).toBe(all.stacked.rows.length);
    for (const el of touched) {
      expect(values.has((el.getAttribute('data-v') ?? '').split(' · ').pop() ?? '')).toBe(true);
    }
  });
});

describe('a read too small, too big or empty for its shape', () => {
  const eleven = MARKS.filter((m) => !['figure', 'dumbbell', 'ranked', 'contributors', 'line', 'table']
    .includes(m));

  it.each(eleven)('%s over no rows says nothing came back', (shape) => {
    const read = { ...all[shape], rows: [] };
    const { container } = draw(shape, read);
    expect(container.querySelector('.r-mk-body')).toBeNull();
    expect(container.textContent).toContain('Nothing to draw here');
  });

  it.each(eleven)('%s over one row is the figure one row is', (shape) => {
    const read = all[shape];
    const one = [read.rows[0]];
    expect(markFor({ kind: shape, ...read.channels } as unknown as BoardObject, one))
      .toBe(shape === 'gauge' ? 'gauge' : 'figure');
  });

  it('a pie of more parts than a whole can show is a ranking', () => {
    const many = all.scatter.rows.map((r) => ({ product: r.product, value: r.value }));
    expect(many.length).toBeGreaterThan(12);
    expect(markFor({ kind: 'pie' } as BoardObject, many)).toBe('ranked');
  });
});

describe('ruled out', () => {
  it('draws a read the ladder ruled out as READ n · RULED OUT, dimmed', () => {
    const { container } = draw('ranked', all.ranked, { ruled_out: true });
    const fig = container.querySelector('.r-fig') as HTMLElement;
    expect(fig.className).toContain('r-fig--out');
    expect(fig.querySelector('.r-fig-lbl')?.textContent).toMatch(/ruled out/);
  });
});
