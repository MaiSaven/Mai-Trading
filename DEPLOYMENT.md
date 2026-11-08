# 🚀 MAI Trading Journal — Production & Deployment Reference

This guide contains everything you need to deploy, configure, and maintain the MAI Trading Journal on **Vercel** + **Neon PostgreSQL** + **MetaTrader 5 VPS**.

---

## 🌐 Live URLs

| Service | URL |
|---|---|
| **Production Web Dashboard** | [https://mai-trading.vercel.app](https://mai-trading.vercel.app) |
| **API Health Check** | [https://mai-trading.vercel.app/api/health](https://mai-trading.vercel.app/api/health) |
| **Swagger API Docs** | [https://mai-trading.vercel.app/api/v1/docs](https://mai-trading.vercel.app/api/v1/docs) |

---

## 🔑 Vercel Environment Variables

Set these in **[Vercel Dashboard](https://vercel.com/dashboard)** $\rightarrow$ **mai-trading** $\rightarrow$ **Settings** $\rightarrow$ **Environment Variables**:

> Select **Production**, **Preview**, and **Development** for each.

| Variable Name | Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://neondb_owner:<DB_PASSWORD>@ep-withered-king-b3yt0iad.c-4.ap-southeast-1.aws.neon.tech/mai-trading?sslmode=require` | Neon Cloud PostgreSQL connection (Singapore `ap-southeast-1`) |
| `DB_SCHEMA` | `trading` | Database schema for all trading tables |
| `GOOGLE_CLIENT_ID` | `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` | Google OAuth 2.0 Web Client ID (from Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | `YOUR_GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret (from Google Cloud Console) |
| `JWT_SECRET` | `YOUR_SECURE_JWT_SECRET_KEY` | Secret key for signing app session tokens |
| `JWT_EXPIRATION_HOURS` | `720` | App token expiration (30 days) |
| `API_KEY` | `mai-trading-secret-key` | Shared secret key for MT5 sync authorization |
| `CORS_ORIGINS` | `https://mai-trading.vercel.app` | Allowed origins (comma-separated or `*`) |
| `ENABLE_DEMO_DATA` | `false` | Disable demo data generation in production |

---

## 🗄️ Neon Production Database Details

| Property | Value |
|---|---|
| **Host** | `ep-withered-king-b3yt0iad.c-4.ap-southeast-1.aws.neon.tech` |
| **Database** | `mai-trading` |
| **User** | `neondb_owner` |
| **Port** | `5432` |
| **SSL Mode** | `require` |
| **Schema** | `trading` |
| **Tables** | `accounts`, `brokers`, `deals`, `journal_entries`, `positions`, `trades`, `users` |
| **Default Brokers** | `Exness Technologies Ltd`, `GTC Global SA (Pty) Ltd`, `Lirunex Limited` |

---

## 📈 MetaTrader 5 (MT5) EA Setup (VPS)

1. Open MetaEditor in MT5 (press **F4**).
2. Open [`mt5-connector/MAI_Sync.mq5`](./mt5-connector/MAI_Sync.mq5) and press **F7** to compile (`MAI_Sync.ex5`).
3. In MT5: **Tools** $\rightarrow$ **Options** $\rightarrow$ **Expert Advisors**:
   - Check **✓ Allow WebRequests for listed URL**
   - Add: `https://mai-trading.vercel.app`
4. Attach `MAI_Sync` onto any chart and enter Inputs:
   - **`ServerURL`**: `https://mai-trading.vercel.app/api/v1/sync`
   - **`APIKey`**: `mai-trading-secret-key`
   - **`SyncIntervalSeconds`**: `10`
   - **`HistoryDays`**: `60`
5. Check MT5 **Experts** log for: `MAI Sync OK [200]`.
6. Full guide: [`mt5-connector/README_EA.md`](./mt5-connector/README_EA.md).

---

## 💻 Local Development vs. Production

### Running Locally
To develop and test on your local machine with local PostgreSQL:
1. Copy or use [`backend/.env.local`](./backend/.env.local).
2. Start the backend:
   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```
3. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```
   (Vite dev server proxies `/api` calls from `http://localhost:5173` to `http://localhost:8000`).

### Deploying Updates to Vercel
Push your changes to GitHub:
```bash
git add .
git commit -m "your update message"
git push origin master
```
Vercel automatically detects the push and deploys both services via the root [`vercel.json`](./vercel.json).

---

## 🛠️ Diagnostics & Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| **Google Sign-In fails with 500** | Missing `DATABASE_URL` or `GOOGLE_CLIENT_ID` in Vercel | Add variables in Vercel Settings $\rightarrow$ Environment Variables $\rightarrow$ Redeploy |
| **"Origin not allowed" in Google OAuth popup** | Missing Vercel URL in Google Console | In Google Cloud Console $\rightarrow$ OAuth Credentials, add `https://mai-trading.vercel.app` to **Authorized JavaScript origins** |
| **MT5 EA WebRequest error 4014** | URL not whitelisted in MT5 | In MT5 $\rightarrow$ Tools $\rightarrow$ Options $\rightarrow$ Expert Advisors $\rightarrow$ Add `https://mai-trading.vercel.app` |
| **DB connection error in `/api/health`** | Neon connection string issue | Ensure `DATABASE_URL` uses unpooled host (`ep-....aws.neon.tech` without `-pooler`) and `sslmode=require` |
