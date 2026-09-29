"""
Train Routes for RailETA Backend API:
- GET /api/trains
- GET /api/trains/search?q=
- GET /api/trains/{train_id}
- GET /api/trains/{train_id}/status
- GET /api/trains/{train_id}/details
- GET /api/trains/{train_id}/eta
- GET /api/trains/{train_id}/route
- GET /api/trains/{train_id}/analytics
- GET /api/analytics
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.railway import Train
from app.schemas.railway import (
    TrainETAResponseSchema,
    TrainStatusResponseSchema,
    TrainSummarySchema,
)
from app.services.data_generator import DEMO_DATA_LABEL
from app.services.eta_service import (
    build_analytics_payload,
    build_train_eta_dict,
    build_train_status_dict,
    build_train_summary_dict,
    resolve_train,
)

router = APIRouter(prefix="/api", tags=["Trains"])


def _filter_trains(
    db: Session,
    q: Optional[str] = None,
    from_station: Optional[str] = None,
    to_station: Optional[str] = None,
    train_type: Optional[str] = None,
) -> List[TrainSummarySchema]:
    trains = db.query(Train).all()
    # Always prioritize trains that have uploaded route records so active corridors appear first
    trains = sorted(trains, key=lambda t: (len(t.routes) == 0, t.id))
    results: List[TrainSummarySchema] = []

    for train in trains:
        if q:
            q_low = q.lower().strip()
            station_match = any(
                q_low in r.station.code.lower() or q_low in r.station.name.lower()
                for r in train.routes
            )
            if (
                q_low not in train.train_number.lower()
                and q_low not in train.train_name.lower()
                and q_low not in train.source.lower()
                and q_low not in train.destination.lower()
                and not station_match
            ):
                continue

        if from_station:
            f_low = from_station.lower().strip()
            has_from = (
                f_low in train.source.lower()
                or f_low in train.source_name.lower()
                or any(
                    f_low in r.station.code.lower() or f_low in r.station.name.lower()
                    for r in train.routes
                )
            )
            if not has_from:
                continue

        if to_station:
            t_low = to_station.lower().strip()
            has_to = (
                t_low in train.destination.lower()
                or t_low in train.destination_name.lower()
                or any(
                    t_low in r.station.code.lower() or t_low in r.station.name.lower()
                    for r in train.routes
                )
            )
            if not has_to:
                continue

        if train_type and train_type.lower() != "all":
            if train_type.lower() not in train.train_type.lower():
                continue

        summary_dict = build_train_summary_dict(train, db=db)
        results.append(TrainSummarySchema(**summary_dict))

    return results


@router.get("/trains", response_model=List[TrainSummarySchema])
def list_trains(
    q: Optional[str] = Query(None, description="Optional search query"),
    from_station: Optional[str] = Query(None, description="Origin station filter"),
    to_station: Optional[str] = Query(None, description="Destination station filter"),
    train_type: Optional[str] = Query(None, description="Train category filter"),
    db: Session = Depends(get_db),
):
    return _filter_trains(
        db=db,
        q=q,
        from_station=from_station,
        to_station=to_station,
        train_type=train_type,
    )


@router.get("/trains/search", response_model=List[TrainSummarySchema])
def search_trains_endpoint(
    q: str = Query("", description="Train number, train name, or station code/name"),
    from_station: Optional[str] = Query(None),
    to_station: Optional[str] = Query(None),
    train_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return _filter_trains(
        db=db,
        q=q,
        from_station=from_station,
        to_station=to_station,
        train_type=train_type,
    )


def _missing_train_detail(train_id: str) -> str:
    return (
        f"Train {train_id} is not available in the current dataset (not found). "
        f"Upload train and route data from Data Center."
    )


@router.get("/trains/{train_id}", response_model=TrainStatusResponseSchema)
def get_train_by_id(train_id: str, db: Session = Depends(get_db)):
    train = resolve_train(db, train_id)
    if not train:
        raise HTTPException(
            status_code=404,
            detail=_missing_train_detail(train_id),
        )
    return TrainStatusResponseSchema(**build_train_status_dict(db, train))


@router.get("/trains/{train_id}/status", response_model=TrainStatusResponseSchema)
def get_train_status(train_id: str, db: Session = Depends(get_db)):
    train = resolve_train(db, train_id)
    if not train:
        raise HTTPException(
            status_code=404,
            detail=_missing_train_detail(train_id),
        )
    return TrainStatusResponseSchema(**build_train_status_dict(db, train))


@router.get("/trains/{train_id}/details", response_model=TrainStatusResponseSchema)
def get_train_details(train_id: str, db: Session = Depends(get_db)):
    train = resolve_train(db, train_id)
    if not train:
        raise HTTPException(
            status_code=404,
            detail=_missing_train_detail(train_id),
        )
    return TrainStatusResponseSchema(**build_train_status_dict(db, train))


@router.get("/trains/{train_id}/eta", response_model=TrainETAResponseSchema)
def get_train_eta(train_id: str, db: Session = Depends(get_db)):
    train = resolve_train(db, train_id)
    if not train:
        raise HTTPException(
            status_code=404,
            detail=_missing_train_detail(train_id),
        )
    return TrainETAResponseSchema(**build_train_eta_dict(db, train))


@router.get("/trains/{train_id}/route")
def get_train_route(train_id: str, db: Session = Depends(get_db)):
    train = resolve_train(db, train_id)
    if not train:
        raise HTTPException(
            status_code=404,
            detail=_missing_train_detail(train_id),
        )
    status_dict = build_train_status_dict(db, train)
    return {
        "train_id": train.id,
        "train_number": train.train_number,
        "train_name": train.train_name,
        "source": train.source,
        "source_name": train.source_name,
        "destination": train.destination,
        "destination_name": train.destination_name,
        "total_distance_km": train.total_distance_km,
        "current_lat": status_dict["current_lat"],
        "current_lng": status_dict["current_lng"],
        "current_speed_kmph": status_dict["current_speed_kmph"],
        "current_delay_mins": status_dict["current_delay_mins"],
        "next_station_code": status_dict["next_station_code"],
        "next_station_name": status_dict["next_station_name"],
        "predicted_eta": status_dict["predicted_eta"],
        "prediction_confidence": status_dict["prediction_confidence"],
        "data_source": status_dict.get("data_source", "Uploaded Dataset"),
        "route": status_dict["stops"],
        "stops": status_dict["stops"],
    }


@router.get("/trains/{train_id}/analytics")
def get_train_analytics(train_id: str, db: Session = Depends(get_db)):
    train = resolve_train(db, train_id)
    if not train:
        raise HTTPException(
            status_code=404,
            detail=_missing_train_detail(train_id),
        )
    status_dict = build_train_status_dict(db, train)
    base_analytics = build_analytics_payload(db, train)

    # Customize train-specific delay propagation & section running times
    train_delay_curve = [
        {
            "station": s["station_code"],
            "station_name": s["station_name"],
            "distance_km": s["distance_km"],
            "predicted_delay_mins": s["delay_mins"],
            "historical_avg_delay_mins": s["historical_avg_delay_mins"],
            "confidence": s["confidence"],
        }
        for s in status_dict["stops"]
    ]

    return {
        "train_id": train.id,
        "train_number": train.train_number,
        "train_name": train.train_name,
        **base_analytics,
        "train_delay_propagation": train_delay_curve,
    }


@router.get("/analytics")
def get_global_analytics(db: Session = Depends(get_db)):
    return build_analytics_payload(db)


@router.get("/analytics/overview")
def get_global_analytics_overview(db: Session = Depends(get_db)):
    return build_analytics_payload(db)

