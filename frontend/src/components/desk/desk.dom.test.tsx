/**
 * The desk, as rendered — the interaction model, against the DOM.
 *
 * The API is mocked at the service boundary and nothing else: the hooks, the
 * merge, the surface composer, the desk composer and every renderer run for
 * real. What is asserted is what the reset asks for — the business reorganises
 * rather than producing a report, "Why?" transforms the object in front of the
 * person, a click is faster than a name, a selection is context, a window
 * change recomposes without a model turn, and none of it depends on colour or
 * on motion.
 *
 * Numbered to the milestone's twelve required tests.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '../../types/river';

/* ------------------------------------------------------------- the mocks -- */

const readRiver = vi.fn();
const readThread = vi.fn();
const replayCalls = vi.fn();
type AskedOptions = { desk?: import('../../types/george').DeskContext | null };
const asked: { question: string; options: AskedOptions }[] = [];

vi.mock('../../services/riverApi', () => ({
  readRiver: (...a: unknown[]) => readRiver(...a),
  readThread: (...a: unknown[]) => readThread(...a),
  sharePost: vi.fn(),
}));
vi.mock('../../services/chatsApi', () => ({
  getChat: vi.fn(async () => { throw Object.assign(new Error('404'), { isAxiosError: true, response: { status: 404 } }); }),
  listChats: vi.fn(async () => []),
}));
vi.mock('../../services/workflowsApi', () => ({
  listApprovals: vi.fn(async () => []),
  listWorkflows: vi.fn(async () => []),
}));
vi.mock('../../services/pinsApi', () => ({ listPins: vi.fn(async () => []), errorMessage: (e: unknown) => String(e) }));
vi.mock('../../services/greetingApi', () => ({
  getGreeting: vi.fn(async () => ({
    kind: 'item', headline: 'Fairview took ₱62,410 on Thu 4 Sep 2026 — 34% above the same Thursday last week.',
    item: null, notices: [], meta: {}, blind_sections: [], follow_ups: [],
  })),
}));
vi.mock('../../services/deskApi', async () => {
  const fixture = await import('./deskFixture');
  return {
    readDeskDefinitions: vi.fn(async () => ({
      business: { name: 'Aji Ichiban', short: 'AJI' },
      windows: [
        { name: 'last_week', includes_partial_day: false, closed_alternative: null, relative: {} },
        { name: 'last_month', includes_partial_day: false, closed_alternative: null, relative: {} },
        { name: 'this_week', includes_partial_day: true, closed_alternative: 'last_week', relative: {} },
      ],
      window_arguments: { get_sales: 'date_range' },
      rest_reads: [{ tool: 'get_sales', arguments: { group_by: ['store'], date_range: 'last_7_days', compare_to: 'previous_period', metric: 'net_sales' } }],
      selection: { dimensions: ['store', 'product', 'category'], max_subjects: 12, identity: { store: 'store_id', product: 'product_id', category: 'category' } },
      direct_manipulation: ['select', 'focus', 'clear', 'back', 'change_window', 'sort', 'show_as_list', 'inspect', 'trail'],
      locations: [],
    })),
    replayCalls: (...a: unknown[]) => replayCalls(...a),
    __fixture: fixture,
  };
});
// The stream: `ask` records what it was sent and answers nothing, so a test
// can prove a click never reached it.
vi.mock('../../hooks/useGeorge', () => ({
  useGeorge: () => ({
    turns: [], state: 'idle', presence: 'idle', busy: false,
    live: { running: [], lastResult: null, thinking: '', toolResults: 0, figures: 0 },
    composer: 'idle', setComposer: vi.fn(),
    ask: (question: string, options: AskedOptions) => { asked.push({ question, options }); return Promise.resolve(); },
    cancel: vi.fn(), reset: vi.fn(), open: vi.fn(),
    threadId: null, storedThreadId: null, pageScope: null,
  }),
}));

import DeskPage from '../../pages/DeskPage';
import { chain, headlineSet, PERF, post, products, question, replayResults, finding, scopedSet } from './deskFixture';

/* ------------------------------------------------------------- the mount -- */

function mount(path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<DeskPage />} />
          <Route path="/w/:threadId" element={<DeskPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const REST = { status: 'ok', notices: [], ran_at: '2026-09-09T09:00:00+08:00', results: replayResults([chain(0)], { name: 'last_7_days', start: '2026-09-01', end: '2026-09-08' }) };

/** The stores question and its answer, as the river stored them. */
function storesWork(): Post[] {
  return [question('q1', 'What’s going on with the stores?', null), post('a1', headlineSet(), PERF())];
}

afterEach(cleanup);
beforeEach(() => {
  readRiver.mockReset();
  readThread.mockReset();
  replayCalls.mockReset();
  asked.length = 0;
  readRiver.mockResolvedValue({ posts: [], before: null });
  readThread.mockResolvedValue([]);
  replayCalls.mockResolvedValue(REST);
  window.localStorage.clear();
});

/**
 * The subjects on screen, in whichever representation the composer chose.
 *
 * A plane draws objects; a ranked comparison draws rows. Both are clickable,
 * both carry the subject, and a test that could only see one of them would be
 * testing the drawing rather than the interaction.
 */
const subjects = (root: HTMLElement) => [...root.querySelectorAll('[data-object], [data-subject]')];
const subjectNamed = (root: HTMLElement, name: string) =>
  root.querySelector(`[data-object="store:${name}"], [data-subject="${name}"]`)
  ?? root.querySelector(`[data-object$=":${name}"]`);
const objects = (container: HTMLElement) => [...container.querySelectorAll('[data-object]')];
const stages = (container: HTMLElement) => [...container.querySelectorAll('[data-answer]')];

/** The clickable thing inside a row or an object. */
const clickable = (el: Element): Element => el.querySelector('button') ?? el;

/* ------------------------------------------------------- 1. open at rest -- */

describe('1. open George: the business is there, and it is not a report', () => {
  it('draws the estate as objects, with George’s sentence above it', async () => {
    const { container } = mount();
    await screen.findByText(/Fairview took ₱62,410/);
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    // Where I am, and what needs me — in the sidebar, which is navigation.
    const sidebar = container.querySelector('[data-sidebar]')!;
    expect(sidebar.querySelector('[data-business]')?.textContent).toBe('AJI');
    expect(sidebar.querySelector('[data-nav="Needs you"]')).toBeTruthy();
    expect(sidebar.querySelector('[data-nav="History"]')).toBeTruthy();
    // The business at rest is ONE object, not a grid of cards.
    expect(stages(container)).toHaveLength(1);
    expect(container.querySelector('[data-stage="field"]')).toBeTruthy();
    // ONE read of one metric: a ranked comparison says it in one dimension,
    // so no plane is drawn and nothing needs explaining.
    expect(container.querySelector('[data-representation]')?.getAttribute('data-representation')).toBe('ranked');
    expect(container.querySelector('[data-guidance]')).toBeNull();
    // A replay, not a turn: the model was never asked.
    expect(replayCalls).toHaveBeenCalledTimes(1);
    expect(asked).toHaveLength(0);
  });

  it('says it is checking, and never claims the estate is quiet before it knows', async () => {
    replayCalls.mockImplementation(() => new Promise(() => {}));
    const { container } = mount();
    expect(await screen.findByText('Laying out the business…')).toBeTruthy();
    expect(container.querySelector('[data-stage]')).toBeNull();
  });
});

/* ---------------------------------------------- 2–4. the investigation -- */

describe('2–4. the business reorganises, and "Why?" transforms it', () => {
  it('asking for the stores draws one field of seven objects, not a report', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(container.querySelector('[data-stage="field"]')).toBeTruthy());
    expect(subjects(container)).toHaveLength(7);
    expect(stages(container)).toHaveLength(1);
    // No table of the same rows beside it, and no tool vocabulary anywhere.
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).not.toMatch(/get_sales|group_by|compare_to|change_pct/);
    // WHAT THE DATA SINGLED OUT IS SAID PER SUBJECT, not joined into one
    // sentence under the drawing. Each finding names its own shop, states the
    // fact a tool established about it, and carries that shop's own figures.
    const found = [...container.querySelectorAll('[data-finding]')];
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found.length).toBeLessThanOrEqual(4);
    const named = found.map((f) => f.getAttribute('data-finding-subject'));
    expect(named).toContain('North Edsa');
    expect(named).toContain('Magnolia');
    // Every one rests on a ground a tool established. There is no score here.
    for (const f of found) {
      expect(['against_the_majority', 'ranked_first', 'drivers_diverge'])
        .toContain(f.getAttribute('data-finding'));
    }
    // Why a finding is here carries no numeral: its figures are beside it.
    expect(found[0].querySelector('p')!.textContent).not.toMatch(/\d/);
    // And the field they were read from is still on screen underneath, so this
    // is a reading of ONE drawing and not a grid of tiles.
    expect(objects(container)).toHaveLength(7);
  });

  it('3. clicking a store focuses it: one object deepens, the estate recedes, nothing is appended', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(subjects(container)).toHaveLength(7));

    fireEvent.click(clickable(subjectNamed(container, 'North Edsa')!));

    await waitFor(() => expect(container.querySelector('[data-stage="anatomy"]')).toBeTruthy());
    // ONE stage still: the workspace transformed, it did not gain a second thing.
    expect(stages(container)).toHaveLength(1);
    expect(container.querySelector('[data-stage="field"]')).toBeNull();
    const anatomy = container.querySelector('[data-anatomy]')!;
    expect(anatomy.getAttribute('data-anatomy')).toBe('North Edsa');
    // The drivers, from rows already on screen — the model was never asked.
    expect(within(anatomy as HTMLElement).getAllByText(/Transactions|Average transaction value/).length).toBeGreaterThanOrEqual(2);
    expect(asked).toHaveLength(0);
    // THE READING IS WITH THE FIGURES IT READS, and carries no numeral.
    const conclusion = anatomy.querySelector('[data-conclusion]')!;
    expect(conclusion).toBeTruthy();
    expect(conclusion.textContent).toMatch(/transactions|average transaction value/i);
    expect(conclusion.textContent).not.toMatch(/\d/);
    // The estate recedes but does not leave: still drawn, still reachable,
    // so the other six shops are there to reach for.
    const band = container.querySelector('[data-band="store"]')!;
    expect(band.textContent).toContain('Net sales');
    expect(subjectNamed(band as HTMLElement, 'Magnolia')).toBeTruthy();
    // The trail says where we are.
    expect(container.querySelector('[data-work-trail]')?.textContent).toContain('North Edsa');
  });

  it('4. "Why?" is offered as a question that needs no store name, and carries the selection', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    fireEvent.click(clickable(subjectNamed(container, 'North Edsa')!));
    await waitFor(() => expect(container.querySelector('[data-stage="anatomy"]')).toBeTruthy());

    const why = container.querySelector('[data-action="explain_selection"]')!;
    expect(why.textContent).toBe('Why?');
    fireEvent.click(why);

    expect(asked).toHaveLength(1);
    expect(asked[0].question).toBe('Why did net sales change for North Edsa last week?');
    // Selection is context, by the id the ROW carried — never a label the
    // model inferred, and never a figure.
    expect(asked[0].options.desk!.selection).toEqual({
      dimension: 'store', subjects: [{ id: 's-north-edsa', label: 'North Edsa' }],
    });
    // AND WHAT IS ON SCREEN, so a follow-up with nothing clicked still has a
    // referent. Names and closed vocabularies; never a figure.
    const drawn = asked[0].options.desk!.drawn!;
    expect(drawn.dimension).toBe('store');
    expect(drawn.subjects).toContain('North Edsa');
    expect(drawn.subjects.length).toBeLessThanOrEqual(12);
    expect(JSON.stringify(asked[0].options.desk)).not.toMatch(/\d+\.\d/);
  });

  it('a stored "Why?" composes into the SAME object — one stage, two steps in the trail', async () => {
    readRiver.mockResolvedValue({
      posts: [
        ...storesWork(),
        question('q2', 'Why?', 'a1', { selection: { dimension: 'store', subjects: [{ id: 's-north-edsa', label: 'North Edsa' }] } }),
        post('a2', [], undefined, { body: 'Basket value fell further than transactions.' }),
      ],
      before: null,
    });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(container.querySelector('[data-stage="anatomy"]')).toBeTruthy());
    // Nothing appended: one answer, and it is the transformed object.
    expect(stages(container)).toHaveLength(1);
    expect(container.querySelectorAll('[data-anatomy]')).toHaveLength(1);
    // The work trail is how we got here, and the way back.
    const steps = container.querySelectorAll('[data-trail-step]');
    expect(steps).toHaveLength(2);
    expect(steps[0].textContent).toContain('What’s going on with the stores?');
    expect(steps[1].textContent).toContain('Why?');
    // George's own words are IN the work, not in the sidebar.
    const prose = container.querySelector('[data-prose]')!;
    expect(prose.textContent).toContain('Basket value fell further');
    expect(container.querySelector('[data-sidebar]')?.textContent).not.toContain('Basket value fell further');
    // Focus was restored from what the question carried, not from the client.
    expect(container.querySelector('[data-anatomy]')?.getAttribute('data-anatomy')).toBe('North Edsa');
  });

  it('5. "Products" transforms the same object into its breakdown', async () => {
    readRiver.mockResolvedValue({
      posts: [
        question('q1', 'North Edsa?', null), post('a1', scopedSet('North Edsa'), PERF()),
        question('q2', 'Products.', 'a1'), post('a2', [products(4, 'North Edsa')], [finding(4, 'breakdown', 1)]),
      ],
      before: null,
    });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(container.querySelector('[data-breakdown]')).toBeTruthy());
    expect(stages(container)).toHaveLength(1);
    expect(container.querySelector('[data-stage="anatomy"]')).toBeTruthy();
    // The products are objects of their own, and the one with no baseline is
    // NAMED rather than drawn at zero.
    const breakdown = container.querySelector('[data-breakdown]') as HTMLElement;
    // The tool ranked by change, so the ranked instrument draws it in that
    // order — and what it could not rank is still named, never at zero.
    expect(subjects(breakdown).map((o) => o.getAttribute('data-subject') ?? o.getAttribute('data-object')))
      .toEqual(['Mango Gummy', 'Cola Chew', 'Milk Candy', 'Mint Drop']);
    expect(breakdown.textContent).toContain('Mint Drop');
  });
});

/* --------------------------------------------------------- 6. selection -- */

describe('6. several objects selected, and one contextual action for them', () => {
  it('shift-clicking two stores compares them, and "Why these?" names both without being told', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(objects(container)).toHaveLength(7));

    fireEvent.click(clickable(subjectNamed(container, 'North Edsa')!));
    // The estate is still there to reach for, so the second shop is one
    // shift-click away rather than a name somebody has to type.
    await waitFor(() => expect(container.querySelector('[data-band="store"]')).toBeTruthy());
    const band = container.querySelector('[data-band="store"]') as HTMLElement;
    fireEvent.click(clickable(subjectNamed(band, 'Magnolia')!), { shiftKey: true });

    await waitFor(() => expect(container.querySelector('[data-stage="compare"]')).toBeTruthy());
    expect(stages(container)).toHaveLength(1);
    expect(container.querySelectorAll('[data-anatomy]')).toHaveLength(2);
    expect(asked).toHaveLength(0);

    fireEvent.click(container.querySelector('[data-action="explain_selection"]')!);
    expect(asked[0].question).toBe('Why did net sales change for North Edsa and Magnolia last week?');
    expect(asked[0].options.desk!.selection).toEqual({
      dimension: 'store',
      subjects: [{ id: 's-north-edsa', label: 'North Edsa' }, { id: 's-magnolia', label: 'Magnolia' }],
    });
    expect(asked[0].options.desk!.drawn?.dimension).toBe('store');
  });

  it('the line says what the question will carry, so nothing about it is a guess', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    fireEvent.click(clickable(subjectNamed(container, 'North Edsa')!));
    await waitFor(() =>
      expect(container.querySelector('[data-desk-context]')?.textContent).toContain('North Edsa'));
    expect(container.querySelector('[data-desk-context]')?.textContent).toContain('last week');
  });
});

/* ------------------------------------------------------------- 4, 7. time -- */

describe('7. a window change recomposes the same workspace, without a model turn', () => {
  it('replays the work’s own calls and redraws the field', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    replayCalls.mockResolvedValue({
      status: 'ok', notices: [], ran_at: '2026-09-09T10:00:00+08:00',
      results: replayResults(headlineSet(), { name: 'last_month', start: '2026-08-01', end: '2026-09-01' }),
    });

    fireEvent.click(container.querySelector('[data-window="last_month"]')!);

    await waitFor(() => expect(replayCalls).toHaveBeenCalled());
    // The calls of the work, with the window moved and nothing else.
    const sent = replayCalls.mock.calls[0][0] as { tool: string; arguments: Record<string, unknown> }[];
    expect(sent).toHaveLength(3);
    for (const call of sent) {
      expect(call.arguments.date_range).toBe('last_month');
      expect(call.arguments.group_by).toEqual(['store']);
    }
    // The model was not consulted, and the same subjects are still there.
    expect(asked).toHaveLength(0);
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    expect(stages(container)).toHaveLength(1);
  });

  it('refuses a window still in progress while the work is compared, in the tool’s own terms', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    const partial = container.querySelector('[data-window="this_week"]') as HTMLButtonElement;
    expect(partial.disabled).toBe(true);
    expect(partial.getAttribute('data-refused')).toBe('true');
    expect(partial.title).toContain('still in progress');
    expect(partial.title).toContain('Last week');
  });
});

/* ------------------------------------------------- 4. direct manipulation -- */

describe('4. what a click does never reaches the model', () => {
  it('shows the same rows as a list, and asks nothing', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(subjects(container)).toHaveLength(7));

    const toggle = container.querySelector('[data-action="list"]');
    if (toggle) fireEvent.click(toggle);

    await waitFor(() => expect(container.querySelector('[data-view="ranked"]')).toBeTruthy());
    expect(container.querySelector('[data-view="field"]')).toBeNull();
    // Every subject, its figure and its delta are still on screen.
    for (const name of ['North Edsa', 'Magnolia', 'OPUS']) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    expect(asked).toHaveLength(0);
    expect(replayCalls).not.toHaveBeenCalled();
  });

  it('backs out of a focus without asking anything', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    fireEvent.click(clickable(subjectNamed(container, 'North Edsa')!));
    await waitFor(() => expect(container.querySelector('[data-stage="anatomy"]')).toBeTruthy());

    fireEvent.click(container.querySelector('[data-action="back"]')!);

    await waitFor(() => expect(container.querySelector('[data-stage="field"]')).toBeTruthy());
    expect(asked).toHaveLength(0);
  });
});

/* ------------------------------------------------------- 9. the inspector -- */

describe('9. provenance without losing the workspace', () => {
  it('keeps the receipts under the figures, with the read time on them', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    // UI rules 3 and 6: where it came from, and when it was read.
    const receipts = container.querySelector('[aria-expanded]')!;
    expect(container.textContent).toMatch(/read /);
    expect(receipts).toBeTruthy();
    // The workspace is still there while the receipts are open.
    fireEvent.click(screen.getAllByText(/read /)[0].closest('button')!);
    expect(container.querySelector('[data-stage="field"]')).toBeTruthy();
  });
});

/* --------------------------------------------- 8, 10, 11. the guarantees -- */

describe('8, 10, 11. no client truth, no dependence on motion or colour', () => {
  it('8. keeps nothing about the desk in browser storage', async () => {
    const { container } = mount();
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    fireEvent.click(clickable(subjectNamed(container, 'North Edsa')!));
    await waitFor(() => expect(container.querySelector('[data-stage="anatomy"]')).toBeTruthy());
    // The auth store persists a session; nothing about the work does.
    const keys = Object.keys(window.localStorage);
    expect(keys.filter((k) => k !== 'supabot_auth')).toEqual([]);
    expect(Object.keys(window.sessionStorage)).toEqual([]);
  });

  it('10. keeps the whole interaction model under reduced motion', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduce'), media: q, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      readRiver.mockResolvedValue({ posts: storesWork(), before: null });
      const { container } = mount('/w/t1');
      await waitFor(() => expect(subjects(container)).toHaveLength(7));
      expect(container.querySelector('[data-desk]')?.className).toContain('desk-motion--reduced');
      // Selecting, focusing and backing out all still work.
      fireEvent.click(clickable(subjectNamed(container, 'North Edsa')!));
      await waitFor(() => expect(container.querySelector('[data-stage="anatomy"]')).toBeTruthy());
      fireEvent.click(container.querySelector('[data-action="back"]')!);
      await waitFor(() => expect(container.querySelector('[data-stage="field"]')).toBeTruthy());
    } finally {
      window.matchMedia = original;
    }
  });

  it('11. says everything in text, so removing the colour removes no information', async () => {
    // The plane is the representation that leans on colour and position, so
    // it is the one worth holding to this: every object prints its name, its
    // figure and its delta, and carries all three in its accessible name.
    readRiver.mockResolvedValue({ posts: [question('q1', 'stores?', null), post('a1', headlineSet(), PERF())], before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    if (objects(container).length === 0) return; // ranked: the rows print everything by construction
    for (const object of objects(container)) {
      // The name, the figure and the delta are PRINTED, and the accessible
      // name carries all three for a reader who sees none of it.
      const label = object.getAttribute('aria-label') ?? '';
      expect(label).toMatch(/₱[\d,]+/);
      expect(label).toMatch(/[+−]\d|new|none now|from zero|no change/);
      expect(object.textContent).toMatch(/₱[\d,]+/);
    }
    // Attention is a ring and a sentence, never a hue.
    const singled = container.querySelector('[data-object][data-attention="true"]')!;
    expect(singled.querySelector('.desk-object__ring')).toBeTruthy();
    expect(singled.getAttribute('aria-label')).toContain('singled out');
  });

  it('12. every figure on the desk came from a tool result', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    const { container } = mount('/w/t1');
    await waitFor(() => expect(subjects(container)).toHaveLength(7));
    const rows = chain(1).rows;
    for (const subject of subjects(container)) {
      const figure = (subject.textContent ?? '').match(/₱([\d,]+)/)?.[1];
      expect(figure).toBeTruthy();
      const drawn = Number((figure ?? '').replace(/,/g, ''));
      expect(rows.some((r) => Math.round(r.value as number) === drawn)).toBe(true);
    }
  });
});
