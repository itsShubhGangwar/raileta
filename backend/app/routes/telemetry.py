"""
Telemetry Control, Mode Switching, & CSV Playback Routes (`backend/app/routes/telemetry.py`).
---------------------------------------------------------------------------------------------
- GET  /api/telemetry/state     (Current data mode, active data source, playback status, providers)
- POST /api/telemetry/update    (Protected: Manual telemetry update -> ML prediction -> DB -> WebSocket)
- POST /api/telemetry/mode      (Protected: Switch between Automatic Simulation & Manual Control)
- POST /api/telemetry/playback  (Protected: Start, Pause, Resume, Stop CSV telemetry playback at 1x/2x/5x/10x)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.railway import TelemetryRecord, User
from app.schemas.railway import (
    ManualTelemetryUpdateSchema,
    TelemetryModeUpdateSchema,
    TelemetryPlaybackControlSchema,
)
from app.services.auth_service import get_current_user
from app.services.eta_service import (
    build_train_status_dict,
    build_ws_telemetry_frame,
    recalculate_train_predictions,
    resolve_train,
)
from app.services.ingestion_service import ingest_live_telemetry
from app.services.simulator_service import simulator_service
from app.services.telemetry_providers import (
    external_provider,
    get_or_create_system_state,
    manual_provider,
    simulator_provider,
    uploaded_provider,
)
from app.websocket.manager import ws_manager

router = APIRouter(prefix="/api/telemetry", tags=["Telemetry & Demo Control"])


@router.get("/state")
def get_telemetry_state(db: Session = Depends(get_db)):
    sys_state = get_or_create_system_state(db)
    total_pb = 0
    if sys_state.playback_train_number:
        total_pb = (
            db.query(TelemetryRecord)
            .filter(TelemetryRecord.train_number == sys_state.playback_train_number)
            .count()
        )
    if total_pb == 0:
        total_pb = db.query(TelemetryRecord).count()

    return {
        "data_mode": sys_state.data_mode,
        "active_data_source": sys_state.active_data_source,
        "playback": {
            "status": sys_state.playback_status,
            "speed_multiplier": sys_state.playback_speed,
            "train_number": sys_state.playback_train_number,
            "current_index": sys_state.playback_index,
            "total_records": total_pb,
        },
        "providers": [
            simulator_provider.get_provider_metadata(),
            manual_provider.get_provider_metadata(),
            uploaded_provider.get_provider_metadata(),
            external_provider.get_provider_metadata(),
        ],
    }


@router.post("/update")
async def update_manual_telemetry(
    payload: ManualTelemetryUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Authenticated endpoint for manual telemetry control:
      Frontend -> POST /api/telemetry/update -> Auth check -> Validation
      -> Update persistent TrainPosition -> Feature Engineering
      -> ML Prediction Service -> Save Prediction -> WebSocket Broadcast -> Frontend updates
    """
    from app.models.railway import Train

    if db.query(Train).count() == 0:
        raise HTTPException(
            status_code=400,
            detail="Upload train data before using Manual Telemetry.",
        )

    target_train_no = (payload.train_number or "").strip()
    train = resolve_train(db, target_train_no) if target_train_no else None
    if not train and not target_train_no:
        all_trains = db.query(Train).order_by(Train.id.asc()).all()
        train = next((t for t in all_trains if t.routes), all_trains[0] if all_trains else None)

    if not train:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Train {payload.train_number} is not available in the current dataset. "
                f"Upload train data before using Manual Telemetry."
            ),
        )

    # Switch persistent system state to MANUAL_CONTROL so automatic simulation does not overwrite it
    sys_state = get_or_create_system_state(db)
    sys_state.data_mode = "MANUAL_CONTROL"
    sys_state.active_data_source = "MANUAL TELEMETRY"
    sys_state.playback_status = "STOPPED"
    db.commit()

    state_dict = manual_provider.build_state_from_input(
        train=train,
        speed=payload.speed,
        delay=payload.delay,
        weather=payload.weather,
        congestion=payload.congestion,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )

    ingest_live_telemetry(
        db=db,
        train=train,
        latitude=state_dict["latitude"],
        longitude=state_dict["longitude"],
        speed=state_dict["speed"],
        delay_minutes=state_dict["delay_minutes"],
        distance_covered_km=state_dict["distance_covered_km"],
        previous_station_code=state_dict["previous_station_code"],
        next_station_code=state_dict["next_station_code"],
        weather_condition=state_dict["weather_condition"],
        weather_severity=state_dict["weather_severity"],
        weather_temp_c=state_dict["weather_temp_c"],
        weather_visibility_km=state_dict["weather_visibility_km"],
        congestion_level=state_dict["congestion_level"],
        congestion_index=state_dict["congestion_index"],
        data_source="MANUAL TELEMETRY",
    )

    # Run real ML prediction pipeline for all upcoming stations and save to PostgreSQL
    recalculate_train_predictions(db, train, force_ml=True)

    # Build WebSocket frame and broadcast to all connected clients
    ws_frame = build_ws_telemetry_frame(db, train)
    await ws_manager.broadcast_to_train(train.train_number, ws_frame)
    await ws_manager.broadcast_to_train(str(train.id), ws_frame)

    status_payload = build_train_status_dict(db, train)
    return {
        "status": "updated",
        "updated_by": current_user.username,
        "data_mode": sys_state.data_mode,
        "data_source": "MANUAL TELEMETRY",
        "telemetry_frame": ws_frame,
        "train_status": status_payload,
    }


@router.post("/mode")
async def switch_telemetry_mode(
    payload: TelemetryModeUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.railway import Train

    mode = payload.data_mode.strip().upper()
    valid_modes = {
        "AUTOMATIC_SIMULATION": "SIMULATED LIVE",
        "MANUAL_CONTROL": "MANUAL TELEMETRY",
        "UPLOADED_TELEMETRY": "UPLOADED TELEMETRY",
        "EXTERNAL_API": "EXTERNAL API",
    }
    if mode not in valid_modes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid data_mode '{payload.data_mode}'. Choose from {list(valid_modes.keys())}.",
        )

    if mode == "EXTERNAL_API" and not external_provider.is_configured():
        raise HTTPException(
            status_code=400,
            detail="ExternalRailwayTelemetryProvider is not configured. Requires an authorized external railway data provider (set RAILWAY_API_URL and RAILWAY_API_KEY).",
        )

    sys_state = get_or_create_system_state(db)
    sys_state.data_mode = mode
    sys_state.active_data_source = valid_modes[mode]
    if mode != "UPLOADED_TELEMETRY":
        sys_state.playback_status = "STOPPED"
    db.commit()

    # If switched back to AUTOMATIC_SIMULATION, step all trains with routes once and broadcast
    if mode == "AUTOMATIC_SIMULATION":
        for train in db.query(Train).order_by(Train.id.asc()).all():
            if train.routes:
                frame = simulator_service.step_single_train(db, train, respect_mode=False)
                await ws_manager.broadcast_to_train(train.train_number, frame)
                await ws_manager.broadcast_to_train(str(train.id), frame)

    return {
        "status": "mode_updated",
        "data_mode": sys_state.data_mode,
        "active_data_source": sys_state.active_data_source,
        "updated_by": current_user.username,
    }


@router.post("/playback")
async def control_telemetry_playback(
    payload: TelemetryPlaybackControlSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    action = payload.action.strip().lower()
    if action not in ("start", "pause", "resume", "stop", "step", "reset"):
        raise HTTPException(
            status_code=400,
            detail="Playback action must be one of: start, pause, resume, stop, step, reset.",
        )

    allowed_speeds = {1.0, 2.0, 5.0, 10.0}
    speed_mult = float(payload.speed_multiplier or 1.0)
    if speed_mult not in allowed_speeds:
        speed_mult = min(allowed_speeds, key=lambda x: abs(x - speed_mult))

    sys_state = get_or_create_system_state(db)
    req_train_no = (payload.train_number or "").strip()
    if not req_train_no:
        first_rec = db.query(TelemetryRecord).order_by(TelemetryRecord.id.asc()).first()
        req_train_no = first_rec.train_number if first_rec else (sys_state.playback_train_number or "")
    sys_state.playback_train_number = req_train_no
    sys_state.playback_speed = speed_mult

    records_count = 0
    if sys_state.playback_train_number:
        records_count = (
            db.query(TelemetryRecord)
            .filter(TelemetryRecord.train_number == sys_state.playback_train_number)
            .count()
        )
    if records_count == 0:
        records_count = db.query(TelemetryRecord).count()

    if records_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No telemetry data available. Upload telemetry.csv first.",
        )

    latest_frame = None
    if action == "start":
        sys_state.data_mode = "UPLOADED_TELEMETRY"
        sys_state.active_data_source = "UPLOADED TELEMETRY"
        sys_state.playback_status = "PLAYING"
        sys_state.playback_index = 0
        db.commit()
        latest_frame = simulator_service.step_playback_record(db)
        if latest_frame:
            await ws_manager.broadcast_to_train(
                str(latest_frame["train_number"]), latest_frame
            )
    elif action in ("resume", "step"):
        sys_state.data_mode = "UPLOADED_TELEMETRY"
        sys_state.active_data_source = "UPLOADED TELEMETRY"
        sys_state.playback_status = "PLAYING"
        db.commit()
        latest_frame = simulator_service.step_playback_record(db)
        if latest_frame:
            await ws_manager.broadcast_to_train(
                str(latest_frame["train_number"]), latest_frame
            )
    elif action == "pause":
        sys_state.playback_status = "PAUSED"
        db.commit()
    elif action in ("stop", "reset"):
        sys_state.playback_status = "STOPPED"
        sys_state.playback_index = 0
        db.commit()

    return {
        "status": "ok",
        "action": action,
        "data_mode": sys_state.data_mode,
        "active_data_source": sys_state.active_data_source,
        "speed_multiplier": sys_state.playback_speed,
        "playback": {
            "status": sys_state.playback_status,
            "speed_multiplier": sys_state.playback_speed,
            "train_number": sys_state.playback_train_number,
            "current_index": sys_state.playback_index,
            "total_records": records_count,
        },
        "latest_frame": latest_frame,
        "telemetry_frame": latest_frame,
    }

