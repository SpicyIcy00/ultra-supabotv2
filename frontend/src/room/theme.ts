/**
 * DARK OR LIGHT — THREE THEMES, THE DESIGN'S STRUCTURE (P2S.1(a)).
 *
 * The design (`ops/ideal/bob-ahead-of-me.html`) is dark-native: a graphite
 * ground. Its light theme is the same set on paper, not an inversion, and it
 * is reached two ways — the system asking for light when nobody chose, or a
 * person choosing it. A person's choice wins either way. room.css declares all
 * three; this file decides which attribute, if any, sits on <html>.
 *
 * The choice lives on <html> as `data-room-theme`, not on the .room element:
 * the room is mounted by two routes (the board and the other rooms), and a
 * theme that lived inside either would be forgotten on the way to the other.
 * It is the person's, so it persists per browser and is never sent anywhere.
 *
 * NOTHING IS STORED UNTIL SOMEBODY PRESSES THE SWITCH. Storing the system's
 * answer on first paint would freeze it, and a machine that goes light at
 * sunrise would stay dark forever after one visit.
 */
import { useCallback, useEffect, useState } from 'react';

export type RoomTheme = 'dark' | 'light';

const KEY = 'room-theme';
const ATTR = 'data-room-theme';

/** What the person chose before, or null when they never chose. */
export function chosenTheme(): RoomTheme | null {
  try {
    const got = localStorage.getItem(KEY);
    return got === 'light' || got === 'dark' ? got : null;
  } catch {
    return null;
  }
}

/** What the system asks for. Dark where it cannot say — the design's own. */
export function systemTheme(): RoomTheme {
  try {
    return typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** The theme on screen: the person's choice, else the system's, else dark. */
export function restoreTheme(): RoomTheme {
  return chosenTheme() ?? systemTheme();
}

/** A person's choice: drawn and remembered. */
export function applyTheme(theme: RoomTheme) {
  document.documentElement.setAttribute(ATTR, theme);
  try { localStorage.setItem(KEY, theme); } catch { /* a private window still gets the theme, for now */ }
}

export function useRoomTheme(): [RoomTheme, () => void] {
  const [theme, setTheme] = useState<RoomTheme>(restoreTheme);
  const [chose, setChose] = useState(() => chosenTheme() !== null);
  useEffect(() => {
    if (chose) applyTheme(theme);
  }, [theme, chose]);
  const toggle = useCallback(() => {
    setChose(true);
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);
  return [theme, toggle];
}
