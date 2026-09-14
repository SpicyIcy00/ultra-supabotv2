/**
 * SIX MARKS, AND EVERY KIND REACHES ONE.
 *
 * Two things are held here and they cover the vocabulary between them.
 *
 * BY EXHAUSTION: `composition.widgets` in definitions/metrics.yaml is the
 * closed list of kinds George may name, and every one of them either maps to a
 * mark or is in `NOT_A_MARK` with a reason. A kind in neither would render as
 * nothing at all, which is the failure this catches — and the yaml is READ,
 * not copied, so adding a widget there fails this test until the renderer has
 * been told what it draws as.
 *
 * BY THE ROWS: which of the six a read becomes is decided by the columns the
 * tool returned, never by a threshold or a figure. The cases below are the
 * shapes the tools actually emit.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BoardObject } from './board';
import {
  DATA_COLOURS, MARKS, NOT_A_MARK, colourOf, markFor, subtitleFor, titleFor,
} from './catalogue';

const YAML = join(__dirname, '..', '..', '..', 'definitions', 'metrics.yaml');

/**
 * The widget names under `composition.widgets:` — read off the yaml's own
 * indentation rather than through a parser, because the only thing wanted is
 * the closed list and a dependency for it would be a dependency for one list.
 */
function widgetKinds(): string[] {
  // Normalised, because the yaml is CRLF in this checkout and the anchor
  // below is written as a line.
  const text = readFileSync(YAML, 'utf8').split('\r\n').join('\n');
  const start = text.indexOf('\n  widgets:\n');
  expect(start).toBeGreaterThan(-1);
  const rest = text.slice(start + '\n  widgets:\n'.length).split('\n');
  const out: string[] = [];
  for (const line of rest) {
    if (/^  \S/.test(line)) break;            // the next key at the same level
    const m = /^ {4}([a-z_]+):\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

const rowsFor = (kind: string): Record<string, unknown>[] => (
  kind === 'comparison' || kind === 'chart' || kind === 'distribution' || kind === 'table'
    ? [{ store: 'OPUS', value: 1 }, { store: 'Rockwell', value: 2 }, { store: 'Magnolia', value: 3 }]
    : [{ store: 'OPUS', value: 1 }]
);

describe('the catalogue covers the vocabulary', () => {
  it('reads the closed list of widgets out of the definitions', () => {
    const kinds = widgetKinds();
    expect(kinds).toContain('figure');
    expect(kinds).toContain('hero');
    expect(kinds).toContain('system');
    expect(kinds.length).toBeGreaterThanOrEqual(13);
    // `text` left the vocabulary in P1.c and must not come back through here.
    expect(kinds).not.toContain('text');
  });

  it('gives every kind either a mark or a reason for not being one', () => {
    for (const kind of widgetKinds()) {
      if (NOT_A_MARK[kind]) {
        expect(NOT_A_MARK[kind].length).toBeGreaterThan(10);
        continue;
      }
      const mark = markFor({ kind } as BoardObject, rowsFor(kind));
      expect(MARKS, `${kind} drew ${mark}`).toContain(mark);
    }
  });

  it('draws a kind the renderer keeps a tile for as its own object, not a mark', () => {
    // The four are objects you do something to, not readings of a read.
    expect(Object.keys(NOT_A_MARK).sort()).toEqual(['control', 'draft', 'state', 'system']);
  });
});

describe('the rows decide which of the six', () => {
  const o = (kind: string, extra: Partial<BoardObject> = {}) =>
    ({ kind, ...extra } as BoardObject);

  it('is a figure when he asked for one, however many rows came back', () => {
    const many = [{ store: 'a', value: 1 }, { store: 'b', value: 2 }];
    expect(markFor(o('figure'), many)).toBe('figure');
    expect(markFor(o('hero'), many)).toBe('figure');
    expect(markFor(o('subject'), many)).toBe('figure');
    expect(markFor(o('recommendation'), many)).toBe('figure');
  });

  it('is a dumbbell when every row carries the tool\'s own before', () => {
    const compared = [
      { store: 'OPUS', value: 555147, baseline: 425000, change: 130147, change_pct: 30.6, direction: 'up' },
      { store: 'Rockwell', value: 203717, baseline: 179000, change: 24717, change_pct: 13.8, direction: 'up' },
    ];
    expect(markFor(o('comparison'), compared)).toBe('dumbbell');
    expect(markFor(o('chart', { form: 'bar' }), compared)).toBe('dumbbell');
  });

  it('is contributors when the rows carry a signed change and no before', () => {
    const drivers = [
      { product: 'Aji Mix', change: -18400, direction: 'down' },
      { product: 'Fuan Haw', change: -9100, direction: 'down' },
    ];
    expect(markFor(o('comparison'), drivers)).toBe('contributors');
  });

  it('is ranked when the rows are values with nothing measured against them', () => {
    const plain = [
      { store: 'OPUS', value: 555147 },
      { store: 'Rockwell', value: 203717 },
    ];
    expect(markFor(o('comparison'), plain)).toBe('ranked');
    expect(markFor(o('chart', { form: 'bar' }), plain)).toBe('ranked');
  });

  it('is a line when the read is ordered, and only then', () => {
    const days = [
      { day: '2026-09-01', value: 1 }, { day: '2026-09-02', value: 2 }, { day: '2026-09-03', value: 3 },
    ];
    expect(markFor(o('chart', { form: 'line' }), days)).toBe('line');
    expect(markFor(o('distribution'), days)).toBe('line');
    expect(markFor(o('timeline'), days)).toBe('line');
    // No order of its own: a line would assert a progression nobody measured.
    expect(markFor(o('distribution'), [
      { store: 'OPUS', value: 1 }, { store: 'Rockwell', value: 2 }, { store: 'Magnolia', value: 3 },
    ])).toBe('ranked');
  });

  it('is a table when he asked for precision', () => {
    expect(markFor(o('table'), [
      { day: '2026-09-01', value: 1, baseline: 2, change_pct: -50 },
    ])).toBe('table');
  });
});

describe('the frame a block is drawn in', () => {
  it('takes the title from George\'s note when he gave one', () => {
    expect(titleFor({ note: 'carries the whole order' } as BoardObject, null))
      .toBe('carries the whole order');
  });

  it('takes it from the read when he did not', () => {
    expect(titleFor({ subject: 'OPUS' } as BoardObject, { metric_label: 'Net sales' } as never))
      .toBe('Net sales · OPUS');
    expect(titleFor({ tool: 'get_replenishment' } as BoardObject, null)).toBe('replenishment');
  });

  it('leads a recommendation with his verb, which is the one word a read has not got', () => {
    expect(titleFor({ action: 'order', subject: 'Aji Mix' } as BoardObject, null))
      .toBe('Order Aji Mix');
    expect(titleFor({ action: 'leave_it', subject: 'Rockwell' } as BoardObject, null))
      .toBe('Leave Rockwell');
  });

  it('says metric, window and unit in the subtitle, all three off meta', () => {
    const sub = subtitleFor(
      { metric_label: 'Net sales', metric_unit: 'PHP', window: { name: 'last_week' },
        comparison: { display_name: 'the week before' } } as never,
      [{ value: 1 }, { value: 2 }],
    );
    expect(sub).toContain('Net sales');
    expect(sub).toContain('last week');
    expect(sub).toContain('vs the week before');
    expect(sub).toContain('₱');
    expect(sub).toContain('2 rows');
  });

  it('carries no figure into the subtitle beyond how many rows there are', () => {
    const sub = subtitleFor({ metric_label: 'Net sales', metric_unit: 'PHP' } as never,
                            [{ value: 555147 }]);
    expect(sub).not.toContain('555');
  });
});

describe('colour is direction', () => {
  it('has four data colours and no more', () => {
    expect([...DATA_COLOURS]).toEqual(['up', 'down', 'flat', 'george']);
  });

  it('paints a row the way the tool said it moved', () => {
    expect(colourOf({ pct: 30.6, direction: 'up' }, true)).toBe('up');
    expect(colourOf({ pct: -7.6, direction: 'down' }, true)).toBe('down');
  });

  it('paints the emphasised row of a read with no direction in George\'s own colour', () => {
    expect(colourOf(null, true)).toBe('george');
    expect(colourOf({ pct: null, direction: null }, true)).toBe('george');
  });

  it('cools every row nobody pointed at, whichever way it moved', () => {
    expect(colourOf({ pct: 30.6, direction: 'up' }, false)).toBe('flat');
    expect(colourOf(null, false)).toBe('flat');
  });
});
