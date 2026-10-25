import os
from sqlalchemy import create_engine, MetaData, text
from sqlalchemy.orm import sessionmaker, declarative_base
from config import DATABASE_URL, DB_SCHEMA as SCHEMA_NAME

engine = create_engine(
    DATABASE_URL,
    connect_args={"options": f"-csearch_path={SCHEMA_NAME},public"},
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

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