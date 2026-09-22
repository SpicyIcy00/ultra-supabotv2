/**
 * THE MORNING'S LINE (W2.1). Drawn only on the morning's own page; says it
 * was shown again with when it was read (UI rule 6); offers the switch only
 * from a LOADED morning that is off (UI rule 8); never wears the accent.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MorningLine, reusedWords } from './MorningLine';
import type { Morning } from '../services/standingApi';

const reused = {
  thread_id: 'm-1', question: 'How are we doing?', answered_at: '2026-09-22T00:02:00Z',
  read_at: '2026-09-22T00:01:00Z', checked_at: null,
};
const off: Morning = {
  standing_question_id: 's-1', question: 'How are we doing?', when: 'every day at 08:00',
  enabled: false,
  today: { thread_id: 'm-1', question: 'How are we doing?', answered_at: null,
           standing_question_id: 's-1', morning: true, read_at: null },
};

afterEach(cleanup);

describe('the morning line', () => {
  it('says it was shown again, with when it was answered and read, in Manila', () => {
    const words = reusedWords(reused, new Date('2026-09-22T02:00:00Z'));
    expect(words).toContain('asked already today');
    expect(words).toContain('08:02');
    expect(words).toContain('read 08:01');
    expect(words).toContain('nothing has landed since');
  });

  it('draws nothing on any other page', () => {
    const { container } = render(
      <MorningLine threadId="other" reused={reused} morning={off} onSwitch={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('offers the switch only from a loaded morning that is off', () => {
    const onSwitch = vi.fn();
    const { rerender, container } = render(
      <MorningLine threadId="m-1" reused={null} morning={undefined} onSwitch={onSwitch} />);
    expect(container.textContent).toBe('');   // not loaded: nothing claimed
    rerender(<MorningLine threadId="m-1" reused={null} morning={{ ...off, enabled: true }}
                          onSwitch={onSwitch} />);
    expect(container.textContent).toBe('');   // on: nothing to say
    rerender(<MorningLine threadId="m-1" reused={null} morning={off} onSwitch={onSwitch} />);
    expect(screen.getByText(/switched off/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'switch it on' }));
    expect(onSwitch).toHaveBeenCalledWith(true);
  });

  it('never wears the accent', () => {
    const { container } = render(
      <MorningLine threadId="m-1" reused={reused} morning={off} onSwitch={() => {}} />);
    expect(container.innerHTML).not.toMatch(/accent|needs-you/);
  });
});
