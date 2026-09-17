// @vitest-environment jsdom
/**
 * THE ARROWS AND THE LEADING LINES, IN THE DOM (P2S.1(b)(c)) — the owner's
 * rows 9 and 10: *"maybe just up and down arrows"*, *"add those like leading
 * lines from stage"*. The rules themselves are pure and held in
 * `beside.test.ts`; this holds that the components draw them.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FiguresArea, Wires } from './FiguresArea';

afterEach(cleanup);

function Area({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return <FiguresArea areaRef={ref}>{children}</FiguresArea>;
}

function size(el: HTMLElement, clientHeight: number, scrollHeight: number) {
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
}

describe('only when there is more — row 9', () => {
  it('draws no arrow when everything fits', () => {
    const { container } = render(<Area><p>one figure</p></Area>);
    expect((container.querySelector('.r-arr--up') as HTMLButtonElement).hidden).toBe(true);
    expect((container.querySelector('.r-arr--dn') as HTMLButtonElement).hidden).toBe(true);
  });

  it('shows down at the top, both in the middle, up at the bottom', async () => {
    const { container } = render(<Area><p>many figures</p></Area>);
    const area = container.querySelector('[data-figures-area]') as HTMLElement;
    const up = () => (container.querySelector('.r-arr--up') as HTMLButtonElement).hidden;
    const down = () => (container.querySelector('.r-arr--dn') as HTMLButtonElement).hidden;
    size(area, 500, 1400);
    area.scrollTop = 0;
    await act(async () => { fireEvent.scroll(area); });
    expect([up(), down()]).toEqual([true, false]);
    area.scrollTop = 450;
    await act(async () => { fireEvent.scroll(area); });
    expect([up(), down()]).toEqual([false, false]);
    area.scrollTop = 900;
    await act(async () => { fireEvent.scroll(area); });
    expect([up(), down()]).toEqual([false, true]);
  });

  it('moves 80% of the area per press, and never draws a scrollbar of its own', async () => {
    const { container } = render(<Area><p>many figures</p></Area>);
    const area = container.querySelector('[data-figures-area]') as HTMLElement;
    size(area, 500, 1400);
    const scrollBy = vi.fn();
    area.scrollBy = scrollBy as unknown as typeof area.scrollBy;
    await act(async () => { fireEvent.scroll(area); });
    fireEvent.click(screen.getByRole('button', { name: 'More figures' }));
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: 400 }));
    expect(area.className).toBe('r-figs');
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
