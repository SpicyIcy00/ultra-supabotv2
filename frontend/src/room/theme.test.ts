// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, restoreTheme } from './theme';

describe('the room remembers dark or light', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-room-theme');
  });

  it('is dark when nobody chose and the system cannot say — the design', () => {
    expect(restoreTheme()).toBe('dark');
  });

  it("follows the system's light when nobody chose, as the design's three themes do", () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('light') })) as unknown as typeof window.matchMedia;
    try {
      expect(restoreTheme()).toBe('light');
      // A choice wins over the system either way.
      applyTheme('dark');
      expect(restoreTheme()).toBe('dark');
    } finally {
      window.matchMedia = was;
    }
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
