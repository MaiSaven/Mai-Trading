# Free Deployment Guide — MAI Trading Journal

> [!IMPORTANT]
> **Stack: Neon (PostgreSQL) + Render (FastAPI) + Vercel (React)**
> All three are free tiers. Total cost: \$0/month.

---

## Architecture Overview

```mermaid
flowchart LR
    MT5["MT5 VPS\nMAI_Sync.mq5"] -->|HTTPS POST /api/v1/sync| RENDER
    BROWSER["User Browser"] -->|HTTPS| VERCEL
    VERCEL["Vercel\nReact/Vite\nfrontend"] -->|Rewrite /api/*| RENDER
    RENDER["Render\nFastAPI\nbackend"] -->|TCP 5432| NEON
    NEON["Neon\nPostgreSQL\ndatabase"]
```

---

## Step 1 — Database: Neon (PostgreSQL)

**Free tier:** 0.5 GB, no sleep, 1 project

1. Go to **[neon.tech](https://neon.tech)** → **Sign Up Free** (GitHub login works)
2. Click **New Project** → give it a name (e.g. `mai-trading`) → **Create Project**
3. Copy the **Connection String** shown:
   ```
   postgresql://user:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Keep this — you'll paste it into Render's env vars in Step 2.

> [!TIP]
> In Neon dashboard → **SQL Editor**, paste and run your schema init SQL or
> let SQLAlchemy auto-create tables on first startup (`Base.metadata.create_all`).

---

## Step 2 — Backend: Render (FastAPI)

**Free tier:** 1 web service, sleeps after 15 min idle (30s cold start)

### 2a. Push your code to GitHub

Your project must be in a GitHub repo. If not:

```bash
cd "d:\File\MAITD\MAI Tech\MAI-TRADING"
git init
git add .
git commit -m "Initial commit"
# Then create a repo on github.com and:
git remote add origin https://github.com/YOUR_USERNAME/mai-trading.git
git push -u origin main
```

### 2b. Create a Render Web Service

1. Go to **[render.com](https://render.com)** → **Sign Up** (GitHub login)
2. **New → Web Service** → Connect your GitHub repo
3. Configure:

| Setting | Value |
|---|---|
| **Name** | `mai-trading-api` |
| **Root Directory** | `backend` |
| **Environment** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | `Free` |

### 2c. Add Environment Variables in Render

In Render → your service → **Environment** tab, add all these:

| Key | Value |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://user:pass@ep-xxx.neon.tech/neondb?sslmode=require` |
| `DB_SCHEMA` | `trading` |
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID |
| `JWT_SECRET` | A long random string (e.g. generate with `openssl rand -hex 32`) |
| `JWT_EXPIRATION_HOURS` | `720` |
| `API_KEY` | Your secret API key (same as in `MAI_Sync.mq5`) |
| `CORS_ORIGINS` | `https://your-app.vercel.app` (fill in after Step 3) |
| `HOST` | `0.0.0.0` |
| `ENABLE_DEMO_DATA` | `false` |

> [!NOTE]
> **`DATABASE_URL` prefix:** Neon gives you `postgresql://...` but SQLAlchemy
> needs `postgresql+psycopg2://...` — just replace the prefix.

4. Click **Create Web Service** → wait ~3 min for first deploy
5. Copy your Render URL: `https://mai-trading-api.onrender.com`

---

## Step 3 — Frontend: Vercel (React/Vite)

**Free tier:** Unlimited, CDN, custom domain, no sleep

### 3a. Update `frontend/vercel.json`

Open [`frontend/vercel.json`](file:///d:/File/MAITD/MAI%20Tech/MAI-TRADING/frontend/vercel.json) and replace the placeholder URL:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://mai-trading-api.onrender.com/api/$1" }
  ]
}
```

This proxies `/api/*` from Vercel → Render, so the browser never hits Render directly (avoids CORS issues).

Commit and push this change.

### 3b. Deploy on Vercel

1. Go to **[vercel.com](https://vercel.com)** → **Sign Up** (GitHub login)
2. **Add New → Project** → Import your GitHub repo
3. Configure:

| Setting | Value |
|---|---|
| **Framework Preset** | `Vite` |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

4. Under **Environment Variables**, add:

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | `/api/v1` |

5. Click **Deploy** → wait ~1 min
6. Copy your Vercel URL: `https://mai-trading.vercel.app`

### 3c. Update Google OAuth Authorized Origins

In **[Google Cloud Console](https://console.cloud.google.com)** → APIs & Services → Credentials → your OAuth client:
- **Authorized JavaScript origins**: add `https://mai-trading.vercel.app`
- **Authorized redirect URIs**: add `https://mai-trading.vercel.app`

### 3d. Update Render CORS_ORIGINS

Go back to Render → Environment → update `CORS_ORIGINS`:
```
https://mai-trading.vercel.app
```
Redeploy (Render auto-redeploys on env change).

---

## Step 4 — Update MT5 EA

In MT5, right-click the chart with `MAI_Sync` → **EA Properties → Inputs**:
- **ServerURL**: `https://mai-trading-api.onrender.com/api/v1/sync`
- **APIKey**: same key you set in Render `API_KEY`

Also update MT5 → Tools → Options → Expert Advisors → Allow WebRequests:
- Add: `https://mai-trading-api.onrender.com`

---

## Checklist

- [ ] Neon project created, connection string copied
- [ ] `backend/requirements.txt` exists (✅ already created)
- [ ] Code pushed to GitHub
- [ ] Render web service created with all env vars
- [ ] `frontend/vercel.json` updated with Render URL and committed
- [ ] Vercel project deployed
- [ ] Google OAuth origins updated with Vercel URL
- [ ] Render `CORS_ORIGINS` updated with Vercel URL
- [ ] MT5 EA `ServerURL` updated to Render URL
- [ ] First sync tested: check Render logs

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Render build fails | Check `requirements.txt` — `psycopg2-binary` not `psycopg2` |
| `DATABASE_URL` error | Use `postgresql+psycopg2://` prefix, not `postgresql://` |
| 401 on API calls from browser | CORS not configured — verify `CORS_ORIGINS` in Render matches Vercel URL exactly |
| Google login fails | Add Vercel URL to Google OAuth authorized origins |
| MT5 sync fails (HTTP 0) | Add Render URL to MT5 → Tools → Options → Allow WebRequests |
| Cold start 30s delay | Normal on Render free tier — upgrade to \$7/mo Starter to eliminate |

---

## Free Tier Limits Summary

| Service | Limit | Your Usage |
|---|---|---|
| Neon | 0.5 GB storage | Trading data ~few MB |
| Render | 750 hrs/month compute, sleeps after 15 min idle | Fine for personal use |
| Vercel | 100 GB bandwidth, unlimited deployments | More than enough |

> [!TIP]
> To prevent Render cold starts for free: use **[UptimeRobot](https://uptimerobot.com)**
> (also free) to ping `https://mai-trading-api.onrender.com/` every 10 minutes.
> This keeps your backend warm 24/7 without upgrading.
