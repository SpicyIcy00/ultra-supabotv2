import { rewrite } from '@vercel/functions';
import { backendTarget } from './routing/backend';

export const config = { matcher: '/api/v1/:path*' };

export default function middleware(request: Request) {
  try {
    // Vercel proxies the original method, body and streaming response.
    // No fetch/buffering layer and no browser-visible backend origin.
    return rewrite(backendTarget(request.url, process.env));
  } catch {
    return new Response('API backend unavailable: deployment configuration required', {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
