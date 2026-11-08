"""
One-time script to initialize the Neon production database.
Run from the backend/ directory: python init_neon.py
"""
import sys
import os
from pathlib import Path

# Load .env
env_path = Path(__file__).parent / ".env"
for line in env_path.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip()

# Force unpooled host for init (pooler blocks search_path startup param)
if "DATABASE_URL" in os.environ:
    os.environ["DATABASE_URL"] = os.environ["DATABASE_URL"].replace(
        "-pooler.", "."
    )

sys.path.insert(0, str(Path(__file__).parent))

from database import engine, Base
import models  # registers all ORM models
from sqlalchemy import text

# 1. Create trading schema
with engine.connect() as conn:
    conn.execute(text("CREATE SCHEMA IF NOT EXISTS trading"))
    conn.commit()
    print("✅ Schema 'trading' ready.")

# 2. Create all tables
Base.metadata.create_all(bind=engine)
print("✅ All tables created.")

# 3. Seed static brokers (Exness, GTC FX, Lirunex)
from models import Broker
from sqlalchemy.orm import Session

brokers_to_seed = [
    {"name": "Exness Technologies Ltd", "server": "Exness-MT5Trial6"},
    {"name": "GTC Global SA (Pty) Ltd",  "server": "GTCGlobal-Server"},
    {"name": "Lirunex Limited",           "server": "Lirunex-Live"},
]

with Session(engine) as session:
    for b in brokers_to_seed:
        exists = session.query(Broker).filter_by(name=b["name"]).first()
        if not exists:
            session.add(Broker(name=b["name"], server=b["server"]))
            print(f"  + Inserted broker: {b['name']}")
        else:
            print(f"  ~ Already exists: {b['name']}")
    session.commit()
    print("✅ Brokers seeded.")

# 4. Verify
with engine.connect() as conn:
    result = conn.execute(text(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'trading' ORDER BY tablename"
    ))
    tables = [row[0] for row in result]
    print(f"\n📋 Tables in 'trading' schema: {tables}")

print("\n🎉 Neon database initialization complete!")
