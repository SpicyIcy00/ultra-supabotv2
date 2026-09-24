/**
 * THE LAST SCREEN OUTSIDE THE ROOM, held to UI rule 8 (W4.5).
 *
 * `/settings` decided what to draw from `stores.length === 0` and drew a
 * spinner: a failed read and an empty list were the same rendering, and it
 * never stopped spinning because the store swallowed the error. Three
 * renderings now, and a failed one keeps the server's sentence.
 */
import { describe, expect, it } from 'vitest';
import { storesReading } from './settingsReading';
import { serverSaid } from '../services/serverSaid';

describe('loading, failed and loaded-empty are three things', () => {
  it('says it is reading before anything has come back', () => {
    for (const read of ['idle', 'loading'] as const) {
      const view = storesReading(read, 0, null);
      expect(view.kind).toBe('loading');
      expect(view.heading).not.toContain('No stores');
      expect(view.detail).toBeUndefined();
    }
  });

  it('a failed read says so, and never spins', () => {
    const view = storesReading('failed', 0, 'Only an administrator may read the stores.');
    expect(view.kind).toBe('failed');
    expect(view.heading).toBe('The stores could not be read.');
    // The server's own words, not "Failed to fetch stores".
    expect(view.detail).toBe('Only an administrator may read the stores.');
  });

  it('a loaded, empty list is its own claim', () => {
    const view = storesReading('loaded', 0, null);
    expect(view.kind).toBe('empty');
    expect(view.heading).toBe('No stores are set up yet.');
  });

  it('rows on hand are drawn while a read is in flight', () => {
    expect(storesReading('loading', 12, null).kind).toBe('rows');
    expect(storesReading('failed', 12, 'down').kind).toBe('rows');
  });
});

describe('what the server said', () => {
  const res = (body: unknown, status = 400, statusText = 'Bad Request') =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body),
                 { status, statusText });

  it('keeps FastAPI’s detail verbatim', async () => {
    expect(await serverSaid(res({ detail: 'That store is already gone.' })))
      .toBe('That store is already gone.');
  });

  it('falls back to the status line, never to an invented sentence', async () => {
    expect(await serverSaid(res('', 503, 'Service Unavailable')))
      .toBe('503 Service Unavailable');
  });

  it('keeps a body that is not JSON', async () => {
    expect(await serverSaid(res('upstream timed out', 504, 'Gateway Timeout')))
      .toBe('upstream timed out');
  });
});
