/**
 * The fold line, as drawn (P1.d).
 *
 * It is the visible half of "the board transforms; it never accumulates": the
 * board keeps every object, and what the newest turn did not touch is one
 * quiet line rather than four columns. Three things it must not do — claim
 * anything when there is nothing to claim (UI rule 8), wear the accent, which
 * means "needs you" and nothing else (UI rule 5), or say a number that is not
 * a count of what the caller folded.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Earlier } from './Earlier';

afterEach(cleanup);

describe('what came before this finding', () => {
  it('draws nothing at all when nothing folded', () => {
    const { container } = render(<Earlier count={0} open={false} onToggle={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('says how many, and offers to show them', () => {
    render(<Earlier count={3} open={false} onToggle={() => {}} />);
    const line = screen.getByRole('button');
    expect(line.textContent).toContain('3 things from earlier');
    expect(line.textContent).toContain('show');
    expect(line.getAttribute('aria-expanded')).toBe('false');
  });

  it('counts one thing as one thing', () => {
    render(<Earlier count={1} open={false} onToggle={() => {}} />);
    expect(screen.getByRole('button').textContent).toContain('1 thing from earlier');
  });

  it('offers to fold them back once they are open', () => {
    render(<Earlier count={2} open onToggle={() => {}} />);
    const line = screen.getByRole('button');
    expect(line.textContent).toContain('fold');
    expect(line.getAttribute('aria-expanded')).toBe('true');
  });

  it('hands the tap back rather than deciding anything itself', () => {
    const onToggle = vi.fn();
    render(<Earlier count={2} open={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
