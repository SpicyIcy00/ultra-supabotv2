// Server-side only. A preview must never inherit production's default.
export const PRODUCTION_BACKEND = 'https://ultra-supabotv2-production.up.railway.app';

export function backendTarget(requestUrl: string, env: Record<string, string | undefined>): URL {
  // A staging project can call its own default deployment 'production'.
  // Only main may use the production default; integration always fails closed.
  const production = env.VERCEL_ENV === 'production' && env.VERCEL_GIT_COMMIT_REF === 'main'
    && env.API_DEPLOYMENT_ENV !== 'staging';
  const configuredProduction = env.API_BACKEND_ORIGIN || PRODUCTION_BACKEND;
  const raw = production ? configuredProduction : env.STAGING_API_BACKEND_ORIGIN;
  if (!raw) throw new Error('API backend is not configured');
  const target = new URL(raw);
  if (target.protocol !== 'https:' || target.username || target.password ||
      target.pathname !== '/' || target.search || target.hash) {
    throw new Error('API backend must be an HTTPS origin without credentials');
  }
  if (!production && [new URL(configuredProduction).hostname, new URL(PRODUCTION_BACKEND).hostname]
      .map(host => host.replace(/\.$/, '').toLowerCase())
      .includes(target.hostname.replace(/\.$/, '').toLowerCase())) {
    throw new Error('Preview cannot use the production backend');
  }
  const incoming = new URL(requestUrl);
  if (!incoming.pathname.startsWith('/api/v1/')) throw new Error('Not an API path');
  // Assign the path, never resolve it as a URL that could replace the origin.
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  return target;
}
