/**
 * THE TWO PIECES OF THE BESIDE ROOM THAT ARE BEHAVIOUR, NOT LAYOUT (P2S.1).
 *
 * `FiguresArea` was the one thing in the room that moved: the figures, by an
 * up and a down arrow (his row 9). The room scrolls as one page since P10 and
 * it is a plain wrapper now — the area keeps its ref, because `scrollToFigure`
 * and the wires find the figures through it.
 *
 * `Wires` is the leading lines (row 10, *"add those like leading lines from
 * stage"*): dashed, from his mark to the claim and to every figure, redrawn
 * when a figure lands, on resize and when the figures move.
 *
 * Both measure the DOM and hand the numbers to the pure rules in `beside.ts`,
 * which is where the rules are tested.
 */
import {
  useCallback, useEffect, useRef, useState, type ReactNode, type RefObject,
} from 'react';
import { wireEnds, type Box, type Wire } from './beside';
import { reducedMotion } from './render';

export function FiguresArea({ children, areaRef }: {
  children: ReactNode;
  areaRef: RefObject<HTMLDivElement | null>;
}) {
  // THE PAGE SCROLLS, NOT THE PANE (P10, 2026-09-21). This was the one thing
  // in the room that moved: an inner scroller with an up and a down arrow,
  // because the owner asked for exactly that on 2026-09-17 (*"i dont really
  // ever want to see a scroll down on the charts ... maybe just up and down
  // arrows"*, *"only charts area should be able to be scrolled"*). Asked a
  // year of screens later whether the room should scroll as one document
  // instead, he said *"ok do both"* — so the arrows are gone with the pane
  // they moved, and what is left is the area itself, which `scrollToFigure`
  // and the wires still find by its ref.
  return (
    <div className="r-right-figs">
      <div className="r-figs" ref={areaRef} data-figures-area="">
        {children}
      </div>
    </div>
  );
}

/* `scrollWords` and `useMoreBelow` went with the panes they measured (P10):
   one page scrolls, so nothing here has a foot to fade or a step to move. */

/**
 * A FIGURE IN HIS WORDS WAS TAPPED: bring the figure that read came out of
 * into view and light its READ label for a moment. The door it used to open
 * was Behind it, which went on 2026-09-17 at the owner's word.
 */
export function scrollToFigure(area: HTMLElement | null, turn: number, seq: number) {
  const el = area?.querySelector<HTMLElement>(
    `[data-figure][data-turn="${turn}"][data-seq="${seq}"]`);
  if (!el) return;
  el.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  el.setAttribute('data-flash', 'yes');
  window.setTimeout(() => el.removeAttribute('data-flash'), 1400);
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
    // A LINE TO EACH POINT, NOT TO EACH FIGURE (P2S.8). What is gathered under
    // a point reaches him THROUGH that point — that is what gathering means —
    // and a line to every child would draw the composition back into the pile
    // of separate things the gathering exists to end.
    // ONE LINE TO A PAGE HE WROTE (P7). On a document the figures sit inside
    // his prose, and a line to each of them ran through the paragraphs it had
    // to cross to get there. The page is one thing he made: the line goes to
    // where it opens.
    const page = area?.querySelector<HTMLElement>('.r-doc-lede, .r-doc-sec') ?? null;
    const figures = page
      ? [{ key: 'page', box: boxOf(page) as Box }]
      : area
        ? Array.from(area.querySelectorAll<HTMLElement>(
          '[data-figure][data-arrived="yes"]:not([data-under])'))
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
