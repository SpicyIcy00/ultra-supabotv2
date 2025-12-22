# Environment Variables Setup for Vercel

## Required Environment Variable

Set this in your Vercel project settings:

```
VITE_API_BASE_URL=https://ultra-supabotv2-production.up.railway.app/api/v1
```

## How to Set in Vercel

1. Go to your Vercel project dashboard
2. Click on "Settings"
3. Click on "Environment Variables"
4. Add a new variable:
   - **Name**: `VITE_API_BASE_URL`
   - **Value**: `https://ultra-supabotv2-production.up.railway.app/api/v1`
   - **Environments**: Select all (Production, Preview, Development)
5. Click "Save"
6. Redeploy your application

## Fallback Behavior

The frontend code now has the following fallback chain:

1. **First**: Tries `VITE_API_BASE_URL` (recommended)
2. **Second**: Tries `VITE_API_URL` (legacy support)
3. **Third**: Falls back to `https://ultra-supabotv2-production.up.railway.app/api/v1` (hardcoded production URL)

This means even if you don't set the environment variable in Vercel, it will still work with the Railway backend!

## Debug Logs

The application now logs the API URL being used to the browser console:
- `API Base URL: ...` (from api.ts)
- `Dashboard API Base URL: ...` (from useDashboardData.ts)
- `Fetching stores from: ...` (from dashboardStore.ts)

Check the browser console to verify the correct URL is being used.

## Local Development

For local development, create a `.env` file in the `frontend` directory:

```
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Or use the Railway URL for local testing:

```
VITE_API_BASE_URL=https://ultra-supabotv2-production.up.railway.app/api/v1
```
