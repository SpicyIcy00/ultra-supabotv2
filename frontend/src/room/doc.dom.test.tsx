/**
 * THE PAGE IS A DOCUMENT (P7, 2026-09-21).
 *
 * The owner: *"i want it like an artifact claude can make ... it feels like it
 * has to fit the stuff in columns and rows or a grid but an artifact/page isnt
 * like that. it makes its own."* The target is
 * ops/ideal/the-page-bob-writes.html. What is held here is what makes the
 * right-hand side a document rather than a board:
 *
 *   a figure INSIDE a sentence is the row's own value, never a digit of his;
 *   a figure is paired with the words it sits beside, and only with them;
 *   his caveat, placed on the page, is on the page and not beside his answer;
 *   and the board's two tile-era rules no longer eat parts of a page.
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Board } from './render';
import { buildBoard, inWordsOf, placesCaveat, MAX_OBJECTS, type BoardObject } from './board';
import { planSteps, leadOf } from './plan';
import type { AnswerTurn } from './data';
import type { TileActions } from './tiles';
import type { Arrangement } from '../types/bob';

afterEach(cleanup);

const META = (label: string, extra: Record<string, unknown> = {}) => ({
  source_table: 'new_transactions', metric_label: label, metric_unit: 'PHP',
  snapshot_timestamp: '2026-09-21T04:25:00Z', filters_applied: [],
  window: { name: 'last_7_days', start: '2026-09-14', end: '2026-09-21' }, ...extra,
});

const read = (seq: number, label: string, rows: Record<string, unknown>[],
              args: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
  seq, tool: 'get_sales', arguments: { seq, ...args }, result: { rows, meta: META(label, meta) },
});

const WEEK = [{ unit: 'PHP', value: 1621528.27, baseline: 1698059.65, change: -76531.38,
                change_pct: -4.5, direction: 'down' }];
const SHOPS = [
  { store: 'OPUS', value: 450944, baseline: 467102, change_pct: -3.5, direction: 'down' },
  { store: 'Greenhills', value: 241519, baseline: 278266, change_pct: -13.2, direction: 'down' },
];
const FELL = [{ product: 'Aji Mix', value: 1, change: -20277, direction: 'down' },
              { product: 'Aji Kiamoy White', value: 1, change: -17512, direction: 'down' }];
const ROSE = [{ product: 'Aji Kiamoy king seedless M', value: 1, change: 14651, direction: 'up' },
              { product: 'Aji Squid Rings', value: 1, change: 13972, direction: 'up' }];

const TURN = {
  role: 'bob', text: 'We are down on the week.', thinking: '', at: '2026-09-21T04:26:00Z',
  reading: { claim: 'We are down on the week', caveat: 'A great many stock counts are below zero.',
             next: 'Greenhills first. Ask the manager.\n\nThen the shelf. Count it by hand.' },
  toolCalls: [read(0, 'Net sales', WEEK, { group_by: [] }), read(1, 'Net sales', SHOPS, { group_by: 'store' }),
              read(2, 'Product revenue', FELL, { rank: 'fell' }), read(3, 'Product revenue', ROSE, { rank: 'rose' })],
} as unknown as AnswerTurn;

const block = (key: string, kind: string, seq: number, extra: Partial<BoardObject> = {}): BoardObject => ({
  key, kind, weight: 'supporting', seq, tool: 'get_sales', turn: 0, touched: 0, ...extra,
} as BoardObject);

const BOARD = [
  block('net', 'figure', 0, { weight: 'lead', claim: 'Net sales, the estate' }),
  block('shops', 'dumbbell', 1, { claim: 'Each shop against the week before' }),
  block('window', 'control', 1, { weight: 'quiet', argument: 'date_range' } as Partial<BoardObject>),
  block('fell', 'contributors', 2, { claim: 'Fell' }),
  block('rose', 'contributors', 3, { claim: 'Rose' }),
];

const PAGE: Arrangement = { layout: 'stack', children: [
  { lede: 'We took {net}{net.change} last week, against {net.was} the week before ({net}).' },
  { head: 'Three shops carry it' },
  { block: 'shops', beside: true, control: 'window' },
  { say: 'Greenhills gave back the most.' },
  { say: 'OPUS slipped a little.' },
  { head: 'What moved on the shelf' },
  { caveat: true },
  { say: 'The kiamoy money moved rather than left.' },
  { layout: 'tabs', labels: ['the estate', 'Greenhills'], children: [
    { layout: 'row', children: [{ block: 'fell' }, { block: 'rose' }] },
    { say: 'Nothing read for Greenhills yet.' },
  ] },
  { next: true },
] };

const ACTIONS = (): TileActions => ({
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(), retune: vi.fn(),
});

function draw(arrangement: Arrangement = PAGE, extra: Record<string, unknown> = {}) {
  const on = ACTIONS();
  const out = render(
    <Board answers={[TURN]} board={BOARD} local={{}} focused={null} selection={[]} live={false}
           retuned={{}} on={on} arrangement={arrangement} caveat={TURN.reading?.caveat}
           foot={<p data-testid="plan">the plan</p>} {...extra} />,
  );
  return { ...out, on };
}

describe('a figure inside a sentence', () => {
  it('is the value of the row its block draws, formatted as the block would', () => {
    const { container } = draw();
    const lede = container.querySelector('.r-doc-lede') as HTMLElement;
    const figures = Array.from(lede.querySelectorAll('button.r-inl')).map((b) => b.textContent);
    expect(figures[0]).toBe('₱1,621,528');
    // `.was` is the same row's baseline; the same key twice is the same figure twice.
    expect(figures).toContain('₱1,698,060');
    expect(figures.filter((f) => f === '₱1,621,528')).toHaveLength(2);
    // `.change` wears its direction and the tool's own percentage.
    expect(lede.querySelector('.r-inl-d')?.textContent).toMatch(/▼\s*[-−]4\.5%/);
    // And not one brace of his reference is left on the page.
    expect(lede.textContent).not.toMatch(/[{}]/);
  });

  it('is not drawn a second time as a block after the page', () => {
    const { container } = draw();
    expect(container.querySelector('[data-figure="net"]')).toBeNull();
  });

  it('opens its receipt where it was tapped, with the time it was read (UI rules 3 and 6)', () => {
    const { container } = draw();
    const figure = container.querySelector('.r-doc-lede button.r-inl') as HTMLElement;
    expect(container.querySelector('.r-inl-receipt')).toBeNull();
    fireEvent.click(figure);
    const receipt = container.querySelector('.r-inl-receipt') as HTMLElement;
    expect(receipt.textContent).toContain('Net sales, the estate');
    expect(receipt.textContent).toMatch(/read \d{1,2}:\d{2}|new_transactions/);
    fireEvent.click(figure);
    expect(container.querySelector('.r-inl-receipt')).toBeNull();
  });

  it('draws a dash, never a guess, for a key the board does not hold', () => {
    const { container } = draw({ layout: 'stack', children: [
      { lede: 'We took {gone} last week.' }, { head: 'x' }, { block: 'shops' }] });
    expect(container.querySelector('.r-doc-lede')?.textContent).toBe('We took — last week.');
  });

  it('never parts from what touches it at the end of a line', () => {
    const { container } = draw();
    const runs = Array.from(container.querySelectorAll('.r-doc-lede .r-inl-run')).map((r) => r.textContent);
    // The value with its own movement; the bracket and the full stop with the figure inside them.
    expect(runs.some((r) => /^₱1,621,528.*4\.5%$/.test(r ?? ''))).toBe(true);
    expect(runs).toContain('(₱1,621,528).');
  });
});

describe('sections, and a figure paired with its words', () => {
  it('opens a section at each head, the lede standing alone above them', () => {
    const { container } = draw();
    const sections = Array.from(container.querySelectorAll('.r-doc-sec'));
    expect(sections).toHaveLength(3);
    expect(sections[0].querySelector('.r-doc-lede')).not.toBeNull();
    expect(sections[1].querySelector('.r-doc-h')?.textContent).toBe('Three shops carry it');
    expect(sections[2].querySelector('.r-doc-h')?.textContent).toBe('What moved on the shelf');
  });

  it('pairs a figure with the paragraphs that follow it, and with nothing else', () => {
    const { container } = draw();
    const pairs = Array.from(container.querySelectorAll('.r-doc-pair'));
    expect(pairs).toHaveLength(1);
    const kids = Array.from(pairs[0].children)
      .map((el) => (el.classList.contains('r-doc-fig') ? 'figure' : el.classList.contains('r-doc-p') ? 'words' : '?'));
    expect(kids).toEqual(['figure', 'words', 'words']);
    const fig = pairs[0].querySelector('.r-doc-fig') as HTMLElement;
    expect(fig.dataset.beside).toBe('yes');
    // A dumbbell of a few rows takes the wider room: its track is the chart.
    expect(fig.dataset.size).toBe('wide');
    // The tabs are the section's, not the pair's: a figure set under its words
    // goes under THOSE words, never past what follows them.
    expect(pairs[0].querySelector('.r-doc-tabs')).toBeNull();
  });

  it('sets nothing beside a figure no words follow', () => {
    const { container } = draw({ layout: 'stack', children: [
      { head: 'x' }, { block: 'shops', beside: true }, { block: 'fell' }] });
    const fig = container.querySelector('[data-figure="shops"]')?.closest('.r-doc-fig') as HTMLElement;
    expect(fig.dataset.beside).toBeUndefined();
    expect(fig.dataset.size).toBe('full');
    expect(container.querySelector('.r-doc-pair')).toBeNull();
  });

  it('draws the date line once, at the head of the page', () => {
    const { container } = draw();
    const lines = container.querySelectorAll('.r-doc-dateline');
    expect(lines).toHaveLength(1);
    // The window and when it was read (UI rule 6). It counted the reads until
    // P14 — "18 READS" — which says nothing about the answer or its freshness.
    expect(lines[0].textContent).toMatch(/read \d/i);
    expect(lines[0].textContent).not.toMatch(/reads/i);
  });

  it('leaves an arrangement with no lede and no head exactly as it was drawn', () => {
    const { container } = draw({ layout: 'stack', children: [
      { block: 'shops' }, { say: 'A line of his.' }, { block: 'fell' }] });
    expect(container.querySelector('.r-doc-sec')).toBeNull();
    expect(container.querySelector('.r-doc-dateline')).toBeNull();
    expect(container.querySelector('.r-laid--stack')).not.toBeNull();
  });
});

describe('his caveat, placed on the page', () => {
  it('is the margin note of the section he set it in, whole', () => {
    const { container } = draw();
    const note = container.querySelector('.r-doc-note[data-caveat]') as HTMLElement;
    expect(note.textContent).toContain('A great many stock counts are below zero.');
    expect(note.closest('.r-doc-sec')?.querySelector('.r-doc-h')?.textContent)
      .toBe('What moved on the shelf');
    // Before the words and the figures of its section, so a phone reads it first.
    const section = note.closest('.r-doc-sec') as HTMLElement;
    const order = Array.from(section.children).map((el) => el.className.split(' ')[0]);
    expect(order.indexOf('r-doc-note')).toBeLessThan(order.indexOf('r-doc-tabs'));
  });

  it('draws nothing where there is no caveat to place', () => {
    const { container } = draw(PAGE, { caveat: null });
    expect(container.querySelector('.r-doc-note[data-caveat]')).toBeNull();
  });

  it('is found in a page wherever it sits', () => {
    expect(placesCaveat(PAGE)).toBe(true);
    expect(placesCaveat({ layout: 'stack', children: [{ say: 'x' }] })).toBe(false);
    expect(placesCaveat(null)).toBe(false);
  });
});

describe('tabs', () => {
  it('shows one view, and the person switches it with no read', () => {
    const { container, on } = draw();
    const tabs = container.querySelector('.r-doc-tabs') as HTMLElement;
    expect(within(tabs).queryByText('Fell')).not.toBeNull();
    expect(within(tabs).queryByText('Nothing read for Greenhills yet.')).toBeNull();
    fireEvent.click(within(tabs).getByRole('button', { name: 'Greenhills' }));
    expect(within(tabs).queryByText('Fell')).toBeNull();
    expect(within(tabs).queryByText('Nothing read for Greenhills yet.')).not.toBeNull();
    expect(on.retune).not.toHaveBeenCalled();
  });

  it('draws lists that face each other on one scale', () => {
    const { container } = draw();
    const width = (key: string) => Array.from(
      container.querySelectorAll(`[data-figure="${key}"] .r-mk-bar i`)).map((i) => (i as HTMLElement).style.width);
    // The largest change on either side fills its track; the other side's largest does not.
    expect(width('fell')[0]).toBe('100%');
    expect(parseFloat(width('rose')[0])).toBeCloseTo((14651 / 20277) * 100, 1);
  });
});

describe('a control carried on a figure', () => {
  it('is drawn above the figure it drives, once, and not after the page', () => {
    const { container } = draw();
    const hosts = container.querySelectorAll('.r-doc-ctl-host');
    expect(hosts).toHaveLength(1);
    expect(hosts[0].closest('.r-doc-fig')?.querySelector('[data-figure="shops"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-figure="window"]')).toHaveLength(1);
  });

  it('is the same act as a dropdown, for a figure too narrow for a row of positions', () => {
    const { container, on } = draw();
    const select = container.querySelector('.r-doc-ctl-host select.r-ctl-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'last_30_days' } });
    expect(on.retune).toHaveBeenCalledWith('window', 'date_range', 'last_30_days');
  });
});

describe('the board, taught about the page', () => {
  const turnWith = (blocks: Record<string, unknown>[], arrangement: Arrangement | null): AnswerTurn => ({
    ...TURN,
    toolCalls: Array.from({ length: 20 }, (_, seq) => read(seq, 'Net sales', WEEK, { n: seq })),
    composition: { blocks, arrangement },
  } as unknown as AnswerTurn);

  it('never lets a control replace the figure whose read it names', () => {
    const board = buildBoard([turnWith([
      { key: 'shops', kind: 'dumbbell', weight: 'lead', seq: 1 },
      { key: 'window', kind: 'control', weight: 'quiet', seq: 1, argument: 'date_range' },
    ], null)]);
    expect(board.map((o) => `${o.key}:${o.kind}`)).toEqual(['shops:dumbbell', 'window:control']);
  });

  it('does not count a figure that lives in a sentence against the bound on attention', () => {
    const inWords = Array.from({ length: 6 }, (_, i) => ({ key: `f${i}`, kind: 'figure', weight: 'supporting', seq: i }));
    const drawn = Array.from({ length: MAX_OBJECTS }, (_, i) => (
      { key: `t${i}`, kind: 'table', weight: 'supporting', seq: 6 + i }));
    const page: Arrangement = { layout: 'stack', children: [
      { lede: inWords.map((f) => `{${f.key}}`).join(' ') }, ...drawn.map((t) => ({ block: t.key }))] };
    const kept = buildBoard([turnWith([...inWords, ...drawn], page)]).map((o) => o.key);
    expect(kept).toHaveLength(MAX_OBJECTS + 6);
    // With no page to hold them in its words they are blocks, and the bound is the bound.
    expect(buildBoard([turnWith([...inWords, ...drawn], null)])).toHaveLength(MAX_OBJECTS);
  });

  it('reads the same keys out of a page as the validator does', () => {
    expect([...inWordsOf(PAGE)].sort()).toEqual(['net', 'window']);
    // Placed as a block anywhere, a key is a block again.
    expect([...inWordsOf({ layout: 'stack', children: [{ lede: '{net}' }, { block: 'net' }] })]).toEqual([]);
  });
});

describe('the plan as steps', () => {
  it('is a step for each paragraph, its short opening sentence the lead', () => {
    const steps = planSteps('Greenhills first. Ask the manager.\n\nThen the shelf. Count it by hand.');
    expect(steps).toHaveLength(2);
    expect(leadOf(steps[0])).toEqual(['Greenhills first.', 'Ask the manager.']);
    // A long opening sentence is a sentence, not a label.
    expect(leadOf('I would look at the Greenhills shelf before anything else this week. Then Magnolia.')[0]).toBe('');
  });

  it('is one paragraph, as it always was, when he wrote one', () => {
    expect(planSteps('I would look at Greenhills next.')).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------------------
 * ONE VOICE (P8, 2026-09-21)
 *
 * The owner, of the first page Bob wrote himself: *"it still doesnt look like
 * your artifact it still looks like a reskin."* The run record said why — he
 * wrote a real page, and every block on it still carried its own question,
 * headline and comment inside a section that had a heading and a paragraph.
 * ------------------------------------------------------------------------ */

const LIVE: Arrangement = { layout: 'stack', children: [
  { head: 'Three shops fall, three hold, Rockwell climbs' },
  { block: 'shops' },
  { say: 'Rockwell is the only shop clearly ahead. **The rest hold.**' },
] };

const SPOKEN = [
  block('shops', 'dumbbell', 1, {
    claim: 'Three shops fall, three hold, Rockwell climbs',
    question: 'Which shops carry the fall?',
    thought: 'Rockwell is the only one clearly ahead.',
  }),
];

function speak(arrangement: Arrangement, board = SPOKEN) {
  return render(
    <Board answers={[TURN]} board={board} local={{}} focused={null} selection={[]} live={false}
           retuned={{}} on={ACTIONS()} arrangement={arrangement} />,
  );
}

describe('a block on a document does not talk over the page', () => {
  it('draws no question: the section head is the question', () => {
    const { container } = speak(LIVE);
    expect(container.querySelector('.r-mk-ask')).toBeNull();
    expect(container.textContent).not.toContain('Which shops carry the fall?');
  });

  it('draws no thought: the paragraph beside it is the thought', () => {
    const { container } = speak(LIVE);
    expect(container.querySelector('.r-mk-thought')).toBeNull();
    expect(container.querySelector('.r-mk-verdict')).toBeNull();
  });

  it('does not draw the section head again as the caption under it', () => {
    const { container } = speak(LIVE);
    const heads = Array.from(container.querySelectorAll('.r-doc-h, .r-mk-title'))
      .map((el) => el.textContent?.trim());
    expect(heads).toEqual(['Three shops fall, three hold, Rockwell climbs']);
  });

  it('keeps the claim where the page has not said it', () => {
    const { container } = speak({ layout: 'stack', children: [
      { head: 'What moved on the shelf' }, { block: 'shops' }] });
    expect(container.querySelector('.r-mk-title')?.textContent)
      .toContain('Three shops fall');
  });

  it('leaves a page the ROOM laid out exactly as it was', () => {
    // No lede and no head is not a document: the block's own words are the
    // only ones there, and every one of them still stands.
    const { container } = speak({ layout: 'stack', children: [{ block: 'shops' }] });
    expect(container.querySelector('.r-mk-ask')?.textContent).toBe('Which shops carry the fall?');
    expect(container.querySelector('.r-mk-thought')).not.toBeNull();
  });
});

describe('his own emphasis reaches the page', () => {
  it('is drawn in weight, and the markers never are', () => {
    const { container } = speak(LIVE);
    const said = container.querySelector('.r-doc-p .r-page-say') as HTMLElement;
    expect(said.textContent).toBe('Rockwell is the only shop clearly ahead. The rest hold.');
    expect(said.querySelector('b')?.textContent).toBe('The rest hold.');
  });
});

describe('a caption does not say the heading again (P14)', () => {
  it('is dropped when it half-repeats the head, not only when it copies it', () => {
    // His live page: head "Three shops fall; the rest are fine", caption
    // "Three shops fall, three hold, Rockwell gains" — half the words shared,
    // which cleared the 0.6 a sentence of prose needs.
    const board = [block('shops', 'dumbbell', 1, {
      claim: 'Three shops fall, three hold, Rockwell gains' })];
    const { container } = render(
      <Board answers={[TURN]} board={board} local={{}} focused={null} selection={[]}
             live={false} retuned={{}} on={ACTIONS()}
             arrangement={{ layout: 'stack', children: [
               { head: 'Three shops fall; the rest are fine' }, { block: 'shops' }] }} />,
    );
    expect(container.querySelector('.r-mk-title')).toBeNull();
  });

  it('keeps a caption that earns its place', () => {
    const board = [block('shops', 'dumbbell', 1, {
      claim: 'Rockwell is the only one clearly ahead' })];
    const { container } = render(
      <Board answers={[TURN]} board={board} local={{}} focused={null} selection={[]}
             live={false} retuned={{}} on={ACTIONS()}
             arrangement={{ layout: 'stack', children: [
               { head: 'Three shops fall; the rest are fine' }, { block: 'shops' }] }} />,
    );
    expect(container.querySelector('.r-mk-title')?.textContent)
      .toContain('Rockwell is the only one clearly ahead');
  });
});

/**
 * ONE MARGIN NOTE AT A TIME (P15.a, 2026-09-21).
 *
 * The card: *"two asides stacked turned the bottom of his page back into
 * columns."* Each `note` drew its own floated aside at 31% of the page, so two
 * of his in a row put two boxes down the margin — the shape the page exists to
 * stop being. A RUN of them is one aside with a paragraph each: one box, one
 * rule, and not one word of either dropped.
 */
describe('a run of margin notes', () => {
  const page = (...notes: string[]): Arrangement => ({
    layout: 'stack',
    children: [
      { lede: 'Seven shops took less.' },
      { head: 'The shelf' },
      { block: 'shops' },
      ...notes.map((note) => ({ note })),
    ],
  }) as Arrangement;

  it('is one aside, not one each', () => {
    const { container } = draw(page(
      'Stock counts run days behind the sales.',
      'Thousands sit below zero, so a line that looks empty may be unrecorded.',
    ));
    expect(container.querySelectorAll('.r-doc-note')).toHaveLength(1);
  });

  it('keeps every word of every one of them', () => {
    const { container } = draw(page(
      'Stock counts run days behind the sales.',
      'Thousands sit below zero, so a line that looks empty may be unrecorded.',
    ));
    const said = container.querySelector('.r-doc-note')?.textContent ?? '';
    expect(said).toContain('run days behind the sales');
    expect(said).toContain('may be unrecorded');
  });

  it('draws them as paragraphs, so they do not run together', () => {
    const { container } = draw(page('First aside.', 'Second aside.'));
    const paras = container.querySelectorAll('.r-doc-note .r-doc-note-p');
    expect(paras).toHaveLength(2);
    expect(paras[0].textContent).toBe('First aside.');
    expect(paras[1].textContent).toBe('Second aside.');
  });

  it('leaves a single note floated beside the words that follow it', () => {
    // The original path: one aside, floated, no paragraph wrapper. It needs
    // words after it in the same section, which is what a margin note IS.
    const withWords = {
      layout: 'stack',
      children: [
        { lede: 'Seven shops took less.' },
        { head: 'The shelf' },
        { note: 'Just the one.' },
        { say: 'And the words it sits beside.' },
      ],
    } as Arrangement;
    const { container } = draw(withWords);
    expect(container.querySelectorAll('.r-doc-note')).toHaveLength(1);
    expect(container.querySelectorAll('.r-doc-note-p')).toHaveLength(0);
    expect(container.querySelector('.r-doc-note')?.getAttribute('data-tail')).toBeNull();
    expect(container.querySelector('.r-doc-note')?.textContent).toContain('Just the one.');
  });

  it('is still one aside when a single note ends its section', () => {
    // It goes through the same path as a run, because at the tail it must stop
    // floating -- but it is one aside carrying his words either way.
    const { container } = draw(page('Just the one.'));
    expect(container.querySelectorAll('.r-doc-note')).toHaveLength(1);
    expect(container.querySelector('.r-doc-note')?.getAttribute('data-tail')).toBe('yes');
    expect(container.querySelector('.r-doc-note')?.textContent).toContain('Just the one.');
  });
});

/**
 * A FOLD (P15.a, 2026-09-21).
 *
 * The card: *"a FOLD, so a long thing is present without being a wall (the
 * artifact folds the ten zero-lines and the caveat; the page has no disclosure
 * leaf, so everything is shown or absent)."* Native `details`, closed at rest,
 * so the page's first still frame is the short one — and the label is his while
 * the count beside it is the drawing's own, off the children (rule 9).
 */
describe('a fold', () => {
  const folded = (label?: string): Arrangement => ({
    layout: 'stack',
    children: [
      { lede: 'Seven shops took less.' },
      { layout: 'fold', ...(label ? { label } : {}), children: [
        { say: 'Ten lines traded the week before and nothing last week.' },
        { say: 'They carry their old figure alone.' },
      ] },
    ],
  }) as Arrangement;

  it('is closed at rest, so the page opens short', () => {
    const { container } = draw(folded('the ten lines that sold nothing'));
    const fold = container.querySelector('details.r-doc-fold') as HTMLDetailsElement;
    expect(fold).toBeTruthy();
    expect(fold.open).toBe(false);
  });

  it('says what is inside it, in his words', () => {
    const { container } = draw(folded('the ten lines that sold nothing'));
    expect(container.querySelector('.r-doc-fold-lab')?.textContent)
      .toContain('the ten lines that sold nothing');
  });

  it('counts what is in there itself, rather than taking his word for it', () => {
    const { container } = draw(folded('the ten lines that sold nothing'));
    expect(container.querySelector('.r-doc-fold-n')?.textContent).toBe('2');
  });

  it('still holds every word, so nothing is lost by folding it', () => {
    const { container } = draw(folded('the ten lines that sold nothing'));
    const inside = container.querySelector('.r-doc-fold-in')?.textContent ?? '';
    expect(inside).toContain('traded the week before');
    expect(inside).toContain('their old figure alone');
  });
});

/**
 * A FLOAT WITH NOTHING TO WRAP IT IS NOT A FLOAT (P15.a, 2026-09-21).
 *
 * Found by rendering the page rather than by reading it: a margin note ending
 * its section has no words beside it, and a 31% box floated right left a hole
 * down the left the width of the page — the gap the owner kept finding
 * (*"theres still too many gaps, it still feels like its trying to fill in
 * columns not the one big page"*). At the tail of a section it runs at the
 * measure instead, and the void goes with the float.
 */
describe('a margin note at the end of its section', () => {
  const page = (after: Arrangement[]): Arrangement => ({
    layout: 'stack',
    children: [
      { lede: 'Seven shops took less.' },
      { head: 'The shelf' },
      { say: 'The counts are behind.' },
      { note: 'Stock counts run days behind the sales.' },
      ...after,
    ],
  }) as Arrangement;

  it('runs at the measure rather than floating into a hole', () => {
    const { container } = draw(page([]));
    expect(container.querySelector('.r-doc-note')?.getAttribute('data-tail')).toBe('yes');
  });

  it('still floats where words follow it in the same section', () => {
    const { container } = draw(page([{ say: 'And here are the words beside it.' }]));
    expect(container.querySelector('.r-doc-note')?.getAttribute('data-tail')).toBeNull();
  });

  it('is not called long when it is running at the measure', () => {
    // `data-long` widens a FLOATED note to 44%; at the measure it means nothing
    // and would only fight the max-width.
    const long = 'x'.repeat(300);
    const { container } = draw({
      layout: 'stack',
      children: [{ lede: 'Seven shops took less.' }, { note: long }, { note: long }],
    } as Arrangement);
    const note = container.querySelector('.r-doc-note');
    expect(note?.getAttribute('data-tail')).toBe('yes');
    expect(note?.getAttribute('data-long')).toBeNull();
  });
});
