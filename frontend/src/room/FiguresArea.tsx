/**
 * THE TWO PIECES OF THE BESIDE ROOM THAT ARE BEHAVIOUR, NOT LAYOUT (P2S.1).
 *
 * `FiguresArea` is the one thing in the room that moves: the figures, by an up
 * and a down arrow that appear only when there is more (his row 9: *"i dont
 * really ever want to see a scroll down on the charts … maybe just up and down
 * arrows"*, then *"only charts area should be able to be scrolled"*).
 *
 * `Wires` is the leading lines (row 10, *"add those like leading lines from
 * stage"*): dashed, from his mark to the claim and to every figure, redrawn
 * when a figure lands, on resize and when the figures move.
 *
 * Both measure the DOM and hand the numbers to the pure rules in `beside.ts`,
 * which is where the rules are tested.
 */
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject,
} from 'react';
import { arrowStep, arrowsFor, wireEnds, type Box, type Wire } from './beside';
import { reducedMotion } from './render';

export function FiguresArea({ children, areaRef }: {
  children: ReactNode;
  areaRef: RefObject<HTMLDivElement | null>;
}) {
  const [arrows, setArrows] = useState({ up: false, down: false });

  const measure = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    const next = arrowsFor(el.scrollTop, el.clientHeight, el.scrollHeight);
    setArrows((was) => (was.up === next.up && was.down === next.down ? was : next));
  }, [areaRef]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // What is inside changes height as figures land and draw; that is "more"
    // arriving, and the arrows have to know.
    const grew = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (grew) {
      grew.observe(el);
      for (const child of Array.from(el.children)) grew.observe(child);
    }
    const changed = new MutationObserver(measure);
    changed.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-arrived'] });
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      grew?.disconnect();
      changed.disconnect();
    };
  }, [areaRef, measure]);

  const move = (by: 1 | -1) => {
    const el = areaRef.current;
    if (!el) return;
    el.scrollBy({ top: by * arrowStep(el.clientHeight), behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <div className="r-right-figs">
      <div className="r-figs" ref={areaRef} data-figures-area=""
           data-more-up={arrows.up ? 'yes' : 'no'} data-more-down={arrows.down ? 'yes' : 'no'}>
        {children}
      </div>
      <button type="button" className="r-arr r-arr--up" title="earlier figures"
              aria-label="Earlier figures" hidden={!arrows.up} onClick={() => move(-1)}>↑</button>
      <button type="button" className="r-arr r-arr--dn" title="more figures"
              aria-label="More figures" hidden={!arrows.down} onClick={() => move(1)}>↓</button>
    </div>
  );
}

/**
 * WHETHER AN ELEMENT HAS MORE BELOW WHAT IT SHOWS — for a column that scrolls
 * with no bar, so its foot can fade rather than cut (the words, 2026-09-17).
 */
export function useMoreBelow(ref: RefObject<HTMLElement | null>): boolean {
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setMore(arrowsFor(el.scrollTop, el.clientHeight, el.scrollHeight).down);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const grew = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    grew?.observe(el);
    const changed = new MutationObserver(measure);
    changed.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      grew?.disconnect();
      changed.disconnect();
    };
  }, [ref]);
  return more;
}

function boxOf(el: Element | null): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

/**
 * THE LEADING LINES. Drawn over `frameRef` (the composition), from the mark in
 * `markRef`, to the claim and to every figure that has ARRIVED inside
 * `areaRef` — a line to a figure still on its way would be a line to nothing.
 */
export function Wires({ frameRef, markRef, wordsRef, areaRef, version }: {
  frameRef: RefObject<HTMLElement | null>;
  markRef: RefObject<HTMLElement | null>;
  wordsRef: RefObject<HTMLElement | null>;
  areaRef: RefObject<HTMLElement | null>;
  /** Anything that changes what is drawn — a new answer, a new view. */
  version: string;
}) {
  const [wires, setWires] = useState<Wire[]>([]);
  const frame = useRef<number | null>(null);

  const draw = useCallback(() => {
    const host = frameRef.current;
    if (!host) return;
    const area = areaRef.current;
    const figures = area
      ? Array.from(area.querySelectorAll<HTMLElement>('[data-figure][data-arrived="yes"]'))
          .map((el) => ({ key: el.dataset.figure ?? '', box: boxOf(el) as Box }))
      : [];
    setWires(wireEnds({
      frame: boxOf(host) as Box,
      mark: boxOf(markRef.current?.querySelector('canvas') ?? markRef.current),
      claim: boxOf(wordsRef.current?.querySelector('.r-say--claim') ?? null),
      area: boxOf(area),
      figures,
    }));
  }, [frameRef, markRef, wordsRef, areaRef]);

  const soon = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => { frame.current = null; draw(); });
  }, [draw]);

  useEffect(() => {
    draw();
    const area = areaRef.current;
    window.addEventListener('resize', soon);
    area?.addEventListener('scroll', soon, { passive: true });
    const landed = new MutationObserver(soon);
    if (area) landed.observe(area, { subtree: true, attributes: true, attributeFilter: ['data-arrived', 'data-col'] });
    return () => {
      window.removeEventListener('resize', soon);
      area?.removeEventListener('scroll', soon);
      landed.disconnect();
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [draw, soon, areaRef, version]);

  return (
    <svg className="r-wires" aria-hidden="true">
      {wires.map((w) => (
        <line key={w.to} data-to={w.to} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
              strokeWidth={w.last ? 1.5 : 1} />
      ))}
    </svg>
  );
}
