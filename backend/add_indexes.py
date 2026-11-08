"""
Applies performance indexes to the production Neon database.
Run once: python add_indexes.py
"""
import sys, os
from pathlib import Path

for line in (Path(__file__).parent / ".env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

sys.path.insert(0, str(Path(__file__).parent))
from database import engine
from sqlalchemy import text

INDEXES = [
    # Composite: account_id + close_time  — used by GET /trades ORDER BY close_time
    "CREATE INDEX IF NOT EXISTS ix_trades_account_close ON trading.trades (account_id, close_time DESC)",
    # Composite: account_id + net_pnl     — used by win/loss filters
    "CREATE INDEX IF NOT EXISTS ix_trades_account_pnl   ON trading.trades (account_id, net_pnl)",
    # close_time standalone               — used by analytics ORDER BY
    "CREATE INDEX IF NOT EXISTS ix_trades_close_time    ON trading.trades (close_time DESC)",
    # Positions: account + updated_at     — used by GET /positions
    "CREATE INDEX IF NOT EXISTS ix_positions_account    ON trading.positions (account_id, updated_at DESC)",
    # Deals: account + timestamp          — used by sync upsert
    "CREATE INDEX IF NOT EXISTS ix_deals_account        ON trading.deals (account_id, timestamp DESC)",
]

with engine.connect() as conn:
    for idx_sql in INDEXES:
        name = idx_sql.split("ix_")[1].split(" ")[0]
        conn.execute(text(idx_sql))
        print(f"  ✅ Index: ix_{name}")
    conn.commit()

print("\n🎉 All indexes applied.")

