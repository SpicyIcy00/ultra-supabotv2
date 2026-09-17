/**
 * HIM — the mark the words and the lines come from (P2S.1(b)).
 *
 * The design's `draw()`, at rest. Its PLACE and SIZE are this card's: a 680×420
 * canvas at 136% of its 580 column, pulled up and out so its glow runs past
 * the column while its body spans most of it — the owner, twice: *"alive is
 * too small … make the alive a more wide horizontal figure but it has to be
 * bigger"*, then *"you made it smaller it should stay big"*.
 *
 * IT IS DRAWN STILL. Breathing, pulsing per read and turning a ring are
 * P2S.2(d), driven by the turn stream; drawing them here off a timer would be
 * a mark that moves for nothing, which the design rules out in its own words
 * ("It never moves for effect"). The form is the design's wide irregular one,
 * not an oval (*"dont make it just an oval make it abnormal"*); its shape and
 * colour are still the owner's to workshop, so nothing else depends on them.
 *
 * Its only colours are the ink and the quiet grey, read from the tokens at
 * draw time so a theme change redraws it. It carries no accent: "needs you" is
 * a state P2S.2(d) draws, and nothing here knows about one.
 */
import { useEffect, useRef } from 'react';
import { MARK_H, MARK_W, markEdge, markGeometry } from './beside';

export function AliveMark() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    draw(canvas);
    // A THEME CHANGE IS A REDRAW, whichever way it came: the switch in the
    // sidebar writes an attribute on <html>, the system flips a media query.
    const redraw = () => draw(canvas);
    const seen = new MutationObserver(redraw);
    seen.observe(document.documentElement, { attributes: true, attributeFilter: ['data-room-theme'] });
    let media: MediaQueryList | null = null;
    try { media = window.matchMedia?.('(prefers-color-scheme: light)') ?? null; } catch { media = null; }
    media?.addEventListener?.('change', redraw);
    return () => { seen.disconnect(); media?.removeEventListener?.('change', redraw); };
  }, []);

  return (
    <canvas
      ref={ref}
      className="r-alive"
      width={MARK_W}
      height={MARK_H}
      data-state="idle"
      aria-hidden="true"
    />
  );
}

function draw(canvas: HTMLCanvasElement) {
  let cx: CanvasRenderingContext2D | null = null;
  try { cx = canvas.getContext('2d'); } catch { cx = null; }
  if (!cx) return;
  const tok = (name: string, fallback: string) => {
    try {
      return getComputedStyle(canvas).getPropertyValue(name).trim() || fallback;
    } catch {
      return fallback;
    }
  };
  const ink = tok('--ink', '#f7f8f8');
  const quiet = tok('--ink-4', '#62666d');
  const { ex, ey, radius: r } = markGeometry();
  const w = canvas.width;
  const h = canvas.height;
  const cxm = w / 2;
  const cym = h / 2;

  cx.clearRect(0, 0, w, h);

  // The halo, following the same irregular edge, wider and softer at rest.
  const haloR = r * 1.36;
  cx.save();
  cx.translate(cxm, cym);
  cx.scale(ex, ey);
  const g = cx.createRadialGradient(0, 0, r * 0.7, 0, 0, haloR);
  g.addColorStop(0, ink);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  cx.globalAlpha = 0.12;
  cx.fillStyle = g;
  cx.beginPath();
  for (let k = 0; k <= 120; k += 1) {
    const th = (k / 120) * Math.PI * 2;
    const e = markEdge(th);
    const x = Math.cos(th) * haloR * e;
    const y = Math.sin(th) * haloR * e;
    if (k === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
  }
  cx.closePath();
  cx.fill();
  cx.restore();

  // Three motes on the wide orbit: the watches he keeps, at rest.
  const orbit = r * 1.3;
  [0, 1, 2].forEach((i) => {
    const a = i * 2.1;
    const e = markEdge(a);
    cx!.globalAlpha = 0.75;
    cx!.fillStyle = quiet;
    cx!.beginPath();
    cx!.arc(cxm + Math.cos(a) * orbit * ex * e, cym + Math.sin(a) * orbit * ey * e, 6, 0, Math.PI * 2);
    cx!.fill();
  });

  // The body.
  cx.globalAlpha = 1;
  cx.fillStyle = ink;
  cx.beginPath();
  for (let k = 0; k <= 140; k += 1) {
    const th = (k / 140) * Math.PI * 2;
    const e = markEdge(th);
    const x = cxm + Math.cos(th) * r * ex * e;
    const y = cym + Math.sin(th) * r * ey * e;
    if (k === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
  }
  cx.closePath();
  cx.fill();
}
