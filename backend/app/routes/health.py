"""
Health Check Route (`GET /api/health`).
"""

from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_database_backend_name, get_db
from app.ml.prediction_service import prediction_service
from app.models.railway import (
    Dataset,
    HistoricalRun,
    Prediction,
    Route,
    Station,
    TelemetryRecord,
    Train,
    TrainPosition,
    User,
    WeatherRecord,
)
from app.services.telemetry_providers import get_or_create_system_state

router = APIRouter(prefix="/api", tags=["Health"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    eval_report = prediction_service.get_evaluation_report()
    test_metrics = eval_report.get("test_evaluation", {}).get("ml_model_metrics", {})
    sys_state = get_or_create_system_state(db)
    train_count = db.query(Train).count()

    return {
        "status": "healthy",
        "service": "RailETA Backend API",
        "database_engine": get_database_backend_name(),
        "ml_model": eval_report.get("model_name", "HistGradientBoostingRegressor"),
        "model_version": eval_report.get("model_version", "2.0.0-hgb"),
        "data_source": "Uploaded Dataset" if train_count > 0 else "Prototype Data",
        "active_telemetry_source": sys_state.active_data_source,
        "data_mode": sys_state.data_mode,
        "evaluated_test_mae_minutes": test_metrics.get("mae_minutes"),
        "database_stats": {
            "trains": train_count,
            "stations": db.query(Station).count(),
            "routes": db.query(Route).count(),
            "historical_runs": db.query(HistoricalRun).count(),
            "weather_records": db.query(WeatherRecord).count(),
            "telemetry_records": db.query(TelemetryRecord).count(),
            "train_positions": db.query(TrainPosition).count(),
            "predictions": db.query(Prediction).count(),
            "datasets": db.query(Dataset).count(),
            "users": db.query(User).count(),
        },
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
