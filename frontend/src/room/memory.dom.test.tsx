// @vitest-environment jsdom
/**
 * WHAT DO YOU REMEMBER — the memory, drawn as a finding.
 *
 * FOUR THINGS PER VIEW, because the question is about the memory and not only
 * about the business: what he thinks, WHEN he learned it, what it RESTS ON,
 * and how many questions it has been carried into. All four come off the row
 * `view_memory` returned; nothing in the tile counts, dates or infers.
 *
 * AND A FORGET ON EACH, which is why this is a tile and not one of the six
 * marks. A mark draws what a read returned; a gesture per row is not a
 * drawing, and mapping this onto `table` would have deleted the one thing the
 * card turns on — exactly the reason `draft` kept its editable quantities.
 *
 * THE COUNT IS DRAWN AS WHAT IT MEASURED. "carried into 9 questions" is what
 * the tool counted. "changed 9 answers" is what nobody measured, and one of
 * the tests here is the one that keeps the two apart on screen.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AnswerTurn } from './data';
import type { BoardObject, Local } from './board';
import type { TileActions } from './tiles';
import { Board } from './render';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const META = {
  source_table: 'george.beliefs',
  snapshot_timestamp: '2026-09-15T09:00:00Z',
  metric_label: 'What I think right now',
  filters_applied: ['superseded_by IS NULL', 'forgotten_at IS NULL'],
};

const ROWS = [
  {
    id: 'b1', subject: 'Rockwell', subject_kind: 'store', stance: 'needs_attention',
    claim: 'Rockwell is losing customers rather than smaller baskets.',
    held_since: '2026-09-04T09:00:00Z', last_checked: '2026-09-12T09:00:00Z',
    rests_on: 'get_sales, get_stock', told: null, carried: true,
    applied: 9, last_applied: '2026-09-15T08:55:00Z', unconfirmed: true,
  },
  {
    id: 't1', subject: 'we', subject_kind: 'estate', stance: 'means',
    claim: 'When they say we they mean the retail shops, not the warehouse.',
    held_since: '2026-09-12T09:00:00Z', last_checked: '2026-09-12T09:00:00Z',
    rests_on: 'no, we means the shops', told: 'no, we means the shops', carried: true,
    applied: 1, last_applied: '2026-09-15T08:55:00Z', unconfirmed: false,
  },
];

const TURN = {
  role: 'bob', text: 'Two things.', thinking: '', at: '2026-09-15T09:00:00Z',
  toolCalls: [{ seq: 1, tool: 'view_memory', arguments: {}, result: { rows: ROWS, meta: META } }],
} as unknown as AnswerTurn;

function acts(over: Partial<TileActions> = {}): TileActions {
  return {
    open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(),
    retune: vi.fn(),
    forget: vi.fn(), ...over,
  };
}

function draw(on: TileActions, over: Partial<BoardObject> = {},
              local: Record<string, Local> = {}) {
  const o = {
    key: 'mem', kind: 'memory', weight: 'lead', seq: 1, tool: 'view_memory',
    turn: 0, touched: 0, ...over,
  } as BoardObject;
  return render(
    <Board answers={[TURN]} board={[o]} local={local} focused={null}
           selection={[]} live={false} retuned={{}} on={on} />,
  );
}

describe('every belief, and its life', () => {
  it('draws every view he holds, not a summary of them', () => {
    draw(acts());
    expect(screen.getByText(/losing customers rather than smaller baskets/)).toBeTruthy();
    expect(screen.getByText(/they mean the retail shops/)).toBeTruthy();
  });

  it('says when it was learned and what it rests on', () => {
    draw(acts());
    const life = document.querySelectorAll('.r-belief-life');
    expect(life[0].textContent).toMatch(/learned/);
    expect(life[0].textContent).toMatch(/from get_sales, get_stock/);
  });

  it('quotes a person where a person is what it rests on', () => {
    draw(acts());
    const life = document.querySelectorAll('.r-belief-life');
    expect(life[1].textContent).toMatch(/you said/);
    expect(life[1].textContent).toMatch(/no, we means the shops/);
    // A taught view is never asked to be re-read: no data can settle it.
    expect(life[1].textContent).not.toMatch(/unconfirmed/);
  });

  it('marks a reading that has not been checked since data landed', () => {
    draw(acts());
    expect(document.querySelectorAll('.r-belief-life')[0].textContent)
      .toMatch(/unconfirmed since new data landed/);
  });

  it('says how many questions it was CARRIED INTO, never how many it changed', () => {
    /**
     * The whole reason this test exists. Nothing on this path observes an
     * answer changing, so the screen may not say one did — the tool counted
     * attachments and the tile says attachments.
     */
    draw(acts());
    const life = document.querySelectorAll('.r-belief-life');
    expect(life[0].textContent).toMatch(/carried into 9 questions/);
    expect(life[1].textContent).toMatch(/carried into 1 question/);
    expect(document.body.textContent).not.toMatch(/changed 9/);
  });

  it('carries the receipts of the read, like any other object', () => {
    /**
     * The card asks for this in those words, and UI rule 6 makes it
     * mandatory: "carried into 9 questions" is a number, so the time it was
     * read has to be on screen with it. It comes off the read's own meta.
     */
    draw(acts());
    expect(document.querySelector('.r-src')?.textContent).toMatch(/read /);
  });
});

describe('forget', () => {
  it('offers one on every view, naming the belief it is about', () => {
    const on = acts();
    draw(on);
    const buttons = screen.getAllByRole('button', { name: 'Forget' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(on.forget).toHaveBeenCalledWith('mem', 't1');
  });

  it('does not open the object when the Forget is pressed', () => {
    /** The row's own gesture is not a click on the tile behind it. */
    const on = acts();
    draw(on);
    fireEvent.click(screen.getAllByRole('button', { name: 'Forget' })[0]);
    expect(on.open).not.toHaveBeenCalled();
  });

  it('says a forgotten view is gone and what that means, rather than hiding it', () => {
    draw(acts(), {}, { mem: { forgot: ['b1'] } });
    expect(screen.getByText(/He will not bring it to the next question/)).toBeTruthy();
    // The claim is still legible — struck through, not deleted under the hand
    // that pressed it. The other view is untouched.
    expect(document.querySelectorAll('.r-belief[data-forgotten]')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Forget' })).toHaveLength(1);
  });

  it('draws no working Forget on a surface that has not wired one', () => {
    /** A button that does nothing is worse than no button. */
    const on = acts();
    delete (on as { forget?: unknown }).forget;
    draw(on);
    for (const b of screen.getAllByRole('button', { name: 'Forget' })) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe('holding nothing', () => {
  it('says so, rather than drawing an empty list', () => {
    /**
     * A claim about state renders from a loaded result (UI rule 8). The rows
     * are in hand by the time this draws, so "he is not holding a view" is
     * read off them and never off a literal.
     */
    const empty = {
      ...TURN,
      toolCalls: [{ seq: 1, tool: 'view_memory', arguments: {},
                    result: { rows: [], meta: META } }],
    } as unknown as AnswerTurn;
    const o = { key: 'mem', kind: 'memory', weight: 'lead', seq: 1,
                tool: 'view_memory', turn: 0, touched: 0 } as BoardObject;
    render(<Board answers={[empty]} board={[o]} local={{}} focused={null}
                  selection={[]} live={false} retuned={{}} on={acts()} />);
    expect(screen.getByText(/not holding a view about anything yet/)).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: 'Forget' })).toHaveLength(0);
  });

  it('shows every view he holds, because he cannot be given a subset', () => {
    /**
     * `composition.widgets.memory` needs `seq` and nothing else, so there is
     * no channel for Bob to choose which of his views you are shown. A
     * memory you cannot see all of is not one you can check.
     */
    draw(acts());
    expect(document.querySelectorAll('.r-belief')).toHaveLength(ROWS.length);
  });
});

/* ---------------------------------------------------------------------------
 * EVERY VIEW, OR IT IS NOT A MEMORY YOU CAN CHECK (the dogfood log, 2026-09-15)
 *
 * *"am i supposed to be able to scroll this memory"* — he was looking at four
 * of six. `.r-tile` is max-height 560px with overflow hidden and pins every
 * direct child to `flex: 0 0 auto`, so the register was cut with no scrollbar
 * and no line saying so, under a card whose own words are "every view he
 * holds".
 * ------------------------------------------------------------------------ */

describe('a memory longer than the tile', () => {
  const MANY = Array.from({ length: 6 }, (_, i) => ({
    ...ROWS[0], id: `b${i}`, subject: `Shop ${i}`,
    claim: `Shop ${i} is doing something worth a sentence about it.`,
  }));

  function drawMany(meta: Record<string, unknown> = META) {
    const turn = {
      role: 'bob', text: 'Six things.', thinking: '', at: '2026-09-15T09:00:00Z',
      toolCalls: [{ seq: 1, tool: 'view_memory', arguments: {},
                    result: { rows: MANY, meta } }],
    } as unknown as AnswerTurn;
    const o = { key: 'mem', kind: 'memory', weight: 'lead', seq: 1,
                tool: 'view_memory', turn: 0, touched: 0 } as BoardObject;
    return render(<Board answers={[turn]} board={[o]} local={{}} focused={null}
                         selection={[]} live={false} retuned={{}} on={acts()} />);
  }

  it('draws every view it was given, not the ones that happen to fit', () => {
    drawMany();
    expect(document.querySelectorAll('.r-belief')).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: 'Forget' })).toHaveLength(6);
  });

  it('says how many there are, so a list that scrolls is not a list that ends', () => {
    drawMany({ ...META, held: 6 });
    expect(screen.getByText(/6 views/)).toBeTruthy();
  });

  it('says the count the READ gave, which can exceed the rows it returned', () => {
    /** self_reader caps the rows at MAX_VIEWS; `held` counts what he holds. */
    drawMany({ ...META, held: 24 });
    expect(screen.getByText(/24 views/)).toBeTruthy();
  });

  it('falls back to the rows when the read named no count', () => {
    drawMany({ ...META, held: undefined });
    expect(screen.getByText(/6 views/)).toBeTruthy();
  });

  it('says nothing about a count when there is nothing to count', () => {
    const turn = {
      role: 'bob', text: '', thinking: '', at: '2026-09-15T09:00:00Z',
      toolCalls: [{ seq: 1, tool: 'view_memory', arguments: {},
                    result: { rows: [], meta: META } }],
    } as unknown as AnswerTurn;
    const o = { key: 'mem', kind: 'memory', weight: 'lead', seq: 1,
                tool: 'view_memory', turn: 0, touched: 0 } as BoardObject;
    render(<Board answers={[turn]} board={[o]} local={{}} focused={null}
                  selection={[]} live={false} retuned={{}} on={acts()} />);
    expect(screen.queryByText(/views/)).toBeNull();
    expect(screen.getByText(/not holding a view about anything yet/)).toBeTruthy();
  });
});
