/**
 * George's mark: the drawing, and what each loop state does to it.
 *
 * Kept apart from ReactiveMark.tsx so the suite can test the state mapping
 * without a DOM — the same reason pinShape.ts is separate from the components
 * that draw with it — and so a component file exports only components.
 *
 * THE MARK is a plum blossom (ume) in the spirit of a carved seal: ONE closed
 * path whose stamens are KNOCKED OUT as true negative space, under
 * fill-rule="evenodd". The holes therefore show whatever sits behind the mark
 * — cream on the page, navy on the avatar chip. Painting them a colour would
 * have looked correct on cream and wrong on the chip, which is the case that
 * matters most. Two consequences follow, and both shaped the drawing:
 *
 *   - No two holes may overlap. An even overlap count fills back in, so each
 *     stamen is a single tapered capsule rather than a line plus a dot, and
 *     the stamens stop clear of the hub instead of running into it.
 *   - The silhouette is the union of five overlapping circles, emitted as five
 *     arcs meeting where adjacent petals cross. (They must overlap: pushed far
 *     enough apart the circles stop intersecting and the outline collapses.)
 *
 * IT IS DELIBERATELY IMPERFECT. Petals differ by a few percent in size and a
 * couple of degrees in placement, stamens vary in length and angle, the hub
 * sits slightly off centre, and the whole stamp is tilted 1.4 degrees. It
 * should read as cut by hand. That removes the exact five-fold symmetry, so
 * there is no angle at which a rotation loops seamlessly — which is why the
 * motion states sway rather than spin.
 *
 * Clearances were measured, not eyeballed, at the smallest size the mark is
 * drawn at (40px): 1.74px between neighbouring stamens where they crowd at the
 * hub, 2.28px between the dots, and 3.26 units from the outermost dot to the
 * silhouette edge. An earlier tuning left 1.39px at the hub and the centre
 * greyed into a blur; these are the numbers that survive.
 *
 * COLOUR. This mark is the single exemption to UI rule 5 — see the recorded
 * amendment in CLAUDE.md. It is static brand presence and asks for nothing.
 * The ERROR state must never add or intensify orange: it dims, and one petal
 * gaps.
 */
import type { GeorgeState } from '../../types/george';
import { actLine } from './cognition';

/** The mark at rest. */
export const MARK_PATH = 'M 31.81 25.07 A 18.2 18.2 0 1 1 68 25.99 A 18.9 18.9 0 1 1 80.38 61.68 A 18 18 0 1 1 49.86 80.72 A 19.1 19.1 0 1 1 18.25 59.28 A 18.4 18.4 0 1 1 31.81 25.07 Z M 41.4 49.4 a 9.4 9.4 0 1 0 18.8 0 a 9.4 9.4 0 1 0 -18.8 0 Z M 51.72 38.41 L 53.91 28.09 A 3.3 3.3 0 1 0 47.46 28.12 L 49.77 38.42 A 1 1 0 0 0 51.72 38.41 Z M 58.44 41.43 L 65.84 35.33 A 3 3 0 1 0 61.26 31.65 L 56.91 40.21 A 1 1 0 0 0 58.44 41.43 Z M 61.58 47.07 L 72.48 46.13 A 3.4 3.4 0 1 0 70.5 39.78 L 61 45.2 A 1 1 0 0 0 61.58 47.07 Z M 60.7 54.29 L 69.16 59.78 A 3.1 3.1 0 1 0 71.35 54.12 L 61.41 52.46 A 1 1 0 0 0 60.7 54.29 Z M 56.43 58.87 L 60.62 68.84 A 3.5 3.5 0 1 0 66.15 64.85 L 58.01 57.73 A 1 1 0 0 0 56.43 58.87 Z M 49.44 60.35 L 47.16 69.46 A 3 3 0 1 0 53.03 69.67 L 51.39 60.42 A 1 1 0 0 0 49.44 60.35 Z M 43.56 57.73 L 35.57 64.93 A 3.3 3.3 0 1 0 40.8 68.72 L 45.15 58.88 A 1 1 0 0 0 43.56 57.73 Z M 39.94 51.41 L 28.88 52.26 A 3.2 3.2 0 1 0 30.57 58.31 L 40.46 53.3 A 1 1 0 0 0 39.94 51.41 Z M 40.73 44.9 L 32.26 39.81 A 3.1 3.1 0 1 0 30.28 45.54 L 40.09 46.75 A 1 1 0 0 0 40.73 44.9 Z M 45.61 39.68 L 42.06 29.99 A 3.4 3.4 0 1 0 36.51 33.62 L 43.98 40.75 A 1 1 0 0 0 45.61 39.68 Z';

/**
 * The mark with the top petal severed from the body by a knocked-out slot.
 *
 * Sliding a petal outward is not available: the petal circles overlap the body
 * deeply, so a displaced petal would still overlap it and cancel to a hole
 * under evenodd. The slot is an annular band sitting between the stamen tips
 * and the notch radius, overrunning the outline at both ends so the cut
 * reaches open ground. It is 3.8 units wide — about 1.5px at 40px, where it
 * still reads as a gap rather than a nick.
 */
export const MARK_PATH_ERROR = 'M 31.81 25.07 A 18.2 18.2 0 1 1 68 25.99 A 18.9 18.9 0 1 1 80.38 61.68 A 18 18 0 1 1 49.86 80.72 A 19.1 19.1 0 1 1 18.25 59.28 A 18.4 18.4 0 1 1 31.81 25.07 Z M 41.4 49.4 a 9.4 9.4 0 1 0 18.8 0 a 9.4 9.4 0 1 0 -18.8 0 Z M 51.72 38.41 L 53.91 28.09 A 3.3 3.3 0 1 0 47.46 28.12 L 49.77 38.42 A 1 1 0 0 0 51.72 38.41 Z M 58.44 41.43 L 65.84 35.33 A 3 3 0 1 0 61.26 31.65 L 56.91 40.21 A 1 1 0 0 0 58.44 41.43 Z M 61.58 47.07 L 72.48 46.13 A 3.4 3.4 0 1 0 70.5 39.78 L 61 45.2 A 1 1 0 0 0 61.58 47.07 Z M 60.7 54.29 L 69.16 59.78 A 3.1 3.1 0 1 0 71.35 54.12 L 61.41 52.46 A 1 1 0 0 0 60.7 54.29 Z M 56.43 58.87 L 60.62 68.84 A 3.5 3.5 0 1 0 66.15 64.85 L 58.01 57.73 A 1 1 0 0 0 56.43 58.87 Z M 49.44 60.35 L 47.16 69.46 A 3 3 0 1 0 53.03 69.67 L 51.39 60.42 A 1 1 0 0 0 49.44 60.35 Z M 43.56 57.73 L 35.57 64.93 A 3.3 3.3 0 1 0 40.8 68.72 L 45.15 58.88 A 1 1 0 0 0 43.56 57.73 Z M 39.94 51.41 L 28.88 52.26 A 3.2 3.2 0 1 0 30.57 58.31 L 40.46 53.3 A 1 1 0 0 0 39.94 51.41 Z M 40.73 44.9 L 32.26 39.81 A 3.1 3.1 0 1 0 30.28 45.54 L 40.09 46.75 A 1 1 0 0 0 40.73 44.9 Z M 45.61 39.68 L 42.06 29.99 A 3.4 3.4 0 1 0 36.51 33.62 L 43.98 40.75 A 1 1 0 0 0 45.61 39.68 Z M 26.62 26.71 A 33 33 0 0 1 73.68 27.01 L 70.95 29.66 A 29.2 29.2 0 0 0 29.31 29.39 Z';

export const MARK_LABEL: Record<GeorgeState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  running: 'Reading the data',
  answering: 'Answering',
  error: 'Something went wrong',
};

/**
 * The animation class for a state. Each is defined in index.css, and each one
 * collapses to an opacity change under prefers-reduced-motion.
 */
export function markClass(state: GeorgeState): string {
  return `george-mark george-mark--${state}`;
}

/** Only the error state changes the drawing itself. */
export function markPath(state: GeorgeState): string {
  return state === 'error' ? MARK_PATH_ERROR : MARK_PATH;
}

/**
 * The line under the mark: what George is doing, in words.
 *
 * Named from the TOOL wherever there is one, because that is the thing that is
 * actually true — a tool_call frame arrived, so that tool is running. The
 * state's own label is the fallback, for the states where no tool is involved
 * and for the moment between deciding to call one and the frame arriving.
 *
 * Here rather than in the component so the suite can hold it to that, and
 * because this file already owns what each state says.
 */
export function markDetail(state: GeorgeState, running: string[] = []): string {
  return state === 'running' && running.length > 0
    ? actLine(running)
    : MARK_LABEL[state];
}
