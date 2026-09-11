/**
 * DARK OR LIGHT.
 *
 * Dark is the design — the ground is near-black and every object is lit from
 * inside by its own colour, which is what the owner pointed at and what the
 * plan said from the start. Light is derived from it and kept complete, so
 * the toggle is a toggle and not a downgrade.
 *
 * The choice lives on <html> as `data-room-theme`, not on the .room element,
 * for one reason: the room is mounted by two routes (the board and the
 * other rooms), and a theme that lived inside either would be forgotten on
 * the way to the other. It is the person's, so it persists per browser and
 * is never sent anywhere — exactly like an arrangement.
 */
import { useCallback, useEffect, useState } from 'react';

export type RoomTheme = 'dark' | 'light';

const KEY = 'room-theme';
const ATTR = 'data-room-theme';

/** What was chosen before, or the design's own default. */
export function restoreTheme(): RoomTheme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: RoomTheme) {
  document.documentElement.setAttribute(ATTR, theme);
  try { localStorage.setItem(KEY, theme); } catch { /* a private window still gets the theme, for now */ }
}

export function useRoomTheme(): [RoomTheme, () => void] {
  const [theme, setTheme] = useState<RoomTheme>(restoreTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return [theme, toggle];
}
