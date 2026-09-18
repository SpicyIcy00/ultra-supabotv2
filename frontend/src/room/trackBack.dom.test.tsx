// @vitest-environment jsdom
/**
 * THE OWNER'S REPORT ON THE LIVE ROOM, 2026-09-18 (ops/DOGFOOD_LOG.md):
 *
 *   "some small changes it stops too early. it should stop almost right before
 *   the text bar. also whats more from george? why is it hiding? … i should see
 *   what i ask too like around the area of the blob just something small and
 *   also be a track back feature … when you can go to your last question and
 *   its last resutls"
 *
 * Held here: the foot of the room sits just above the line; his words are drawn
 * whole, with his emphasis drawn and never printed; the question is on screen;
 * and an arrow steps back to an earlier question with no model call.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { thoughtsOf } from './beside';
import { Reading } from './Reading';
import { questionsOf } from './history';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const ROOM = readFileSync(join(__dirname, 'Room.tsx'), 'utf8');
const CSS = postcss.parse(readFileSync(join(__dirname, 'room.css'), 'utf8'));

function declaration(selector: string, prop: string): string | undefined {
  let found: string | undefined;
  CSS.walkRules((rule) => {
    if (rule.selector !== selector || rule.parent?.type !== 'root') return;
    rule.walkDecls(prop, (d) => { found = d.value; });
  });
  return found;
}

describe('"it stops too early"', () => {
  it('ends the room just above the line, not 150px above it', () => {
    const padding = declaration('.r-beside', 'padding') ?? '';
    const bottom = Number(/(\d+)px\s*$/.exec(padding)?.[1]);
    // The line stands 20px off the bottom and is about 54px tall.
    expect(bottom).toBeGreaterThanOrEqual(74);
    expect(bottom).toBeLessThanOrEqual(96);
  });
});

describe('"whats more from george? why is it hiding?"', () => {
  it('draws the rest of what he said without a tap', () => {
    expect(ROOM).not.toMatch(/more from George'/);
    expect(ROOM).not.toMatch(/moreOpen/);
    expect(ROOM).toMatch(/\{!busy && \(\s*<Reading part="rest"/);
  });

  it('never prints a marker when his emphasis runs across a sentence', () => {
    // The owner's screenshot: the opened text began "**Three."
    const text = 'Yes — but not the engine. **Three. Two of them are small.** The rest wait.';
    const got = thoughtsOf(text, 'Yes — but not the engine.', []);
    expect(got.unbound).toBe('**Three.** **Two of them are small.** The rest wait.');
    const { container } = render(
      <Reading part="rest" text={text} reading={{ claim: 'Yes — but not the engine.' } as never}
               standing={got.unbound} />,
    );
    expect(container.textContent).not.toContain('*');
    expect(container.textContent).toContain('Three. Two of them are small. The rest wait.');
    expect([...container.querySelectorAll('b')].map((b) => b.textContent))
      .toEqual(['Three.', 'Two of them are small.']);
  });

  it('keeps a stray marker he did not close, as he wrote it', () => {
    const got = thoughtsOf('It fell. A lone ** here.', 'It fell.', []);
    expect(got.unbound).toBe('A lone ** here.');
  });
});

describe('"i should see what i ask too"', () => {
  it('pairs each answer with the question before it, in the person\'s words', () => {
    const turns = [
      { role: 'george', text: 'Good morning.' },      // a standing answer nobody asked
      { role: 'user', text: '  how are we doing  ' },
      { role: 'george', text: 'Down.' },
      { role: 'user', text: 'why?' },
      { role: 'george', text: 'OPUS.' },
    ];
    expect(questionsOf(turns)).toEqual([null, 'how are we doing', 'why?']);
  });

  it('draws the question small under him', async () => {
    const { Asked } = await import('./Room');
    const { container } = render(<Asked question="how are we doing" at={0} count={1} busy={false} onStep={vi.fn()} />);
    expect(container.querySelector('.r-asked-q')?.textContent).toBe('you askedhow are we doing');
    expect(container.querySelector('.r-asked-step')).toBeNull();
  });
});

describe('"a track back feature"', () => {
  it('steps to the question before and after, and back to the latest', async () => {
    const { Asked } = await import('./Room');
    const onStep = vi.fn();
    const { container, rerender } = render(
      <Asked question="why?" at={2} count={3} busy={false} onStep={onStep} />,
    );
    const [back, forward] = [...container.querySelectorAll<HTMLButtonElement>('.r-asked-step')];
    expect(forward.disabled).toBe(true);
    expect(container.querySelector('.r-asked-latest')).toBeNull();
    fireEvent.click(back);
    expect(onStep).toHaveBeenLastCalledWith(1);

    rerender(<Asked question="how are we doing" at={1} count={3} busy={false} onStep={onStep} />);
    fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.r-asked-step')[1]);
    expect(onStep).toHaveBeenLastCalledWith(null);   // one step forward is the newest
    fireEvent.click(container.querySelector('.r-asked-latest') as HTMLButtonElement);
    expect(onStep).toHaveBeenLastCalledWith(null);

    rerender(<Asked question="how are we doing" at={0} count={3} busy={true} onStep={onStep} />);
    for (const b of container.querySelectorAll<HTMLButtonElement>('.r-asked-step')) expect(b.disabled).toBe(true);
  });

  it('redraws an earlier answer from the stored turns, with no model call', () => {
    // The board is built from the answers up to the one being looked at, by the
    // same function that built it then; nothing on the step path asks George.
    expect(ROOM).toMatch(/allAnswers\.slice\(0, at \+ 1\)/);
    expect(ROOM).toMatch(/const board = useMemo\(\(\) => buildBoard\(answers\), \[answers\]\);/);
    expect(ROOM).toMatch(/onStep=\{\(to\) => \{ setFocused\(null\); setView\(to\); \}\}/);
  });
});
