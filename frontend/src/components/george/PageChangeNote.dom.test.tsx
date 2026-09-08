/**
 * The page-change confirmation, as rendered output.
 *
 * THE PROPERTIES UNDER TEST: the lines come from the frame's operations,
 * not from prose; "remove" reads as kept in Ungrouped and never as deleted;
 * the link goes to the page by id; and nothing wears the approvals colour.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageChangedFrame } from '../../types/george';
import { PageChangeNote } from './PageChangeNote';

afterEach(cleanup);

const change: PageChangedFrame = {
  page_id: 'p-rock', title: 'Rockwell Weekly', purpose: null,
  updated_at: '2026-09-08T01:00:00+00:00', analysis_count: 2,
  analyses: [], created: false,
  operations: [
    { op: 'remove', title: 'Units', from_page: 'Rockwell Weekly', to: 'ungrouped' },
    { op: 'rename', from: 'Rockwell', to: 'Rockwell Weekly' },
  ],
};

describe('PageChangeNote', () => {
  it('confirms each operation from the frame, in the agreed words', () => {
    const { container } = render(
      <MemoryRouter><PageChangeNote change={change} /></MemoryRouter>,
    );
    expect(screen.getByText('Removed “Units” from “Rockwell Weekly” · kept in Ungrouped')).toBeTruthy();
    expect(screen.getByText('Renamed page “Rockwell” to “Rockwell Weekly”')).toBeTruthy();
    expect(container.textContent).not.toMatch(/delet/i);
    expect(container.innerHTML).not.toMatch(/george-accent/);
  });

  it('links to the page by its id, never by its title', () => {
    render(<MemoryRouter><PageChangeNote change={change} /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Open Rockwell Weekly' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/pages/p-rock');
  });
});
