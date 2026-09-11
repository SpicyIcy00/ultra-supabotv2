// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, restoreTheme } from './theme';

describe('the room remembers dark or light', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-room-theme');
  });

  it('is dark by default — the design, not the system', () => {
    expect(restoreTheme()).toBe('dark');
  });

  it('keeps the choice on <html>, where both rooms can see it', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-room-theme')).toBe('light');
    expect(restoreTheme()).toBe('light');
    applyTheme('dark');
    expect(restoreTheme()).toBe('dark');
  });

  it('treats anything that is not light as dark', () => {
    localStorage.setItem('room-theme', 'sepia');
    expect(restoreTheme()).toBe('dark');
  });
});
