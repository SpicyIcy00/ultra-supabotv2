/**
 * HIM, ALIVE — what the mark is doing, and how each state is drawn (P2S.2(d)).
 *
 * The design's `draw()` (`ops/ideal/bob-ahead-of-me.html`), ported and
 * split in two so both halves can be held by a test:
 *
 *   `markStateOf`  WHICH state, read off the turn stream the room already
 *                  carries — never a timer. His words: *"a moving thing like
 *                  jarvis when processing like alive"*, and the design's own:
 *                  *"Not a thinking animation: everything it does maps to his
 *                  state."*
 *   `drawMark`     HOW that state is drawn, one frame, onto any 2D context.
 *
 * THE FOUR STATES, as the design writes them:
 *   idle     a slow breath; three motes drift on a wide orbit
 *   reading  one pulse per read; a ring turns; a mote drawn in for each read
 *   writing  the motes settle close, the ring steadies
 *   need     warm, and still: he is waiting on you
 *
 * AND A FIFTH FACT THAT IS NOT A STATE: the turn failed. CLAUDE.md UI rule 5
 * makes his mark the one exemption to "one colour means needs you", and says
 * its error state changes the DRAWING, never the colour — so a failure breaks
 * the ring into dashes and stills the motes, in his own ink.
 *
 * THE FORM IS THE OWNER'S TO WORKSHOP (*"except the alive we can workshop the
 * shape color and everything"*). Three forms ship behind `?form=` so he can
 * point rather than describe: `wide` (the design's irregular one, the
 * default), `round`, and `tide`. Nothing else in the room depends on which.
 */
import { MARK_H, MARK_W, markEdge } from './beside';
import type { AnswerTurn } from './data';
import { stepsOf } from './work';

export type MarkState = 'idle' | 'reading' | 'writing' | 'need';
export type MarkForm = 'wide' | 'round' | 'tide';
export const MARK_FORMS: readonly MarkForm[] = ['wide', 'round', 'tide'];

/** `?form=round` — the switch he points with. Anything else is the design's. */
export function formFrom(search: string | null | undefined): MarkForm {
  let asked: string | null = null;
  try { asked = new URLSearchParams(search ?? '').get('form'); } catch { asked = null; }
  return (MARK_FORMS as readonly string[]).includes(asked ?? '') ? asked as MarkForm : 'wide';
}

/**
 * WHAT HE IS DOING, off what the stream has already said.
 *
 *   busy, a read still running        reading
 *   busy, nothing running             writing — connecting what has landed
 *   done, figures still arriving      reading — the design: "the mark is
 *                                     `reading` while they land and `idle`
 *                                     after the last"
 *   done, something needs a decision  need — only from a LOADED count (UI 8)
 *   otherwise                         idle
 */
export function markStateOf(p: {
  busy: boolean;
  turn: AnswerTurn | null | undefined;
  /** Figures of the answer that have not arrived yet. */
  landing: number;
  /** The approvals count as READ; undefined while unread draws no need. */
  needsYou: number | undefined;
}): { state: MarkState; failed: boolean; reads: number } {
  const steps = stepsOf(p.turn ?? null);
  const reads = steps.filter((s) => s.state === 'landed' && s.index !== null).length;
  const failed = !p.busy && Boolean(p.turn?.error);
  if (p.busy) {
    return { state: steps.some((s) => s.state === 'running') ? 'reading' : 'writing', failed, reads };
  }
  if (p.landing > 0) return { state: 'reading', failed, reads };
  if ((p.needsYou ?? 0) > 0) return { state: 'need', failed, reads };
  return { state: 'idle', failed, reads };
}

/* ------------------------------------------------------------------ forms */

/** How far the edge of a form moves at angle `theta`, time `t`. */
export function edgeOf(form: MarkForm, theta: number, t: number): number {
  if (form === 'round') return 1;
  if (form === 'tide') {
    // Long and low: two slow swells and a faint ripple, flatter than `wide`.
    return 1 + 0.2 * Math.sin(2 * theta + t * 0.3) + 0.07 * Math.sin(7 * theta - t * 0.6 + 0.8);
  }
  return markEdge(theta, t);
}

/** The stretch from a round form to the canvas — the design's `ex`, `ey`. */
export function stretchOf(form: MarkForm): { ex: number; ey: number } {
  const reach = 103 * 1.36 * 1.23;
  if (form === 'round') {
    // Round on a wide canvas: one scale for both axes, fitted to the height.
    const k = (MARK_H / 2) / reach;
    return { ex: k, ey: k };
  }
  if (form === 'tide') return { ex: (MARK_W / 2) / reach * 1.06, ey: (MARK_H / 2) / reach * 0.8 };
  return { ex: (MARK_W / 2) / reach, ey: (MARK_H / 2) / reach };
}

/* ---------------------------------------------------------------- drawing */

/** The smallest slice of a 2D context the mark draws with — so a test can record it. */
export type Pen = Pick<CanvasRenderingContext2D,
  'clearRect' | 'save' | 'restore' | 'translate' | 'scale' | 'createRadialGradient'
  | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'fill' | 'stroke' | 'arc' | 'setLineDash'>
  & { globalAlpha: number; fillStyle: unknown; strokeStyle: unknown; lineWidth: number };

export interface Mote { a: number; r: number; speed: number }

export function motes(): Mote[] {
  return [0, 1, 2].map((i) => ({ a: i * 2.1, r: 0, speed: 0.22 + i * 0.05 }));
}

export interface Colours {
  ink: string;
  quiet: string;
  up: string;
  /** "Needs you". The mark is the one exemption to UI rule 5. */
  act: string;
}

export interface Frame {
  state: MarkState;
  failed: boolean;
  form: MarkForm;
  /** Seconds since the mark was mounted. */
  t: number;
  /** Seconds since the last read landed, or null for none yet. */
  sincePulse: number | null;
  /** How many reads have landed in this turn. */
  drawn: number;
  reduce: boolean;
  colours: Colours;
}

/**
 * ONE FRAME OF HIM. The design's `draw(now)`, with its state, form and colours
 * handed in rather than read from globals. `ms` is advanced by the caller.
 */
export function drawMark(cx: Pen, f: Frame, ms: Mote[], w = MARK_W, h = MARK_H): void {
  const cxm = w / 2;
  const cym = h / 2;
  const t = f.reduce ? 0 : f.t;
  const { ex, ey } = stretchOf(f.form);
  const edge = (th: number) => edgeOf(f.form, th, t);
  const form = (rad: number, from?: number, to?: number) => {
    const n = 140;
    const a0 = from ?? 0;
    const a1 = to ?? Math.PI * 2;
    cx.beginPath();
    for (let k = 0; k <= n; k += 1) {
      const th = a0 + ((a1 - a0) * k) / n;
      const e = edge(th);
      const x = cxm + Math.cos(th) * rad * ex * e;
      const y = cym + Math.sin(th) * rad * ey * e;
      if (k === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
    }
    if (from === undefined) cx.closePath();
  };

  cx.clearRect(0, 0, w, h);
  const { ink, act, quiet, up } = f.colours;
  const mode = f.state;
  const breath = f.reduce ? 0 : Math.sin(t * 0.8) * 5;
  let r = 84 + breath;
  const body = mode === 'need' ? act : ink;
  if (mode === 'reading' && !f.reduce && f.sincePulse !== null) {
    const dt = f.sincePulse;
    r += Math.max(0, Math.sin(dt * Math.PI * 2) * 14) * Math.max(0, 1 - dt / 0.9);
  }

  // The halo breathes with him: wider and softer when quiet, tighter at work.
  const haloR = r * (mode === 'idle' ? 1.36 : 1.25);
  cx.save();
  cx.translate(cxm, cym);
  cx.scale(ex, ey);
  const g = cx.createRadialGradient(0, 0, r * 0.7, 0, 0, haloR);
  g.addColorStop(0, body);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  cx.globalAlpha = mode === 'idle' ? 0.12 : 0.2;
  cx.fillStyle = g;
  cx.beginPath();
  for (let k = 0; k <= 120; k += 1) {
    const th = (k / 120) * Math.PI * 2;
    const e = edge(th);
    const x = Math.cos(th) * haloR * e;
    const y = Math.sin(th) * haloR * e;
    if (k === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
  }
  cx.closePath();
  cx.fill();
  cx.restore();

  // Motes: far and slow when idle; drawn in as reads land; close while writing;
  // still when the turn failed.
  const orbit = mode === 'idle' ? r * 1.3 : mode === 'writing' ? r * 1.15 : r * 1.22;
  ms.forEach((m, i) => {
    const moving = !f.reduce && !f.failed && mode !== 'need';
    if (moving) m.a += (mode === 'reading' ? m.speed * 2.2 : m.speed) * 0.016;
    const drawnIn = mode === 'reading' && i < f.drawn;
    const target = drawnIn ? r * 1.25 : orbit;
    if (!m.r) m.r = orbit;
    m.r += (target - m.r) * (f.reduce ? 1 : 0.06);
    const me = edge(m.a);
    cx.globalAlpha = mode === 'need' ? 0.35 : 0.75;
    cx.fillStyle = drawnIn ? up : quiet;
    cx.beginPath();
    cx.arc(cxm + Math.cos(m.a) * m.r * ex * me, cym + Math.sin(m.a) * m.r * ey * me, 6, 0, Math.PI * 2);
    cx.fill();
  });

  // The body.
  cx.globalAlpha = 1;
  cx.fillStyle = body;
  form(r);
  cx.fill();

  // The ring: turns while reading, steadies while writing, still and warm while waiting.
  if (mode === 'reading') {
    cx.strokeStyle = up; cx.lineWidth = 3.5; cx.globalAlpha = 0.9;
    form(r + 24, t * 2.6, t * 2.6 + Math.PI * 1.2);
    cx.stroke();
  } else if (mode === 'writing') {
    cx.strokeStyle = ink; cx.lineWidth = 3; cx.globalAlpha = 0.5;
    form(r + 24);
    cx.stroke();
  } else if (mode === 'need') {
    cx.strokeStyle = act; cx.lineWidth = 3.5; cx.globalAlpha = 0.6;
    form(r + 24);
    cx.stroke();
  }

  // A FAILED TURN BREAKS THE RING — the drawing changes, the colour does not.
  if (f.failed) {
    cx.strokeStyle = ink; cx.lineWidth = 2.5; cx.globalAlpha = 0.7;
    cx.setLineDash([10, 14]);
    form(r + 40);
    cx.stroke();
    cx.setLineDash([]);
  }
  cx.globalAlpha = 1;
}
