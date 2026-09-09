/**
 * The state model and its renderer are separate, and the separation is held.
 *
 * presence.ts decides WHAT state George is in and refuses to invent one.
 * PresenceMark.tsx decides how that state LOOKS, and is the one file to change
 * to give George another look. The shell and the pages reach the drawing only
 * through the seam, so a redesign of the mark touches nothing that knows what
 * the states are.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const GEORGE = join(__dirname);
const SHELL = join(__dirname, '..', 'shell');
const DESK = join(__dirname, '..', 'desk');
const read = (dir: string, name: string) =>
  readFileSync(join(dir, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the presence seam', () => {
  it('is the only way the shell reaches the drawing', () => {
    const shell = read(SHELL, 'GeorgeShell.tsx');
    expect(shell).toContain("from '../george/PresenceMark'");
    expect(shell).not.toMatch(/ReactiveMark/);
  });

  it('is the only way the workspace reaches the drawing', () => {
    const line = read(DESK, 'ShellLine.tsx');
    expect(line).toContain("from '../george/PresenceMark'");
    expect(line).not.toMatch(/ReactiveMark/);
  });

  it('is the one place the current look is chosen', () => {
    const mark = read(GEORGE, 'PresenceMark.tsx');
    expect(mark).toMatch(/PresenceRenderer/);
    expect(mark).toMatch(/ReactiveMark/);
  });

  it('hands a renderer the state and never lets it derive one', () => {
    // The contract has a `state` and the live facts a label is built from,
    // and nothing a renderer could use to decide a state of its own — no
    // stream, no composer activity, no turns.
    const seam = read(GEORGE, 'presenceRenderer.ts');
    const props = seam.split('export interface PresenceProps {')[1].split('}')[0];
    expect(props).toMatch(/state: GeorgeState/);
    for (const forbidden of ['turns', 'composer', 'stream', 'busy']) {
      expect(props).not.toContain(forbidden);
    }
  });

  it('leaves the state model untouched: presence.ts still refuses invented states', () => {
    const presence = read(GEORGE, 'presence.ts');
    expect(presence).toMatch(/export function presenceState/);
    expect(presence).not.toMatch(/'found'|'found_something'|'understanding'|'investigating'|'waiting'/);
  });
});
