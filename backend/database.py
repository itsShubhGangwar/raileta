"""
Database configuration for RailETA Backend.
Supports hosted PostgreSQL (Render, Neon, Supabase) via DATABASE_URL
with automatic fallback to local SQLite for instant zero-config evaluation.
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

raw_db_url = os.getenv("DATABASE_URL", "sqlite:///./raileta_local.db")

# Render/Heroku sometimes emit postgres:// instead of postgresql://
if raw_db_url.startswith("postgres://"):
    DATABASE_URL = raw_db_url.replace("postgres://", "postgresql://", 1)
else:
    DATABASE_URL = raw_db_url

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
