"""
Real-Time Train Telemetry Simulator & CSV Playback Engine (`backend/app/services/simulator_service.py`).
--------------------------------------------------------------------------------------------------------
Supports:
1. Automatic Simulation (`AUTOMATIC_SIMULATION` / `SIMULATED LIVE`):
   - Interpolates train coordinates strictly along route station sequences.
   - Updates speed & delay, runs ML prediction pipeline, saves to PostgreSQL, broadcasts via WebSocket.
2. Manual Control (`MANUAL_CONTROL` / `MANUAL TELEMETRY`):
   - Pauses automatic simulation overrides so persisted manual telemetry updates survive across refreshes and devices.
3. Uploaded Telemetry Playback (`UPLOADED_TELEMETRY` / `UPLOADED TELEMETRY`):
   - Streams `TelemetryRecord` rows from PostgreSQL at 1x, 2x, 5x, or 10x speed through the real ML pipeline.
"""

import asyncio
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.railway import TelemetryRecord, Train
from app.services.eta_service import (
    build_ws_telemetry_frame,
    recalculate_train_predictions,
    resolve_train,
)
from app.services.ingestion_service import ingest_live_telemetry
from app.services.telemetry_providers import (
    get_or_create_system_state,
    simulator_provider,
    uploaded_provider,
)


class LiveTelemetrySimulator:
    def __init__(self, seed: int = 42):
        self._task: Optional[asyncio.Task] = None
        self._running = False

    def step_single_train(
        self,
        db: Session,
        train: Train,
        respect_mode: bool = True,
    ) -> Dict[str, Any]:
        """
        If `respect_mode` is True and the system is in MANUAL_CONTROL or UPLOADED_TELEMETRY
        mode, returns the current persisted state without overwriting it with simulator ticks.
        Otherwise advances `train` along its route coordinates using `simulator_provider`.
        """
        if not train.routes:
            return build_ws_telemetry_frame(db, train)

        sys_state = get_or_create_system_state(db)
        if respect_mode and sys_state.data_mode != "AUTOMATIC_SIMULATION":
            return build_ws_telemetry_frame(db, train)

        next_state = simulator_provider.generate_next_state(train)
        ingest_live_telemetry(
            db=db,
            train=train,
            latitude=next_state["latitude"],
            longitude=next_state["longitude"],
            speed=next_state["speed"],
            delay_minutes=next_state["delay_minutes"],
            distance_covered_km=next_state["distance_covered_km"],
            previous_station_code=next_state["previous_station_code"],
            next_station_code=next_state["next_station_code"],
            weather_condition=next_state["weather_condition"],
            weather_severity=next_state["weather_severity"],
            weather_temp_c=next_state["weather_temp_c"],
            weather_visibility_km=next_state["weather_visibility_km"],
            congestion_level=next_state["congestion_level"],
            congestion_index=next_state["congestion_index"],
            data_source="SIMULATED LIVE",
        )
        recalculate_train_predictions(db, train, force_ml=True)
        return build_ws_telemetry_frame(db, train)

    def step_playback_record(self, db: Session) -> Optional[Dict[str, Any]]:
        """
        Ingests the next `TelemetryRecord` in PostgreSQL when CSV playback is active,
        runs the full ML prediction pipeline, saves to DB, and returns the WS frame.
        """
        sys_state = get_or_create_system_state(db)
        if sys_state.playback_status != "PLAYING":
            return None

        target_train_no = (sys_state.playback_train_number or "").strip()
        records = []
        if target_train_no:
            records = (
                db.query(TelemetryRecord)
                .filter(TelemetryRecord.train_number == target_train_no)
                .order_by(TelemetryRecord.sequence_index.asc(), TelemetryRecord.id.asc())
                .all()
            )
        if not records:
            records = (
                db.query(TelemetryRecord)
                .order_by(TelemetryRecord.sequence_index.asc(), TelemetryRecord.id.asc())
                .all()
            )
        if not records:
            sys_state.playback_status = "STOPPED"
            db.commit()
            return None

        idx = int(sys_state.playback_index or 0)
        if idx >= len(records):
            idx = 0

        rec = records[idx]
        train = resolve_train(db, rec.train_number) or (
            resolve_train(db, target_train_no) if target_train_no else None
        )
        if not train:
            return None

        state_dict = uploaded_provider.build_state_from_record(train, rec)
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
            data_source="UPLOADED TELEMETRY",
        )
        recalculate_train_predictions(db, train, force_ml=True)

        # Advance playback cursor
        next_idx = idx + 1
        if next_idx >= len(records):
            sys_state.playback_index = 0
            sys_state.playback_status = "COMPLETED"
        else:
            sys_state.playback_index = next_idx
        db.commit()

        frame = build_ws_telemetry_frame(db, train)
        frame["playback"] = {
            "status": sys_state.playback_status,
            "current_index": idx + 1,
            "total_records": len(records),
            "speed_multiplier": sys_state.playback_speed,
            "record_timestamp": rec.timestamp,
        }
        return frame

    async def run_loop(self, ws_manager, interval_seconds: float = 4.0) -> None:
        self._running = True
        while self._running:
            sleep_time = interval_seconds
            try:
                db = SessionLocal()
                try:
                    sys_state = get_or_create_system_state(db)
                    if (
                        sys_state.data_mode == "UPLOADED_TELEMETRY"
                        and sys_state.playback_status == "PLAYING"
                    ):
                        mult = max(1.0, float(sys_state.playback_speed or 1.0))
                        sleep_time = max(0.35, 3.0 / mult)
                        frame = self.step_playback_record(db)
                        if frame:
                            t_no = str(frame["train_number"])
                            await ws_manager.broadcast_to_train(t_no, frame)
                    elif sys_state.data_mode == "AUTOMATIC_SIMULATION":
                        trains = db.query(Train).all()
                        for train in trains:
                            payload = self.step_single_train(db, train, respect_mode=True)
                            await ws_manager.broadcast_to_train(train.train_number, payload)
                            await ws_manager.broadcast_to_train(str(train.id), payload)
                finally:
                    db.close()
            except Exception as exc:
                print(f"[RailETA Simulator] Tick warning: {exc}")
            await asyncio.sleep(sleep_time)

    def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()


simulator_service = LiveTelemetrySimulator()
