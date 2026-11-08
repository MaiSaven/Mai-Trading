import os
from sqlalchemy import create_engine, MetaData, text, event
from sqlalchemy.orm import sessionmaker, declarative_base
from config import DATABASE_URL, DB_SCHEMA as SCHEMA_NAME

# Neon pooler connections reject the search_path startup parameter.
# Detect pooler URL and skip connect_args; set search_path via event instead.
_is_neon_pooler = "-pooler." in DATABASE_URL
_is_external_db = "neon.tech" in DATABASE_URL or "amazonaws.com" in DATABASE_URL or "supabase" in DATABASE_URL

_connect_args = {} if _is_neon_pooler else {
    "options": f"-csearch_path={SCHEMA_NAME},public",
    # Faster TCP keepalive for external DBs to detect stale connections quickly
    **({"keepalives": 1, "keepalives_idle": 30, "keepalives_interval": 5, "keepalives_count": 3}
       if _is_external_db else {})
}

# Pool tuning:
# - External DB (Neon): smaller pool, longer recycle to avoid connection churn
# - Local DB: larger pool, faster recycle
_pool_size    = 3  if _is_external_db else 10
_max_overflow = 5  if _is_external_db else 20
_pool_recycle = 300  # recycle connections every 5 min (avoids stale conn errors)
_pool_timeout = 10   # wait up to 10s for a connection from pool

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,       # test connection before use (catches stale conns)
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_recycle=_pool_recycle,
    pool_timeout=_pool_timeout,
)

# For Neon pooler: set search_path after each new connection is established
if _is_neon_pooler:
    @event.listens_for(engine, "connect")
    def set_search_path(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute(f"SET search_path TO {SCHEMA_NAME}, public")
        cursor.close()

# Ensure schema exists on engine startup
with engine.connect() as conn:
    conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA_NAME};"))
    conn.commit()

metadata = MetaData(schema=SCHEMA_NAME)
Base = declarative_base(metadata=metadata)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()