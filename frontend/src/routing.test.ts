import { describe, it, expect, vi, afterEach } from 'vitest';
import middleware from '../middleware';
import { backendTarget, PRODUCTION_BACKEND } from '../routing/backend';

const request = 'https://preview.example/api/v1/bob/ask?stream=1';
describe('deployment API isolation', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('preserves the production destination', () => {
    expect(backendTarget(request, { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' }).origin).toBe(PRODUCTION_BACKEND);
  });
  it.each(['preview', 'development', undefined])('fails closed without staging config (%s)', (environment) => {
    expect(() => backendTarget(request, { VERCEL_ENV: environment })).toThrow();
  });
  it.each([PRODUCTION_BACKEND, PRODUCTION_BACKEND + ':443', 'https://user:secret@stage.example',
    'http://stage.example', 'https://stage.example?token=secret', 'https://stage.example/api'])
  ('rejects unsafe preview origins', (origin) => {
    expect(() => backendTarget(request, { STAGING_API_BACKEND_ORIGIN: origin })).toThrow();
  });
  it('rejects a configured production alias too', () => {
    expect(() => backendTarget(request, { API_BACKEND_ORIGIN: 'https://prod.example',
      STAGING_API_BACKEND_ORIGIN: 'https://prod.example' })).toThrow();
  });
  it('preserves API path and query for the staging proxy', () => {
    expect(backendTarget(request, { STAGING_API_BACKEND_ORIGIN: 'https://stage.example' }).href)
      .toBe('https://stage.example/api/v1/bob/ask?stream=1');
  });
  it('keeps an integration deployment isolated even in a production-labelled project', () => {
    expect(() => backendTarget(request, { VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: 'integration/bob-v1' })).toThrow();
  });
  it('rewrites the streaming request without reading its body', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('STAGING_API_BACKEND_ORIGIN', 'https://stage.example');
    const input = new Request(request, { method: 'POST', body: JSON.stringify({question: 'fixture'}) });
    const response = middleware(input);
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://stage.example/api/v1/bob/ask?stream=1');
    expect(input.bodyUsed).toBe(false);
  });
  it('returns a closed, uncached response for missing configuration', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('STAGING_API_BACKEND_ORIGIN', '');
    const response = middleware(new Request(request));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
