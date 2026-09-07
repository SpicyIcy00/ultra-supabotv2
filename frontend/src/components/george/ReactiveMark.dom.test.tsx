/**
 * The mark, as rendered.
 *
 * markState.test.ts holds the mapping and checks that index.css answers every
 * state. This checks the other half: that the component actually PUTS the
 * state on the element, so a state that exists in the model and never reaches
 * the DOM cannot pass both suites.
 *
 * REDUCED MOTION is a CSS media query, and jsdom evaluates no stylesheets, so
 * it cannot be asserted here without asserting a stub. It is held in
 * markState.test.ts instead, which reads index.css and fails if a state that
 * would otherwise loop has no answer inside the reduced-motion block. That is
 * the real guarantee; a jsdom assertion would only look like one.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GeorgeState } from '../../types/george';
import { ReactiveMark } from './ReactiveMark';
import { MARK_LABEL, MARK_PATH, MARK_PATH_ERROR, markDetail } from './markState';

afterEach(cleanup);

const STATES: GeorgeState[] = [
  'idle', 'listening', 'thinking', 'running', 'answering', 'building', 'complete', 'error',
];

function markOf(state: GeorgeState, extra: Record<string, unknown> = {}) {
  const { container } = render(<ReactiveMark variant="mark" state={state} {...extra} />);
  return container.querySelector('svg') as SVGElement;
}

describe('the mark carries its state to the DOM', () => {
  it('puts every state on the drawing as its own class', () => {
    for (const state of STATES) {
      const g = markOf(state).querySelector(`.george-mark--${state}`);
      expect(g, `state ${state} never reaches the DOM`).toBeTruthy();
      cleanup();
    }
  });

  it('keeps the base class in every state, so the transform origin applies', () => {
    for (const state of STATES) {
      expect(markOf(state).querySelector('.george-mark')).toBeTruthy();
      cleanup();
    }
  });

  it('names the state in the accessible name, since the words are off screen', () => {
    render(<ReactiveMark variant="mark" state="running" running={['get_sales']} />);
    // The words come from markState, so this asserts they REACH the name
    // rather than restating them and drifting from the one vocabulary.
    const detail = markDetail('running', ['get_sales']);
    expect(detail).toContain('reading sales');
    expect(screen.getByRole('img', { name: `George — ${detail}` })).toBeTruthy();
  });

  it('says only "George" at rest — a caption on a photograph is not a state', () => {
    render(<ReactiveMark variant="mark" state="idle" />);
    expect(screen.getByRole('img', { name: 'George' })).toBeTruthy();
  });

  it('gives building and complete a label of their own', () => {
    for (const state of ['building', 'complete'] as GeorgeState[]) {
      render(<ReactiveMark variant="mark" state={state} />);
      expect(screen.getByRole('img', { name: `George — ${MARK_LABEL[state]}` })).toBeTruthy();
      cleanup();
    }
  });
});

describe('UI rule 5 — the error state changes the drawing, never the hue', () => {
  it('gaps a petal rather than reddening or brightening', () => {
    expect(markOf('error').querySelector('path')?.getAttribute('d')).toBe(MARK_PATH_ERROR);
    expect(markOf('thinking').querySelector('path')?.getAttribute('d')).toBe(MARK_PATH);
  });

  it('adds no second colour class in any state', () => {
    // The accent is the mark's bounded exemption. A state that added another
    // colour would be the mark learning to shout, which is what the amendment
    // in CLAUDE.md forbids.
    for (const state of STATES) {
      const svg = markOf(state);
      expect(svg.getAttribute('class')).toContain('text-george-accent');
      expect(svg.getAttribute('class')).not.toMatch(/text-red|text-amber|text-orange/);
      cleanup();
    }
  });
});

describe('the beat on a landing result', () => {
  it('does not pulse before anything has come back', () => {
    expect(markOf('thinking', { toolResults: 0 }).querySelector('.george-mark-pulse')).toBeNull();
  });

  it('pulses once a result has landed', () => {
    expect(markOf('running', { toolResults: 2 }).querySelector('.george-mark-pulse')).toBeTruthy();
  });
});
