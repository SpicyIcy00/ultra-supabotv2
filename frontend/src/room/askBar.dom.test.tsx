// @vitest-environment jsdom
/**
 * THE LINE IS ON EVERY SCREEN (the owner, 2026-09-19: "the text bar should be
 * global same spot everypage").
 *
 * UI rule 1: Bob is on every page, not a page you navigate to, and he receives
 * that page as context. Before this he was on ONE page. The other four screens
 * in his own chrome — Needs you, Kept, Systems, StoreHub exports — had nowhere
 * to say anything, so the way to ask about what you were looking at was to
 * leave it first.
 *
 * Held here: the line renders in the shell rather than in any one screen, it
 * sits in the SAME wrapper the board's composer sits in (so it is in the same
 * place, which is what "same spot" means), a question names the screen it was
 * asked from, and asking opens the board, because an answer needs somewhere to
 * land.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('../services/workflowsApi', () => ({
  listApprovals: () => Promise.resolve([]),
  listWorkflows: () => Promise.resolve([]),
}));
vi.mock('../services/pagesApi', () => ({ listPages: () => Promise.resolve([]) }));
vi.mock('../services/standingApi', () => ({ listStanding: () => Promise.resolve([]) }));
vi.mock('../services/storehubImportsApi', () => ({ listImports: () => Promise.resolve([]) }));

const ask = vi.fn();
vi.mock('../hooks/useBob', () => ({
  useBob: () => ({ ask, busy: false, presence: 'idle' }),
}));

import { RoomShell } from './RoomShell';

afterEach(() => { cleanup(); ask.mockReset(); navigate.mockReset(); });

function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <RoomShell><p>a screen</p></RoomShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('the line, on every screen', () => {
  it('is there on a screen that is not the board, in the composer place', () => {
    const { container } = mount('/storehub-imports');
    const line = screen.getByLabelText('Ask Bob');
    expect(line).toBeTruthy();
    // THE SAME SPOT: `.r-line-wrap` is the fixed bottom strip the board's
    // composer lives in. Same wrapper, same position, no second geometry.
    expect(container.querySelector('.r-line-wrap .r-compose .r-line')).toBeTruthy();
    expect(line.getAttribute('placeholder')).toContain('storehub exports');
  });

  it('names the screen it was asked from and opens the board', () => {
    mount('/storehub-imports');
    const line = screen.getByLabelText('Ask Bob') as HTMLInputElement;
    fireEvent.change(line, { target: { value: 'is the transfer file in yet?' } });
    fireEvent.keyDown(line, { key: 'Enter' });

    expect(ask).toHaveBeenCalledWith('is the transfer file in yet?',
      { pageContext: 'StoreHub exports' });
    // The answer is drawn in the room, so that is where asking takes you.
    expect(navigate).toHaveBeenCalledWith('/bob');
    expect(line.value).toBe('');
  });

  it('asks nothing on an empty line', () => {
    mount('/kept');
    const line = screen.getByLabelText('Ask Bob');
    fireEvent.change(line, { target: { value: '   ' } });
    fireEvent.keyDown(line, { key: 'Enter' });
    expect(ask).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
