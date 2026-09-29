"""
Prediction Route (`POST /api/predictions` and `POST /api/predict`).
Computes on-demand ML ETA predictions using the 14-feature HistGradientBoostingRegressor
and persists the prediction in the `predictions` table if the train & station exist.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.ml.prediction_service import prediction_service
from app.models.railway import Prediction, Station
from app.schemas.railway import PredictionRequestSchema, PredictionResponseSchema
from app.services.eta_service import resolve_train

router = APIRouter(prefix="/api", tags=["Predictions"])


def _handle_prediction(payload: PredictionRequestSchema, db: Session) -> PredictionResponseSchema:
    train_key = payload.train_number or payload.train_id or "12951"
    train_obj = resolve_train(db, str(train_key))
    if not train_obj:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Train {train_key} is not available in the current dataset. "
                f"Upload stations, trains, and routes in Data Center first."
            ),
        )

    sched_eta = payload.scheduled_eta or payload.scheduled_arrival or "18:30"
    curr_delay = (
        payload.current_delay_mins
        if payload.current_delay_mins is not None
        else payload.current_delay
    )
    curr_speed = (
        payload.current_speed_kmph
        if payload.current_speed_kmph is not None
        else payload.current_speed
    )
    dist_dest = (
        payload.distance_remaining_km
        if payload.distance_remaining_km is not None
        else payload.distance_to_destination
    )
    hist_delay = (
        payload.historical_station_delay_mins
        if payload.historical_station_delay_mins is not None
        else payload.historical_average_delay
    )
    hour_val = payload.hour_of_day if payload.hour_of_day is not None else payload.hour
    weather_val = (
        payload.weather_severity
        if payload.weather_severity is not None
        else payload.weather
    )
    congestion_val = (
        payload.congestion_index
        if payload.congestion_index is not None
        else payload.congestion
    )

    route_code = f"{train_obj.source}-{train_obj.destination}"

    ml_input = {
        "train": train_obj.train_number if train_obj else str(train_key),
        "station": payload.station_code,
        "route": route_code,
        "scheduled_eta": sched_eta,
        "current_delay": curr_delay,
        "current_speed": curr_speed,
        "distance_to_next_station": min(dist_dest, payload.distance_to_next_station),
        "distance_to_destination": dist_dest,
        "historical_section_running_time": payload.historical_section_running_time,
        "historical_average_delay": hist_delay,
        "day_of_week": payload.day_of_week,
        "hour": hour_val,
        "weather": weather_val,
        "congestion": congestion_val,
        "previous_station_delay": payload.previous_station_delay,
    }

    res = prediction_service.predict_station_eta(ml_input)
    res["data_source"] = "Uploaded Dataset"

    # Save/update prediction record in DB if train and station exist
    if train_obj:
        station_obj = (
            db.query(Station)
            .filter(Station.code == payload.station_code.upper().strip())
            .first()
        )
        if station_obj:
            existing_pred = (
                db.query(Prediction)
                .filter(
                    Prediction.train_id == train_obj.id,
                    Prediction.station_id == station_obj.id,
                )
                .first()
            )
            if existing_pred:
                existing_pred.predicted_eta = res["predicted_eta"]
                existing_pred.scheduled_eta = sched_eta
                existing_pred.predicted_delay = float(res["predicted_delay"])
                existing_pred.confidence = float(res["confidence"])
                existing_pred.lower_bound = res["lower_bound"]
                existing_pred.upper_bound = res["upper_bound"]
                existing_pred.prediction_time = datetime.utcnow()
            else:
                db.add(
                    Prediction(
                        train_id=train_obj.id,
                        station_id=station_obj.id,
                        prediction_time=datetime.utcnow(),
                        predicted_eta=res["predicted_eta"],
                        scheduled_eta=sched_eta,
                        predicted_delay=float(res["predicted_delay"]),
                        confidence=float(res["confidence"]),
                        lower_bound=res["lower_bound"],
                        upper_bound=res["upper_bound"],
                    )
                )
            db.commit()

    return PredictionResponseSchema(**res)


@router.post("/predictions", response_model=PredictionResponseSchema)
def create_prediction(
    payload: PredictionRequestSchema,
    db: Session = Depends(get_db),
):
    return _handle_prediction(payload, db)


@router.post("/predict", response_model=PredictionResponseSchema)
def create_prediction_alias(
    payload: PredictionRequestSchema,
    db: Session = Depends(get_db),
):
    return _handle_prediction(payload, db)
