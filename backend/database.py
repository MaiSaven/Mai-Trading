import os
from sqlalchemy import create_engine, MetaData, text, event
from sqlalchemy.orm import sessionmaker, declarative_base
from config import DATABASE_URL, DB_SCHEMA as SCHEMA_NAME

from sqlalchemy.pool import NullPool

# Detect Vercel serverless environment
_is_vercel = os.getenv("VERCEL") == "1" or "VERCEL_ENV" in os.environ
_is_neon_pooler = "-pooler." in DATABASE_URL
_is_external_db = any(h in DATABASE_URL for h in ["neon.tech", "amazonaws.com", "supabase"])

_connect_args = {} if _is_neon_pooler else {
    "options": f"-csearch_path={SCHEMA_NAME},public",
    **({"keepalives": 1, "keepalives_idle": 30, "keepalives_interval": 5, "keepalives_count": 3}
       if _is_external_db else {})
}

# In Vercel serverless, NullPool prevents stale cached connections and connection exhaustion
if _is_vercel:
    engine = create_engine(
        DATABASE_URL,
        connect_args=_connect_args,
        poolclass=NullPool,
    )
else:
    engine = create_engine(
        DATABASE_URL,
        connect_args=_connect_args,
        pool_pre_ping=True,
        pool_size=3 if _is_external_db else 10,
        max_overflow=5 if _is_external_db else 20,
        pool_recycle=300,
        pool_timeout=10,
    )

# For Neon pooler: set search_path after each new connection is established
if _is_neon_pooler:
    @event.listens_for(engine, "connect")
    def set_search_path(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute(f"SET search_path TO {SCHEMA_NAME}, public")
        cursor.close()

def ensure_schema_exists():
    """Lazily ensure schema exists without crashing serverless cold starts."""
    try:
        with engine.connect() as conn:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA_NAME};"))
            conn.commit()
    except Exception as e:
        print(f"[WARN] Database schema check skipped or deferred: {e}")

metadata = MetaData(schema=SCHEMA_NAME)
Base = declarative_base(metadata=metadata)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()