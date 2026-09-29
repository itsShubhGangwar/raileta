"""
Database Configuration for RailETA Backend (FastAPI + PostgreSQL + SQLAlchemy).
Production uses persistent cloud PostgreSQL via DATABASE_URL environment variable.
Local development/test environments fall back to SQLite when DATABASE_URL is unset
or when a local PostgreSQL service is not reachable.
"""

import os
from pathlib import Path
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

DEFAULT_SQLITE_URL = "sqlite:///./raileta_v4.db"
raw_db_url = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL).strip()

if raw_db_url.startswith("postgres://"):
    DATABASE_URL = raw_db_url.replace("postgres://", "postgresql://", 1)
elif not raw_db_url:
    DATABASE_URL = DEFAULT_SQLITE_URL
else:
    DATABASE_URL = raw_db_url


def _build_engine(db_url: str):
    if db_url.startswith("sqlite"):
        return create_engine(
            db_url,
            connect_args={"check_same_thread": False},
            pool_pre_ping=True,
        )
    try:
        eng = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            connect_args={"connect_timeout": 5},
        )
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return eng
    except Exception as exc:
        print(
            f"[RailETA DB] Hosted PostgreSQL ({db_url.split('@')[-1]}) unreachable ({exc}); "
            f"falling back to local SQLite ({DEFAULT_SQLITE_URL})."
        )
        return create_engine(
            DEFAULT_SQLITE_URL,
            connect_args={"check_same_thread": False},
            pool_pre_ping=True,
        )


engine = _build_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_database_backend_name() -> str:
    """Returns 'postgresql' or 'sqlite' depending on the active SQLAlchemy engine."""
    return str(engine.dialect.name)


def ensure_schema_migrations() -> None:
    """
    Idempotently ensures new columns on existing tables are present when upgrading
    an already-initialized PostgreSQL or SQLite database in-place.
    """
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        if "train_positions" in table_names:
            cols = {c["name"] for c in inspector.get_columns("train_positions")}
            if "data_source" not in cols:
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            "ALTER TABLE train_positions "
                            "ADD COLUMN data_source VARCHAR(48) DEFAULT 'SIMULATED LIVE'"
                        )
                    )
    except Exception as exc:
        print(f"[RailETA DB] Schema check note: {exc}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
