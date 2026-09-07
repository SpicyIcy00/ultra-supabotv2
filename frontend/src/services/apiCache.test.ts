import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('removes the old shared API cache when the new worker activates', async () => {
  let activate!: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void;
  const remove = vi.fn().mockResolvedValue(true);
  runInNewContext(readFileSync('public/clear-api-cache.js', 'utf8'), {
    self: { addEventListener: (event: string, fn: typeof activate) => {
      expect(event).toBe('activate'); activate = fn;
    } }, caches: { delete: remove },
  });
  let done!: Promise<unknown>;
  activate({ waitUntil: (promise) => { done = promise; } });
  await done;
  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith('api-cache');
});

it('API routes have no service-worker cache fallback', () => {
  const config = readFileSync('vite.config.ts', 'utf8');
  expect(config).toContain("handler: 'NetworkOnly'");
  expect(config).not.toMatch(/handler: '(NetworkFirst|CacheFirst|StaleWhileRevalidate)'/);
  expect(config).toContain("importScripts: ['/clear-api-cache.js']");
  expect(config).toContain('clientsClaim: true');
  expect(config).toContain('skipWaiting: true');
});
