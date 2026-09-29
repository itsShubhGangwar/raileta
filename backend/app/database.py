"""
Database Configuration for RailETA Backend (FastAPI + PostgreSQL + SQLAlchemy).
Production uses persistent cloud PostgreSQL via DATABASE_URL environment variable.
Local development falls back to SQLite ONLY when DATABASE_URL is not set.
When DATABASE_URL is configured for PostgreSQL, any connection failure raises a
clear startup RuntimeError instead of silently falling back to SQLite.
"""

import importlib.util
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


def _has_module(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def normalize_database_url(raw_url: str | None) -> str:
    """
    Normalizes DATABASE_URL so the SQLAlchemy dialect+driver matches the installed
    PostgreSQL driver (`psycopg` v3 or `psycopg2`).
    Returns DEFAULT_SQLITE_URL only when DATABASE_URL is unset/empty.
    """
    cleaned = (raw_url or "").strip()
    if not cleaned:
        return DEFAULT_SQLITE_URL

    if cleaned.startswith("sqlite"):
        return cleaned

    pg_prefixes = (
        "postgres://",
        "postgresql://",
        "postgresql+psycopg://",
        "postgresql+psycopg2://",
    )
    if cleaned.startswith(pg_prefixes):
        rest = cleaned.split("://", 1)[1]
        has_psycopg3 = _has_module("psycopg")
        has_psycopg2 = _has_module("psycopg2")

        if cleaned.startswith("postgresql+psycopg2://") and has_psycopg2:
            return f"postgresql+psycopg2://{rest}"
        if has_psycopg3:
            return f"postgresql+psycopg://{rest}"
        if has_psycopg2:
            return f"postgresql+psycopg2://{rest}"
        return f"postgresql+psycopg://{rest}"

    return cleaned


raw_db_url = os.getenv("DATABASE_URL")
DATABASE_URL = normalize_database_url(raw_db_url)


def _build_engine(db_url: str):
    if db_url.startswith("sqlite"):
        return create_engine(
            db_url,
            connect_args={"check_same_thread": False},
            pool_pre_ping=True,
        )

    safe_target = db_url.split("@")[-1] if "@" in db_url else db_url
    try:
        eng = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            connect_args={"connect_timeout": 10},
        )
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        print(f"[RailETA DB] Connected to PostgreSQL ({safe_target}) via {eng.driver}.")
        return eng
    except Exception as exc:
        raise RuntimeError(
            f"[RailETA DB] CRITICAL STARTUP ERROR: Hosted PostgreSQL ({safe_target}) "
            f"connection failed ({exc}). Refusing to fall back to SQLite because "
            f"DATABASE_URL is configured for PostgreSQL."
        ) from exc


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
