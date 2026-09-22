// @vitest-environment jsdom
/**
 * SET IT ASIDE, WITH ONE TAP FOR WHY (W2.3).
 *
 * What this holds: the tap on a reason IS the dismissal (no second step);
 * what goes to the server is the key the row itself carried, or the post's
 * id; the three renderings — words, words on their way, what was kept — are
 * three; "wrong" says it stays; a row someone doubted says so; a set-aside in
 * the memory view is undone, not forgotten; and none of it wears the accent.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';
import { Board } from './render';
import { SetAside } from './SetAside';
import type { Dismissed } from '../services/dismissalsApi';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
vi.mock('../services/noticedApi', () => ({ listNoticed: vi.fn() }));
afterEach(cleanup);

const KEPT: Dismissed = { item: 'attention', kind: 'attention.stock_crossed_out', reason: 'known',
                          quiets: true, kept: [{ id: 'b1', subject: 'Aji Mix at OPUS', outcome: 'new' }] };

describe('the control', () => {
  it('offers the three reasons in order, and one tap is the whole gesture', async () => {
    const send = vi.fn().mockResolvedValue(KEPT);
    const what = { item: 'attention' as const, kind: 'attention.stock_crossed_out', subject: 'Aji Mix at OPUS' };
    render(<SetAside what={what} send={send} />);
    const words = screen.getAllByRole('button').map((b) => b.textContent);
    expect(words).toEqual(['known', 'not important', 'wrong']);
    fireEvent.click(screen.getByText('known'));
    // On its way: the words stay, disabled — not the confirmation yet.
    expect(screen.getByText('not important')).toHaveProperty('disabled', true);
    expect(send).toHaveBeenCalledWith(what, 'known', undefined);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Set aside as known/));
    expect(screen.getByRole('status').textContent).toMatch(/undo it in what he remembers/);
  });

  it('says that wrong keeps it, marked, rather than quieting it', async () => {
    const send = vi.fn().mockResolvedValue({ ...KEPT, reason: 'wrong', quiets: false });
    render(<SetAside what={{ item: 'watch', post_id: 'p1' }} send={send} />);
    fireEvent.click(screen.getByText('wrong'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/stays, marked/));
  });

  it('puts the words back when the write fails, and says it did not take', async () => {
    const send = vi.fn().mockRejectedValue(new Error('500'));
    render(<SetAside what={{ item: 'watch', post_id: 'p1' }} send={send} />);
    fireEvent.click(screen.getByText('not important'));
    await waitFor(() => expect(screen.getByText(/did not take/)).toBeTruthy());
    expect(screen.getByText('known')).toHaveProperty('disabled', false);
  });

  it('never wears the accent', () => {
    const { container } = render(<SetAside what={{ item: 'watch', post_id: 'p1' }} send={vi.fn()} />);
    expect(container.innerHTML).not.toMatch(/accent|r-chip--needs/);
  });
});

/* ---------------------------------------------------- a row of a read */

const ATTENTION_ROWS = [
  { rank: 1, source: 'stock_crossed_out', section: 'stock_crossed_out', subject: 'Aji Mix', store: 'OPUS',
    was: 40, now: 0, measure: 'was',
    dismiss: { item: 'attention', kind: 'attention.stock_crossed_out', subject: 'Aji Mix at OPUS' } },
  { rank: 2, source: 'newly_dead', section: 'newly_dead', subject: 'Haw Flakes', store: 'OPUS',
    quantity_on_hand: 12, measure: 'quantity_on_hand',
    dismiss: { item: 'attention', kind: 'attention.newly_dead', subject: 'Haw Flakes at OPUS' },
    disputed: { reason: 'wrong', by: 'joy', on: '2026-09-22' } },
];

function attentionTurn(): AnswerTurn {
  return {
    role: 'bob', text: 'Two things.', thinking: '', at: '2026-09-22T00:00:00Z',
    toolCalls: [{ seq: 1, tool: 'get_attention', arguments: {}, result: {
      rows: ATTENTION_ROWS,
      meta: { source_table: 'multiple', snapshot_timestamp: '2026-09-22T06:00:00+08:00',
              notice: { kind: 'disputed_by_a_person', message: 'joy said Haw Flakes at OPUS may be wrong.' } },
    } }],
  } as unknown as AnswerTurn;
}

function acts(over: Partial<TileActions> = {}): TileActions {
  return { open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(), ...over };
}

function drawList(on: TileActions) {
  const o = { key: 'att', kind: 'list', weight: 'lead', seq: 1, tool: 'get_attention',
              turn: 0, touched: 0 } as BoardObject;
  return render(<Board answers={[attentionTurn()]} board={[o]} local={{}} focused={null}
                       selection={[]} live={false} retuned={{}} on={on} />);
}

describe('a morning row', () => {
  it('carries the control, and sends back exactly the key the row carried', async () => {
    const dismiss = vi.fn().mockResolvedValue(KEPT);
    drawList(acts({ dismiss }));
    const knowns = screen.getAllByText('known');
    expect(knowns).toHaveLength(2);
    await act(async () => { fireEvent.click(knowns[0]); });
    expect(dismiss).toHaveBeenCalledWith(ATTENTION_ROWS[0].dismiss, 'known');
  });

  it('draws no control where the room did not wire the write', () => {
    drawList(acts());
    expect(screen.queryByText('not important')).toBeNull();
  });

  it('points at the row someone called wrong, and the notice says who', () => {
    const { container } = drawList(acts());
    expect(container.querySelectorAll('[data-disputed="yes"]')).toHaveLength(1);
    expect(container.textContent).toMatch(/joy said Haw Flakes at OPUS may be wrong/);
  });
});

/* ------------------------------------------------------ the memory view */

describe('the memory view', () => {
  it('undoes a set-aside where every other view is forgotten', () => {
    const rows = [
      { id: 's1', subject: 'Aji Mix at OPUS', subject_kind: 'attention.stock_crossed_out',
        stance: 'set_aside_known', stance_said: 'Set aside: known',
        claim: 'Already known to them, so a line running out about this is not raised again',
        held_since: '2026-09-22T00:00:00Z', rests_on: 'I already know about this',
        told: 'I already know about this', carried: true, applied: 0, unconfirmed: false,
        set_aside: 'known' },
      { id: 'b1', subject: 'Rockwell', subject_kind: 'store', stance: 'needs_attention',
        stance_said: 'Noticed', claim: 'Rockwell is losing customers.', held_since: '2026-09-20T00:00:00Z',
        rests_on: 'get_sales', told: null, carried: true, applied: 2, unconfirmed: false, set_aside: null },
    ];
    const turn = {
      role: 'bob', text: '', thinking: '', at: '2026-09-22T00:00:00Z',
      toolCalls: [{ seq: 1, tool: 'view_memory', arguments: {}, result: {
        rows, meta: { source_table: 'george.beliefs', snapshot_timestamp: '2026-09-22T00:00:00Z' } } }],
    } as unknown as AnswerTurn;
    const forget = vi.fn();
    const o = { key: 'mem', kind: 'memory', weight: 'lead', seq: 1, tool: 'view_memory',
                turn: 0, touched: 0 } as BoardObject;
    render(<Board answers={[turn]} board={[o]} local={{}} focused={null}
                  selection={[]} live={false} retuned={{}} on={acts({ forget })} />);
    expect(screen.getByText('Set aside: known')).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
    expect(screen.getByText('Forget')).toBeTruthy();
    fireEvent.click(screen.getByText('Undo'));
    expect(forget).toHaveBeenCalledWith('mem', 's1');
  });
});

/* ------------------------------------------------------ what he noticed */

describe('what Bob noticed', () => {
  it('draws the doubt above the post and sets a watch post aside by its id', async () => {
    const { listNoticed } = await import('../services/noticedApi');
    (listNoticed as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { post_id: 'p1', thread_id: 't1', kind: 'watch', body: 'Sales watch — OPUS down 40.0%',
        created_at: '2026-09-22T00:00:00Z', has_calls: true,
        disputed: 'joy said OPUS may be wrong (a watch on sales, 2026-09-21).' },
      { post_id: 'stuck:workflow:Monday reorder', thread_id: '', kind: 'stuck',
        body: 'Monday reorder failed on its schedule', created_at: '2026-09-22T00:00:00Z', has_calls: false },
    ]);
    const { Noticed } = await import('./Noticed');
    const send = vi.fn().mockResolvedValue({ ...KEPT, item: 'stuck', kind: 'stuck.workflow' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}><Noticed onLookInto={vi.fn()} send={send} /></QueryClientProvider>,
    );
    await waitFor(() => expect(container.textContent).toMatch(/joy said OPUS may be wrong/));
    const caveat = container.querySelector('.r-caveat');
    const body = screen.getByText(/Sales watch/);
    // ABOVE the thing it qualifies.
    expect(caveat!.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getAllByText('known')[1]); });
    expect(send).toHaveBeenCalledWith({ item: 'stuck', post_id: 'stuck:workflow:Monday reorder' }, 'known', null);
    expect(send.mock.calls[0]).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getAllByText('not important')[0]); });
    expect(send).toHaveBeenLastCalledWith({ item: 'watch', post_id: 'p1' }, 'not_important', 't1');
  });
});
