/**
 * The test runner.
 *
 * Separate from vite.config.ts so a test run does not pull in the PWA plugin
 * and the React refresh transform, neither of which a suite of pure functions
 * needs. Environment is `node`: what is under test is the decision to draw a
 * chart, not the drawing, so there is no DOM to stand up.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
