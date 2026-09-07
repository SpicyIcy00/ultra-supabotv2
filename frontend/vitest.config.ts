/**
 * The test runner.
 *
 * Separate from vite.config.ts so a test run does not pull in the PWA plugin
 * and the React refresh transform, neither of which a suite of pure functions
 * needs.
 *
 * TWO ENVIRONMENTS, AND THE DEFAULT IS STILL `node`. Almost everything under
 * test here is a DECISION — whether to draw a chart, which figures share a
 * scope, what the mark is allowed to say — and those are pure functions with
 * no DOM to stand up. That is the convention every suite in this repo follows
 * and it is not changing.
 *
 * The exception is the result primitives. "A notice sits above the number" and
 * "a table stacks on a phone" are claims about RENDERED OUTPUT, and asserting
 * them against a data structure would be asserting the test's own model of the
 * component rather than the component. Those files are named `*.dom.test.tsx`
 * and get jsdom; nothing else pays for it.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.dom.test.tsx', 'jsdom']],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
