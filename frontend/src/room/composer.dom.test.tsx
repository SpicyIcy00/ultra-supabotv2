// @vitest-environment jsdom
/**
 * THE `@` DOOR, AS RENDERED OUTPUT (P2.c).
 *
 * THE PROPERTIES UNDER TEST — the card's own "done when", as far as a DOM can
 * see it:
 *
 *   - Typing `@Seik` offers the supplier, the page and the rule as THREE
 *     DISTINGUISHABLE things: same word, three kinds, each saying which.
 *   - Picking one puts its NAME in the line and its ID on the chip — and the
 *     three kinds go to three different places, which is `bind`'s job and is
 *     asserted here through the props the composer actually calls.
 *   - The menu costs no model turn: one read, and nothing else is called.
 *   - A source that could not be read says so, and is never drawn as "nothing
 *     by that name" (UI rule 8).
 *   - What is held above the line is drawn as what it is — a subject, a scope
 *     and a name — and tapping one puts it down.
 *
 * The reader is INJECTED, so this drives the resolution without a network and
 * without a query cache pretending to be one.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Composer } from './Composer';
import type { Bound } from './mentions';
import type { DeskDefinitions } from '../services/deskApi';
import type { Mentions } from '../services/mentionsApi';
import type { Subject } from './subjects';

afterEach(cleanup);

const DEFS = {
  selection: {
    dimensions: ['store', 'product', 'category', 'supplier'],
    max_subjects: 12,
    identity: { store: 'store_id', product: 'product_id', supplier: 'supplier' },
    mentions: {
      trigger: '@', min_prefix: 0, max_per_kind: 5, max_results: 12,
      max_words: 8,
      kinds: {
        store: { binds: 'selection', dimension: 'store', says: 'shop' },
        product: { binds: 'selection', dimension: 'product', says: 'product' },
        supplier: { binds: 'selection', dimension: 'supplier', says: 'supplier' },
        page: { binds: 'page_scope', says: 'page' },
        rule: { binds: 'named_on_question', says: 'rule' },
      },
    },
  },
} as unknown as DeskDefinitions;

/** Three things called Seikyo, which is the case the card names. */
const SEIKYO: Mentions = {
  query: 'Seik',
  candidates: [
    { kind: 'supplier', id: 'Seikyo', label: 'Seikyo', says: 'supplier',
      binds: 'selection', dimension: 'supplier', hint: '7 orders' },
    { kind: 'page', id: 'page-7', label: 'Seikyo orders', says: 'page',
      binds: 'page_scope', dimension: null, hint: 'what is on the water' },
    { kind: 'rule', id: 'wf-3', label: 'Seikyo reorder', says: 'rule',
      binds: 'named_on_question', dimension: null, hint: 'active' },
  ],
  unavailable: {},
};

/**
 * The composer is CONTROLLED, so the harness holds the draft the way the room
 * does. A test that passed a fixed string and a spy would be testing a
 * component nobody renders.
 */
function mount(over: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onDraft = vi.fn();
  const props = {
    draft: '', subjects: [] as Subject[],
    scope: null, named: [], defs: DEFS, busy: false,
    onUnpick: vi.fn(), onUnscope: vi.fn(), onUnname: vi.fn(),
    onBind: vi.fn<(b: Bound) => void>(), onSend: vi.fn(), onStop: vi.fn(),
    onClear: vi.fn(),
    read: vi.fn(async () => SEIKYO),
    ...over,
  };

  function Harness() {
    const [draft, setDraft] = useState(props.draft);
    return (
      <Composer
        {...props}
        draft={draft}
        onDraft={(text) => { onDraft(text); setDraft(text); }}
      />
    );
  }

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}><Harness /></QueryClientProvider>,
  );
  const line = screen.getByLabelText('Say something to George') as HTMLInputElement;
  return { ...props, onDraft, line, view };
}

/** Type into the line the way a browser does: the value, then the caret. */
function type(line: HTMLInputElement, text: string) {
  fireEvent.change(line, { target: { value: text } });
  line.setSelectionRange(text.length, text.length);
  fireEvent.keyUp(line, { key: 'a' });
}

describe('typing @Seik', () => {
  it('offers the supplier, the page and the rule, each saying which it is', async () => {
    const { line } = mount({ draft: '@Seik' });
    type(line, '@Seik');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.textContent)).toEqual([
      'Seikyosupplier7 orders',
      'Seikyo orderspagewhat is on the water',
      'Seikyo reorderruleactive',
    ]);
  });

  it('costs one read and no model turn', async () => {
    const { line, read } = mount({ draft: '@Seik' });
    type(line, '@Seik');
    await screen.findAllByRole('option');
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('Seik', expect.anything());
  });

  it('is not asked for at all while there is no mention open', () => {
    const { read } = mount({ draft: 'how are we doing' });
    expect(read).not.toHaveBeenCalled();
  });
});

describe('picking one', () => {
  it('sends a supplier to the selection, as an id with its dimension', async () => {
    const { line, onBind, onDraft } = mount({ draft: '@Seik' });
    type(line, '@Seik');
    const options = await screen.findAllByRole('option');
    fireEvent.mouseDown(options[0]);
    expect(onBind).toHaveBeenCalledWith({
      binds: 'selection',
      subject: { dimension: 'supplier', id: 'Seikyo', label: 'Seikyo', from: 'mention' },
    });
    // The NAME goes in the line; the id is on the chip.
    expect(onDraft).toHaveBeenCalledWith('@Seikyo ');
  });

  // ONE PICK PER MOUNT, deliberately. Accepting a name with a space in it
  // closes the mention — a name's end is never guessed — so a second pick in
  // the same composer is a second gesture, not a continuation of this one.
  it('sends a page to the SCOPE', async () => {
    const { line, onBind } = mount({ draft: '@Seik' });
    type(line, '@Seik');
    const options = await screen.findAllByRole('option');
    fireEvent.mouseDown(options[1]);
    expect(onBind).toHaveBeenCalledTimes(1);
    expect(onBind).toHaveBeenCalledWith({
      binds: 'page_scope', pageId: 'page-7', title: 'Seikyo orders',
    });
  });

  it('sends a rule to neither the selection nor the scope', async () => {
    const { line, onBind } = mount({ draft: '@Seik' });
    type(line, '@Seik');
    const options = await screen.findAllByRole('option');
    fireEvent.mouseDown(options[2]);
    expect(onBind).toHaveBeenCalledTimes(1);
    expect(onBind).toHaveBeenCalledWith({
      binds: 'named', kind: 'rule', id: 'wf-3', label: 'Seikyo reorder',
    });
  });

  it('is done from the keyboard too, and Enter does not send the question', async () => {
    const { line, onBind, onSend } = mount({ draft: '@Seik' });
    type(line, '@Seik');
    await screen.findAllByRole('option');
    fireEvent.keyDown(line, { key: 'ArrowDown' });
    fireEvent.keyDown(line, { key: 'Enter' });
    expect(onBind).toHaveBeenCalledWith(expect.objectContaining({ binds: 'page_scope' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('leaves Enter alone once the menu is shut', () => {
    const { line, onSend } = mount({ draft: 'how are we doing' });
    fireEvent.keyDown(line, { key: 'Enter' });
    expect(onSend).toHaveBeenCalled();
  });
});

describe('a source that could not be read', () => {
  it('says so, and is never drawn as nothing found', async () => {
    const { line } = mount({
      draft: '@Seik',
      read: vi.fn(async (): Promise<Mentions> => ({
        query: 'Seik', candidates: [],
        unavailable: { supplier: 'the purchasing read timed out' },
      })),
    });
    type(line, '@Seik');
    await waitFor(() => {
      expect(screen.getByText(/suppliers could not be read/i)).toBeTruthy();
    });
    expect(screen.queryByText(/nothing by that name/i)).toBeNull();
  });

  it('says nothing by that name only when nothing failed', async () => {
    const { line } = mount({
      draft: '@zzz',
      read: vi.fn(async (): Promise<Mentions> => ({ query: 'zzz', candidates: [], unavailable: {} })),
    });
    type(line, '@zzz');
    await waitFor(() => {
      expect(screen.getByText(/nothing by that name/i)).toBeTruthy();
    });
  });
});

describe('what is held above the line', () => {
  const opus: Subject = { dimension: 'store', id: 's-opus', label: 'OPUS', from: 'rows' };

  it('draws a subject, a scope and a name as three different things', () => {
    mount({
      subjects: [opus],
      scope: { id: 'page-7', title: 'Seikyo orders' },
      named: [{ kind: 'rule', id: 'wf-3', label: 'Seikyo reorder' }],
    });
    expect(screen.getByText('OPUS ×')).toBeTruthy();
    expect(screen.getByText('page · Seikyo orders ×')).toBeTruthy();
    expect(screen.getByText('rule · Seikyo reorder ×')).toBeTruthy();
  });

  it('puts one down by tapping it, by identity rather than by name', () => {
    const { onUnpick } = mount({ subjects: [opus] });
    fireEvent.click(screen.getByText('OPUS ×'));
    expect(onUnpick).toHaveBeenCalledWith(opus);
  });

  /**
   * THE DEFECT THAT BROKE THE BUILD, held so it cannot come back.
   *
   * P2.d added a SECOND `subjects` to ComposerProps — `subjects?: string[]`,
   * the board's own words for the grey completion — beside the
   * `subjects: Subject[]` that carries what the person picked. TypeScript
   * refused the interface and Railway refused the deploy, but the worse half
   * was what it did when it ran: Room.tsx passed the attribute twice, the
   * later one won, and the picked subjects never reached the composer at all.
   * Every chip above the line would have drawn `undefined ×`.
   *
   * The board's words are `drawn` now. These two hold the pair apart: the
   * chips are what was PICKED, and a board word never becomes one.
   */
  it('draws what was picked, not what the board happens to be showing', () => {
    mount({ subjects: [opus], drawn: ['Greenhills', 'Rockwell'] });
    expect(screen.getByText('OPUS ×')).toBeTruthy();
    const chips = Array.from(document.querySelectorAll('.r-chips button'))
      .map((c) => c.textContent ?? '');
    expect(chips.join(' ')).not.toMatch(/undefined/);
    expect(chips.some((c) => c.includes('Greenhills'))).toBe(false);
  });

  it('holds nothing above the line when only the board has names', () => {
    mount({ subjects: [], drawn: ['Greenhills', 'Rockwell'] });
    expect(document.querySelector('.r-chips')).toBeNull();
  });

  it('names no figure anywhere in the chips', () => {
    mount({ subjects: [opus], scope: { id: 'p', title: 'A page' }, named: [] });
    const chips = document.querySelectorAll('.r-chips button');
    for (const chip of chips) {
      expect(chip.textContent ?? '').not.toMatch(/\d[\d,.]*\s*(₱|%)|₱/);
    }
  });
});

/**
 * GREY TEXT THAT FINISHES THE QUESTION (P2.d), through the component nobody
 * can see it in otherwise.
 *
 * The pure half is `ghosts.test.ts`. This is the wiring: that the completion
 * is drawn, that TAB takes it and ENTER does not, and that it gets out of the
 * way of the `@` menu — two completions on one line, both bound to Tab, is one
 * too many.
 */
describe('the grey completion', () => {
  const TOKENS = [{
    argument: 'date_range', kind: 'navigation' as const, label: 'window',
    value: 'last_week', valueLabel: 'last week',
    alternatives: [
      { value: 'last_week', label: 'last week', spellings: ['last week'] },
      { value: 'last_month', label: 'last month', spellings: ['last month'] },
    ],
    targets: [{ post: 'p1', turn: 0, seq: 1, tool: 'get_sales' }],
  }];

  it('finishes what is typed, in grey, with what it costs', () => {
    const { line, view } = mount({ tokens: TOKENS, subjects: [] });
    type(line, 'last mo');
    expect(view.container.querySelector('.r-ghost-rest')?.textContent).toBe('nth');
    expect(view.container.querySelector('.r-ghost-key')?.textContent).toContain('tab');
    expect(view.container.querySelector('.r-ghost-key')?.textContent).toContain('~1s');
  });

  it('repeats the typed half transparently, so the grey starts at the caret', () => {
    const { line, view } = mount({ tokens: TOKENS });
    type(line, 'last mo');
    expect(view.container.querySelector('.r-ghost-typed')?.textContent).toBe('last mo');
  });

  it('is taken by Tab', () => {
    const { line, onDraft } = mount({ tokens: TOKENS });
    type(line, 'last mo');
    fireEvent.keyDown(line, { key: 'Tab' });
    expect(onDraft).toHaveBeenLastCalledWith('last month');
  });

  it('is NOT taken by Enter — Enter sends what was actually typed', () => {
    const { line, onDraft, onSend } = mount({ tokens: TOKENS });
    type(line, 'last mo');
    onDraft.mockClear();
    fireEvent.keyDown(line, { key: 'Enter' });
    expect(onSend).toHaveBeenCalled();
    expect(onDraft).not.toHaveBeenCalled();
  });

  it('costs no request and no model turn to produce', async () => {
    const { line, read, view } = mount({ tokens: TOKENS });
    type(line, 'last mo');
    await waitFor(() => expect(view.container.querySelector('.r-ghost')).not.toBeNull());
    expect(read).not.toHaveBeenCalled();
  });

  it('gets out of the way of the @ menu, which also answers to Tab', async () => {
    const { line, view } = mount({ tokens: TOKENS, draft: '@Seik' });
    type(line, '@Seik');
    await screen.findAllByRole('option');
    expect(view.container.querySelector('.r-ghost')).toBeNull();
  });

  it('draws nothing when the board has nothing to finish with', () => {
    const { line, view } = mount({ tokens: [], subjects: [], pages: [] });
    type(line, 'last mo');
    expect(view.container.querySelector('.r-ghost')).toBeNull();
  });
});
