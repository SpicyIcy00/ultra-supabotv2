/**
 * HIM — the mark the words and the lines come from.
 *
 * P2S.1(b) set its PLACE and SIZE: a 680×420 canvas at 136% of its 580
 * column, pulled up and out so its glow runs past the column while its body
 * spans most of it — the owner, twice: *"alive is too small … make the alive a
 * more wide horizontal figure but it has to be bigger"*, then *"you made it
 * smaller it should stay big"*.
 *
 * P2S.2(d) MAKES IT ALIVE, and only from what the room already knows: the
 * state is handed in by `Room` off the turn stream (`alive.markStateOf`), and a
 * pulse is a read landing or a figure arriving — never a clock deciding he is
 * busy. The drawing is `alive.drawMark`; this component is the frame loop and
 * the colours.
 *
 * ITS COLOURS ARE READ FROM THE TOKENS AT DRAW TIME, so a theme change is the
 * next frame. It is the ONE thing in the room that may wear the "needs you"
 * colour outside an approval (CLAUDE.md UI rule 5, the mark's exemption), and
 * it does so only in the `need` state; a failed turn changes the drawing.
 */
import { useEffect, useRef } from 'react';
import { MARK_H, MARK_W } from './beside';
import { drawMark, formFrom, motes, type Colours, type MarkForm, type MarkState, type Pen } from './alive';
import { reducedMotion } from './render';

export function AliveMark({ state = 'idle', failed = false, pulses = 0, drawn = 0, form }: {
  state?: MarkState;
  failed?: boolean;
  /** A counter: every increase is one read landing or one figure arriving. */
  pulses?: number;
  /** How many reads of this turn have landed — a mote drawn in for each. */
  drawn?: number;
  /** The workshop switch; read from `?form=` when not given. */
  form?: MarkForm;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const shape = form ?? formFrom(typeof window === 'undefined' ? '' : window.location.search);
  // The loop reads the newest props without restarting.
  const live = useRef({ state, failed, drawn, shape, pulseAt: null as number | null });
  const seenPulses = useRef(pulses);
  live.current.state = state;
  live.current.failed = failed;
  live.current.drawn = drawn;
  live.current.shape = shape;
  if (pulses !== seenPulses.current) {
    seenPulses.current = pulses;
    live.current.pulseAt = now();
  }

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    let cx: CanvasRenderingContext2D | null = null;
    try { cx = canvas.getContext('2d'); } catch { cx = null; }
    if (!cx) return undefined;
    const pen = cx as unknown as Pen;
    const started = now();
    const orbiting = motes();
    const reduce = reducedMotion();
    let frame: number | null = null;
    const paint = () => {
      const l = live.current;
      const at = now();
      drawMark(pen, {
        state: l.state,
        failed: l.failed,
        form: l.shape,
        t: (at - started) / 1000,
        sincePulse: l.pulseAt === null ? null : (at - l.pulseAt) / 1000,
        drawn: l.drawn,
        reduce,
        colours: coloursOf(canvas),
      }, orbiting);
    };
    const tick = () => {
      paint();
      frame = raf(tick);
    };
    // REDUCED MOTION DRAWS EACH STATE STILL: one frame now, and one whenever
    // the state or the theme changes (below), never a loop.
    if (reduce) paint(); else tick();
    const seen = new MutationObserver(paint);
    seen.observe(document.documentElement, { attributes: true, attributeFilter: ['data-room-theme'] });
    return () => {
      if (frame !== null) caf(frame);
      seen.disconnect();
    };
  }, []);

  // Still frames need a redraw when the state moves; a loop draws it anyway.
  useEffect(() => {
    if (!reducedMotion()) return;
    const canvas = ref.current;
    let cx: CanvasRenderingContext2D | null = null;
    try { cx = canvas?.getContext('2d') ?? null; } catch { cx = null; }
    if (!canvas || !cx) return;
    drawMark(cx as unknown as Pen, {
      state, failed, form: shape, t: 0, sincePulse: null, drawn, reduce: true,
      colours: coloursOf(canvas),
    }, motes());
  }, [state, failed, shape, drawn]);

  return (
    <canvas
      ref={ref}
      className="r-alive"
      width={MARK_W}
      height={MARK_H}
      data-state={state}
      data-failed={failed ? 'yes' : undefined}
      data-form={shape}
      aria-hidden="true"
    />
  );
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function raf(fn: () => void): number | null {
  return typeof window !== 'undefined' && window.requestAnimationFrame
    ? window.requestAnimationFrame(fn) : null;
}

function caf(id: number) {
  if (typeof window !== 'undefined' && window.cancelAnimationFrame) window.cancelAnimationFrame(id);
}

/** The ink, the quiet grey, up, and the one warm colour — off the tokens, now. */
function coloursOf(canvas: HTMLCanvasElement): Colours {
  let style: CSSStyleDeclaration | null = null;
  try { style = getComputedStyle(canvas); } catch { style = null; }
  const tok = (name: string, fallback: string) => style?.getPropertyValue(name).trim() || fallback;
  // `--up` and the reserved colour are `r, g, b` triples in room.css.
  const triple = (name: string, fallback: string) => {
    const v = tok(name, '');
    return v ? `rgb(${v})` : fallback;
  };
  return {
    ink: tok('--ink', '#f7f8f8'),
    quiet: tok('--ink-4', '#62666d'),
    up: triple('--up', '#2FA874'),
    act: triple('--accent', '#E8B04B'),
  };
}
