from app.routes.auth import router as auth_router
from app.routes.datasets import router as datasets_router
from app.routes.health import router as health_router
from app.routes.predictions import router as predictions_router
from app.routes.telemetry import router as telemetry_router
from app.routes.trains import router as trains_router

__all__ = [
    "auth_router",
    "datasets_router",
    "health_router",
    "trains_router",
    "predictions_router",
    "telemetry_router",
]
