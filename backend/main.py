from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models  # Ensure all SQLAlchemy models are registered
from routers import sync, trades, journal, analytics, positions, accounts

# Auto-create SQLite database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MAI Trading Journal API",
    description="Automated MT5 Trading Journal, Analytics Engine & Reflection System",
    version="2.0.0"
)

# Enable CORS for local React/Vite development frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync.router)
app.include_router(trades.router)
app.include_router(journal.router)
app.include_router(analytics.router)
app.include_router(positions.router)
app.include_router(accounts.router)

@app.get("/")
def root():
    return {
        "app": "MAI Trading Journal API",
        "version": "2.0.0",
        "status": "online",
        "endpoints": {
            "docs": "/docs",
            "sync": "/api/v1/sync",
            "trades": "/api/v1/trades",
            "positions": "/api/v1/positions",
            "analytics": "/api/v1/analytics/summary",
            "journal": "/api/v1/journal"
        }
    }