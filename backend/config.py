import os

def load_env_file(env_path=None):
    """Load key-value pairs from .env file into os.environ if not already present."""
    if env_path is None:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("\"'")
                    if key not in os.environ:
                        os.environ[key] = val
        except Exception as e:
            print(f"[WARN] Failed to load .env file: {e}")

# Automatically load environment on import
load_env_file()

# Server Settings
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8000"))

# CORS Settings
def get_cors_origins() -> list:
    raw = os.getenv("CORS_ORIGINS", "*").strip()
    if raw == "*":
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]

CORS_ORIGINS: list = get_cors_origins()

# Database Settings
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:9669@localhost:5432/mai-trading"
)
DB_SCHEMA: str = os.getenv("DB_SCHEMA", "trading")

# Security Settings
API_KEY: str = os.getenv("API_KEY", "mai-trading-secret-key")

# Demo Data Setting
ENABLE_DEMO_DATA: bool = os.getenv("ENABLE_DEMO_DATA", "false").strip().lower() == "true"
