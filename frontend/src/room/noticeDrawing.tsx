/**
 * WHICH NOTICES ARE DRAWN — CLAUDE.md UI rule 4, as changed 2026-09-17.
 *
 * The owner, of the caveat boxes over his charts: *"we dont need those
 * disclaimers unless it has wrong data"*. A notice that says a figure may be
 * wrong is drawn above it; one that only explains how the figure was measured
 * is not. The split is the definitions' (`surface.desk.notices`), served with
 * the desk and handed down by `Room` — this file keeps no list of its own.
 *
 * FAIL TOWARD SHOWING. Only a kind the definitions name as `explains_only` is
 * held back; before they load, or for a kind they do not name, everything is
 * drawn. A notice hidden because nobody decided is the one outcome ruled out.
 *
 * Bob still receives every notice; this is the screen, nothing more.
 */
import { createContext, useContext } from 'react';
import type { BobNotice } from '../types/bob';

export const ExplainsOnlyContext = createContext<ReadonlySet<string>>(new Set());

/** The served `explains_only` kinds as a set; empty (draw everything) when absent. */
export function explainsOnlyFrom(defs: { notices?: { explains_only?: string[] } } | null | undefined): ReadonlySet<string> {
  return new Set((defs?.notices?.explains_only ?? []).map(String));
}

/** The notices a person is shown: every one that is not only an explanation. */
export function drawnOnly(notices: BobNotice[] | undefined, explains: ReadonlySet<string>): BobNotice[] {
  return (notices ?? []).filter((n) => !explains.has(String(n.kind)));
}

export function useDrawnOnly(notices: BobNotice[] | undefined): BobNotice[] {
  return drawnOnly(notices, useContext(ExplainsOnlyContext));
}
