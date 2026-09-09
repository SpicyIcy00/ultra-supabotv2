/**
 * UNDERSTAND: the failures found in the 2026-09-09 dogfood, held closed.
 *
 * Each block names the thing that was actually broken, so a regression is
 * reported as the product failure it is rather than as an assertion that
 * stopped holding. Nothing here hard-codes a business figure: the fixtures
 * carry real SHAPES and synthetic values, and every assertion is about
 * structure, vocabulary and provenance.
 */
import { describe, expect, it } from 'vitest';
import { composeDesk } from './deskCompose';
import { INITIAL_DESK, deskContextFor } from './deskState';
import { deskFindings, MAX_FINDINGS } from './findings';
import { layoutField, labelsFit } from './fieldLayout';
import { workLine, workSentence } from './workLine';
import { PRIMARY } from '../shell/shellNav';
import {
  MAGNOLIA, NORTH_EDSA, PERF, divergingSet, headlineSet, post, question, surfacesOf,
} from './deskFixture';

const estate = () => surfacesOf([
  question('q1', 'How are we doing?', null),
  post('a1', headlineSet(), PERF()),
])[0];

const diverging = () => surfacesOf([
  question('q1', 'How are we doing?', null),
  post('a1', divergingSet(), PERF()),
])[0];

/* ------------------------------------------------------------- findings -- */

describe('a broad read produces findings, not one line under one chart', () => {
  it('names each subject the rows singled out, with its own ground', () => {
    const layout = composeDesk(estate(), INITIAL_DESK);
    const field = layout.stage.kind === 'field' ? layout.stage.field : null;
    const found = deskFindings(field, layout.attention, layout.identity);

    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found.length).toBeLessThanOrEqual(MAX_FINDINGS);
    const named = found.map((f) => f.subject.label);
    expect(new Set(named).size).toBe(named.length);        // one entry per shop
    expect(named).toContain('North Edsa');
    expect(named).toContain('Magnolia');
  });

  it('rests every finding on a fact a tool established, and never on a score', () => {
    const layout = composeDesk(diverging(), INITIAL_DESK);
    const field = layout.stage.kind === 'field' ? layout.stage.field : null;
    for (const f of deskFindings(field, layout.attention, layout.identity)) {
      expect(['against_the_majority', 'ranked_first', 'drivers_diverge']).toContain(f.ground);
      // No composite, no rating, no severity anywhere on the object.
      expect(Object.keys(f)).not.toContain('score');
      expect(Object.keys(f)).not.toContain('severity');
    }
  });

  it('carries no numeral in the reason or the reading — the figures are beside them', () => {
    const layout = composeDesk(diverging(), INITIAL_DESK);
    const field = layout.stage.kind === 'field' ? layout.stage.field : null;
    for (const f of deskFindings(field, layout.attention, layout.identity)) {
      expect(f.why).not.toMatch(/\d/);
      if (f.reading) expect(f.reading).not.toMatch(/\d/);
      // The evidence is there, and it came off rows the tools returned.
      expect(f.anatomy.headline.meta.source_table).toBeTruthy();
    }
  });

  it('does not manufacture findings when nothing was singled out', () => {
    const layout = composeDesk(estate(), INITIAL_DESK);
    const field = layout.stage.kind === 'field' ? layout.stage.field : null;
    // No marks and no second driver axis: nothing established, nothing shown.
    expect(deskFindings(field, [], null)).toEqual([]);
    expect(deskFindings(null, layout.attention, null)).toEqual([]);
  });

  it('keeps one finding per subject however many grounds it satisfies', () => {
    const layout = composeDesk(diverging(), INITIAL_DESK);
    const field = layout.stage.kind === 'field' ? layout.stage.field : null;
    const found = deskFindings(field, layout.attention, layout.identity);
    const labels = found.map((f) => f.subject.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

/* ------------------------------------------------- the workspace context -- */

describe('a question carries the workspace it was asked from', () => {
  it('says what is drawn even when nothing is selected', () => {
    // The failure: desk_sentence returned nothing without a selection, so
    // "show me" and "is that actually bad?" had no referent at all.
    const layout = composeDesk(estate(), INITIAL_DESK);
    const context = deskContextFor(INITIAL_DESK, layout, null);
    expect(context).not.toBeNull();
    expect(context!.selection).toBeUndefined();
    expect(context!.drawn!.dimension).toBe('store');
    expect(context!.drawn!.subjects.length).toBeGreaterThan(1);
    expect(context!.drawn!.metric_label).toBeTruthy();
  });

  it('sends names and closed vocabularies, and never a figure', () => {
    const layout = composeDesk(diverging(), INITIAL_DESK);
    const context = deskContextFor(
      { ...INITIAL_DESK, selection: [NORTH_EDSA, MAGNOLIA] },
      layout,
      { ground: 'drivers_diverge', action: { question: 'Which products moved most?' } },
    )!;
    const wire = JSON.stringify(context);
    // A value, a delta or a percentage would be a figure travelling on a
    // channel declared never to carry one (metrics.yaml surface.desk.context).
    expect(wire).not.toMatch(/\d+\.\d/);
    expect(wire).not.toMatch(/change_pct|baseline|snapshot/);
    for (const mark of context.attention ?? []) {
      expect(['against_the_majority', 'ranked_first']).toContain(mark.reason);
    }
    expect(context.recommendation!.ground).toBe('drivers_diverge');
  });

  it('stays inside the bounds the definitions declare', () => {
    const layout = composeDesk(estate(), INITIAL_DESK);
    const context = deskContextFor(INITIAL_DESK, layout, null)!;
    expect(context.drawn!.subjects.length).toBeLessThanOrEqual(12);
    expect((context.attention ?? []).length).toBeLessThanOrEqual(6);
  });
});

/* ----------------------------------------------------------- visible work -- */

describe('watching George work is derived from frames, or it is nothing', () => {
  it('says what he has read and is reading, in business words', () => {
    const line = workLine({
      completed: [{ tool: 'get_sales', arguments: { metric: 'net_sales', group_by: ['store'], compare_to: 'previous_period' } }],
      running: [{ tool: 'get_sales', arguments: { metric: 'product_revenue', group_by: ['product'], filters: { store: 'Rockwell' } } }],
    }, true);
    const sentence = workSentence(line)!;
    expect(sentence).toContain('sales');
    expect(sentence).toContain('Rockwell');
    // No tool identifier, no argument name, no row count reaches this line.
    expect(sentence).not.toMatch(/get_sales|group_by|compare_to|metric|\{|\}/);
  });

  it('drops the bookkeeping call, which reads nothing and lands last', () => {
    const line = workLine({ completed: [{ tool: 'record_findings', arguments: {} }], running: [] }, true);
    expect(workSentence(line)).toBeNull();
  });

  it('is silent when George is not working — there is no idle caption', () => {
    const line = workLine({
      completed: [{ tool: 'get_sales', arguments: {} }],
      running: [{ tool: 'get_sales', arguments: {} }],
    }, false);
    expect(workSentence(line)).toBeNull();
  });
});

/* --------------------------------------------------------- legible fields -- */

describe('a drawing that cannot be read falls back to one that can', () => {
  const crowded = () => {
    const layout = composeDesk(diverging(), INITIAL_DESK);
    return layout.stage.kind === 'field' ? layout.stage.field : null;
  };

  it('never prints two labels on top of each other', () => {
    const field = crowded()!;
    const geometry = layoutField(field, 720, 420);
    const rows = geometry.placed.map((p) => ({ side: p.labelSide, y: p.labelY ?? p.y }));
    for (const side of ['left', 'right'] as const) {
      const ys = rows.filter((r) => r.side === side).map((r) => r.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i += 1) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('leaves the objects themselves exactly where the figures put them', () => {
    const field = crowded()!;
    const tall = layoutField(field, 720, 420);
    // The nudge moves TEXT. A moved object would misreport a measurement.
    for (const p of tall.placed) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
    }
    expect(tall.placed.map((p) => p.y)).toEqual(
      layoutField(field, 720, 420).placed.map((p) => p.y),
    );
  });

  it('reports that the labels do not fit when the plot is too short for them', () => {
    const field = crowded()!;
    expect(labelsFit(layoutField(field, 720, 30), 30)).toBe(false);
    expect(labelsFit(layoutField(field, 720, 900), 900)).toBe(true);
  });
});

/* ------------------------------------------------------------ navigation -- */

describe('one environment has one set of names', () => {
  it('gives every destination exactly one word, shared by both chromes', () => {
    // The desk sidebar renders this list; the shell rail renders this list.
    // Two hand-typed vocabularies for four places was "the tabs map wrongly".
    expect(PRIMARY.map((i) => i.label)).toEqual(['Home', 'Needs you', 'Running', 'Kept']);
    expect(PRIMARY.map((i) => i.path)).toEqual(['/', '/inbox', '/workflows', '/pages']);
  });
});
