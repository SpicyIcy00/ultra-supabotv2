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
    /*
     * A TEST THAT LOSES A RACE FOR THE MACHINE IS NOT A FAILING PRODUCT
     * (the lead, 2026-09-23). Several dom tests `await import('./Room')` or
     * wait on a lazily-loaded panel. Alone each passes in well under a second;
     * in the full suite, with every worker compiling at once, that first import
     * has repeatedly gone past the 5s default — a different file each run
     * (askBar on 2026-09-22, trackBack today), which is the signature of load,
     * not of a regression. A suite whose green is a coin flip is worse than a
     * slow one: the number stops meaning anything and a real break hides in it.
     * 20s is the wait; nothing else about these tests changes, and a test that
     * genuinely hangs still fails, just later.
     */
    testTimeout: 20_000,
  },
});
