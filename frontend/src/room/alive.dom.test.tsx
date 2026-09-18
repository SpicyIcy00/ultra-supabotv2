// @vitest-environment jsdom
/**
 * HIM, ALIVE — P2S.2(d)'s done-when: *"a dom test with a mocked canvas sees
 * four distinct drawings for the four states"*.
 *
 * The owner's rows 15 and 16: *"dont make it just an oval make it abnormal"*,
 * *"the right more alive"*, *"a moving thing like jarvis when processing like
 * alive"*. What is held here is that each state is its own DRAWING — not the
 * same drawing at another speed — and that the state comes from the turn
 * stream, never from a clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AliveMark } from './AliveMark';
import { MARK_FORMS, drawMark, formFrom, markStateOf, motes, type MarkState, type Pen } from './alive';
import type { AnswerTurn } from './data';

/**
 * A 2D context that records WHAT was drawn and in which colour, and drops the
 * coordinates — so two frames differ only where the drawing differs, not where
 * a breath moved a point by a pixel.
 */
function recorder(): { pen: Pen; log: string[] } {
  const log: string[] = [];
  const state = { globalAlpha: 1, fillStyle: '' as unknown, strokeStyle: '' as unknown, lineWidth: 1 };
  const pen = {
    clearRect: () => log.push('clear'),
    save: () => log.push('save'),
    restore: () => log.push('restore'),
    translate: () => {},
    scale: () => {},
    createRadialGradient: () => ({ addColorStop: (_: number, c: string) => log.push(`stop ${c}`) }),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => log.push('close'),
    fill: () => log.push(`fill ${typeof state.fillStyle === 'string' ? state.fillStyle : 'gradient'} α${state.globalAlpha}`),
    stroke: () => log.push(`stroke ${String(state.strokeStyle)} w${state.lineWidth} α${state.globalAlpha}`),
    arc: () => log.push('mote'),
    setLineDash: (d: number[]) => log.push(`dash ${d.join(',')}`),
  } as unknown as Pen;
  return {
    log,
    pen: new Proxy(pen, {
      set(target, key, value) {
        (state as Record<string, unknown>)[key as string] = value;
        (target as unknown as Record<string, unknown>)[key as string] = value;
        return true;
      },
      get(target, key) {
        if (key in state && !(key in target)) return (state as Record<string, unknown>)[key as string];
        return (target as unknown as Record<string, unknown>)[key as string];
      },
    }),
  };
}

const COLOURS = { ink: 'INK', quiet: 'QUIET', up: 'UP', act: 'ACT' };
const STATES: MarkState[] = ['idle', 'reading', 'writing', 'need'];

let pens: { pen: Pen; log: string[] }[] = [];
beforeEach(() => {
  pens = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const r = recorder();
    pens.push(r);
    return r.pen as unknown as CanvasRenderingContext2D;
  });
  // One frame per mount: the loop asks for the next and is never given it.
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('four states, four drawings', () => {
  it('draws each state differently through the real component', () => {
    const drawings = STATES.map((state) => {
      const { container, unmount } = render(<AliveMark state={state} drawn={2} pulses={1} />);
      expect(container.querySelector('canvas')?.getAttribute('data-state')).toBe(state);
      const log = pens[pens.length - 1].log.join('\n');
      unmount();
      return log;
    });
    expect(new Set(drawings).size).toBe(4);
  });

  it('turns a ring only while reading, and draws motes in from the orbit as reads land', () => {
    const { pen, log } = recorder();
    drawMark(pen, { state: 'reading', failed: false, form: 'wide', t: 1, sincePulse: 0.2, drawn: 2, reduce: false, colours: COLOURS }, motes());
    expect(log.filter((l) => l.startsWith('fill UP'))).toHaveLength(2);
    expect(log.some((l) => l.startsWith('stroke UP'))).toBe(true);
  });

  it('wears the warm colour only when something needs him — his exemption, and only that', () => {
    const colourOf = (state: MarkState) => {
      const { pen, log } = recorder();
      drawMark(pen, { state, failed: false, form: 'wide', t: 1, sincePulse: null, drawn: 0, reduce: false, colours: COLOURS }, motes());
      return log.some((l) => l.includes('ACT'));
    };
    expect(STATES.filter(colourOf)).toEqual(['need']);
  });

  it('breaks the drawing when a turn failed, and changes no colour (UI rule 5)', () => {
    const run = (failed: boolean) => {
      const { pen, log } = recorder();
      drawMark(pen, { state: 'idle', failed, form: 'wide', t: 1, sincePulse: null, drawn: 0, reduce: false, colours: COLOURS }, motes());
      return log;
    };
    const ok = run(false);
    const broken = run(true);
    expect(broken).not.toEqual(ok);
    expect(broken.some((l) => l.startsWith('dash'))).toBe(true);
    const colours = (log: string[]) => new Set(log.flatMap((l) => l.match(/INK|QUIET|UP|ACT/g) ?? []));
    expect(colours(broken)).toEqual(colours(ok));
  });
});

describe('the state comes from the stream, not a clock', () => {
  const turn = (calls: { seq: number; tool: string; result?: unknown }[], extra: object = {}) => ({
    role: 'bob', text: '', thinking: '', at: '2026-09-17T00:00:00Z', toolCalls: calls, ...extra,
  }) as unknown as AnswerTurn;
  const landed = { seq: 1, tool: 'get_sales', result: { rows: [{ value: 1 }], meta: {} } };
  const running = { seq: 2, tool: 'get_stock' };

  it('reads while a read runs, writes while nothing does', () => {
    expect(markStateOf({ busy: true, turn: turn([landed, running]), landing: 0, needsYou: 0 }).state).toBe('reading');
    expect(markStateOf({ busy: true, turn: turn([landed]), landing: 0, needsYou: 0 }).state).toBe('writing');
  });

  it('keeps reading while figures land, and is idle after the last', () => {
    expect(markStateOf({ busy: false, turn: turn([landed]), landing: 2, needsYou: 0 }).state).toBe('reading');
    expect(markStateOf({ busy: false, turn: turn([landed]), landing: 0, needsYou: 0 }).state).toBe('idle');
  });

  it('needs you only from a loaded count', () => {
    expect(markStateOf({ busy: false, turn: null, landing: 0, needsYou: 3 }).state).toBe('need');
    expect(markStateOf({ busy: false, turn: null, landing: 0, needsYou: undefined }).state).toBe('idle');
  });

  it('counts the reads that landed, and says a turn failed', () => {
    const got = markStateOf({ busy: false, turn: turn([landed], { error: 'boom' }), landing: 0, needsYou: 0 });
    expect(got.reads).toBe(1);
    expect(got.failed).toBe(true);
  });
});

describe('the form is his to point at', () => {
  it('ships three forms behind ?form=, the design\'s irregular one by default', () => {
    expect(MARK_FORMS).toEqual(['wide', 'round', 'tide']);
    expect(formFrom('')).toBe('wide');
    expect(formFrom('?form=round')).toBe('round');
    expect(formFrom('?form=tide')).toBe('tide');
    expect(formFrom('?form=oval')).toBe('wide');
  });

  it('draws each form as a different outline', () => {
    const outline = (form: 'wide' | 'round' | 'tide') => {
      const pts: string[] = [];
      const { pen } = recorder();
      (pen as unknown as { lineTo: (x: number, y: number) => void }).lineTo =
        (x, y) => { pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); };
      drawMark(pen, { state: 'idle', failed: false, form, t: 0, sincePulse: null, drawn: 0, reduce: true, colours: COLOURS }, motes());
      return pts.join(' ');
    };
    expect(new Set([outline('wide'), outline('round'), outline('tide')]).size).toBe(3);
  });

  it('carries the form on the canvas', () => {
    const { container } = render(<AliveMark form="tide" />);
    expect(container.querySelector('canvas')?.getAttribute('data-form')).toBe('tide');
  });
});
