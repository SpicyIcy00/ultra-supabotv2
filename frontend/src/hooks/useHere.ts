/**
 * A PAGE SAYS WHAT IT IS AND WHAT IT SHOWS (W1.4).
 *
 * A page calls `useRegisterHere` with its account of itself — a kept page its
 * identity, a BI page its key, tab, subjects and window, never a figure — and
 * the one line above both chromes reads it with `useHere`. Registered against
 * the path it was made on, so a page that has just been left can never speak
 * for the one after it; a page that registers nothing is named from its path.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { create } from 'zustand';
import { hereForPath, type Here } from '../components/bob/here';

interface HereState {
  path: string | null;
  here: Here | null;
  put(path: string, here: Here): void;
  drop(path: string): void;
}

export const useHereStore = create<HereState>((set, get) => ({
  path: null,
  here: null,
  put: (path, here) => {
    const was = get();
    if (was.path === path && JSON.stringify(was.here) === JSON.stringify(here)) return;
    set({ path, here });
  },
  drop: (path) => {
    if (get().path === path) set({ path: null, here: null });
  },
}));

/** Register this page. `null` registers nothing (the path names it). */
export function useRegisterHere(here: Here | null): void {
  const { pathname } = useLocation();
  const put = useHereStore((s) => s.put);
  const drop = useHereStore((s) => s.drop);
  const said = here ? JSON.stringify(here) : null;
  useEffect(() => {
    if (!said) return;
    put(pathname, JSON.parse(said) as Here);
    return () => drop(pathname);
  }, [said, pathname, put, drop]);
}

/** Where the person is standing: what this page registered, or its path's name. */
export function useHere(): Here {
  const { pathname } = useLocation();
  const path = useHereStore((s) => s.path);
  const here = useHereStore((s) => s.here);
  return path === pathname && here ? here : hereForPath(pathname);
}
