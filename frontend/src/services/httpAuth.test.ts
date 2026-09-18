import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { authenticatedFetch, createAuthenticatedClient, installAuthInterceptors } from './httpAuth';
import { useAuthStore } from '../stores/authStore';

const user = { id: 'a', username: 'a', role: 'admin', allowed_pages: ['bob'] };
const login = (token = 'test-a') => useAuthStore.getState().setSession(token, { ...user, id: token });
beforeEach(() => login());
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout(); });

describe('shared authenticated transports', () => {
  it('authenticates both global axios and factory clients, preserving params', async () => {
    installAuthInterceptors();
    installAuthInterceptors();
    const adapter: AxiosAdapter = async (config) => {
      expect(config.headers.get('Authorization')).toBe('Bearer test-a');
      expect(config.params).toEqual({ store: ['a', 'b'] });
      return { config, status: 200, statusText: 'OK', headers: {}, data: [] };
    };
    await axios.get('/api/v1/bob/pins', { adapter, params: { store: ['a', 'b'] } });
    await createAuthenticatedClient({ baseURL: '/api/v1', adapter }).get('/bob/pins', { params: { store: ['a', 'b'] } });
  });

  it('does not send the session token to another origin', async () => {
    const client = createAuthenticatedClient({ adapter: async (config) => {
      expect(config.headers.get('Authorization')).toBeUndefined();
      return { config, status: 200, statusText: 'OK', headers: {}, data: [] };
    } });
    await client.get('https://example.com/api/v1/data');
    await expect(authenticatedFetch('https://example.com/api/v1/data')).rejects.toThrow('same-origin');
  });

  it('adds fetch authentication without losing body, signal, or content type', async () => {
    const stub = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', stub);
    const signal = new AbortController().signal;
    await authenticatedFetch('/api/v1/chatbot/query/stream', {
      method: 'POST', body: '{}', signal, headers: { 'Content-Type': 'application/json' },
    });
    const options = stub.mock.calls[0][1];
    expect(options.headers.get('Authorization')).toBe('Bearer test-a');
    expect(options.headers.get('Content-Type')).toBe('application/json');
    expect(options).toMatchObject({ method: 'POST', body: '{}', signal, cache: 'no-store' });
  });

  it.each([401, 403])('handles fetch %s without redirecting', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    await authenticatedFetch('/api/v1/bob/river');
    expect(useAuthStore.getState().token).toBe(status === 401 ? null : 'test-a');
  });

  it.each([200, 401])('rejects a late fetch %s from a previous session', async (status) => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const pending = authenticatedFetch('/api/v1/bob/river');
    login('test-b');
    finish(new Response('{}', { status }));
    await expect(pending).rejects.toThrow('Session changed');
    expect(useAuthStore.getState().token).toBe('test-b');
  });

  it.each([200, 401, 403])('handles axios %s and ignores previous-session responses', async (status) => {
    let finish!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const client = createAuthenticatedClient({ baseURL: '/api/v1', adapter: (config: InternalAxiosRequestConfig) => new Promise((resolve, reject) => {
      finish = () => {
        const response = { config, status, statusText: '', headers: {}, data: 'private' };
        if (status >= 400) reject(new axios.AxiosError('HTTP error', undefined, config, undefined, response));
        else resolve(response);
      };
      started();
    }) });
    const pending = client.get('/bob/river');
    await ready;
    login('test-b');
    finish();
    await expect(pending).rejects.toThrow('Session changed');
    expect(useAuthStore.getState().token).toBe('test-b');
  });

  it.each([401, 403])('handles current-session axios %s', async (status) => {
    const client = createAuthenticatedClient({ baseURL: '/api/v1', adapter: async (config) => {
      throw new axios.AxiosError('HTTP error', undefined, config, undefined, { config, status, statusText: '', headers: {}, data: '' });
    } });
    await expect(client.get('/bob/river')).rejects.toThrow('HTTP error');
    expect(useAuthStore.getState().token).toBe(status === 401 ? null : 'test-a');
  });
});
