---
name: mai-trading-context
description: >-
  Complete project context, architecture, database schema, auth system, and
  development history for the MAI Trading Journal app. Activate this skill
  whenever continuing work on this project so you have full context without
  needing to re-read every file. Covers backend (FastAPI + PostgreSQL),
  frontend (React + Vite), MT5 connector, auth (Google OAuth + JWT),
  and all IDOR-protection decisions already implemented.
---

# MAI Trading Journal — Full Project Context

> [!IMPORTANT]
> Read this skill at the start of every session before making any changes.
> It is the single source of truth for architecture, decisions, and current state.

---

## 1. Project Overview

**MAI Trading Journal** is a full-stack trading analytics + psychology journal app for MetaTrader 5 (MT5) traders.

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI (Python 3.13), SQLAlchemy ORM, PostgreSQL |
| Frontend | React 18, Vite 6, plain CSS variables |
| MT5 Connector | **MQL5 Expert Advisor** (`MAI_Sync.mq5`) — primary; Python `sync.py` kept as reference |
| Auth | Google OAuth 2.0 ID-token flow + app-issued JWT (HS256) |
| DB Schema | PostgreSQL schema: `trading` |
| Virtual Env | `.venv` at project root (Windows) |

**Root path:** `d:\File\MAITD\MAI Tech\MAI-TRADING\`

---

## 2. Directory Structure

```
MAI-TRADING/
├── .agents/
│   └── skills/
│       └── mai-trading-context/
│           └── SKILL.md              ← this file
├── .venv/                            ← Python venv (Windows)
├── backend/
│   ├── .env                          ← secrets (never commit real values)
│   ├── .env.example
│   ├── config.py                     ← settings loader (reads .env)
│   ├── database.py                   ← SQLAlchemy engine + Base + get_db
│   ├── main.py                       ← FastAPI app, CORS, router mounts
│   ├── models.py                     ← ORM models (User, Account, Trade, …)
│   ├── schemas.py                    ← Pydantic schemas
│   ├── trade_matching.py             ← deals → closed trade aggregation logic
│   └── routers/
│       ├── auth.py                   ← Google OAuth, JWT, get_current_user, verify_account_access
│       ├── accounts.py               ← GET /accounts, POST /accounts/claim
│       ├── trades.py                 ← CRUD /trades (IDOR-protected)
│       ├── positions.py              ← GET /positions (IDOR-protected)
│       ├── analytics.py              ← GET /analytics/summary (IDOR-protected)
│       ├── journal.py                ← POST/DELETE /journal (IDOR-protected)
│       └── sync.py                   ← POST /sync (MT5 connector webhook)
├── frontend/
│   ├── .env                          ← VITE_GOOGLE_CLIENT_ID=...
│   ├── .env.example
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                   ← main app shell, all data fetching + handlers
│       ├── index.css                 ← CSS variables, dark theme
│       ├── context/
│       │   └── AuthContext.jsx       ← Google login, token storage, useAuth()
│       └── components/
│           ├── LoginScreen.jsx       ← Full-screen login (Google + Demo)
│           ├── Header.jsx            ← Navbar with account selector + logout
│           ├── MetricsCards.jsx
│           ├── PnLChart.jsx
│           ├── TradeList.jsx
│           ├── TradingCalendar.jsx
│           ├── OpenPositions.jsx
│           ├── JournalTab.jsx
│           ├── JournalModal.jsx
│           └── ManualTradeModal.jsx
├── mt5-connector/
│   ├── MAI_Sync.mq5                  ← MQL5 Expert Advisor (primary connector)
│   ├── README_EA.md                  ← EA installation guide
│   ├── .env                          ← API_KEY, BACKEND_URL
│   ├── sync.py                       ← main sync loop (account + deals + positions)
│   ├── account.py
│   ├── history.py
│   └── positions.py
├── launcher.py                       ← desktop launcher (starts backend + opens browser)
├── start.bat
└── build_exe.bat
```

---

## 3. Database Schema (`trading.*`)

### `trading.users`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| google_id | VARCHAR UNIQUE | nullable (demo user has fake value) |
| email | VARCHAR UNIQUE | |
| name | VARCHAR | |
| picture | VARCHAR | Google avatar URL |
| created_at | TIMESTAMP | |
| last_login | TIMESTAMP | |

### `trading.accounts`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | internal row id |
| account_id | BIGINT UNIQUE | MT5 account number |
| **user_id** | INTEGER FK → users.id | **Added for IDOR protection** — SET NULL on delete |
| broker | VARCHAR | |
| currency | VARCHAR | |
| balance / equity / margin / free_margin / profit | FLOAT | live MT5 values |
| leverage | INTEGER | |
| updated_at | TIMESTAMP | |

### `trading.trades`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| account_id | BIGINT FK → accounts.account_id | CASCADE delete |
| position_id | BIGINT UNIQUE | MT5 position ticket |
| symbol / type / volume | VARCHAR/FLOAT | |
| entry_price / exit_price | FLOAT | |
| open_time / close_time | TIMESTAMP | |
| gross_profit / commission / swap / net_pnl | FLOAT | |
| status | VARCHAR | "CLOSED" or "OPEN" |

### `trading.journal_entries`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| trade_id | INTEGER UNIQUE FK → trades.id | CASCADE delete |
| setup / emotion / notes | VARCHAR/TEXT | |
| rating | INTEGER | 1–10 |
| screenshot_url | VARCHAR | nullable |
| created_at / updated_at | TIMESTAMP | |

### `trading.positions` (live open positions)
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| account_id | BIGINT FK → accounts.account_id | |
| ticket | BIGINT UNIQUE | |
| symbol / type | VARCHAR | |
| volume / price_open / price_current / sl / tp / profit / swap | FLOAT | |
| time / updated_at | TIMESTAMP | |

### `trading.deals` (raw MT5 deal history, used to build trades)
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| account_id | BIGINT FK | |
| deal_id | BIGINT UNIQUE | |
| order_id / position_id | BIGINT | |
| symbol / type / entry | VARCHAR | |
| volume / price / profit / commission / swap | FLOAT | |
| timestamp | TIMESTAMP | |

---

## 4. Known Users in DB

| id | email | name | Notes |
|----|-------|------|-------|
| 1 | trader@mai-trading.local | Demo Trader | auto-created by demo-login |
| 2 | borotsaven@gmail.com | Borot Saven | primary Google account |
| 3 | savenborot2003@gmail.com | Saven - Official | secondary Google account |

## 5. Known MT5 Accounts in DB

| account_id | user_id | Notes |
|------------|---------|-------|
| 55682561 | 2 | linked to borotsaven@gmail.com |
| 569343035 | 2 | linked to borotsaven@gmail.com |
| 502014138 | 2 | linked to borotsaven@gmail.com |

---

## 6. Authentication Architecture

### Flow
```
Frontend                              Backend
   |                                     |
   |-- Google Sign-In button ----------->|
   |   (Google returns ID token)         |
   |                                     |
   |-- POST /api/v1/auth/google -------->|
   |   { credential: "<google_id_token>" }|
   |                                     |-- verify with google.oauth2.id_token
   |                                     |-- upsert User in DB
   |                                     |-- auto-assign unowned accounts to user
   |                                     |-- issue app JWT (HS256, 720h)
   |<-- { access_token, user } ---------|
   |                                     |
   |   (store token in localStorage      |
   |    as "mai_auth_token")             |
   |                                     |
   |-- GET /api/v1/trades -------------->|
   |   Authorization: Bearer <jwt>       |-- get_current_user() dependency
   |                                     |-- verify_account_access()
   |<-- [ trades ] ---------------------|
```

### Key Auth Functions (in `backend/routers/auth.py`)

```python
def get_current_user(authorization: Header, db) -> User:
    """Decodes Bearer JWT → returns User ORM object. Raises 401 if missing/invalid/expired."""

def verify_account_access(db, user, account_id=None) -> list[int]:
    """
    - If account_id given: checks ownership, raises 403 if not owned, returns [account_id]
    - If account_id=None: returns all account_ids owned by user
    """
```

### Auth Endpoints
| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| GET | `/api/v1/auth/config` | ❌ | Returns `google_client_id` for frontend |
| POST | `/api/v1/auth/google` | ❌ | Google ID token → app JWT |
| POST | `/api/v1/auth/demo-login` | ❌ | Dev/demo mode login |
| GET | `/api/v1/auth/me` | ✅ JWT | Returns current user profile |

### JWT Token Storage
- **localStorage key:** `mai_auth_token`
- **React hook:** `useAuth()` from `AuthContext.jsx` → returns `{ user, token, login, logout }`
- **App.jsx pattern:**
  ```js
  const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};
  ```

### Google OAuth Credentials
- **Google Cloud Project:** `mai-trading`
- **Client ID:** `200630373261-738rf1i25s5ln2f556velg8sk93pi460.apps.googleusercontent.com`
- **Authorized JS Origins in Google Console:** must include `http://localhost:5173` (and production URL)
- **Auth type:** "Web application" (browser-side, NOT server-side)

> [!CAUTION]
> Never hardcode `GOOGLE_CLIENT_SECRET` or `JWT_SECRET` in source files.
> They live in `backend/.env` only.

---

## 7. IDOR Protection — Fully Implemented ✅

Every API endpoint that returns user-sensitive data is protected. The pattern is consistent:

```python
# Every protected endpoint follows this exact pattern:
current_user: User = Depends(get_current_user)           # 1. Authenticate
allowed_ids = verify_account_access(db, current_user, account_id)  # 2. Authorize
query = query.filter(Trade.account_id.in_(allowed_ids))  # 3. Scope to user's data
```

### Protection Status by Router

| Router | Endpoints | IDOR Protected |
|--------|-----------|---------------|
| `auth.py` | /google, /demo-login, /me | ✅ |
| `accounts.py` | GET /accounts, POST /accounts/claim | ✅ (filters by user_id) |
| `trades.py` | GET, GET/{id}, POST, DELETE/{id}, DELETE | ✅ |
| `positions.py` | GET | ✅ |
| `analytics.py` | GET /summary | ✅ |
| `journal.py` | POST, DELETE/{id}, GET /tags | ✅ (trade ownership check) |
| `sync.py` | POST /sync | 🔑 API-Key auth (MT5 connector) |

### Security Tests (verified passing)
```
GET /trades?account_id=99999999  → 403 "Access denied: You do not own trading account #99999999"
GET /trades (no token)           → 401 "Missing or invalid Authorization header"
GET /analytics/summary?account_id=99999999 → 403
```

### `clear_all_trades` scope fix
The `DELETE /trades` endpoint (clear all) **only deletes the current user's own trades**, not all trades in the DB. It scopes via owned account IDs.

---

## 8. API Endpoints Reference

### Base URL: `http://localhost:8000/api/v1`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/accounts` | JWT | List user's MT5 accounts |
| POST | `/accounts/claim` | JWT | Claim an unassigned account |
| GET | `/trades` | JWT | List closed trades (filterable) |
| GET | `/trades/{id}` | JWT | Single trade by ID |
| POST | `/trades` | JWT | Create manual trade |
| DELETE | `/trades/{id}` | JWT | Delete a trade |
| DELETE | `/trades?confirm=true` | JWT | Clear all user's trades |
| GET | `/positions` | JWT | Live open positions |
| GET | `/analytics/summary` | JWT | Analytics dashboard data |
| POST | `/journal` | JWT | Create/update journal entry |
| DELETE | `/journal/{trade_id}` | JWT | Delete journal entry |
| GET | `/journal/tags` | ❌ | Get available setup/emotion tags |
| POST | `/sync` | API-Key | MT5 connector webhook |
| GET | `/sync/status` | JWT | Last sync info |
| POST | `/sync/seed-demo` | JWT | Seed demo trade data |

### Query Params (trades)
- `account_id` — filter by MT5 account (IDOR-validated)
- `symbol` — partial match
- `trade_type` — BUY / SELL
- `outcome` — `win` / `loss`
- `search` — full-text across symbol, setup, emotion, notes
- `limit` / `offset` — pagination

---

## 9. Frontend Architecture

### Auth Context (`AuthContext.jsx`)
```jsx
// Provides: { user, token, login, logout, isLoading }
// Reads token from localStorage("mai_auth_token")
// login(credential) → POST /auth/google → stores token
```

### App.jsx — Key Patterns
```jsx
const { user, token } = useAuth();
const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

// All fetch calls use authHeaders:
fetch(`${API_BASE}/trades`, { headers: authHeaders })
fetch(`${API_BASE}/journal`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: ... })
fetch(`${API_BASE}/trades/${id}`, { method: 'DELETE', headers: authHeaders })
```

### Account Switching
- `Header.jsx` renders a `<select>` with all user's accounts
- Selected account stored in `activeAccount` state in `App.jsx`
- All `fetchData()` calls append `?account_id=<activeAccount.account_id>` when an account is selected

### Login Guard
- `App.jsx` renders `<LoginScreen />` if `!user` (before auth)
- `LoginScreen.jsx` has Google Sign-In button + Demo Login button
- After login, full dashboard renders

---

## 10. Environment Variables

### `backend/.env`
```env
DATABASE_URL=postgresql+psycopg2://postgres:<password>@localhost:5432/mai-trading
DB_SCHEMA=trading
API_KEY=<mt5-connector-shared-secret>
GOOGLE_CLIENT_ID=200630373261-738rf1i25s5ln2f556velg8sk93pi460.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secret>
JWT_SECRET=<random-secure-string>
JWT_EXPIRATION_HOURS=720
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### `frontend/.env`
```env
VITE_GOOGLE_CLIENT_ID=200630373261-738rf1i25s5ln2f556velg8sk93pi460.apps.googleusercontent.com
VITE_API_BASE=http://localhost:8000/api/v1
```

---

## 11. Development Setup

### Start Backend
```powershell
cd "d:\File\MAITD\MAI Tech\MAI-TRADING"
.\.venv\Scripts\Activate.ps1
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Start Frontend
```powershell
cd "d:\File\MAITD\MAI Tech\MAI-TRADING"
npm --prefix frontend run dev
# → http://localhost:5173
```

### Run Backend Tests
```powershell
cd "d:\File\MAITD\MAI Tech\MAI-TRADING"
python -c @"
import sys; sys.path.insert(0, 'backend')
from main import app
from fastapi.testclient import TestClient
client = TestClient(app)
res = client.post('/api/v1/auth/demo-login')
token = res.json()['access_token']
headers = {'Authorization': 'Bearer ' + token}
print(client.get('/api/v1/trades', headers=headers).status_code)         # expect 200
print(client.get('/api/v1/trades?account_id=99999999', headers=headers).status_code)  # expect 403
print(client.get('/api/v1/trades').status_code)                          # expect 401
"@
```

### Build Frontend for Production
```powershell
npm --prefix frontend run build
# Output: frontend/dist/
```

---

## 12. Known Issues / Gotchas

> [!WARNING]
> **Line endings on Windows**: Python files in `backend/` can get CRLF endings.
> Always normalize before editing:
> ```python
> import pathlib
> p = pathlib.Path('backend/routers/file.py')
> p.write_bytes(p.read_bytes().replace(b'\r\n', b'\n'))
> ```

> [!WARNING]
> **`limit: Optional[int] = Query(None)`** — MUST use `Query(None)` not bare `= None`
> in FastAPI route params passed to SQLAlchemy `.limit()`. Otherwise FastAPI passes
> its own `Query` object to SQLAlchemy and you get `TypeError`.

> [!NOTE]
> **`orm_mode` deprecation**: Pydantic v2 renames it to `from_attributes`.
> Both are present in schemas.py for backward compat. Harmless warning.

> [!NOTE]
> **Demo login auto-assigns accounts**: Both `POST /auth/google` and `POST /auth/demo-login`
> automatically claim any `Account` rows with `user_id = NULL` and assign them to the
> newly logged-in user. This is intentional for first-run MT5 sync flows.

> [!NOTE]
> **`Account.account_id` vs `Account.id`**: The MT5 account number is stored in
> `account_id` (BigInteger, the actual MT5 login number like `55682561`).
> `Account.id` is just an internal auto-increment PK. Always use `account_id`
> when filtering trades/positions (FK relationship uses `account_id`, not `id`).

---

## 13. Development History — Key Decisions

| Decision | Rationale |
|----------|-----------|
| PostgreSQL over SQLite | Multi-connection support for MT5 connector + backend running simultaneously |
| `trading` schema (not `public`) | Namespace isolation; easier to wipe/reset without touching other PG objects |
| Google OAuth ID token (not Authorization Code) | Simpler browser-side flow; no server-side redirect needed |
| "Web application" OAuth client | Provides `client_id` for browser JS `google.accounts.id.initialize()`; server only needs `client_id` to verify tokens (not `client_secret`) |
| JWT issued by backend (not Google session) | Stateless auth; portable; Google session not held server-side |
| `user_id` FK on `accounts` table | Core of IDOR protection — each account belongs to exactly one user |
| Auto-assign unowned accounts on login | Handles race condition where MT5 syncs before user has logged in; first login claims orphan accounts |
| `verify_account_access()` helper | Single reusable 403 guard used by all 5 routers |
| `clear_all_trades` scoped to user | Prevents one user accidentally wiping another user's history |

---

## 14. What Was Completed (as of last session)

- [x] PostgreSQL schema + all tables created
- [x] `user_id` FK column added to `trading.accounts` (via `ALTER TABLE`)
- [x] `User` ↔ `Account` bidirectional SQLAlchemy relationship
- [x] All 3 MT5 accounts linked to `borotsaven@gmail.com` (user_id = 2)
- [x] Google OAuth login end-to-end working
- [x] Demo login working
- [x] JWT generation + verification
- [x] `get_current_user()` dependency
- [x] `verify_account_access()` IDOR guard
- [x] `routers/accounts.py` — IDOR protected (GET /accounts, POST /accounts/claim)
- [x] `routers/trades.py` — all 5 endpoints IDOR protected
- [x] `routers/positions.py` — IDOR protected
- [x] `routers/analytics.py` — IDOR protected
- [x] `routers/journal.py` — IDOR protected (ownership via trade → account)
- [x] `routers/sync.py` — `GET /sync/status` IDOR protected (scoped to user), `POST /sync/seed-demo` protected
- [x] Direct account linking on sync (`POST /sync` accepts `Authorization: Bearer <jwt>` or `X-User-Email` to link immediately)
- [x] `mt5-connector/sync.py` updated to read `user_email` / `user_token` from `config.json` or `.env` and pass in sync headers
- [x] `LinkAccountModal.jsx` UI component added with "Claim by Account #" and "Auto-Link Setup" instructions
- [x] `Header.jsx` updated with Account switcher linking option & initial link button
- [x] `App.jsx` — `authHeaders` sent on ALL fetch calls (journal, trades POST, delete, seed-demo, sync/status)
- [x] Multi-broker same login collision resolution implemented (Option 2): deterministic synthetic `account_id` via SHA-256 63-bit integer from `(broker, login, server)` with dedicated `login` and `server` columns on `trading.accounts`
- [x] Account claiming supports specific broker selection (`POST /api/v1/accounts/claim` with `account_id` and optional `broker`), plus `GET /api/v1/accounts/unclaimed` endpoint with detected account cards in `LinkAccountModal.jsx`
- [x] Dedicated `trading.brokers` table created; auto-inserts new broker name & server whenever MT5 syncs
- [x] Removed `/api/v1/accounts/unclaimed` endpoint; added `GET /api/v1/accounts/brokers` dynamic endpoint
- [x] Link MT5 Account modal dynamically populates broker options strictly from `trading.brokers` table with server display (removed "+ Other Broker" option)
- [x] Fixed toast zIndex (set to 99999) preventing blur behind modal backdrop, and added high-contrast inline error banner inside `LinkAccountModal.jsx`
- [x] Frontend production build passes (`npm run build` → 0 errors)
- [x] All security tests pass (403 on tamper, 401 on no token, 200 on valid)

## 16. Production Concept: Centralized VPS Bridge Model

```
[Windows VPS: MT5 Terminals]
         ↓ sync.py (POST /api/v1/sync with X-API-Key)
[Cloud Web Server: FastAPI + PostgreSQL]
   - Saves account with user_id = NULL (unclaimed)
   - Handles multi-broker collisions via deterministic synthetic IDs
         ↓
[Web UI (Browser): Google OAuth]
   - User signs in with Google
   - Clicks "Link MT5 Account"
   - Enters Account Login + Broker (or 1-click claims detected account)
   - Server validates presence & links: account.user_id = current_user.id
   - Process Complete! Live dashboard renders immediately.
```

- [ ] Rate limiting on auth endpoints (prevent brute-force token guessing)
- [ ] Refresh token / token rotation (current JWT is long-lived 720h)
- [ ] Pagination UI in TradeList (backend supports `limit`/`offset` but frontend loads all)
- [ ] Screenshot upload for journal entries (placeholder field exists, no storage backend)
- [ ] Email notifications / daily summary
- [ ] Multi-account dashboard view (compare P&L across accounts)
- [ ] Export trades to CSV/Excel
- [ ] `sync.py` — after sync, auto-assign newly created accounts to user via email matching
- [ ] Deployment (Docker Compose for backend + Nginx for frontend)
- [ ] Add `account_id` to `ManualTradeCreate` schema (currently falls back to first owned account)

