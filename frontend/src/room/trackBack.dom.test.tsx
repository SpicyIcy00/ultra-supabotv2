// @vitest-environment jsdom
/**
 * THE OWNER'S REPORT ON THE LIVE ROOM, 2026-09-18 (ops/DOGFOOD_LOG.md):
 *
 *   "some small changes it stops too early. it should stop almost right before
 *   the text bar. also whats more from bob? why is it hiding? … i should see
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
import { caveatUnshown, thoughtsOf, unmark } from './beside';
import { Reading } from './Reading';
import { questionsOf } from './history';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const ROOM = readFileSync(join(__dirname, 'Room.tsx'), 'utf8');
const RENDER = readFileSync(join(__dirname, 'render.tsx'), 'utf8');
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

describe('"whats more from bob? why is it hiding?"', () => {
  it('hides nothing behind a tap: what no chart took is under him', () => {
    expect(ROOM).not.toMatch(/more from Bob'/);
    expect(ROOM).not.toMatch(/moreOpen/);
    // The owner, later the same day: "with the charts thats it related to. and
    // if its not related then it can go under the blob".
    expect(ROOM).toMatch(/\{!busy && \(\s*<Reading part="rest"/);
    expect(ROOM).toMatch(/thoughts=\{thoughts\?\.bySeq\}/);
    expect(ROOM).not.toMatch(/wordsOnCharts/);
  });

  it('draws his words about a chart UNDER that chart, not above it', () => {
    // "no not on top and before of the charts"
    const at = (needle: string) => RENDER.indexOf(needle);
    expect(at('<Piece')).toBeGreaterThan(0);
    expect(at('className="r-fig-thought"')).toBeGreaterThan(at('<Piece'));
  });

  it('takes a heading to wherever the line it heads goes', () => {
    const META = { source_table: 'new_transactions', snapshot_timestamp: '2026-09-18T06:00:00Z', filters_applied: [] };
    const calls = [{ seq: 0, tool: 'get_sales', arguments: {}, result: { rows: [{ store: 'OPUS', value: 467102 }], meta: META } }] as never;
    const text = 'Yes — OPUS is the story.\n\n**Three.**\nOPUS fell to ₱467,102.\n\nI would leave it alone.';
    const got = thoughtsOf(text, 'Yes — OPUS is the story.', calls, new Set(), { drawn: new Set([0]), said: [] });
    // "Three." goes onto OPUS's chart with the line it heads; it is not left alone under him.
    expect(got.bySeq.get(0)).toEqual(['**Three.**', 'OPUS fell to ₱467,102.']);
    expect(got.unbound).toBe('I would leave it alone.');
  });

  it('draws *x* as his emphasis, never its asterisks', () => {
    const { plain, bold } = unmark("it's the estate's biggest *number*, and 3 * 4 stays");
    expect(plain).toBe("it's the estate's biggest number, and 3 * 4 stays");
    expect(bold.map(([a, b]) => plain.slice(a, b))).toEqual(['number']);
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

describe('"if its stating whats already stated or shown in the page … dont make it say that"', () => {
  const META = { source_table: 'new_transactions', snapshot_timestamp: '2026-09-18T06:00:00Z', filters_applied: [] };
  const CALLS = [
    { seq: 0, tool: 'get_sales', arguments: {}, result: { rows: [{ store: 'OPUS', value: 467102, change_pct: -15.9 }], meta: META } },
    { seq: 1, tool: 'get_sales', arguments: {}, result: { rows: [{ store: 'North Edsa', value: 16230, hours: 11 }], meta: META } },
  ] as never;
  const CLAIM = 'the dip is one outsized Monday at OPUS';

  it('draws nothing a chart already says, and keeps what no chart shows', () => {
    const text = 'Yes — the dip is one outsized Monday at OPUS. '
      + 'OPUS fell to ₱467,102, down 15.9%. So it is one shop. '          // chart 0, and what carries on from it
      + 'North Edsa took ₱16,230 yesterday. '                             // read 1, not drawn
      + 'I cannot establish the cause from here.';
    const got = thoughtsOf(text, CLAIM, CALLS, new Set([0]), { drawn: new Set([0]), said: [] });
    expect(got.unbound).toBe('North Edsa took ₱16,230 yesterday. I cannot establish the cause from here.');
    expect(got.bySeq.size).toBe(0);
  });

  it('draws nothing his next step, his questions or a chart title already say', () => {
    const next = 'Ask the North Edsa team what changed on the 14th, and have the barn recount F9.';
    const text = `Yes — the dip is one outsized Monday at OPUS. Nothing else moved. ${next.replace('Ask', 'I would ask')}`;
    const got = thoughtsOf(text, CLAIM, CALLS, new Set(), { drawn: new Set(), said: [next] });
    expect(got.unbound).toBe('Nothing else moved.');
  });

  it('takes a heading with the lines it heads, and draws no list marker', () => {
    const text = 'Yes — the dip is one outsized Monday at OPUS.\n\nWhere it sits:\n\n'
      + '- **It is one shop.**\n- OPUS fell to ₱467,102.\n\n- **The cause is open.**\n- Nothing in the reads says why.';
    const got = thoughtsOf(text, CLAIM, CALLS, new Set([0]), { drawn: new Set([0]), said: [] });
    // His lines stay lines: two list items are two lines, with no marker.
    expect(got.unbound).toBe('**The cause is open.**\nNothing in the reads says why.');
  });

  it('draws no caveat sentence the answer already said in other sentences', () => {
    const answer = 'Three product codes are each shared by two products. They are nuts01, nuts02 and gz31. '
      + 'Those codes do not identify a single item.';
    const caveat = 'Three product codes — nuts01, nuts02 and gz31 — are each shared by two products, so those codes do not identify one item. '
      + 'Purchase orders are a frozen import.';
    expect(caveatUnshown(caveat, [], answer)).toBe('Purchase orders are a frozen import.');
  });

  it('is fed what the room draws: the reads on screen and his words beside them', () => {
    expect(ROOM).toMatch(/thoughtsOf\(latest\.text, latest\.reading\?\.claim, latest\.toolCalls, thoughtful,\s*\{ drawn: shown, said \}\)/);
    expect(ROOM).toMatch(/latest\.reading\?\.next, \.\.\.\(latest\.reading\?\.asks \?\? \[\]\)/);
    expect(ROOM).toMatch(/caveat=\{thoughts\?\.caveat\}/);
  });
});

describe('"add a indicatior … to let people know they can scroll down on it"', () => {
  it('draws the figures\' own arrow at the foot of his words, only while there is more', () => {
    expect(ROOM).toMatch(/className="r-arr r-arr--words"[\s\S]{0,200}hidden=\{!wordsMore\}/);
    expect(ROOM).toMatch(/onClick=\{\(\) => scrollWords\(wordsRef\.current\)\}/);
    expect(declaration('.r-arr--words', 'grid-area')).toBe('words');
    expect(declaration('.r-arr--words', 'bottom')).toBe('0');
  });
});

describe('"i should see what i ask too"', () => {
  it('pairs each answer with the question before it, in the person\'s words', () => {
    const turns = [
      { role: 'bob', text: 'Good morning.' },      // a standing answer nobody asked
      { role: 'user', text: '  how are we doing  ' },
      { role: 'bob', text: 'Down.' },
      { role: 'user', text: 'why?' },
      { role: 'bob', text: 'OPUS.' },
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
    // same function that built it then; nothing on the step path asks Bob.
    expect(ROOM).toMatch(/allAnswers\.slice\(0, at \+ 1\)/);
    expect(ROOM).toMatch(/const board = useMemo\(\(\) => buildBoard\(answers\), \[answers\]\);/);
    expect(ROOM).toMatch(/onStep=\{\(to\) => \{ setFocused\(null\); setView\(to\); \}\}/);
  });
});
