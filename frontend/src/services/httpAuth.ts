import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios';
import { useAuthStore } from '../stores/authStore';

const installed = new WeakSet<object>();
type Session = { token: string | null; sessionRevision: number };
const requests = new WeakMap<object, Session>();

function session(): Session {
  const { token, sessionRevision } = useAuthStore.getState();
  return { token, sessionRevision };
}

function assertCurrent(sent: Session): void {
  const current = session();
  if (sent.token !== current.token || sent.sessionRevision !== current.sessionRevision) {
    throw new axios.CanceledError('Session changed while the request was running');
  }
}

function handleStatus(status: number | undefined, sent: Session): void {
  assertCurrent(sent);
  if (status === 401 && sent.token) useAuthStore.getState().logout();
}

/** Credentials are only sent to our same-origin API, never arbitrary URLs. */
function isApi(url: string): boolean {
  const origin = globalThis.location?.origin ?? 'http://localhost';
  const target = new URL(url, origin);
  return target.origin === origin && /^\/api\/v1(?:\/|$)/.test(target.pathname);
}

function install(target: AxiosInstance): void {
  if (installed.has(target)) return;
  installed.add(target);
  target.interceptors.request.use((config) => {
    if (!isApi(target.getUri(config))) return config;
    const sent = session();
    requests.set(config, sent);
    if (sent.token) config.headers.set('Authorization', `Bearer ${sent.token}`);
    else config.headers.delete('Authorization');
    return config;
  });
  target.interceptors.response.use(
    (response) => {
      const sent = requests.get(response.config);
      if (sent) handleStatus(response.status, sent);
      return response;
    },
    (error) => {
      const sent = error.config && requests.get(error.config);
      if (sent) handleStatus(error.response?.status, sent);
      return Promise.reject(error);
    },
  );
}

/** Also covers existing feature clients that use global axios. */
export function installAuthInterceptors(): void {
  install(axios);
}

export function createAuthenticatedClient(config: CreateAxiosDefaults): AxiosInstance {
  const client = axios.create(config);
  install(client);
  return client;
}

/** Shared fetch transport, including POST SSE via fetch-event-source. */
export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  if (!isApi(url)) throw new Error('Authenticated fetch requires a same-origin API URL');
  const sent = session();
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (sent.token) headers.set('Authorization', `Bearer ${sent.token}`);
  else headers.delete('Authorization');
  const response = await fetch(input, { ...init, headers, cache: 'no-store' });
  handleStatus(response.status, sent);
  return response;
}
