/**
 * What George considered of a page, as rendered output.
 *
 * THE PROPERTY UNDER TEST: the line is visible without doing anything and
 * says what was and was not read; the pins, their states and their read
 * times wait behind one disclosure; and nothing here wears the approvals
 * colour, because nothing here needs anyone.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageContextFrame } from '../../types/george';
import { PageContextBlock } from './PageContextBlock';

afterEach(cleanup);

const CTX: PageContextFrame = {
  page: 'AJI BARN Reorder',
  read_at: '2026-09-07T09:00:00+08:00',
  figures: true,
  pins_total: 4,
  pins_inspected: 3,
  pins_reproduced: 2,
  pins: [
    { pin_id: 'p1', title: 'Dead at retail', status: 'ok', reason: null,
      calls: [{ tool: 'get_dead_stock', arguments: {} }],
      snapshot_timestamp: '2026-09-07T08:55:00+08:00', notice_kinds: [] },
    { pin_id: 'p2', title: 'Low stock at the barn', status: 'refused', reason: null,
      calls: [{ tool: 'get_stock', arguments: { location: 'AJI BARN' } }],
      snapshot_timestamp: null, notice_kinds: ['low_stock_not_operational'] },
    { pin_id: 'p3', title: 'PO value by status', status: 'not_read', reason: 'deadline',
      calls: [{ tool: 'get_purchasing', arguments: {} }],
      snapshot_timestamp: null, notice_kinds: [] },
  ],
  not_inspected: [{ pin_id: 'p4', title: 'Cost history' }],
  unavailable: [],
  partial: true,
  truncated: true,
  rows_dropped: 0,
  notice_kinds: ['page_context_partial', 'page_context_truncated'],
};

describe('the block', () => {
  it('renders nothing when the answer read no page', () => {
    const { container } = render(<PageContextBlock context={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the line without any interaction, and the detail behind it', () => {
    render(<PageContextBlock context={CTX} />);
    expect(
      screen.getByText('Read 3 of 4 saved analyses · 2 could not be reproduced · 1 not inspected'),
    ).toBeTruthy();
    expect(screen.queryByText('Dead at retail')).toBeNull();

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('AJI BARN Reorder')).toBeTruthy();
    expect(screen.getByText('Dead at retail')).toBeTruthy();
    expect(screen.getByText(/· reproduced/)).toBeTruthy();
    expect(screen.getByText('Low stock at the barn')).toBeTruthy();
    expect(screen.getByText(/George declined this one/)).toBeTruthy();
    expect(screen.getByText(/1 notice/)).toBeTruthy();
    expect(screen.getByText('PO value by status')).toBeTruthy();
    expect(screen.getByText(/the time limit passed first/)).toBeTruthy();
    expect(screen.getByText('Cost history')).toBeTruthy();
  });

  it('says Ungrouped for the null scope, and only in words', () => {
    render(<PageContextBlock context={{ ...CTX, page: null }} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Ungrouped')).toBeTruthy();
  });

  it('names requested ids that were not on the page', () => {
    render(<PageContextBlock context={{ ...CTX, unavailable: ['zzz'] }} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Not on this page: zzz')).toBeTruthy();
  });

  it('wears no accent', () => {
    const { container } = render(<PageContextBlock context={CTX} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(container.innerHTML).not.toMatch(/accent/);
  });
});
