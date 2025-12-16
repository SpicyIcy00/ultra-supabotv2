# Deployment Guide - BI Dashboard

This guide will help you deploy your BI Dashboard to production using Vercel (frontend) and Railway (backend).

## Prerequisites

- GitHub account
- Vercel account (free tier available at https://vercel.com)
- Railway account (free tier available at https://railway.app)
- Your Supabase database is already set up

---

## Part 1: Deploy Backend to Railway

### Step 1: Create a Railway Account
1. Go to https://railway.app
2. Sign up with GitHub
3. Authorize Railway to access your repositories

### Step 2: Deploy Backend
1. Click "New Project" in Railway dashboard
2. Select "Deploy from GitHub repo"
3. Choose your repository
4. Railway will auto-detect the backend folder

### Step 3: Configure Environment Variables
In Railway dashboard, go to your project > Variables tab and add:

```
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@db.xxx.supabase.co:5432/postgres
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
SECRET_KEY=your-secret-key-change-this-in-production
ENVIRONMENT=production
CORS_ORIGINS=["https://your-app.vercel.app"]
API_V1_PREFIX=/api/v1
PROJECT_NAME=BI Dashboard API
VERSION=0.1.0
LOG_LEVEL=INFO
REDIS_ENABLED=false
```

**IMPORTANT:**
- Use your actual Supabase DATABASE_URL from your local `.env` file
- Use your actual ANTHROPIC_API_KEY
- Generate a new SECRET_KEY for production (you can use: `openssl rand -hex 32`)

### Step 4: Configure Build Settings
Railway should auto-detect your Python app. Verify these settings:

- **Root Directory**: `backend`
- **Build Command**: `poetry install --no-dev`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### Step 5: Deploy
1. Railway will automatically deploy
2. Wait for deployment to complete (2-5 minutes)
3. Copy your Railway backend URL (e.g., `https://your-app.railway.app`)

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Create a Vercel Account
1. Go to https://vercel.com
2. Sign up with GitHub
3. Authorize Vercel to access your repositories

### Step 2: Import Project
1. Click "Add New" > "Project"
2. Import your GitHub repository
3. Vercel will auto-detect it's a Vite project

### Step 3: Configure Build Settings
Vercel should auto-detect these, but verify:

- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### Step 4: Add Environment Variables
In Vercel project settings > Environment Variables, add:

```
VITE_API_URL=https://your-backend-url.railway.app
```

Replace `your-backend-url.railway.app` with your actual Railway backend URL from Part 1, Step 5.

### Step 5: Deploy
1. Click "Deploy"
2. Wait for build to complete (2-5 minutes)
3. Vercel will provide you with a URL (e.g., `https://your-app.vercel.app`)

---

## Part 3: Update CORS Settings

### Update Railway Backend CORS
1. Go back to Railway dashboard
2. Update the `CORS_ORIGINS` environment variable with your Vercel URL:

```
CORS_ORIGINS=["https://your-app.vercel.app","https://your-app-*.vercel.app"]
```

The wildcard pattern `*` allows preview deployments to work.

2. Railway will automatically redeploy with new settings

### Update Vercel Rewrites (Already Done)
The `vercel.json` file has been created with API proxy settings. Update it:

1. Edit `frontend/vercel.json`
2. Replace `your-backend-url.railway.app` with your actual Railway URL
3. Commit and push changes

---

## Part 4: Test Your Deployment

1. Visit your Vercel URL: `https://your-app.vercel.app`
2. The app should load and connect to your Railway backend
3. Test the following:
   - Store Performance Heatmap loads
   - Category Performance Matrix loads
   - All 6 stores appear in visualizations
   - AI Chatbot works

---

## Continuous Deployment

Both Vercel and Railway are now set up for automatic deployments:

- **Push to main branch** → Automatically deploys to production
- **Push to other branches** → Creates preview deployments (Vercel only)

---

## Troubleshooting

### Frontend can't connect to backend
- Check `VITE_API_URL` in Vercel environment variables
- Check `CORS_ORIGINS` in Railway environment variables includes your Vercel URL
- Check Railway logs for errors

### Backend crashes on startup
- Check Railway logs
- Verify all environment variables are set correctly
- Verify DATABASE_URL is correct

### Database connection errors
- Verify your Supabase database is accessible from Railway
- Check if Supabase has IP restrictions (Railway uses dynamic IPs)
- Ensure DATABASE_URL uses `postgresql+psycopg://` (not `postgresql://`)

### Build failures
**Frontend:**
- Check Vercel build logs
- Ensure all npm dependencies are in `package.json`

**Backend:**
- Check Railway build logs
- Ensure all Python dependencies are in `pyproject.toml`

---

## Custom Domain (Optional)

### Add Custom Domain to Vercel
1. Go to Vercel project > Settings > Domains
2. Add your custom domain (e.g., `dashboard.yourdomain.com`)
3. Follow Vercel's DNS configuration instructions
4. Update Railway CORS_ORIGINS to include your custom domain

---

## Monitoring & Logs

### Railway Logs
- Go to Railway project > Deployments > View Logs
- Monitor API requests, errors, and performance

### Vercel Logs
- Go to Vercel project > Deployments > View Function Logs
- Monitor build errors and runtime issues

---

## Security Checklist

- [ ] Changed SECRET_KEY from default value
- [ ] ANTHROPIC_API_KEY is not exposed in frontend
- [ ] CORS_ORIGINS only includes your actual domains
- [ ] DATABASE_URL credentials are secure
- [ ] Environment variables are set in Railway/Vercel (not in code)
- [ ] `.env` files are in `.gitignore`

---

## Cost Estimates

**Vercel Free Tier:**
- 100GB bandwidth/month
- Unlimited deployments
- Automatic SSL

**Railway Free Tier:**
- $5 free credit/month
- Should be sufficient for low-traffic apps
- Upgrade to Pro ($20/month) for production apps

**Total:** Free to start, ~$20/month for production use

---

## Next Steps

1. Deploy backend to Railway
2. Deploy frontend to Vercel
3. Test the deployment
4. Set up custom domain (optional)
5. Monitor logs and performance

---

## Support

If you encounter issues:
- Check Railway docs: https://docs.railway.app
- Check Vercel docs: https://vercel.com/docs
- Review application logs in both platforms
