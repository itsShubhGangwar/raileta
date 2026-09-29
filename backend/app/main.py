"""
RailETA FastAPI Main Application (`backend/app/main.py`).
---------------------------------------------------------
Architecture Pipeline:
  TelemetryProvider (`app.services.telemetry_providers`)
  → Data Ingestion (`app.services.ingestion_service`)
  → Feature Engineering (`app.ml.feature_engineering`)
  → ML Prediction (`app.ml.prediction_service`)
  → ETA Service (`app.services.eta_service`)
  → Persistent PostgreSQL (`app.database` & `app.models`)
  → REST API / WebSocket (`app.routes` & `app.websocket`)
  → React Frontend
"""

import asyncio
from contextlib import asynccontextmanager
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from app.database import Base, SessionLocal, engine, ensure_schema_migrations
from app.ml.prediction_service import prediction_service
from app.routes import (
    auth_router,
    datasets_router,
    health_router,
    predictions_router,
    telemetry_router,
    trains_router,
)
from app.services.ingestion_service import seed_all_tables_if_empty
from app.services.simulator_service import simulator_service
from app.websocket import websocket_router, ws_manager


def initialize_system() -> None:
    """
    Idempotently initializes database tables, schema migrations, Demo Account,
    persistent seed datasets, and ML model bundle.
    """
    Base.metadata.create_all(bind=engine)
    ensure_schema_migrations()
    prediction_service.ensure_loaded()
    db = SessionLocal()
    try:
        seed_all_tables_if_empty(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_system()
    enable_sim = os.getenv("ENABLE_SIMULATOR", "true").lower() in ("true", "1", "yes")
    sim_interval = float(os.getenv("SIMULATOR_INTERVAL_SECONDS", "4.0"))
    sim_task = None
    if enable_sim:
        sim_task = asyncio.create_task(
            simulator_service.run_loop(ws_manager, interval_seconds=sim_interval)
        )
    try:
        yield
    finally:
        simulator_service.stop()
        if sim_task and not sim_task.done():
            sim_task.cancel()


app = FastAPI(
    title="RailETA API — Indian Railways Dynamic ML ETA Prediction System",
    description=(
        "Production FastAPI backend with HistGradientBoostingRegressor ETA pipeline, "
        "persistent PostgreSQL/SQLAlchemy storage, JWT authentication, Data Center "
        "CSV validation, Manual Telemetry Control, CSV Playback, and WebSocket streaming."
    ),
    version="2.1.0",
    lifespan=lifespan,
)

raw_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,https://raileta.vercel.app",
)
allowed_origins = (
    ["*"]
    if raw_origins.strip() == "*"
    else [o.strip() for o in raw_origins.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(datasets_router)
app.include_router(telemetry_router)
app.include_router(trains_router)
app.include_router(predictions_router)
app.include_router(websocket_router)
