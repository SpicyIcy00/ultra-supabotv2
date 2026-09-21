// @vitest-environment jsdom
/**
 * THE ARROWS AND THE LEADING LINES, IN THE DOM (P2S.1(b)(c)) — the owner's
 * rows 9 and 10: *"maybe just up and down arrows"*, *"add those like leading
 * lines from stage"*. The rules themselves are pure and held in
 * `beside.test.ts`; this holds that the components draw them.
 */
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { FiguresArea, Wires } from './FiguresArea';

afterEach(cleanup);

function Area({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return <FiguresArea areaRef={ref}>{children}</FiguresArea>;
}

describe('the figures area is a plain wrapper now — P10', () => {
  /**
   * It drew an up and a down arrow over an inner scroller, which is what the
   * owner asked for on 2026-09-17: *"i dont really ever want to see a scroll
   * down on the charts ... maybe just up and down arrows"*, *"only charts area
   * should be able to be scrolled"*. Looking at a document drawn inside that
   * pane on 2026-09-21: *"it still feels like its trying to fill in columns
   * not the one big page"* — and, asked whether the room should scroll as one
   * document instead, *"ok do both"*. The room scrolls; this holds nothing.
   */
  it('draws no arrows', () => {
    const { container } = render(<Area><p>many figures</p></Area>);
    expect(container.querySelector('.r-arr')).toBeNull();
  });

  it('still carries the area its ref and the wires find it by', () => {
    const { container } = render(<Area><p>one figure</p></Area>);
    const area = container.querySelector('[data-figures-area]') as HTMLElement;
    expect(area.className).toBe('r-figs');
    expect(area.textContent).toBe('one figure');
  });

  it('claims nothing about how much there is below', () => {
    // `data-more-down` fed a fade at the foot of a pane that no longer exists.
    const { container } = render(<Area><p>many figures</p></Area>);
    expect(container.querySelector('[data-more-down]')).toBeNull();
  });
});

function Composition({ arrived }: { arrived: ('yes' | 'no')[] }) {
  const frame = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  return (
    <div ref={frame}>
      <Wires frameRef={frame} markRef={mark} wordsRef={words} areaRef={area} version={arrived.join()} />
      <div ref={mark}><canvas /></div>
      <div ref={words}><h2 className="r-say--claim">The claim.</h2></div>
      <div ref={area}>
        {arrived.map((a, i) => <div key={i} data-figure={`f${i}`} data-arrived={a} />)}
      </div>
    </div>
  );
}

describe('a line from him to the claim and to every figure that has landed — row 10', () => {
  it('draws one to the claim and one per arrived figure', () => {
    const { container } = render(<Composition arrived={['yes', 'yes', 'yes']} />);
    const to = [...container.querySelectorAll('.r-wires line')].map((l) => l.getAttribute('data-to'));
    expect(to).toEqual(['claim', 'f0', 'f1', 'f2']);
  });

  it('draws no line to a figure still on its way', () => {
    const { container } = render(<Composition arrived={['yes', 'no']} />);
    const to = [...container.querySelectorAll('.r-wires line')].map((l) => l.getAttribute('data-to'));
    expect(to).toEqual(['claim', 'f0']);
  });
});
