# Environment Variables Setup for Vercel

## ⚠️ IMPORTANT: Proxy Architecture in Use

**The frontend now uses a PROXY to eliminate CORS issues.**

You should **NOT** set `VITE_API_BASE_URL` or `VITE_API_URL` in Vercel environment variables anymore, as this would bypass the proxy and cause CORS errors.

## How It Works

1. **Frontend code** uses relative paths (`/api/v1`)
2. **Vite dev server** proxies to `localhost:8000` (configured in `vite.config.ts`)
3. **Vercel production** rewrites `/api/v1` to Railway backend (configured in `vercel.json`)

This means:
- Browser makes same-origin requests to Vercel
- Vercel forwards them server-side to Railway
- No CORS issues!

## If You Have Existing Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Click on "Settings"
3. Click on "Environment Variables"
4. **DELETE** these variables if they exist:
   - `VITE_API_BASE_URL`
   - `VITE_API_URL`
5. Redeploy your application

## Other Environment Variables

You may still need to set other environment variables in Vercel:
- `VITE_ANTHROPIC_API_KEY` (if using AI features)
- `VITE_GOOGLE_SHEETS_URL` (if using Google Sheets integration)

## Local Development

For local development, you don't need to set `VITE_API_BASE_URL`. The proxy in `vite.config.ts` handles it automatically.

If you want to test against the live Railway backend locally, you can temporarily modify `vite.config.ts` proxy target.

