"""
Dataset Management & ML Retraining Routes (`backend/app/routes/datasets.py`).
-----------------------------------------------------------------------------
- GET    /api/datasets                        (List persistent datasets & validation summaries)
- GET    /api/datasets/templates/{dtype}      (Download Synthetic Demo Dataset CSV template)
- POST   /api/datasets/upload                 (Protected: Upload, validate, & persist CSV dataset)
- PATCH  /api/datasets/{dataset_id}           (Protected: Modify dataset metadata)
- DELETE /api/datasets/{dataset_id}           (Protected: Delete uploaded dataset)
- POST   /api/ml/retrain                      (Protected: Explicit ML model retraining from DB)
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_database_backend_name, get_db
from app.ml.prediction_service import prediction_service
from app.models.railway import (
    Dataset,
    HistoricalRun,
    Route,
    Station,
    TelemetryRecord,
    Train,
    User,
    WeatherRecord,
)
from app.schemas.railway import DatasetItemSchema, DatasetUpdateSchema
from app.services.auth_service import get_current_user
from app.services.dataset_service import (
    generate_csv_template,
    import_validated_dataset_to_db,
    parse_and_validate_csv,
    serialize_dataset,
)

router = APIRouter(prefix="/api", tags=["Datasets & ML Retraining"])


def _sync_seed_row_counts(db: Session) -> None:
    """Keeps row_count on catalog records synchronized with actual PostgreSQL table counts."""
    counts = {
        "historical_runs": db.query(HistoricalRun).count(),
        "trains": db.query(Train).count(),
        "stations": db.query(Station).count(),
        "routes": db.query(Route).count(),
        "weather": db.query(WeatherRecord).count(),
        "telemetry": db.query(TelemetryRecord).count(),
    }
    datasets = db.query(Dataset).all()
    changed = False
    for ds in datasets:
        if ds.source_type == "Synthetic Demo Data" and ds.dataset_type in counts:
            actual = counts[ds.dataset_type]
            if ds.row_count != actual:
                ds.row_count = actual
                changed = True
    if changed:
        db.commit()


@router.get("/datasets", response_model=List[DatasetItemSchema])
def list_datasets(db: Session = Depends(get_db)):
    _sync_seed_row_counts(db)
    datasets = db.query(Dataset).order_by(Dataset.id.asc()).all()
    return [DatasetItemSchema(**serialize_dataset(ds)) for ds in datasets]


@router.get("/datasets/summary")
def get_data_center_summary(db: Session = Depends(get_db)):
    _sync_seed_row_counts(db)
    datasets = db.query(Dataset).order_by(Dataset.id.asc()).all()
    hist_count = db.query(HistoricalRun).count()
    eval_report = prediction_service.get_evaluation_report()
    min_req = 10
    return {
        "database_engine": get_database_backend_name(),
        "persistent": True,
        "datasets": [serialize_dataset(ds) for ds in datasets],
        "table_counts": {
            "stations": db.query(Station).count(),
            "trains": db.query(Train).count(),
            "routes": db.query(Route).count(),
            "historical_runs": hist_count,
            "weather_records": db.query(WeatherRecord).count(),
            "telemetry_records": db.query(TelemetryRecord).count(),
        },
        "ml_retrain_status": {
            "can_retrain": hist_count >= min_req,
            "labeled_historical_runs": hist_count,
            "min_required_runs": min_req,
            "model_version": eval_report.get("model_version", "2.0.0-hgb"),
            "trained_at": eval_report.get("trained_at"),
            "message": (
                "Ready to retrain model on uploaded historical runs."
                if hist_count >= min_req
                else "Upload sufficient historical runs and click RETRAIN MODEL."
            ),
        },
    }


@router.get("/datasets/templates/{dataset_type}")
def download_dataset_template(dataset_type: str):
    filename, csv_text = generate_csv_template(dataset_type)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Data-Label": "Prototype Dataset Template",
        },
    )


@router.get("/datasets/template/{dataset_type}")
def download_dataset_template_singular(dataset_type: str):
    return download_dataset_template(dataset_type)


@router.get("/datasets/{dataset_id}", response_model=DatasetItemSchema)
def get_dataset_by_id(dataset_id: int, db: Session = Depends(get_db)):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail=f"Dataset ID {dataset_id} not found.")
    return DatasetItemSchema(**serialize_dataset(ds))


@router.post("/datasets/upload", response_model=DatasetItemSchema)
async def upload_dataset(
    request: Request,
    dataset_type: Optional[str] = Form(None),
    name: Optional[str] = Form(None),
    dataset_name: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Authenticated endpoint to upload, validate, and persist a CSV dataset in PostgreSQL.
    Supports both multipart/form-data (`file` + `dataset_type`) and JSON payloads.
    """
    raw_bytes: bytes = b""
    filename: str = "uploaded_dataset.csv"
    dtype: str = dataset_type or ""
    custom_name: Optional[str] = name or dataset_name

    if file is not None:
        raw_bytes = await file.read()
        filename = file.filename or f"{dtype or 'dataset'}.csv"
    else:
        try:
            body = await request.json()
            dtype = str(body.get("dataset_type", dtype)).strip()
            filename = str(body.get("filename", f"{dtype}.csv")).strip()
            custom_name = body.get("name") or body.get("dataset_name") or custom_name
            csv_content = body.get("csv_content", "")
            raw_bytes = str(csv_content).encode("utf-8")
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="No CSV file provided. Upload a multipart file or provide csv_content.",
            )

    if not dtype:
        lower_fn = filename.lower()
        for candidate in (
            "historical_runs",
            "trains",
            "stations",
            "routes",
            "weather",
            "telemetry",
        ):
            if candidate in lower_fn:
                dtype = candidate
                break
        if not dtype:
            raise HTTPException(
                status_code=400,
                detail="dataset_type is required (stations, trains, routes, historical_runs, weather, or telemetry).",
            )

    df, validation_summary = parse_and_validate_csv(raw_bytes, dtype)
    ds = import_validated_dataset_to_db(
        db=db,
        dataset_type=dtype,
        filename=filename,
        df=df,
        validation_summary=validation_summary,
        uploaded_by=current_user.username,
        custom_name=custom_name,
    )
    return DatasetItemSchema(**serialize_dataset(ds))


@router.patch("/datasets/{dataset_id}", response_model=DatasetItemSchema)
def update_dataset_metadata(
    dataset_id: int,
    payload: DatasetUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail=f"Dataset ID {dataset_id} not found.")
    if payload.name is not None:
        ds.name = payload.name.strip()
    if payload.status is not None:
        ds.status = payload.status.strip()
    if payload.source_type is not None:
        ds.source_type = payload.source_type.strip()
    ds.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ds)
    return DatasetItemSchema(**serialize_dataset(ds))


@router.delete("/datasets/{dataset_id}")
def delete_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail=f"Dataset ID {dataset_id} not found.")
    if ds.dataset_type == "weather":
        db.query(WeatherRecord).filter(WeatherRecord.dataset_id == ds.id).delete()
    elif ds.dataset_type == "telemetry":
        db.query(TelemetryRecord).filter(TelemetryRecord.dataset_id == ds.id).delete()

    deleted_name = ds.filename
    db.delete(ds)
    db.commit()
    return {
        "status": "deleted",
        "dataset_id": dataset_id,
        "filename": deleted_name,
        "deleted_by": current_user.username,
    }


@router.post("/ml/retrain")
def retrain_ml_model(
    min_records: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Explicit authenticated endpoint to retrain the HistGradientBoostingRegressor
    ensemble using labeled historical runs stored in PostgreSQL.
    Validates that sufficient historical labeled data exists before retraining.
    """
    try:
        report = prediction_service.retrain_from_database(db, min_records=min_records)
        return {
            "status": "retrained",
            "triggered_by": current_user.username,
            "model_version": report.get("model_version"),
            "db_records_used": report.get("db_records_used"),
            "records_used": report.get("db_records_used"),
            "metrics": report.get("test_evaluation", {}).get("ml_model_metrics", {}),
            "evaluation_report": report,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
