# MAI_Sync Expert Advisor — Installation Guide

This Expert Advisor (EA) syncs your MT5 account data (positions + deal history)
to the MAI Trading Journal web server automatically, without needing Python or any
other software running on the VPS.

---

## Prerequisites

| Requirement | Details |
|---|---|
| MetaTrader 5 | Build 2755 or later (supports `WebRequest`) |
| MetaEditor | Included with MT5 |
| MAI server URL | Your deployed backend, e.g. `https://api.yourdomain.com/api/v1/sync` |
| API Key | Shared secret configured in your backend `.env` as `API_KEY` |

---

## Step 1 — Copy the source file

Copy `MAI_Sync.mq5` into your MT5 **MQL5/Experts** folder.

**Default path:**
```
C:\Users\<YourUser>\AppData\Roaming\MetaQuotes\Terminal\<TerminalID>\MQL5\Experts\
```

You can also open it directly from MetaEditor:
> **MetaEditor → File → Open** → browse to `MAI_Sync.mq5`

---

## Step 2 — Compile in MetaEditor

1. Open MetaEditor (press **F4** in MT5, or launch `metaeditor64.exe`).
2. Open `MAI_Sync.mq5`.
3. Press **F7** (Compile) or click the **Compile** toolbar button.
4. Confirm **0 errors, 0 warnings** in the Errors tab.
5. The compiled file `MAI_Sync.ex5` is now in the same `Experts/` folder.

---

## Step 3 — Allow WebRequests in MT5

> ⚠️ This step is mandatory. Without it, `WebRequest()` returns error **4014**.

1. In MT5: **Tools → Options → Expert Advisors**
2. Check **✓ Allow WebRequests for listed URL:**
3. Click **+** and add your server URL, e.g.:
   ```
   https://api.yourdomain.com
   ```
   (Just the base origin — no path needed.)
4. Click **OK**.

---

## Step 4 — Attach the EA to a chart

1. In MT5 **Navigator** panel → **Expert Advisors** → find `MAI_Sync`.
2. Drag it onto any chart (e.g. EURUSD H1). The chart and timeframe don't
   affect sync — the EA reads account-level data, not chart data.
3. The **EA Inputs** dialog opens. Configure:

| Input | Description | Example |
|---|---|---|
| `ServerURL` | Full sync endpoint URL | `https://api.yourdomain.com/api/v1/sync` |
| `APIKey` | Your API key from backend `.env` | `your-secret-api-key` |
| `SyncIntervalSeconds` | How often to sync (minimum 5 s) | `10` |
| `HistoryDays` | Days of deal history to include | `60` |
| `EnableLogging` | Print status to Experts log | `true` |

4. Click **OK**. You should see a smiley face (🙂) on the chart and the EA
   name in the top-right corner.

---

## Step 5 — Verify sync is working

Open the MT5 **Experts** tab (bottom panel). You should see:

```
MAI Sync started. Server: https://... | Interval: 10 s | History: 60 days
MAI Sync OK [200] at 2026.01.01 12:00:05
MAI Sync OK [200] at 2026.01.01 12:00:15
...
```

If you see **HTTP 401** → your `APIKey` is wrong.  
If you see **HTTP 422** → payload schema mismatch (contact dev).  
If you see **error 4014** → WebRequests not enabled (redo Step 3).

---

## Step 6 — Link your MT5 account on the web UI

After the EA syncs at least once:

1. Log into the MAI Trading Journal web app.
2. Click your profile icon → **Link New Account**.
3. Enter your MT5 **Login number** and select your **Broker** from the dropdown.
4. Click **Link Account**.

Your account is now linked and the dashboard will update automatically on each
subsequent sync.

---

## Multiple MT5 accounts

You can run the EA on **multiple MT5 terminals** (or multiple charts within one
terminal if using different account logins). Each terminal syncs its own account.
The backend deduplicates by `(broker, login, server)` — no double-counting.

---

## Stopping / removing the EA

Right-click the chart → **Expert Advisors → Remove** (or close the chart).
Syncing stops immediately. Data already on the server is preserved.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Smiley face is sad (☹️) | EA failed to initialise | Check Inputs: APIKey and ServerURL are set |
| `error 4014` in log | WebRequests blocked | MT5 → Tools → Options → Expert Advisors → Allow WebRequests |
| `HTTP 401` | Wrong API key | Verify `APIKey` input matches backend `API_KEY` env var |
| `HTTP 422` | Schema mismatch | Update EA from latest `MAI_Sync.mq5` |
| `HTTP 0` or timeout | Network / firewall | Ensure VPS can reach your server on port 443 |
| Account not found when claiming | EA never synced | Wait for one successful sync (check Experts log) |

---

## File locations

```
MAI-TRADING/
└── mt5-connector/
    ├── MAI_Sync.mq5      ← MQL5 source (edit here)
    ├── README_EA.md      ← This file
    └── sync.py           ← Legacy Python connector (kept for reference)
```

