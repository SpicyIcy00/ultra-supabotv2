/**
 * A duplicate read's row says so, in place of a row count.
 *
 * The loop serves an identical read from the turn's own record and marks the
 * frame duplicate_of; the row must say "same as call N, not re-read" rather
 * than show a count for a read that did not happen.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ToolCall } from '../../types/george';
import { ToolCallRow } from './ToolCallRow';

afterEach(cleanup);

const result = {
  row_count: 7, source_table: 'new_transactions', truncated: false, duration_ms: 3, error: null,
};

describe('ToolCallRow', () => {
  it('counts rows for a read that ran', () => {
    const call: ToolCall = { seq: 1, tool: 'get_sales', arguments: { metric: 'net_sales' }, result };
    render(<ToolCallRow call={call} />);
    expect(screen.getByText(/7 rows/)).toBeTruthy();
    expect(screen.queryByText(/not re-read/)).toBeNull();
  });

  it('says a duplicate was served from the record, not re-read', () => {
    const call: ToolCall = {
      seq: 2, tool: 'get_sales', arguments: { metric: 'net_sales' }, duplicate_of: 1, result,
    };
    render(<ToolCallRow call={call} />);
    expect(screen.getByText('same as call 1 · not re-read')).toBeTruthy();
    expect(screen.queryByText(/7 rows/)).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/served from this turn/)).toBeTruthy();
  });
});
